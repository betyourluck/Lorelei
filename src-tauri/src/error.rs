//! 画面に渡すエラー (spec 34 D3、data_contract `DesktopError`)。
//!
//! - `code` は見分ける名、`params` は訳と見分けに使う値、`detail` は訳さない詳しい文 (io・serde・merman の文)
//! - **`Display` は前の版の日本語の文のまま**。MCP の reason・readback・ログはこれを使う (AI 向けは訳さない)
//! - Tauri の境界 (コマンドの `Err`・`OpenRequest.error`・`McpStatus.detail`) だけで、この形に直列化する
//!   (`message` は直列化しない。画面は `code` を画面の言語で訳す)

use std::collections::BTreeMap;
use std::fmt;

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopError {
    pub code: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<BTreeMap<&'static str, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    /// 前の版の日本語の文 (Display)
    #[serde(skip)]
    message: String,
}

impl DesktopError {
    /// code と、Display に出す前の版の文
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            params: None,
            detail: None,
            message: message.into(),
        }
    }

    /// 訳さない詳しい文
    pub fn detail(mut self, detail: impl ToString) -> Self {
        self.detail = Some(detail.to_string());
        self
    }

    /// 訳と見分けに使う値
    pub fn param(mut self, key: &'static str, value: impl Into<serde_json::Value>) -> Self {
        self.params
            .get_or_insert_with(BTreeMap::new)
            .insert(key, value.into());
        self
    }
}

impl fmt::Display for DesktopError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for DesktopError {}

/// code の無い文 (逆直列化の失敗など)。画面は文をそのまま出す
impl From<String> for DesktopError {
    fn from(message: String) -> Self {
        Self {
            code: OTHER,
            params: None,
            detail: Some(message.clone()),
            message,
        }
    }
}

impl From<&str> for DesktopError {
    fn from(message: &str) -> Self {
        message.to_string().into()
    }
}

// documents
pub const DOC_LIST_FAILED: &str = "DOC_LIST_FAILED";
pub const DOC_READ_FAILED: &str = "DOC_READ_FAILED";
pub const DOC_CORRUPT: &str = "DOC_CORRUPT";
pub const DOC_WRITE_FAILED: &str = "DOC_WRITE_FAILED";
pub const INVALID_ID: &str = "INVALID_ID";
pub const TRASH_FAILED: &str = "TRASH_FAILED";
pub const NOTHING_TO_CONFIRM: &str = "NOTHING_TO_CONFIRM";
pub const DOCUMENT_GONE: &str = "DOCUMENT_GONE";
pub const INITIAL_FIGURE_REJECTED: &str = "INITIAL_FIGURE_REJECTED";
pub const STALE_BASE: &str = "STALE_BASE";
// app
pub const NO_DATA_DIR: &str = "NO_DATA_DIR";
pub const ADD_FAILED: &str = "ADD_FAILED";
pub const UNSUPPORTED_DIAGRAM: &str = "UNSUPPORTED_DIAGRAM";
pub const CONVERT_FAILED: &str = "CONVERT_FAILED";
// desktop
pub const UNSUPPORTED_FORMAT: &str = "UNSUPPORTED_FORMAT";
pub const EXPORT_FAILED: &str = "EXPORT_FAILED";
pub const TASK_FAILED: &str = "TASK_FAILED";
// mcp
pub const MCP_CONFIG_UNREADABLE: &str = "MCP_CONFIG_UNREADABLE";
pub const MCP_TOKEN_SAVE_FAILED: &str = "MCP_TOKEN_SAVE_FAILED";
pub const MCP_LISTEN_FAILED: &str = "MCP_LISTEN_FAILED";
pub const MCP_PORT_RANGE: &str = "MCP_PORT_RANGE";
pub const OTHER: &str = "OTHER";

/// 全部の code (OTHER を除く)。画面の訳が全部あることを vitest が fixture で確かめる (読むのはテストだけ)
#[cfg_attr(not(test), allow(dead_code))]
pub const ALL_CODES: &[&str] = &[
    DOC_LIST_FAILED,
    DOC_READ_FAILED,
    DOC_CORRUPT,
    DOC_WRITE_FAILED,
    INVALID_ID,
    TRASH_FAILED,
    NOTHING_TO_CONFIRM,
    DOCUMENT_GONE,
    INITIAL_FIGURE_REJECTED,
    STALE_BASE,
    NO_DATA_DIR,
    ADD_FAILED,
    UNSUPPORTED_DIAGRAM,
    CONVERT_FAILED,
    UNSUPPORTED_FORMAT,
    EXPORT_FAILED,
    TASK_FAILED,
    MCP_CONFIG_UNREADABLE,
    MCP_TOKEN_SAVE_FAILED,
    MCP_LISTEN_FAILED,
    MCP_PORT_RANGE,
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_is_the_old_text_and_serde_is_code_params_detail() {
        let e = DesktopError::new(STALE_BASE, "STALE_BASE: 2026-10-31T10:00:00+09:00")
            .param("currentUpdatedAt", "2026-10-31T10:00:00+09:00");
        assert_eq!(e.to_string(), "STALE_BASE: 2026-10-31T10:00:00+09:00");
        assert_eq!(
            serde_json::to_value(&e).unwrap(),
            serde_json::json!({ "code": "STALE_BASE", "params": { "currentUpdatedAt": "2026-10-31T10:00:00+09:00" } })
        );
        let other: DesktopError = "invalid args".into();
        assert_eq!(
            serde_json::to_value(&other).unwrap(),
            serde_json::json!({ "code": "OTHER", "detail": "invalid args" })
        );
    }

    /// 画面の訳が全部の code を持つことを vitest が確かめるための fixture (LORELEI_UPDATE_FIXTURES=1 で書き直す)
    #[test]
    fn error_codes_fixture_is_up_to_date() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/desktop_error_codes.json");
        let want = format!("{}\n", serde_json::to_string_pretty(ALL_CODES).unwrap());
        if std::env::var("LORELEI_UPDATE_FIXTURES").is_ok() {
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, &want).unwrap();
        }
        let have = std::fs::read_to_string(&path)
            .unwrap_or_default()
            .replace("\r\n", "\n");
        assert_eq!(have, want, "LORELEI_UPDATE_FIXTURES=1 で書き直す");
    }
}
