//! アプリのデータフォルダと inbox (data_contract `AppIdentity` / `EditorInbox`, spec 01 D8)。
//!
//! MCP モードは Tauri を初期化しないので、Tauri の `app_data_dir()` と同じ場所を自前で組み立てる。
//! 2 つが一致することは P3 で src-tauri 側のテストで固定する。

use std::path::PathBuf;

/// `AppIdentity.identifier`。app_data と WebView プロファイルの場所を決めるので公開後は変えない。
pub const IDENTIFIER: &str = "jp.outcasts.lorelei";

/// Tauri 2 の `app_data_dir()` と同じ: `dirs::data_dir()/{identifier}`
/// (Windows は `%APPDATA%\jp.outcasts.lorelei`)。
pub fn app_data_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join(IDENTIFIER))
}

/// open_in_editor が GUI へ渡すファイルの置き場。
pub fn inbox_dir() -> Option<PathBuf> {
    app_data_dir().map(|d| d.join("inbox"))
}

/// inbox のファイルの拡張子 (data_contract `EditorInbox`)。spec 01 の `.mmd` (本文だけ) から spec 02 P4 で替えた
pub const INBOX_EXTENSION: &str = "json";

/// inbox の 1 件 `{uuid}.json`。MCP が書き、GUI が読む。両側で同じ型を使って形の食い違いを防ぐ
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct InboxItem {
    /// Mermaid の原文
    pub source: String,
    /// 図の一覧での名前 (MCP の open_in_editor の title)。無ければ GUI が「AI の図 HH:MM:SS」にする
    pub title: Option<String>,
}
