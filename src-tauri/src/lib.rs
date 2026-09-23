//! Lorelei のデスクトップ殻 (spec 01 P3)。
//!
//! - `lorelei --mcp`: MCP サーバー (stdio)。本体は `lorelei_mcp`
//! - `lorelei [--open <inbox のファイル>]`: GUI。2 つ目の起動は single-instance が argv を 1 つ目へ渡して終わる

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

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
}

#[derive(Default)]
struct PendingOpens(Mutex<Vec<OpenRequest>>);

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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![take_pending_open])
        .run(tauri::generate_context!())
        .expect("Lorelei の起動に失敗しました");
}

/// フロントが準備できたら呼ぶ。溜まっている「開く図」を全部渡して空にする。
#[tauri::command]
fn take_pending_open(state: tauri::State<'_, PendingOpens>) -> Vec<OpenRequest> {
    std::mem::take(&mut *state.0.lock().expect("pending opens"))
}

/// argv の `--open <path>` を拾って溜め、フロントへ知らせる。
fn accept_argv(app: &AppHandle, argv: impl Iterator<Item = String>) {
    let Some(path) = open_arg(argv) else { return };
    let request = match lorelei_core::paths::inbox_dir() {
        Some(inbox) => open_request(&path, &inbox),
        None => OpenRequest::failed(String::new(), "アプリのデータフォルダを決められません".into()),
    };
    if let Some(state) = app.try_state::<PendingOpens>() {
        state.0.lock().expect("pending opens").push(request);
    }
    let _ = app.emit(OPEN_EVENT, ());
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
        }
    }
}

/// inbox のファイルを読み、エディタのデータ形へ変換し、ファイルを消す (spec 01 D8)。
pub fn open_request(path: &Path, inbox: &Path) -> OpenRequest {
    let source = match read_inbox_file(path, inbox) {
        Ok(s) => s,
        Err(e) => return OpenRequest::failed(String::new(), e),
    };
    let _ = std::fs::remove_file(path);
    match lorelei_core::to_editor(&source) {
        Ok(Some(payload)) => OpenRequest {
            dropped: payload.dropped().to_vec(),
            payload: Some(payload),
            source,
            error: None,
        },
        Ok(None) => OpenRequest::failed(source, "この図の種類は GUI エディタで開けません".into()),
        Err(e) => OpenRequest::failed(source, e.to_string()),
    }
}

/// `--open` で渡されたパスが inbox の中の `.mmd` である時だけ読む。
/// argv は誰でも渡せるので、任意のファイルを読む口にしない。
fn read_inbox_file(path: &Path, inbox: &Path) -> Result<String, String> {
    let file = path
        .canonicalize()
        .map_err(|e| format!("開くファイルが見つかりません ({}): {e}", path.display()))?;
    let inbox = inbox
        .canonicalize()
        .map_err(|e| format!("inbox が見つかりません ({}): {e}", inbox.display()))?;
    let in_inbox = file.parent() == Some(inbox.as_path());
    let is_mmd = file.extension().is_some_and(|e| e == "mmd");
    if !in_inbox || !is_mmd {
        return Err(format!("inbox の外のファイルは開きません: {}", path.display()));
    }
    std::fs::read_to_string(&file).map_err(|e| format!("読めません ({}): {e}", file.display()))
}

/// 古い inbox のファイルを捨てる。GUI が読む前に落ちた分の後始末。
pub fn sweep_inbox(inbox: &Path, max_age: Duration) {
    let Ok(entries) = std::fs::read_dir(inbox) else { return };
    let now = SystemTime::now();
    for entry in entries.flatten() {
        let path = entry.path();
        let old = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| now.duration_since(t).ok())
            .is_some_and(|age| age > max_age);
        if old && path.extension().is_some_and(|e| e == "mmd") {
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
        let argv = ["lorelei", "--open", "C:/x/a.mmd"].map(String::from);
        assert_eq!(open_arg(argv.into_iter()), Some(PathBuf::from("C:/x/a.mmd")));
        assert_eq!(open_arg(["lorelei"].map(String::from).into_iter()), None);
        assert_eq!(open_arg(["lorelei", "--open"].map(String::from).into_iter()), None);
    }

    #[test]
    fn open_request_converts_and_consumes_the_inbox_file() {
        let inbox = scratch();
        let file = inbox.join("a.mmd");
        std::fs::write(&file, "flowchart TD\n  subgraph S\n    A --> B\n  end\n").unwrap();
        let r = open_request(&file, &inbox);
        assert!(r.error.is_none(), "{r:?}");
        assert!(matches!(r.payload, Some(EditorPayload::Flowchart { .. })));
        assert_eq!(r.dropped[0].construct, "subgraph");
        assert!(!file.exists(), "読んだファイルが残っている");
        std::fs::remove_dir_all(inbox).unwrap();
    }

    #[test]
    fn files_outside_the_inbox_or_not_mmd_are_refused() {
        let inbox = scratch();
        let outside = scratch();
        let secret = outside.join("secret.mmd");
        std::fs::write(&secret, "flowchart TD\n  A --> B\n").unwrap();
        let txt = inbox.join("note.txt");
        std::fs::write(&txt, "flowchart TD\n  A --> B\n").unwrap();
        for path in [&secret, &txt] {
            let r = open_request(path, &inbox);
            assert!(r.error.unwrap().contains("inbox の外"), "{path:?}");
            assert!(path.exists(), "拒否したのにファイルを消した: {path:?}");
        }
        std::fs::remove_dir_all(inbox).unwrap();
        std::fs::remove_dir_all(outside).unwrap();
    }

    #[test]
    fn sweep_removes_only_old_mmd_files() {
        let inbox = scratch();
        let old = inbox.join("old.mmd");
        let fresh = inbox.join("fresh.mmd");
        let other = inbox.join("old.txt");
        for p in [&old, &fresh, &other] {
            std::fs::write(p, "x").unwrap();
        }
        let two_days_ago = SystemTime::now() - Duration::from_secs(2 * 24 * 60 * 60);
        for p in [&old, &other] {
            std::fs::File::options()
                .write(true)
                .open(p)
                .unwrap()
                .set_modified(two_days_ago)
                .unwrap();
        }
        sweep_inbox(&inbox, INBOX_MAX_AGE);
        assert!(!old.exists());
        assert!(fresh.exists());
        assert!(other.exists(), ".mmd 以外は触らない");
        std::fs::remove_dir_all(inbox).unwrap();
    }
}
