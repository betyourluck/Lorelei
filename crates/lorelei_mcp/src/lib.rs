//! Lorelei の MCP サーバー (stdio)。spec 01 D1 / D2、ツールの入出力の正は data_contract `McpServer.tools`。
//!
//! **stdout は JSON-RPC 専用** (D1)。このクレートは stdout へ何も書かない — ログが要るなら stderr。
//! GUI を起動する時も子プロセスに stdin / stdout / stderr を引き継がせない。

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use base64::Engine as _;
use lorelei_core::output::write_output;
use lorelei_core::{
    CoreError, DroppedItem, EditorPayload, RenderFormat, RenderOptions, render, render_preview_png,
    to_editor, validate,
};
use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{CallToolResult, ContentBlock, ServerCapabilities, ServerInfo};
use rmcp::{ErrorData, ServerHandler, ServiceExt, schemars, tool, tool_handler, tool_router};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

/// preview の長辺 (px)。Claude の画像入力の推奨上限に合わせた値 (spec 01 D2)。
pub const PREVIEW_MAX_SIDE: u32 = 1568;

/// open_in_editor が GUI をどう起動するか。
#[derive(Debug, Clone, Default)]
pub struct GuiLauncher {
    /// GUI の実行ファイル。単一 exe 構成 (D1) では `current_exe()`。None なら GUI では開けない。
    pub exe: Option<PathBuf>,
}

/// stdin / stdout で MCP を喋る。クライアントが切断するまで戻らない。
pub async fn run_stdio(launcher: GuiLauncher) -> Result<(), Box<dyn std::error::Error>> {
    let service = LoreleiServer::new(launcher)
        .serve(rmcp::transport::stdio())
        .await?;
    service.waiting().await?;
    Ok(())
}

#[derive(Clone)]
pub struct LoreleiServer {
    launcher: GuiLauncher,
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
}

/// data_contract `McpServer.tools.open_in_editor.output`。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct OpenResult {
    pub opened: bool,
    pub editor: Option<&'static str>,
    pub dropped: Vec<DroppedItem>,
    pub reason: Option<String>,
}

#[tool_router]
impl LoreleiServer {
    pub fn new(launcher: GuiLauncher) -> Self {
        Self {
            launcher,
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
                       対応は flowchart と erDiagram だけ。GUI が起動していなければ起動し、起動中ならその窓で開く。\
                       エディタで表現できない要素 (subgraph・classDef・style など) は dropped に件数が返る。"
    )]
    async fn open_in_editor(
        &self,
        Parameters(p): Parameters<OpenParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let launcher = self.launcher.clone();
        let inbox = lorelei_core::paths::inbox_dir();
        let result =
            blocking(move || open_in_editor(&p.source, &launcher, inbox.as_deref())).await?;
        Ok(match result {
            Ok(r) => CallToolResult::structured(to_value(&r)?),
            Err(e) => core_error(&e),
        })
    }
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

/// open_in_editor の本体。GUI の起動と inbox の場所を引数で受けるのはテストのため。
pub fn open_in_editor(
    source: &str,
    launcher: &GuiLauncher,
    inbox: Option<&Path>,
) -> Result<OpenResult, CoreError> {
    let payload = to_editor(source)?;
    let Some(payload) = payload else {
        let family = validate(source)?.family.unwrap_or_default();
        return Ok(OpenResult {
            opened: false,
            editor: None,
            dropped: Vec::new(),
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
    let not_opened = |reason: String| OpenResult {
        opened: false,
        editor: Some(editor),
        dropped: dropped.clone(),
        reason: Some(reason),
    };

    let Some(exe) = &launcher.exe else {
        return Ok(not_opened("GUI の実行ファイルが見つかりません".into()));
    };
    let Some(inbox) = inbox else {
        return Ok(not_opened("アプリのデータフォルダを決められません".into()));
    };
    let file = inbox.join(format!("{}.mmd", uuid::Uuid::new_v4()));
    if let Err(e) = std::fs::create_dir_all(inbox).and_then(|_| std::fs::write(&file, source)) {
        return Ok(not_opened(format!(
            "inbox に書けません ({}): {e}",
            inbox.display()
        )));
    }
    if let Err(e) = spawn_gui(exe, &file) {
        let _ = std::fs::remove_file(&file);
        return Ok(not_opened(format!(
            "GUI を起動できません ({}): {e}",
            exe.display()
        )));
    }
    Ok(OpenResult {
        opened: true,
        editor: Some(editor),
        dropped,
        reason: None,
    })
}

/// GUI を切り離して起動する。終了は待たない (D8)。
fn spawn_gui(exe: &Path, file: &Path) -> std::io::Result<()> {
    let mut cmd = Command::new(exe);
    cmd.arg("--open")
        .arg(file)
        // MCP の stdio を引き継がせない (stdout に JSON-RPC 以外が混ざるのを防ぐ)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;
        // MCP クライアントがジョブで子孫ごと終了させる場合でも GUI が残るよう、ジョブから抜ける。
        // ジョブが抜けることを許していなければ spawn が失敗するので、抜けずに起動し直す
        cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB);
        if cmd.spawn().is_ok() {
            return Ok(());
        }
        cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    cmd.spawn().map(drop)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lorelei-inbox-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// GUI の代わりに、このテストの実行ファイル自身を起動する (起動できること・inbox に書くことを見る)。
    #[test]
    fn open_writes_to_the_inbox_and_launches_the_gui() {
        let inbox = scratch();
        let launcher = GuiLauncher {
            exe: Some(std::env::current_exe().unwrap()),
        };
        let r = open_in_editor(
            "flowchart TD\n  subgraph S\n    A --> B\n  end\n",
            &launcher,
            Some(&inbox),
        )
        .unwrap();
        assert!(r.opened, "{r:?}");
        assert_eq!(r.editor, Some("flowchart"));
        assert_eq!(r.dropped[0].construct, "subgraph");
        let files: Vec<_> = std::fs::read_dir(&inbox).unwrap().flatten().collect();
        assert_eq!(files.len(), 1);
        assert!(
            std::fs::read_to_string(files[0].path())
                .unwrap()
                .contains("subgraph S")
        );
        std::fs::remove_dir_all(inbox).unwrap();
    }

    #[test]
    fn a_launch_failure_leaves_no_file_behind() {
        let inbox = scratch();
        let launcher = GuiLauncher {
            exe: Some(inbox.join("no-such-gui.exe")),
        };
        let r = open_in_editor("erDiagram\n  A ||--o{ B : has\n", &launcher, Some(&inbox)).unwrap();
        assert!(!r.opened);
        assert_eq!(r.editor, Some("erDiagram"));
        assert!(r.reason.unwrap().contains("起動できません"));
        assert_eq!(std::fs::read_dir(&inbox).unwrap().count(), 0);
        std::fs::remove_dir_all(inbox).unwrap();
    }
}
