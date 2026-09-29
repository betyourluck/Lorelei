//! Lorelei のデスクトップ殻。GUI と、その中で待ち受ける MCP (spec 03)。
//! single-instance なので 2 つ目の起動は 1 つ目を前に出して終わる (同じポートを取り合わない)。

mod desktop;
mod documents;
mod mcp_host;
mod readback;

use std::sync::Mutex;

use lorelei_core::{DroppedItem, EditorPayload};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// フロントへ「開く図が届いた」ことを知らせるイベント。本体は `take_pending_open` で取りに来る
/// (初回起動時はフロントの読み込み前に届くので、イベントだけだと取りこぼす)。
pub const OPEN_EVENT: &str = "lorelei://open-pending";

/// update_diagram がファイルを書けた合図 (本体は書き換え後の DocumentSummary)。外枠はその 1 件だけを一覧で差し替える
/// (data_contract `GuiCommands.documents_event`, spec 08 D3)
pub const DOCUMENTS_EVENT: &str = "lorelei://documents-changed";

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
    /// AI / インポートで届いた図のために作った新しい 1 件 (spec 02 D8・D10)、update_diagram では書き換え後のその 1 件。変換に失敗した時は作らない
    pub document: Option<documents::DocumentSummary>,
    /// update_diagram が開いている図を載せ替える要求 (spec 08 D3)。フロントは partitionOpens に入れず別に扱う
    pub reload: bool,
    /// update_diagram の要求に付ける、その図の位置 (同じ ID のノードの位置を当てる)。保存した図を開く時 (convert_source) は None
    pub layout: Option<documents::Layout>,
}

/// deliver_update の判断 (spec 08 D3、data_contract `update_diagram.gui_effect`)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum UpdateEffect {
    /// 今開いている図: reload の要求で載せ替える
    Reload,
    /// 開いていない図を open=true で: 開く要求を積む
    Open,
    /// 開いていない図: ファイルだけ
    FileOnly,
}

/// last_opened と一致するか × open → 何をするかと、窓を前に出すか。純粋 (テストで固定)
fn update_effect(is_open_in_gui: bool, open: bool) -> (UpdateEffect, bool) {
    match (is_open_in_gui, open) {
        (true, front) => (UpdateEffect::Reload, front),
        (false, true) => (UpdateEffect::Open, true),
        (false, false) => (UpdateEffect::FileOnly, false),
    }
}

/// HTTP の MCP の update_diagram の行き先 (spec 08 D3)。Store::update で書き、last_opened と open で載せ替え・開く・ファイルだけを決め、
/// 書けた時はどの場合も DOCUMENTS_EVENT を出す。断った時 (Err) は何も積まず、何も出さない。
/// last_opened は図を開いている全区間で前の図を指す (現況 3) ので、その間は FileOnly に倒れる — 古いキャンバスの保存は STALE_BASE が受け持つ
fn deliver_update<R: tauri::Runtime>(
    app: &AppHandle<R>,
    store: &documents::Store,
    req: lorelei_mcp::UpdateRequest,
) -> Result<lorelei_mcp::UpdateOutcome, lorelei_mcp::UpdateError> {
    let editor = match req.editor {
        lorelei_mcp::EditorKind::Flowchart => documents::Editor::Flowchart,
        lorelei_mcp::EditorKind::ErDiagram => documents::Editor::ErDiagram,
    };
    let doc = store.update(&req.id, req.source, editor, &req.expected_updated_at)?;
    let summary = documents::DocumentSummary::from(&doc);
    let is_open = store.last_opened().as_deref() == Some(doc.id.as_str());
    let (effect, front) = update_effect(is_open, req.open);
    if effect != UpdateEffect::FileOnly {
        // 変換は lorelei_mcp が to_editor で確かめ済みなので失敗しない。万一失敗しても error 付きの要求で通知が出る
        let mut request = request_from_source(doc.source.clone());
        request.document = Some(summary.clone());
        request.reload = effect == UpdateEffect::Reload;
        request.layout = Some(doc.layout.clone());
        push_open(app, request);
    }
    if front {
        bring_to_front(app);
    }
    let _ = app.emit(DOCUMENTS_EVENT, &summary);
    Ok(lorelei_mcp::UpdateOutcome {
        open: effect != UpdateEffect::FileOnly,
        updated_at: doc.updated_at,
    })
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
        // 2 つ目の起動は 1 つ目を前に出して終わる。図の受け渡しは MCP (HTTP) がじかに行うので argv は読まない (spec 03 D5)
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            bring_to_front(app);
        }))
        .manage(PendingOpens::default())
        .setup(|app| {
            // 保険 (spec 05 D5): フロントが窓を出せなかった時も、一定時間で必ず出す (出すのは何度呼んでも同じ)
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(SHOW_WINDOW_FALLBACK).await;
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                }
            });
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

/// 自動保存 (D7)。並びは動かさない。base_updated_at はフロントが読んだ版 (spec 08 D2、STALE_BASE)
#[tauri::command]
fn save_document(
    id: String,
    source: String,
    layout: documents::Layout,
    base_updated_at: String,
) -> Result<documents::DocumentSummary, String> {
    store()?.save(&id, source, layout, &base_updated_at)
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
/// 足せたら作った図の id (MCP の `document_id`) と updated_at (spec 08 D2)、足せなかった時は理由を返す (MCP の `opened: false` の reason になる)
fn deliver<R: tauri::Runtime>(
    app: &AppHandle<R>,
    store: &documents::Store,
    source: String,
    title: Option<String>,
) -> Result<lorelei_mcp::Opened, String> {
    let request = incoming(store, source, documents::Origin::Ai, title);
    let Some(opened) = request.document.as_ref().map(|d| lorelei_mcp::Opened {
        id: d.id.clone(),
        updated_at: d.updated_at.clone(),
    }) else {
        return Err(request
            .error
            .unwrap_or_else(|| "図の一覧に足せませんでした".into()));
    };
    push_open(app, request);
    bring_to_front(app);
    Ok(opened)
}

/// 窓を前に出す。起動の途中 (まだ隠れている窓, spec 05 D5) でも出してから前に出す
fn bring_to_front<R: tauri::Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// 窓は隠したまま起動し、フロントの外枠が描けてから JS が出す (spec 05 D5)。
/// フロントが読み込めない・外枠が描けない時に、窓が出ないまま動き続けないよう、この時間で必ず出す
const SHOW_WINDOW_FALLBACK: std::time::Duration = std::time::Duration::from_secs(3);

/// GUI の中の HTTP の MCP が図を届ける口
struct GuiEditor(AppHandle);

impl lorelei_mcp::EditorPort for GuiEditor {
    fn open(&self, source: String, title: Option<String>) -> Result<lorelei_mcp::Opened, String> {
        deliver(&self.0, &store()?, source, title)
    }
    // 書き換え (spec 08 D3): Store::update で書き、開いている図なら載せ替えの要求を積む
    fn update(&self, req: lorelei_mcp::UpdateRequest) -> Result<lorelei_mcp::UpdateOutcome, lorelei_mcp::UpdateError> {
        let store = store().map_err(lorelei_mcp::UpdateError::Other)?;
        deliver_update(&self.0, &store, req)
    }
    // 読み戻し (spec 04): documents/ と state.json を読む。画面には問い合わせない (D1)
    fn list(&self) -> Result<Vec<lorelei_mcp::DiagramSummary>, String> {
        readback::list(&store()?)
    }
    fn read(&self, id: Option<String>) -> Result<lorelei_mcp::Diagram, String> {
        readback::read(&store()?, id)
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

impl OpenRequest {
    fn failed(source: String, error: String) -> Self {
        Self {
            source,
            payload: None,
            dropped: Vec::new(),
            error: Some(error),
            document: None,
            reload: false,
            layout: None,
        }
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
            reload: false,
            layout: None,
        },
        Ok(None) => OpenRequest::failed(source, "この図の種類は GUI エディタで開けません".into()),
        Err(e) => OpenRequest::failed(source, e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("lorelei-gui-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// src-tauri は独立 project なので、ルートの [patch.crates-io] が効かない。同じ patch がここでも効くこと。
    #[test]
    fn japanese_node_ids_are_accepted_in_the_gui_build() {
        let v = lorelei_core::validate("flowchart TD\n  開始 --> 終了\n").unwrap();
        assert!(v.ok, "{v:?}");
    }

    /// 同じく spec 14 の修正 (ER 図の to / one / many を語の境界で取る) もこの project で効くこと
    #[test]
    fn er_names_starting_with_cardinality_words_are_accepted_in_the_gui_build() {
        let v = lorelei_core::validate("erDiagram\n  A ||--o{ tokens : has\n").unwrap();
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
        let opened = deliver(app.handle(), &store, "flowchart TD\n  A --> B\n".into(), Some("注文".into())).unwrap();
        let id = opened.id;
        let pending = app.state::<PendingOpens>();
        let pending = pending.0.lock().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].document.as_ref().unwrap().title, "注文");
        // 作った図の id と updated_at を返す (MCP の document_id / updated_at, spec 04 D2・spec 08 D2)
        assert_eq!(pending[0].document.as_ref().unwrap().id, id);
        assert_eq!(pending[0].document.as_ref().unwrap().updated_at, opened.updated_at);
        assert_eq!(store.load(&id).unwrap().title, "注文");
        assert_eq!(store.list().unwrap().len(), 1);
        drop(pending);

        // 変換できない図は一覧に足さず、理由を返す (MCP の opened: false の reason になる)
        let err = deliver(app.handle(), &store, "flowchart TD\n  A[a --> B\n".into(), None);
        assert!(err.is_err());
        assert_eq!(store.list().unwrap().len(), 1);
    }

    // spec 08 D3: last_opened と open で、載せ替える・開く・ファイルだけ、と前に出すかを決める (純粋な関数)
    #[test]
    fn update_effect_decides_reload_open_or_file_only() {
        assert_eq!(update_effect(true, false), (UpdateEffect::Reload, false));
        assert_eq!(update_effect(true, true), (UpdateEffect::Reload, true), "開いている図でも open=true なら前に出す");
        assert_eq!(update_effect(false, true), (UpdateEffect::Open, true));
        assert_eq!(update_effect(false, false), (UpdateEffect::FileOnly, false));
    }

    // spec 08 D3: HTTP の update_diagram は、開いている図なら reload の要求 (layout 付き、新しい 1 件は作らない) を積み、
    // 開いていない図はファイルだけ書く (open=true なら開く要求を積む)
    #[test]
    fn http_update_diagram_reloads_the_open_diagram_or_writes_only() {
        use lorelei_mcp::{EditorKind, UpdateError, UpdateRequest};
        let app = tauri::test::mock_builder()
            .manage(PendingOpens::default())
            .build(tauri::generate_context!())
            .expect("mock app");
        let store = documents::Store::new(scratch());
        let opened = deliver(app.handle(), &store, "flowchart TD\n  A --> B\n".into(), Some("注文".into())).unwrap();
        let mut layout = documents::Layout::new();
        layout.insert("A".into(), documents::Pos { x: 10.0, y: 20.0 });
        store.save(&opened.id, "flowchart TD\n    A[A]\n    B[B]\n    A --> B\n".into(), layout, &opened.updated_at).unwrap();
        let cur = store.load(&opened.id).unwrap().updated_at;
        app.state::<PendingOpens>().0.lock().unwrap().clear();
        let req = |source: &str, expected: &str, open: bool| UpdateRequest {
            id: opened.id.clone(),
            source: source.into(),
            editor: EditorKind::Flowchart,
            expected_updated_at: expected.into(),
            open,
        };

        // 開いている図 (last_opened) → Reload: reload: true・layout・書き換え後の document。一覧に新しい 1 件は増えない
        store.set_last_opened(&opened.id).unwrap();
        let out = deliver_update(app.handle(), &store, req("flowchart LR\n  A --> C\n", &cur, false)).unwrap();
        assert!(out.open);
        {
            let pending = app.state::<PendingOpens>();
            let pending = pending.0.lock().unwrap();
            assert_eq!(pending.len(), 1);
            let r = &pending[0];
            assert!(r.reload);
            assert!(r.payload.is_some(), "{:?}", r.error);
            assert_eq!(r.document.as_ref().unwrap().id, opened.id);
            assert_eq!(r.document.as_ref().unwrap().updated_at, out.updated_at);
            assert!(r.document.as_ref().unwrap().unsaved, "● が付く");
            assert_eq!(r.layout.as_ref().unwrap()["A"].x, 10.0);
        }
        assert_eq!(store.list().unwrap().len(), 1);
        assert_eq!(store.load(&opened.id).unwrap().source, "flowchart LR\n  A --> C\n");
        app.state::<PendingOpens>().0.lock().unwrap().clear();

        // 開いていない図 → FileOnly: 何も積まない。ファイルは書く
        let other = store.create(documents::Editor::Flowchart, None, documents::Origin::New, None).unwrap();
        store.set_last_opened(&other.id).unwrap();
        let out = deliver_update(app.handle(), &store, req("flowchart LR\n  A --> D\n", &out.updated_at, false)).unwrap();
        assert!(!out.open);
        assert!(app.state::<PendingOpens>().0.lock().unwrap().is_empty());
        assert_eq!(store.load(&opened.id).unwrap().source, "flowchart LR\n  A --> D\n");

        // 開いていない図で open=true → Open: reload: false で積む
        let out = deliver_update(app.handle(), &store, req("flowchart LR\n  A --> E\n", &out.updated_at, true)).unwrap();
        assert!(out.open);
        {
            let pending = app.state::<PendingOpens>();
            let pending = pending.0.lock().unwrap();
            assert_eq!(pending.len(), 1);
            assert!(!pending[0].reload);
            assert!(pending[0].layout.is_some());
        }
        app.state::<PendingOpens>().0.lock().unwrap().clear();

        // 断った時 (Conflict) は何も積まず、ファイルも変わらない
        let err = deliver_update(app.handle(), &store, req("flowchart LR\n  A --> F\n", &cur, true)).unwrap_err();
        assert!(matches!(err, UpdateError::Conflict { .. }));
        assert!(app.state::<PendingOpens>().0.lock().unwrap().is_empty());
        assert_eq!(store.load(&opened.id).unwrap().source, "flowchart LR\n  A --> E\n");
    }

    /// spec 05 D5: 窓は隠したまま起動し、外枠が描けてから JS が出す (起動直後に Web 版の画面を見せない)。
    /// 出すには権限 core:window:allow-show が要る (無いと窓が出ないまま、Rust の保険の 3 秒を待つことになる)
    #[test]
    fn the_window_starts_hidden_and_the_page_may_show_it() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let main = &conf["app"]["windows"][0];
        assert_eq!(main["label"], "main");
        assert_eq!(main["visible"], false, "{main}");
        let caps: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        let perms: Vec<&str> = caps["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|p| p.as_str())
            .collect();
        assert!(perms.contains(&"core:window:allow-show"), "{perms:?}");
    }

    /// 図の一覧と MCP の設定は lorelei_core の app_data_dir() に置く。Tauri の app_data_dir() と一致すること
    #[test]
    fn app_data_dir_matches_tauri() {
        let app = tauri::test::mock_builder()
            .build(tauri::generate_context!())
            .expect("mock app");
        let tauri_dir = app.path().app_data_dir().unwrap();
        assert_eq!(Some(tauri_dir), lorelei_core::paths::app_data_dir());
    }

    // MCP の open_in_editor の title が図の名前になる (spec 02 D8)
    #[test]
    fn title_names_the_new_document() {
        let store = documents::Store::new(scratch());
        let r = incoming(&store, "flowchart TD\n  A --> B\n".into(), documents::Origin::Ai, Some("注文フロー".into()));
        assert_eq!(r.document.unwrap().title, "注文フロー");

        let untitled = incoming(&store, "flowchart TD\n  A --> B\n".into(), documents::Origin::Ai, None);
        assert!(untitled.document.unwrap().title.starts_with("AI の図 "));
    }

    #[test]
    fn a_converted_request_reports_what_the_editor_drops() {
        let r = request_from_source("flowchart TD\n  subgraph S\n    A --> B\n  end\n".into());
        assert!(r.error.is_none(), "{r:?}");
        assert!(matches!(r.payload, Some(EditorPayload::Flowchart { .. })));
        assert_eq!(r.dropped[0].construct, "subgraph");
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
        // 向きはエディタへ渡り、dropped に載らない (spec 07 で落とさないようにした)
        match &r.payload {
            Some(EditorPayload::Flowchart { data, .. }) => {
                assert_eq!(data.direction.as_deref(), Some("LR"))
            }
            other => panic!("{other:?}"),
        }
        assert!(r.dropped.is_empty(), "{:?}", r.dropped);
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
}
