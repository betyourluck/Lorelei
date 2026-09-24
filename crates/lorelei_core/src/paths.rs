//! アプリのデータフォルダ (data_contract `AppIdentity`)。
//!
//! 図の一覧 (`documents/`) と MCP の設定 (`mcp_server.json`) の置き場。Tauri の `app_data_dir()` と同じ場所を
//! 自前で組み立てる (一致は src-tauri のテスト `app_data_dir_matches_tauri` で固定)。
//! spec 01〜02 の inbox (`inbox/`) は spec 03 P3 で撤去した。

use std::path::PathBuf;

/// `AppIdentity.identifier`。app_data と WebView プロファイルの場所を決めるので公開後は変えない。
pub const IDENTIFIER: &str = "jp.outcasts.lorelei";

/// Tauri 2 の `app_data_dir()` と同じ: `dirs::data_dir()/{identifier}`
/// (Windows は `%APPDATA%\jp.outcasts.lorelei`)。
pub fn app_data_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join(IDENTIFIER))
}
