//! merman の Engine / Renderer の組み立て。入力の `%%{init}%%` より優先する設定をここで固定する
//! (data_contract `RenderConfigOverrides`)。

use merman::{Engine, MermaidConfig, Renderer};
use serde_json::json;

use crate::render::Theme;

/// 入力のディレクティブで上書きさせないキー。merman の既定の hardened リスト
/// (`merman-core/src/config/mod.rs` の `HARDENED_SECURE_KEYS`) に `htmlLabels` を足したもの。
/// `htmlLabels` が true だと resvg-safe の代替テキストが折り返しを失い、長いラベルが
/// 箱からはみ出す (spec 01 P0-2)。
const SECURE_KEYS: &[&str] = &[
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

pub(crate) fn engine(theme: Theme) -> Engine {
    Engine::new().with_site_config(MermaidConfig::from_value(json!({
        "theme": theme.as_str(),
        "htmlLabels": false,
        "flowchart": { "htmlLabels": false },
        "secure": SECURE_KEYS,
    })))
}

pub(crate) fn renderer(theme: Theme) -> Renderer {
    Renderer::new().with_engine(engine(theme))
}
