//! Lorelei の核: Mermaid の検査・描画 (SVG / PNG / PDF)・書き出し。
//!
//! MCP モードと GUI の両方がこの crate を呼ぶ。名詞の正は `data_contract.yaml`、
//! 決定の正は `specs/01_tauri-mcp-foundation.md`。

mod engine;
mod error;
mod fonts;
pub mod output;
pub mod paths;
mod render;
mod validate;

pub use error::CoreError;
pub use render::{
    MAX_PNG_SIDE, RenderFormat, RenderOptions, Rendered, SCALE_RANGE, Theme, render,
    render_preview_png,
};
pub use validate::{ParseError, ValidationResult, validate};

/// `DiagramSource.text` の上限 (data_contract)。
pub const MAX_SOURCE_BYTES: usize = 256 * 1024;

/// GUI エディタで開ける図の種類 (data_contract `DiagramFamily.editable_in_gui`)。
/// 値は merman の `diagram_type`。`graph` と `flowchart` はどちらも `flowchart-v2` になる。
pub fn is_editable_in_gui(family: &str) -> bool {
    matches!(family, "flowchart-v2" | "flowchart" | "er")
}
