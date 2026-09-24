//! Lorelei のデスクトップ殻 (spec 01 P3)。
//!
//! - `lorelei --mcp`: MCP サーバー (stdio)。本体は `lorelei_mcp`
//! - `lorelei [--open <inbox のファイル>]`: GUI。2 つ目の起動は single-instance が argv を 1 つ目へ渡して終わる

mod desktop;
mod documents;
mod mcp_host;

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use lorelei_core::paths::{INBOX_EXTENSION, InboxItem};
use lorelei_core::{DroppedItem, EditorPayload};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// フロントへ「開く図が届いた」ことを知らせるイベント。本体は `take_pending_open` で取りに来る
/// (初回起動時はフロントの読み込み前に届くので、イベントだけだと取りこぼす)。
pub const OPEN_EVENT: &str = "lorelei://open-pending";

/// クラッシュ等で残った inbox のファイルを捨てる目安 (spec 01 D8)。
const INBOX_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);

/// MCP モード。戻り値はプロセスの終了コード。stdout は JSON-RPC 専用なので、失敗は stderr へ。
pub fn run_mcp() -> i32 {
    let launcher = lorelei_mcp::GuiLauncher {
        exe: std::env::current_exe().ok(),
        inbox: lorelei_core::paths::inbox_dir(),
    };
    let runtime = match tokio::runtime::Runtime::new() {
        Ok(rt) => rt,
        Err(e) => {
            eprintln!("lorelei --mcp: {e}");
            return 1;
        }
    };
    match runtime.block_on(lorelei_mcp::run_stdio(launcher)) {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("lorelei --mcp: {e}");
            1
        }
    }
}

/// GUI へ届いた「開く図」1 件。フロントは editor ごとに既存の取り込み処理へ data を渡す。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenRequest {
    /// 元の Mermaid。エディタで開けなかった時に人が読めるように付ける。
    pub source: String,
    /// 変換結果。None なら error に理由。
    pub payload: Option<EditorPayload>,
    pub dropped: Vec<DroppedItem>,
    pub error: Option<String>,
    /// AI / インポートで届いた図のために作った新しい 1 件 (spec 02 D8・D10)。変換に失敗した時は作らない
    pub document: Option<documents::DocumentSummary>,
}

#[derive(Default)]
struct PendingOpens(Mutex<Vec<OpenRequest>>);

fn editor_of(payload: &EditorPayload) -> documents::Editor {
    match payload {
        EditorPayload::Flowchart { .. } => documents::Editor::Flowchart,
        EditorPayload::ErDiagram { .. } => documents::Editor::ErDiagram,
    }
}

/// 届いた図を変換し、開ける時だけ一覧に新しい 1 件を作る。今開いている図は上書きしない (spec 02 P3 の設計の補足 1)
/// `title` は MCP の open_in_editor で AI が付けた名前 (無ければ既定の名前, spec 02 D8)
fn incoming(
    store: &documents::Store,
    source: String,
    origin: documents::Origin,
    title: Option<String>,
) -> OpenRequest {
    let mut request = request_from_source(source);
    let Some(payload) = &request.payload else {
        return request;
    };
    match store.create(editor_of(payload), title, origin, Some(request.source.clone())) {
        Ok(doc) => request.document = Some((&doc).into()),
        Err(e) => {
            request.payload = None;
            request.error = Some(format!("図の一覧に足せませんでした: {e}"));
        }
    }
    request
}

fn store() -> Result<documents::Store, String> {
    documents::Store::open_default().ok_or_else(|| "アプリのデータフォルダを決められません".into())
}

pub fn run_gui() {
    tauri::Builder::default()
        // single-instance は最初に登録する (プラグインの要求)
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            accept_argv(app, argv.into_iter());
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .manage(PendingOpens::default())
        .setup(|app| {
            if let Some(inbox) = lorelei_core::paths::inbox_dir() {
                sweep_inbox(&inbox, INBOX_MAX_AGE);
            }
            accept_argv(app.handle(), std::env::args());
            // MCP の待ち受け (spec 03 D2: 既定で ON)。失敗しても GUI は起動する (状態として見せる)
            let editor = std::sync::Arc::new(GuiEditor(app.handle().clone()));
            let host = mcp_host::McpHost::new(mcp_host::ConfigStore::load_default(), editor);
            app.manage(McpState(tokio::sync::Mutex::new(host)));
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = handle.state::<McpState>();
                let mut host = state.0.lock().await;
                host.apply().await;
                emit_status(&handle, &host.status());
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_open,
            import_source,
            convert_source,
            list_documents,
            create_document,
            load_document,
            save_document,
            mark_document_saved,
            rename_document,
            trash_document,
            last_opened,
            set_last_opened,
            mcp_status,
            set_mcp_enabled,
            set_mcp_port,
            regenerate_mcp_token,
            desktop::export_diagram,
            desktop::show_about
        ])
        .run(tauri::generate_context!())
        .expect("Lorelei の起動に失敗しました");
}

/// フロントが準備できたら呼ぶ。溜まっている「開く図」を全部渡して空にする。
#[tauri::command]
fn take_pending_open(state: tauri::State<'_, PendingOpens>) -> Vec<OpenRequest> {
    std::mem::take(&mut *state.0.lock().expect("pending opens"))
}

/// ツールバーのインポート (spec 02 D10)。新しい 1 件を作って「開く図」として溜め、AI から届いた図と同じ経路で開く —
/// 失敗や省いた要素の通知もそちらに揃う。
#[tauri::command]
fn import_source(app: AppHandle, source: String) -> Result<(), String> {
    push_open(&app, incoming(&store()?, source, documents::Origin::Import, None));
    Ok(())
}

/// 保存した図を開く時の変換。溜めない・イベントも出さない (作り直す前の古いエディタに拾わせないため)
#[tauri::command]
fn convert_source(source: String) -> OpenRequest {
    request_from_source(source)
}

#[tauri::command]
fn list_documents() -> Result<Vec<documents::DocumentSummary>, String> {
    store()?.list()
}

#[tauri::command]
fn create_document(
    editor: documents::Editor,
    title: Option<String>,
) -> Result<documents::Document, String> {
    store()?.create(editor, title, documents::Origin::New, None)
}

#[tauri::command]
fn load_document(id: String) -> Result<documents::Document, String> {
    store()?.load(&id)
}

/// 自動保存 (D7)。並びは動かさない
#[tauri::command]
fn save_document(
    id: String,
    source: String,
    layout: documents::Layout,
) -> Result<documents::DocumentSummary, String> {
    store()?.save(&id, source, layout)
}

/// 利用者の「保存」(D12)。一覧の先頭へ動く
#[tauri::command]
fn mark_document_saved(id: String) -> Result<documents::DocumentSummary, String> {
    store()?.mark_saved(&id)
}

#[tauri::command]
fn rename_document(id: String, title: String) -> Result<(), String> {
    store()?.rename(&id, title)
}

#[tauri::command]
fn trash_document(id: String) -> Result<(), String> {
    store()?.trash(&id)
}

#[tauri::command]
fn last_opened() -> Result<Option<String>, String> {
    Ok(store()?.last_opened())
}

#[tauri::command]
fn set_last_opened(id: String) -> Result<(), String> {
    store()?.set_last_opened(&id)
}

fn push_open<R: tauri::Runtime>(app: &AppHandle<R>, request: OpenRequest) {
    if let Some(state) = app.try_state::<PendingOpens>() {
        state.0.lock().expect("pending opens").push(request);
    }
    let _ = app.emit(OPEN_EVENT, ());
}

/// HTTP の MCP の open_in_editor の行き先 (spec 03 D1)。一覧に新しい 1 件を足し、フロントへの預かりに積む。
/// 足せなかった時は理由を返す (MCP の `opened: false` の reason になる)
fn deliver<R: tauri::Runtime>(
    app: &AppHandle<R>,
    store: &documents::Store,
    source: String,
    title: Option<String>,
) -> Result<(), String> {
    let request = incoming(store, source, documents::Origin::Ai, title);
    if request.document.is_none() {
        return Err(request
            .error
            .unwrap_or_else(|| "図の一覧に足せませんでした".into()));
    }
    push_open(app, request);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    Ok(())
}

/// GUI の中の HTTP の MCP が図を届ける口
struct GuiEditor(AppHandle);

impl lorelei_mcp::EditorPort for GuiEditor {
    fn open(&self, source: String, title: Option<String>) -> Result<(), String> {
        deliver(&self.0, &store()?, source, title)
    }
}

/// MCP の待ち受けの状態が変わった合図 (本体は McpStatus)
const MCP_STATUS_EVENT: &str = "lorelei://mcp-status";

struct McpState(tokio::sync::Mutex<mcp_host::McpHost>);

fn emit_status(app: &AppHandle, status: &mcp_host::McpStatus) {
    let _ = app.emit(MCP_STATUS_EVENT, status);
}

#[tauri::command]
async fn mcp_status(state: tauri::State<'_, McpState>) -> Result<mcp_host::McpStatus, String> {
    Ok(state.0.lock().await.status())
}

#[tauri::command]
async fn set_mcp_enabled(
    app: AppHandle,
    state: tauri::State<'_, McpState>,
    enabled: bool,
) -> Result<mcp_host::McpStatus, String> {
    let status = state.0.lock().await.set_enabled(enabled).await?;
    emit_status(&app, &status);
    Ok(status)
}

#[tauri::command]
async fn set_mcp_port(
    app: AppHandle,
    state: tauri::State<'_, McpState>,
    port: u16,
) -> Result<mcp_host::McpStatus, String> {
    let status = state.0.lock().await.set_port(port).await?;
    emit_status(&app, &status);
    Ok(status)
}

#[tauri::command]
async fn regenerate_mcp_token(
    app: AppHandle,
    state: tauri::State<'_, McpState>,
) -> Result<mcp_host::McpStatus, String> {
    let status = state.0.lock().await.regenerate_token().await?;
    emit_status(&app, &status);
    Ok(status)
}

/// argv の `--open <path>` を拾って溜め、フロントへ知らせる。
fn accept_argv(app: &AppHandle, argv: impl Iterator<Item = String>) {
    let Some(path) = open_arg(argv) else { return };
    let request = match (lorelei_core::paths::inbox_dir(), store()) {
        (Some(inbox), Ok(store)) => match read_inbox(&path, &inbox) {
            Ok(item) => incoming(&store, item.source, documents::Origin::Ai, item.title),
            Err(e) => OpenRequest::failed(String::new(), e),
        },
        _ => OpenRequest::failed(
            String::new(),
            "アプリのデータフォルダを決められません".into(),
        ),
    };
    push_open(app, request);
}

fn open_arg(mut argv: impl Iterator<Item = String>) -> Option<PathBuf> {
    while let Some(arg) = argv.next() {
        if arg == "--open" {
            return argv.next().map(PathBuf::from);
        }
    }
    None
}

impl OpenRequest {
    fn failed(source: String, error: String) -> Self {
        Self {
            source,
            payload: None,
            dropped: Vec::new(),
            error: Some(error),
            document: None,
        }
    }
}

/// inbox のファイルを読んで消す (spec 01 D8)。
fn read_inbox(path: &Path, inbox: &Path) -> Result<InboxItem, String> {
    let text = read_inbox_file(path, inbox)?;
    let _ = std::fs::remove_file(path);
    serde_json::from_str(&text).map_err(|e| format!("inbox のファイルが壊れています: {e}"))
}

/// inbox のファイルを読み、エディタのデータ形へ変換し、ファイルを消す (spec 01 D8)。一覧には足さない
pub fn open_request(path: &Path, inbox: &Path) -> OpenRequest {
    match read_inbox(path, inbox) {
        Ok(item) => request_from_source(item.source),
        Err(e) => OpenRequest::failed(String::new(), e),
    }
}

/// Mermaid の原文をエディタのデータ形へ変換する。AI から届いた図もツールバーのインポートもここを通る
/// (フォーク元のパーサーは通さない, spec 01 D5' / spec 02 D10)。
pub fn request_from_source(source: String) -> OpenRequest {
    match lorelei_core::to_editor(&source) {
        Ok(Some(payload)) => OpenRequest {
            dropped: payload.dropped().to_vec(),
            payload: Some(payload),
            source,
            error: None,
            document: None,
        },
        Ok(None) => OpenRequest::failed(source, "この図の種類は GUI エディタで開けません".into()),
        Err(e) => OpenRequest::failed(source, e.to_string()),
    }
}

/// `--open` で渡されたパスが inbox の中の `.json` である時だけ読む (spec 02 D8。spec 01 の `.mmd` は読まない)。
/// argv は誰でも渡せるので、任意のファイルを読む口にしない。
fn read_inbox_file(path: &Path, inbox: &Path) -> Result<String, String> {
    let file = path
        .canonicalize()
        .map_err(|e| format!("開くファイルが見つかりません ({}): {e}", path.display()))?;
    let inbox = inbox
        .canonicalize()
        .map_err(|e| format!("inbox が見つかりません ({}): {e}", inbox.display()))?;
    let in_inbox = file.parent() == Some(inbox.as_path());
    let is_item = file.extension().is_some_and(|e| e == INBOX_EXTENSION);
    if !in_inbox || !is_item {
        return Err(format!(
            "inbox の外のファイルは開きません: {}",
            path.display()
        ));
    }
    std::fs::read_to_string(&file).map_err(|e| format!("読めません ({}): {e}", file.display()))
}

/// 古い inbox のファイルを捨てる。GUI が読む前に落ちた分の後始末。
pub fn sweep_inbox(inbox: &Path, max_age: Duration) {
    let Ok(entries) = std::fs::read_dir(inbox) else {
        return;
    };
    let now = SystemTime::now();
    for entry in entries.flatten() {
        let path = entry.path();
        let old = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| now.duration_since(t).ok())
            .is_some_and(|age| age > max_age);
        // spec 01 の形式 (.mmd) の取り残しも一緒に捨てる
        if old && path.extension().is_some_and(|e| e == INBOX_EXTENSION || e == "mmd") {
            let _ = std::fs::remove_file(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "lorelei-gui-{}",
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// src-tauri は独立 project なので、ルートの [patch.crates-io] が効かない。同じ patch がここでも効くこと。
    #[test]
    fn japanese_node_ids_are_accepted_in_the_gui_build() {
        let v = lorelei_core::validate("flowchart TD\n  開始 --> 終了\n").unwrap();
        assert!(v.ok, "{v:?}");
    }

    // HTTP の MCP の open_in_editor は GUI の中でじかに届く (spec 03 D1): 一覧に 1 件足し、フロントへの預かりに積む
    #[test]
    fn http_open_in_editor_adds_a_document_and_queues_it() {
        let app = tauri::test::mock_builder()
            .manage(PendingOpens::default())
            .build(tauri::generate_context!())
            .expect("mock app");
        let store = documents::Store::new(scratch());
        deliver(app.handle(), &store, "flowchart TD\n  A --> B\n".into(), Some("注文".into())).unwrap();
        let pending = app.state::<PendingOpens>();
        let pending = pending.0.lock().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].document.as_ref().unwrap().title, "注文");
        assert_eq!(store.list().unwrap().len(), 1);
        drop(pending);

        // 変換できない図は一覧に足さず、理由を返す (MCP の opened: false の reason になる)
        let err = deliver(app.handle(), &store, "flowchart TD\n  A[a --> B\n".into(), None);
        assert!(err.is_err());
        assert_eq!(store.list().unwrap().len(), 1);
    }

    /// MCP モードは Tauri を使わずに inbox の場所を組み立てる。Tauri の app_data_dir() と一致すること (D8)。
    #[test]
    fn inbox_location_matches_tauri_app_data_dir() {
        let app = tauri::test::mock_builder()
            .build(tauri::generate_context!())
            .expect("mock app");
        let tauri_dir = app.path().app_data_dir().unwrap();
        assert_eq!(Some(tauri_dir), lorelei_core::paths::app_data_dir());
    }

    #[test]
    fn open_arg_takes_the_path_after_the_flag() {
        let argv = ["lorelei", "--open", "C:/x/a.json"].map(String::from);
        assert_eq!(
            open_arg(argv.into_iter()),
            Some(PathBuf::from("C:/x/a.json"))
        );
        assert_eq!(open_arg(["lorelei"].map(String::from).into_iter()), None);
        assert_eq!(
            open_arg(["lorelei", "--open"].map(String::from).into_iter()),
            None
        );
    }

    fn write_item(path: &Path, source: &str, title: Option<&str>) {
        let item = lorelei_core::paths::InboxItem {
            source: source.into(),
            title: title.map(Into::into),
        };
        std::fs::write(path, serde_json::to_string(&item).unwrap()).unwrap();
    }

    #[test]
    fn open_request_converts_and_consumes_the_inbox_file() {
        let inbox = scratch();
        let file = inbox.join("a.json");
        write_item(&file, "flowchart TD\n  subgraph S\n    A --> B\n  end\n", None);
        let r = open_request(&file, &inbox);
        assert!(r.error.is_none(), "{r:?}");
        assert!(matches!(r.payload, Some(EditorPayload::Flowchart { .. })));
        assert_eq!(r.dropped[0].construct, "subgraph");
        assert!(!file.exists(), "読んだファイルが残っている");
        std::fs::remove_dir_all(inbox).unwrap();
    }

    // MCP の open_in_editor の title が図の名前になる (spec 02 D8)
    #[test]
    fn inbox_title_names_the_new_document() {
        let inbox = scratch();
        let store = documents::Store::new(scratch());
        let file = inbox.join("b.json");
        write_item(&file, "flowchart TD\n  A --> B\n", Some("注文フロー"));
        let item = read_inbox(&file, &inbox).unwrap();
        let r = incoming(&store, item.source, documents::Origin::Ai, item.title);
        assert_eq!(r.document.unwrap().title, "注文フロー");

        let untitled = incoming(&store, "flowchart TD\n  A --> B\n".into(), documents::Origin::Ai, None);
        assert!(untitled.document.unwrap().title.starts_with("AI の図 "));
        std::fs::remove_dir_all(inbox).unwrap();
    }

    #[test]
    fn files_outside_the_inbox_or_not_json_are_refused() {
        let inbox = scratch();
        let outside = scratch();
        let secret = outside.join("secret.json");
        write_item(&secret, "flowchart TD\n  A --> B\n", None);
        let txt = inbox.join("note.txt");
        std::fs::write(&txt, "flowchart TD\n  A --> B\n").unwrap();
        // spec 01 の形式 (本文だけの .mmd) は読まない。移行期に残った分は起動時の掃除で消える
        let old = inbox.join("old.mmd");
        std::fs::write(&old, "flowchart TD\n  A --> B\n").unwrap();
        for path in [&secret, &txt, &old] {
            let r = open_request(path, &inbox);
            assert!(r.error.unwrap().contains("inbox の外"), "{path:?}");
            assert!(path.exists(), "拒否したのにファイルを消した: {path:?}");
        }
        std::fs::remove_dir_all(inbox).unwrap();
        std::fs::remove_dir_all(outside).unwrap();
    }

    #[test]
    fn export_writes_each_format_and_overwrites_the_chosen_file() {
        let dir = scratch();
        let src = "flowchart TD\n  開始 --> 終了\n";
        for (format, magic) in [
            (lorelei_core::RenderFormat::Svg, &b"<svg"[..]),
            (lorelei_core::RenderFormat::Png, &b"\x89PNG"[..]),
            (lorelei_core::RenderFormat::Pdf, &b"%PDF"[..]),
        ] {
            let path = dir.join(format!("図.{}", format.extension()));
            std::fs::write(&path, b"old").unwrap();
            desktop::export_to(&path, src, format).unwrap();
            assert!(std::fs::read(&path).unwrap().starts_with(magic), "{path:?}");
        }
        let err = desktop::export_to(
            &dir.join("x.svg"),
            "flowchart TD\n  A[a --> B\n",
            lorelei_core::RenderFormat::Svg,
        );
        assert!(err.is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }

    // 届いた図は新しい 1 件になる (spec 02 D8・D10、P3 の設計の補足 1)
    #[test]
    fn incoming_source_becomes_a_new_document() {
        let store = documents::Store::new(scratch());
        let src = "erDiagram\n  会員 ||--o{ 注文 : places\n";
        let r = incoming(&store, src.into(), documents::Origin::Import, None);
        let summary = r.document.clone().expect("document");
        let doc = store.load(&summary.id).unwrap();
        assert_eq!(doc.editor, documents::Editor::ErDiagram);
        assert_eq!(doc.origin, documents::Origin::Import);
        assert_eq!(doc.original_source.as_deref(), Some(src));
        // source はエディタに載ってから自動保存で埋まる (生成器の出力)
        assert_eq!(doc.source, "");
        assert!(r.payload.is_some());
    }

    #[test]
    fn incoming_source_that_cannot_open_creates_nothing() {
        let store = documents::Store::new(scratch());
        let r = incoming(&store, "sequenceDiagram\n  A->>B: hi\n".into(), documents::Origin::Ai, None);
        assert!(r.document.is_none());
        assert!(r.error.is_some());
        assert!(store.list().unwrap().is_empty());
    }

    // ツールバーのインポート (spec 02 P2) は AI から届いた図と同じ変換を通る
    #[test]
    fn request_from_source_converts_with_lorelei_core() {
        let r = request_from_source("flowchart LR\n  注文 --> 発送\n".into());
        assert!(r.error.is_none(), "{:?}", r.error);
        assert!(matches!(r.payload, Some(EditorPayload::Flowchart { .. })));
        // LR は エディタで表現できないので dropped に載る (フォーク元のパーサーなら黙って捨てる)
        assert!(r.dropped.iter().any(|d| d.construct.starts_with("direction")));
    }

    #[test]
    fn request_from_source_keeps_source_when_it_cannot_open() {
        let r = request_from_source("sequenceDiagram\n  A->>B: hi\n".into());
        assert!(r.payload.is_none());
        assert!(r.error.as_deref().unwrap().contains("開けません"));
        assert!(r.source.starts_with("sequenceDiagram"));

        let broken = request_from_source("flowchart TD\n  A[a --> B\n".into());
        assert!(broken.payload.is_none());
        assert!(broken.error.is_some());
    }

    #[test]
    fn about_names_every_bundled_license() {
        let text = desktop::about_text("9.9.9");
        for needle in [
            "9.9.9",
            "MIT",
            "Apache-2.0",
            "Open Font License",
            "Reserved Font Name 'Source'",
            // フォーク元の GitHub メニューを隠すので、上流への謝辞は About が持つ (spec 02 D2)
            "https://github.com/illionillion/mermaid-editor",
        ] {
            assert!(text.contains(needle), "{needle}");
        }
    }

    #[test]
    fn sweep_removes_only_old_inbox_files() {
        let inbox = scratch();
        let old = inbox.join("old.json");
        let old_mmd = inbox.join("old.mmd"); // spec 01 の形式の取り残し
        let fresh = inbox.join("fresh.json");
        let other = inbox.join("old.txt");
        for p in [&old, &old_mmd, &fresh, &other] {
            std::fs::write(p, "x").unwrap();
        }
        let two_days_ago = SystemTime::now() - Duration::from_secs(2 * 24 * 60 * 60);
        for p in [&old, &old_mmd, &other] {
            std::fs::File::options()
                .write(true)
                .open(p)
                .unwrap()
                .set_modified(two_days_ago)
                .unwrap();
        }
        sweep_inbox(&inbox, INBOX_MAX_AGE);
        assert!(!old.exists());
        assert!(!old_mmd.exists());
        assert!(fresh.exists());
        assert!(other.exists(), "inbox の形式以外は触らない");
        std::fs::remove_dir_all(inbox).unwrap();
    }
}
