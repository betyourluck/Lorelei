//! Lorelei の MCP サーバー。ツールの入出力の正は data_contract `McpServer.tools`。
//!
//! GUI のプロセスの中で `127.0.0.1:{port}/mcp` に Streamable HTTP で待ち受ける (`start_http`, spec 03)。
//! `open_in_editor` は `EditorPort` で GUI へじかに届ける。stdio の `lorelei --mcp` は spec 03 P3 で撤去した。
//! `list_diagrams` / `read_diagram` は同じ口で GUI の図の一覧を読む (spec 04。人が直した図の読み戻し)。
//! `update_diagram` は読んだ図を同じ 1 件に書き戻す (spec 08。ツールは計 6 本)。

use std::path::Path;
use std::sync::Arc;

use base64::Engine as _;
use lorelei_core::output::write_output;
use lorelei_core::{
    CoreError, DroppedItem, EditorPayload, RenderFormat, RenderOptions, render, render_preview_png,
    to_editor, validate,
};
use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{CallToolResult, ContentBlock, ServerCapabilities, ServerInfo};
use rmcp::{ErrorData, ServerHandler, schemars, tool, tool_handler, tool_router};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

/// preview の長辺 (px)。Claude の画像入力の推奨上限に合わせた値 (spec 01 D2)。
pub const PREVIEW_MAX_SIDE: u32 = 1568;

mod http;
pub use http::{RunningHttp, start_http};

/// GUI の図の一覧への口 (spec 03 D1・spec 04 D3、data_contract `McpServer.http.editor_port`)。
/// このクレートを Tauri に依存させないための境目。GUI の中の HTTP では GUI 自身が実装する
pub trait EditorPort: Send + Sync + 'static {
    /// 図を GUI の一覧に新しい 1 件として足し、開く。Ok は作った図の id (document_id) と updated_at。
    /// 届けられなかった理由は Err で返す (opened: false の reason になる)
    fn open(&self, source: String, title: Option<String>) -> Result<Opened, String>;
    /// 図の一覧 (GUI の一覧と同じ並び)
    fn list(&self) -> Result<Vec<DiagramSummary>, String>;
    /// 1 枚の図。id を省くと今 GUI で開いている図。original_source は常に詰める (省くのはツールの層)。
    /// Err の文字列はそのまま AI に見せる (ファイルのパスを載せない)
    fn read(&self, id: Option<String>) -> Result<Diagram, String>;
    /// 既存の 1 件の中身を届いた Mermaid で丸ごと差し替える (spec 08 D4、data_contract `Document.update`)。
    /// 種類 (`editor`) はこのクレートが変換で決めたもので、`Document.editor` と違えば `KindMismatch`。
    /// 開いている図の載せ替え・開く・ファイルだけ、の判断は GUI 側 (`open` は「GUI へ渡した」)
    fn update(&self, req: UpdateRequest) -> Result<UpdateOutcome, UpdateError>;
}

/// `EditorPort::open` の Ok。updated_at はそのまま `update_diagram` の expected_updated_at に渡せる (spec 08 D2)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Opened {
    pub id: String,
    pub updated_at: String,
}

/// GUI エディタの種類 (data_contract `EditorPayload.editor`)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EditorKind {
    Flowchart,
    ErDiagram,
}

impl EditorKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Flowchart => "flowchart",
            Self::ErDiagram => "erDiagram",
        }
    }
}

/// data_contract `McpServer.http.editor_port` の UpdateRequest (spec 08 D4)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateRequest {
    pub id: String,
    /// 届いた Mermaid そのもの (生成器を通していない)
    pub source: String,
    /// 変換で決めた種類。Document.editor と違えば KindMismatch
    pub editor: EditorKind,
    /// AI が読んだ版。時刻として読めることはツールの層で確かめ済み
    pub expected_updated_at: String,
    /// true なら GUI でその図を開いて窓を前に出す
    pub open: bool,
}

/// data_contract `McpServer.http.editor_port` の UpdateOutcome
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateOutcome {
    /// 載せ替え・開くを GUI へ渡した (Rust が積んだ時点の判断)
    pub open: bool,
    /// 書いた後の updated_at
    pub updated_at: String,
}

/// data_contract `McpServer.http.editor_port` の UpdateError。KindMismatch だけ updated: false + reason、
/// 他はツール結果のエラー { error } (`McpServer.refusal_vs_error`)
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UpdateError {
    /// 届いた図の種類が Document.editor と違う (actual = 図の今の種類)
    KindMismatch { actual: EditorKind },
    /// id が uuid の形でない・その図が無い・ごみ箱
    NotFound,
    /// expected_updated_at がファイルの updated_at と違う
    Conflict { current_updated_at: String },
    /// 書けない等。文字列はそのまま AI に見せる (ファイルのパスを載せない)
    Other(String),
}

/// data_contract `DiagramSummary` (spec 04 D2)
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DiagramSummary {
    pub id: String,
    pub title: String,
    /// flowchart | erDiagram
    pub editor: String,
    /// new | ai | import
    pub origin: String,
    pub created_at: String,
    pub updated_at: String,
    pub saved_at: Option<String>,
    /// 最後の「保存」(Ctrl+S) の後に中身が変わったか (ファイルの時刻の比較)
    pub unsaved: bool,
    /// 今 GUI で開いている図
    pub open: bool,
}

/// data_contract `Diagram` (spec 04 D2)
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Diagram {
    #[serde(flatten)]
    pub summary: DiagramSummary,
    pub source: String,
    pub original_source: Option<String>,
}

#[derive(Clone)]
pub struct LoreleiServer {
    editor: Arc<dyn EditorPort>,
    tool_router: ToolRouter<Self>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ValidateParams {
    /// Mermaid のテキスト (1 図)。
    pub source: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct RenderParams {
    /// Mermaid のテキスト (1 図)。
    pub source: String,
    /// 出力形式。
    pub format: FormatParam,
    /// 書き出し先の絶対パス。png / pdf では必須。svg で省略すると SVG 本文を返す。
    #[serde(default)]
    pub output_path: Option<String>,
    /// 既存ファイルを上書きするか。
    #[serde(default)]
    pub overwrite: bool,
    #[serde(default)]
    pub options: Option<RenderOptionsParam>,
    /// 描画結果の PNG (長辺 1568px 以内) を画像でも返す。既定は true。
    /// 返ってきた画像で見た目を確かめ、崩れていれば Mermaid を直してから書き出し直すこと。
    /// 画像が不要な時だけ false にする。
    // 既定を true にしたのは利用者 FB (2026-09-24): 説明文で勧めても、頼まれるまで AI がプレビューしなかった
    #[serde(default = "preview_default")]
    pub preview: bool,
}

fn preview_default() -> bool {
    true
}

// data_contract `RenderOptions`。ドキュメントコメント (///) はそのままツールの説明として AI に見えるので、
// 開発者向けのメモは通常のコメントに書く
/// 描画の細かい指定。省略できる。
#[derive(Debug, Default, Deserialize, schemars::JsonSchema)]
pub struct RenderOptionsParam {
    /// PNG の倍率 (0.5〜8.0、既定 2.0)。
    pub scale: Option<f32>,
    /// CSS の色か "transparent"。省略すると Mermaid の既定 (白)。
    pub background: Option<String>,
    /// 配色。入力の %%{init}%% で theme を指定していればそちらが優先される。
    pub theme: Option<ThemeParam>,
}

// core の型に schemars を持ち込まないため、ツールの入力用に同じ値の enum を置く
#[derive(Debug, Clone, Copy, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum FormatParam {
    Svg,
    Png,
    Pdf,
}

impl From<FormatParam> for RenderFormat {
    fn from(f: FormatParam) -> Self {
        match f {
            FormatParam::Svg => Self::Svg,
            FormatParam::Png => Self::Png,
            FormatParam::Pdf => Self::Pdf,
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ThemeParam {
    Default,
    Neutral,
    Dark,
    Forest,
}

impl From<ThemeParam> for lorelei_core::Theme {
    fn from(t: ThemeParam) -> Self {
        match t {
            ThemeParam::Default => Self::Default,
            ThemeParam::Neutral => Self::Neutral,
            ThemeParam::Dark => Self::Dark,
            ThemeParam::Forest => Self::Forest,
        }
    }
}

impl RenderOptionsParam {
    fn resolve(self) -> RenderOptions {
        let d = RenderOptions::default();
        RenderOptions {
            scale: self.scale.unwrap_or(d.scale),
            background: self.background,
            theme: self.theme.map_or(d.theme, Into::into),
        }
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct OpenParams {
    /// Mermaid のテキスト (flowchart か erDiagram)。
    pub source: String,
    /// GUI の図の一覧に付ける名前 (例: 「注文テーブルの ER 図」)。省略すると「AI の図 HH:MM:SS」。
    #[serde(default)]
    pub title: Option<String>,
}

/// data_contract `McpServer.tools.open_in_editor.output`。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct OpenResult {
    pub opened: bool,
    pub editor: Option<&'static str>,
    pub dropped: Vec<DroppedItem>,
    pub reason: Option<String>,
    /// 作った図の id。read_diagram の id にそのまま渡せる。opened=false なら null
    pub document_id: Option<String>,
    /// 作った図の updated_at。update_diagram の expected_updated_at にそのまま渡せる。opened=false なら null
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ReadParams {
    /// 読む図の id (list_diagrams の id、または open_in_editor の document_id)。省くと今 GUI で開いている図。
    #[serde(default)]
    pub id: Option<String>,
    /// true なら、AI やインポートが最後に届けた原文 (original_source) も返す (update_diagram で置き換わる)。
    /// 新規作成の図は、update_diagram されるまで null。
    #[serde(default)]
    pub include_original: bool,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateParams {
    /// 書き換える図の id (list_diagrams の id、または open_in_editor の document_id)。
    pub id: String,
    /// 図の全体の Mermaid (差分ではない)。read_diagram で読んだ Mermaid を直して丸ごと渡す。図の種類は今の図と同じでなければならない。
    pub source: String,
    /// 必須。read_diagram / list_diagrams / open_in_editor / 前の update_diagram が返した updated_at を、そのまま渡す。
    /// 今の図の updated_at と違えば (人が直していれば) 書かずにエラーになるので、read_diagram で読み直してから直す。
    pub expected_updated_at: String,
    /// true なら GUI でその図を開いて窓を前に出す。false (既定) なら画面は変えない (開いている図なら中身だけ載せ替わる)。
    #[serde(default)]
    pub open: bool,
}

/// data_contract `McpServer.tools.update_diagram.output`。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UpdateResult {
    pub updated: bool,
    pub editor: Option<&'static str>,
    pub dropped: Vec<DroppedItem>,
    pub reason: Option<String>,
    /// 載せ替え・開くを GUI へ渡した。updated=false なら false
    pub open: bool,
    /// 書いた後の updated_at。次の update_diagram の expected_updated_at にそのまま使える。updated=false なら null
    pub updated_at: Option<String>,
}

#[tool_router]
impl LoreleiServer {
    pub fn new(editor: Arc<dyn EditorPort>) -> Self {
        Self {
            editor,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(
        name = "validate",
        description = "Mermaid のテキストを検査する。文法エラーなら ok=false と理由 (分かれば行番号) を返す。\
                       editor 欄は GUI エディタで開けるか (flowchart / erDiagram のみ) と、開くと失われる要素 \
                       (classDef・style・サブグラフを指す線・サブグラフの中の direction など) の件数。flowchart の subgraph は枠として残る。"
    )]
    async fn validate(
        &self,
        Parameters(p): Parameters<ValidateParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let result = blocking(move || validate(&p.source)).await?;
        Ok(match result {
            Ok(v) => CallToolResult::structured(to_value(&v)?),
            Err(e) => core_error(&e),
        })
    }

    #[tool(
        name = "render",
        description = "Mermaid を SVG / PNG / PDF に描画する。日本語は同梱フォント (Noto Sans JP) で描く。\
                       png / pdf は output_path (絶対パス、拡張子は形式と一致、親フォルダは既存) に書き出す。\
                       svg で output_path を省くと SVG 本文を返す。既存ファイルは overwrite=true の時だけ上書きする。\
                       描画結果の縮小 PNG を毎回画像で返す (preview、既定 true)。画像で見た目を確かめ、\
                       ラベルの重なりや読みにくい配置があれば Mermaid を直して描き直すこと。\
                       flowchart / erDiagram / sequenceDiagram / classDiagram / stateDiagram ほか Mermaid の図に対応。"
    )]
    async fn render(
        &self,
        Parameters(p): Parameters<RenderParams>,
    ) -> Result<CallToolResult, ErrorData> {
        blocking(move || render_tool(p)).await?
    }

    #[tool(
        name = "open_in_editor",
        description = "Mermaid を Lorelei の GUI エディタで開き、人が手直しできるようにする。\
                       対応は flowchart と erDiagram だけ (ノードの無い図は開けない)。開いている Lorelei の窓に出る。\
                       図は GUI の図の一覧に新しい 1 件として足され、開いている図は上書きしない (既存の図を書き換えるのは update_diagram)。\
                       title でその名前を付けられる。flowchart の subgraph は枠として開く (入れ子も)。\
                       エディタで表現できない要素 (classDef・style・サブグラフを指す線・サブグラフの中の direction など) は dropped に件数が返る。\
                       返る document_id と updated_at は、そのまま read_diagram / update_diagram に渡せる。"
    )]
    async fn open_in_editor(
        &self,
        Parameters(p): Parameters<OpenParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let editor = Arc::clone(&self.editor);
        let result = blocking(move || open_in_editor(&p.source, p.title, editor.as_ref())).await?;
        Ok(match result {
            Ok(r) => CallToolResult::structured(to_value(&r)?),
            Err(e) => core_error(&e),
        })
    }

    #[tool(
        name = "list_diagrams",
        description = "Lorelei の GUI の図の一覧を返す (並びは GUI の一覧と同じ)。open=true が今 GUI で開いている図。                       unsaved は最後の「保存」(Ctrl+S) の後に変更があるか。中身は read_diagram で読む。"
    )]
    async fn list_diagrams(&self) -> Result<CallToolResult, ErrorData> {
        let editor = Arc::clone(&self.editor);
        Ok(match blocking(move || editor.list()).await? {
            Ok(diagrams) => CallToolResult::structured(json!({ "diagrams": to_value(&diagrams)? })),
            Err(e) => tool_error(json!({ "error": e })),
        })
    }

    #[tool(
        name = "read_diagram",
        description = "人が Lorelei の GUI で直した今の図を Mermaid で読む。id を省くと今 GUI で開いている図。\
                       source はエディタが出した Mermaid で、style・classDef などは落ちている (向き・FK・flowchart の subgraph は残る)。\
                       ただし update_diagram の後、GUI でその図を開く (載せ替える) までは、届けた Mermaid そのものが返る。\
                       最後に届けた原文が要る時は include_original=true (original_source)。\
                       GUI での編集は約 1 秒後に保存されるので、直後の編集は含まれないことがある。\
                       source が空文字なら、新規作成の図はまだ何も保存されておらず、AI やインポートで届いた図はまだエディタに載っていない。\
                       source はそのまま validate / render に渡せる。直して書き戻すなら、返った updated_at を添えて update_diagram に渡す。"
    )]
    async fn read_diagram(
        &self,
        Parameters(p): Parameters<ReadParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let editor = Arc::clone(&self.editor);
        Ok(match blocking(move || editor.read(p.id)).await? {
            Ok(d) => CallToolResult::structured(diagram_value(&d, p.include_original)?),
            Err(e) => tool_error(json!({ "error": e })),
        })
    }

    #[tool(
        name = "update_diagram",
        description = "Lorelei の GUI にある既存の図 (id) の中身を、渡した Mermaid で丸ごと差し替える。\
                       read_diagram で読んだ図を直して同じ図に書き戻す時に使う (新しい図を作るのは open_in_editor)。\
                       名前・一覧の並び・同じ ID のノードの位置は保たれる。図の種類 (flowchart / erDiagram) は変えられない。\
                       expected_updated_at は必須: read_diagram 等が返した updated_at をそのまま渡す。人がその後に直していれば書かずにエラーになるので、読み直してから直す。\
                       開いている図なら GUI の中身が載せ替わる (直前約 1 秒の人の編集は消えることがある)。開いていない図はファイルだけ書き、open=true の時だけ開いて前に出す。\
                       返る updated_at は次の update_diagram にそのまま使える。"
    )]
    async fn update_diagram(
        &self,
        Parameters(p): Parameters<UpdateParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let editor = Arc::clone(&self.editor);
        let result = blocking(move || update_diagram(p, editor.as_ref())).await?;
        Ok(match result {
            Ok(r) => CallToolResult::structured(to_value(&r)?),
            Err(UpdateFailure::Core(e)) => core_error(&e),
            Err(UpdateFailure::Editor(message)) => tool_error(json!({ "error": message })),
        })
    }
}

/// include_original=false ならキーごと出さない。true なら文字列か null (data_contract `Diagram.original_source`)
fn diagram_value(d: &Diagram, include_original: bool) -> Result<Value, ErrorData> {
    let mut v = to_value(d)?;
    if !include_original && let Some(obj) = v.as_object_mut() {
        obj.remove("original_source");
    }
    Ok(v)
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for LoreleiServer {
    fn get_info(&self) -> ServerInfo {
        let mut info = ServerInfo::default();
        info.capabilities = ServerCapabilities::builder().enable_tools().build();
        info.server_info.name = "Lorelei".into();
        info.server_info.version = env!("CARGO_PKG_VERSION").into();
        info.instructions = Some(
            "Lorelei は Mermaid の図を検査・描画・書き出しし、GUI で手直しできるようにします。\
             DB やコードは読みません — 図の素材はあなたが読み、Mermaid にして渡してください。\
             書いたら validate で確かめてください。render は描画結果の画像を毎回返すので、\
             その画像で見た目を確かめ、必要なら直してから書き出してください。\
             人が GUI で直した図は read_diagram で読み、直したら返った updated_at を添えて update_diagram で同じ図に書き戻せます。"
                .into(),
        );
        info
    }
}

fn render_tool(p: RenderParams) -> Result<CallToolResult, ErrorData> {
    let options = p.options.unwrap_or_default().resolve();
    let format = RenderFormat::from(p.format);
    if p.output_path.is_none() && format != RenderFormat::Svg {
        return Ok(tool_error(json!({
            "error": format!("{} は output_path が必須です (バイナリは本文で返せません)", format.extension()),
        })));
    }
    let rendered = match render(&p.source, format, &options) {
        Ok(r) => r,
        Err(e) => return Ok(core_error(&e)),
    };

    let mut result = json!({
        "format": rendered.format,
        "family": rendered.family,
        "width": rendered.width,
        "height": rendered.height,
        "svg": Value::Null,
        "output_path": Value::Null,
        "bytes": Value::Null,
    });
    match &p.output_path {
        Some(path) => match write_output(Path::new(path), format, &rendered.bytes, p.overwrite) {
            Ok(written) => {
                result["output_path"] = json!(written.display().to_string());
                result["bytes"] = json!(rendered.bytes.len());
            }
            Err(e) => return Ok(core_error(&CoreError::Output(e))),
        },
        None => result["svg"] = json!(String::from_utf8_lossy(&rendered.bytes)),
    }

    let mut blocks = vec![ContentBlock::text(result.to_string())];
    if p.preview {
        match render_preview_png(&p.source, &options, PREVIEW_MAX_SIDE) {
            Ok(png) => blocks.push(ContentBlock::image(
                base64::engine::general_purpose::STANDARD.encode(png),
                "image/png",
            )),
            Err(e) => return Ok(core_error(&e)),
        }
    }
    let mut out = CallToolResult::success(blocks);
    out.structured_content = Some(result);
    Ok(out)
}

/// open_in_editor の本体。図の種類を確かめてから、GUI へ届ける口 (EditorPort) に渡す。
/// GUI で開けない種類は届ける前に断る。
pub fn open_in_editor(
    source: &str,
    title: Option<String>,
    port: &dyn EditorPort,
) -> Result<OpenResult, CoreError> {
    let refused = |editor: Option<&'static str>, dropped: Vec<DroppedItem>, reason: String| OpenResult {
        opened: false,
        editor,
        dropped,
        reason: Some(reason),
        document_id: None,
        updated_at: None,
    };
    let (editor, dropped) = match check_editable(source)? {
        Ok(ok) => ok,
        Err(Refusal { editor, dropped, reason }) => return Ok(refused(editor, dropped, reason)),
    };
    let title = title.map(|t| t.trim().to_string()).filter(|t| !t.is_empty());
    Ok(match port.open(source.to_string(), title) {
        Ok(Opened { id, updated_at }) => OpenResult {
            opened: true,
            editor: Some(editor.as_str()),
            dropped,
            reason: None,
            document_id: Some(id),
            updated_at: Some(updated_at),
        },
        Err(reason) => refused(Some(editor.as_str()), dropped, reason),
    })
}

/// 届いた図そのものの問題 (GUI で開けない種類・ノードが 0)。opened / updated: false + reason になる (data_contract `McpServer.refusal_vs_error`)
struct Refusal {
    editor: Option<&'static str>,
    dropped: Vec<DroppedItem>,
    reason: String,
}

/// 図を GUI へ渡してよいか。Ok = 種類と dropped、Err = 断る理由。文法エラー等は CoreError のまま (validate と同じツール結果のエラー)
fn check_editable(source: &str) -> Result<Result<(EditorKind, Vec<DroppedItem>), Refusal>, CoreError> {
    let Some(payload) = to_editor(source)? else {
        let family = validate(source)?.family.unwrap_or_default();
        return Ok(Err(Refusal {
            editor: None,
            dropped: Vec::new(),
            reason: format!(
                "この図の種類 ({family}) は GUI エディタで開けません。対応は flowchart と erDiagram だけです (render で描画はできます)"
            ),
        }));
    };
    let (editor, node_count) = match &payload {
        EditorPayload::Flowchart { data, .. } => (EditorKind::Flowchart, data.nodes.len()),
        EditorPayload::ErDiagram { data, .. } => (EditorKind::ErDiagram, data.nodes.len()),
    };
    let dropped = payload.dropped().to_vec();
    // ノードが 0 の図はエディタの取り込みが何もせず、前のキャンバスがその図として保存される (spec 08 現況 4)
    if node_count == 0 {
        return Ok(Err(Refusal {
            editor: Some(editor.as_str()),
            dropped,
            reason: "ノードの無い図は開けません (ノードやテーブルを 1 つ以上書いてください)".into(),
        }));
    }
    Ok(Ok((editor, dropped)))
}

/// update_diagram の失敗。Core は文法エラー等 (validate と同じ形)、Editor は口のエラー文字列 (ツール結果のエラー { error })
pub enum UpdateFailure {
    Core(CoreError),
    Editor(String),
}

impl From<CoreError> for UpdateFailure {
    fn from(e: CoreError) -> Self {
        Self::Core(e)
    }
}

/// update_diagram の本体 (spec 08 D1・D4)。届いた図そのものの問題は updated: false + reason、指した図の状態の問題は Err(Editor)
pub fn update_diagram(p: UpdateParams, port: &dyn EditorPort) -> Result<UpdateResult, UpdateFailure> {
    let refused = |editor: Option<&'static str>, dropped: Vec<DroppedItem>, reason: String| UpdateResult {
        updated: false,
        editor,
        dropped,
        reason: Some(reason),
        open: false,
        updated_at: None,
    };
    let (editor, dropped) = match check_editable(&p.source)? {
        Ok(ok) => ok,
        Err(Refusal { editor, dropped, reason }) => return Ok(refused(editor, dropped, reason)),
    };
    // 時刻として読めない値は入力のエラー。同じ瞬間かの比較は GUI 側 (data_contract `Document.update`)
    if chrono::DateTime::parse_from_rfc3339(&p.expected_updated_at).is_err() {
        return Err(UpdateFailure::Editor(format!(
            "expected_updated_at を時刻 (RFC 3339) として読めません: {:?}。read_diagram が返した updated_at をそのまま渡してください",
            p.expected_updated_at
        )));
    }
    let req = UpdateRequest {
        id: p.id.clone(),
        source: p.source,
        editor,
        expected_updated_at: p.expected_updated_at,
        open: p.open,
    };
    match port.update(req) {
        Ok(UpdateOutcome { open, updated_at }) => Ok(UpdateResult {
            updated: true,
            editor: Some(editor.as_str()),
            dropped,
            reason: None,
            open,
            updated_at: Some(updated_at),
        }),
        Err(UpdateError::KindMismatch { actual }) => Ok(refused(
            Some(editor.as_str()),
            dropped,
            format!(
                "この図は {} です。{} にするなら open_in_editor で新しい図を作ってください",
                actual.as_str(),
                editor.as_str()
            ),
        )),
        Err(UpdateError::NotFound) => Err(UpdateFailure::Editor(format!("図が見つかりません（id: {}）", p.id))),
        Err(UpdateError::Conflict { current_updated_at }) => Err(UpdateFailure::Editor(format!(
            "図が変わっています（updated_at: {current_updated_at}）。read_diagram で読み直してから update_diagram してください"
        ))),
        Err(UpdateError::Other(message)) => Err(UpdateFailure::Editor(message)),
    }
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> T + Send + 'static,
) -> Result<T, ErrorData> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| ErrorData::internal_error(e.to_string(), None))
}

fn to_value<T: Serialize>(v: &T) -> Result<Value, ErrorData> {
    serde_json::to_value(v).map_err(|e| ErrorData::internal_error(e.to_string(), None))
}

fn tool_error(value: Value) -> CallToolResult {
    CallToolResult::structured_error(value)
}

/// 入力や規則の問題は呼ぶ側 (AI) が読んで直せるよう、ツール結果のエラーとして返す。
fn core_error(e: &CoreError) -> CallToolResult {
    let mut v = json!({ "error": e.to_string() });
    if let CoreError::Parse(p) = e {
        v["line"] = json!(p.line);
    }
    tool_error(v)
}
