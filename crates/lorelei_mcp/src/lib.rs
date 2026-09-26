//! Lorelei の MCP サーバー。ツールの入出力の正は data_contract `McpServer.tools`。
//!
//! GUI のプロセスの中で `127.0.0.1:{port}/mcp` に Streamable HTTP で待ち受ける (`start_http`, spec 03)。
//! `open_in_editor` は `EditorPort` で GUI へじかに届ける。stdio の `lorelei --mcp` は spec 03 P3 で撤去した。
//! `list_diagrams` / `read_diagram` は同じ口で GUI の図の一覧を読む (spec 04。人が直した図の読み戻し)。

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
    /// 図を GUI の一覧に新しい 1 件として足し、開く。Ok は作った図の id (document_id)。
    /// 届けられなかった理由は Err で返す (opened: false の reason になる)
    fn open(&self, source: String, title: Option<String>) -> Result<String, String>;
    /// 図の一覧 (GUI の一覧と同じ並び)
    fn list(&self) -> Result<Vec<DiagramSummary>, String>;
    /// 1 枚の図。id を省くと今 GUI で開いている図。original_source は常に詰める (省くのはツールの層)。
    /// Err の文字列はそのまま AI に見せる (ファイルのパスを載せない)
    fn read(&self, id: Option<String>) -> Result<Diagram, String>;
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
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ReadParams {
    /// 読む図の id (list_diagrams の id、または open_in_editor の document_id)。省くと今 GUI で開いている図。
    #[serde(default)]
    pub id: Option<String>,
    /// true なら、AI やインポートで届いた時の原文 (original_source) も返す。新規作成の図は null。
    #[serde(default)]
    pub include_original: bool,
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
                       (subgraph・classDef・style など) の件数。"
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
                       対応は flowchart と erDiagram だけ。開いている Lorelei の窓に出る。\
                       図は GUI の図の一覧に新しい 1 件として足され、開いている図は上書きしない。title でその名前を付けられる。\
                       エディタで表現できない要素 (subgraph・classDef・style など) は dropped に件数が返る。"
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
        description = "人が Lorelei の GUI で直した今の図を Mermaid で読む。id を省くと今 GUI で開いている図。                       source はエディタが出した Mermaid で、subgraph・style・classDef などは落ちている (向きと FK は残る)。                       渡した原文が要る時は include_original=true (original_source)。                       GUI での編集は約 1 秒後に保存されるので、直後の編集は含まれないことがある。                       source が空文字なら、新規作成の図はまだ何も保存されておらず、AI やインポートで届いた図はまだエディタに載っていない。                       source はそのまま validate / render に渡せる。"
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
             その画像で見た目を確かめ、必要なら直してから書き出してください。"
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
    let payload = to_editor(source)?;
    let Some(payload) = payload else {
        let family = validate(source)?.family.unwrap_or_default();
        return Ok(OpenResult {
            opened: false,
            editor: None,
            dropped: Vec::new(),
            document_id: None,
            reason: Some(format!(
                "この図の種類 ({family}) は GUI エディタで開けません。対応は flowchart と erDiagram だけです (render で描画はできます)"
            )),
        });
    };
    let editor = match &payload {
        EditorPayload::Flowchart { .. } => "flowchart",
        EditorPayload::ErDiagram { .. } => "erDiagram",
    };
    let dropped = payload.dropped().to_vec();
    let title = title.map(|t| t.trim().to_string()).filter(|t| !t.is_empty());
    Ok(match port.open(source.to_string(), title) {
        Ok(id) => OpenResult {
            opened: true,
            editor: Some(editor),
            dropped,
            reason: None,
            document_id: Some(id),
        },
        Err(reason) => OpenResult {
            opened: false,
            editor: Some(editor),
            dropped,
            reason: Some(reason),
            document_id: None,
        },
    })
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
