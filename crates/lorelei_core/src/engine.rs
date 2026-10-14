//! merman の Engine / Renderer の組み立て。入力の `%%{init}%%` より優先する設定をここで固定する
//! (data_contract `RenderConfigOverrides`)。

use merman::{Engine, MermaidConfig, Renderer};
use serde_json::json;

use crate::render::Theme;

/// 書き出し (render・validate) で入力のディレクティブに上書きさせないキー。merman の既定の hardened リスト
/// (`merman-core/src/config/mod.rs` の `HARDENED_SECURE_KEYS`) から `themeVariables` を外し、`htmlLabels` を足したもの。
/// `htmlLabels` が true だと resvg-safe の代替テキストが折り返しを失い、長いラベルが
/// 箱からはみ出す (spec 01 P0-2)。`themeVariables` は図に書いた色を書き出しにも効かせるために外す
/// (spec 24 D4-2。プレビューの mermaid.js は元から効かせる。色として読めない値は merman が解析でエラーにする)
const EXPORT_SECURE_KEYS: &[&str] = &[
    "secure",
    "securityLevel",
    "startOnLoad",
    "maxTextSize",
    "suppressErrorRendering",
    "maxEdges",
    "fontFamily",
    "altFontFamily",
    "themeCSS",
    "htmlLabels",
];

/// 取り込み (to_editor) の守り。書き出しの守りに `themeVariables` を足した、spec 24 より前のもの。
/// 取り込みは `themeVariables` を落とすので、その色の値で取り込みそのものを落とさない (spec 24 D4-2)
const IMPORT_SECURE_KEYS: &[&str] = &[
    "secure",
    "securityLevel",
    "startOnLoad",
    "maxTextSize",
    "suppressErrorRendering",
    "maxEdges",
    "fontFamily",
    "altFontFamily",
    "themeCSS",
    "themeVariables",
    "htmlLabels",
];

/// どちらの守りで読むか
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Guard {
    /// render と validate
    Export,
    /// to_editor
    Import,
}

pub(crate) fn engine(theme: Theme, guard: Guard) -> Engine {
    let secure = match guard {
        Guard::Export => EXPORT_SECURE_KEYS,
        Guard::Import => IMPORT_SECURE_KEYS,
    };
    Engine::new().with_site_config(MermaidConfig::from_value(json!({
        "theme": theme.as_str(),
        "htmlLabels": false,
        "flowchart": { "htmlLabels": false },
        "secure": secure,
    })))
}

pub(crate) fn renderer(theme: Theme) -> Renderer {
    Renderer::new().with_engine(engine(theme, Guard::Export))
}
