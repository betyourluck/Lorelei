//! 描画 (MCP ツール `render`)。merman は SVG 生成だけに使い、PNG / PDF は同梱フォントで
//! usvg → resvg / krilla-svg に通す (spec 01 D3)。

use std::str::FromStr;

use merman::svg::SvgPipeline;
use merman::{OperationControl, RenderOutput, RenderRequest, SvgRequest};
use serde::{Deserialize, Serialize};

use crate::engine::{self, Guard};
use crate::{CoreError, fonts, validate};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RenderFormat {
    Svg,
    Png,
    Pdf,
}

impl RenderFormat {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Svg => "svg",
            Self::Png => "png",
            Self::Pdf => "pdf",
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    Default,
    Neutral,
    Dark,
    Forest,
}

impl Theme {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Neutral => "neutral",
            Self::Dark => "dark",
            Self::Forest => "forest",
        }
    }
}

/// data_contract `RenderOptions`。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct RenderOptions {
    /// PNG の倍率。SVG / PDF では無視する。
    pub scale: f32,
    /// CSS の色文字列、または `"transparent"`。None は Mermaid の既定 (白)。
    /// ただし効いているテーマ (下の theme か、図の中のテーマ) が dark なら #333 (spec 24 D5)。
    pub background: Option<String>,
    /// 入力の frontmatter・`%%{init}%%` で theme が指定されていればそちらが勝つ (Mermaid の優先順位どおり)。
    pub theme: Theme,
}

impl Default for RenderOptions {
    fn default() -> Self {
        Self {
            scale: 2.0,
            background: None,
            theme: Theme::Default,
        }
    }
}

/// dark のテーマの書き出しの背景 (spec 24 D5)。Mermaid の dark のテーマの `background` と同じ
/// (白の上では dark の線 (lightgrey) と線のラベルがほとんど見えない, spec 24 P0 の 2)
const DARK_BACKGROUND: &str = "#333";

pub const SCALE_RANGE: std::ops::RangeInclusive<f32> = 0.5..=8.0;
/// PNG の一辺の上限 (px)。これを超える倍率は拒否する。
pub const MAX_PNG_SIDE: u32 = 16_384;

#[derive(Debug, Clone)]
pub struct Rendered {
    pub format: RenderFormat,
    /// merman の `diagram_type`。
    pub family: String,
    /// SVG の論理寸法 (px)。PNG のピクセル数は width × scale。
    pub width: f32,
    pub height: f32,
    /// SVG は UTF-8 のテキスト、PNG / PDF はバイナリ。
    pub bytes: Vec<u8>,
}

pub fn render(
    source: &str,
    format: RenderFormat,
    options: &RenderOptions,
) -> Result<Rendered, CoreError> {
    if format == RenderFormat::Png && !SCALE_RANGE.contains(&options.scale) {
        return Err(CoreError::Render(format!(
            "scale は {}〜{} の範囲で指定してください (指定値 {})",
            SCALE_RANGE.start(),
            SCALE_RANGE.end(),
            options.scale
        )));
    }

    let (family, svg) = render_svg(source, options)?;
    let tree = svg_tree(&svg)?;
    let (width, height) = (tree.size().width(), tree.size().height());
    let bytes = match format {
        RenderFormat::Svg => svg.into_bytes(),
        RenderFormat::Png => png(&tree, options.scale)?,
        RenderFormat::Pdf => pdf(&tree)?,
    };
    Ok(Rendered {
        format,
        family,
        width,
        height,
        bytes,
    })
}

/// 長辺が `max_side` px 以内に収まる PNG (MCP の preview 用。spec 01 D2)。
/// 倍率は `options.scale` を上限に、収まるまで下げる。
pub fn render_preview_png(
    source: &str,
    options: &RenderOptions,
    max_side: u32,
) -> Result<Vec<u8>, CoreError> {
    let (_, svg) = render_svg(source, options)?;
    let tree = svg_tree(&svg)?;
    let longest = tree.size().width().max(tree.size().height());
    let scale = options.scale.min(max_side as f32 / longest);
    png(&tree, scale)
}

fn render_svg(source: &str, options: &RenderOptions) -> Result<(String, String), CoreError> {
    let background = parse_background(options.background.as_deref())?;
    validate::check_size(source)?;
    // 文法エラーは validate と同じ形 (行番号つき) で返す。書き出しと同じ守りで読む
    let meta = validate::parse(source, options.theme, Guard::Export)?.meta;
    let family = meta.diagram_type;
    // 背景の指定が無ければ、効いているテーマ (図の中のテーマが勝つ) に合わせる。dark は #333、ほかは Mermaid の既定の白のまま
    let background = match background {
        None if meta.effective_config.get_str("theme") == Some("dark") => {
            parse_background(Some(DARK_BACKGROUND))?
        }
        other => other,
    };
    let request = SvgRequest {
        pipeline: Some(SvgPipeline::resvg_safe()),
        ..SvgRequest::default()
    };
    let output = engine::renderer(options.theme)
        .render(RenderRequest::svg(source, OperationControl::new(), request))
        .map_err(|err| CoreError::Render(err.to_string()))?;
    match output {
        RenderOutput::Svg(Some(svg)) => {
            let svg = svg.svg().to_string();
            let svg = match background {
                Some(bg) => set_root_background(&svg, &bg)?,
                None => svg,
            };
            Ok((family, svg))
        }
        _ => Err(CoreError::Render("SVG が生成されませんでした".to_string())),
    }
}

fn svg_tree(svg: &str) -> Result<usvg::Tree, CoreError> {
    let options = usvg::Options {
        fontdb: fonts::database(),
        font_family: fonts::FAMILY.to_string(),
        ..usvg::Options::default()
    };
    usvg::Tree::from_str(svg, &options).map_err(|err| CoreError::Render(err.to_string()))
}

/// 検査済みの背景色を CSS の値として返す (`transparent` はそのまま)。
fn parse_background(value: Option<&str>) -> Result<Option<String>, CoreError> {
    match value {
        None => Ok(None),
        Some(v) if v.eq_ignore_ascii_case("transparent") => Ok(Some("transparent".to_string())),
        Some(v) => {
            let c = svgtypes::Color::from_str(v)
                .map_err(|_| CoreError::Render(format!("background の色を解釈できません: {v}")))?;
            Ok(Some(format!(
                "rgba({},{},{},{})",
                c.red,
                c.green,
                c.blue,
                f32::from(c.alpha) / 255.0
            )))
        }
    }
}

/// merman はルートの `<svg style="…;background-color:white">` で背景を塗る (Mermaid 本家と同じ)。
/// 背景の指定はこの 1 か所を書き換えて行う = SVG / PNG / PDF で同じ結果になる。
fn set_root_background(svg: &str, css: &str) -> Result<String, CoreError> {
    let missing = || CoreError::Render("SVG のルート要素に背景の指定が見つかりません".to_string());
    let tag_end = svg.find('>').ok_or_else(missing)?;
    let root = &svg[..tag_end];
    let key = "background-color:";
    let start = root.find(key).ok_or_else(missing)? + key.len();
    let end = root[start..]
        .find([';', '"'])
        .map(|i| start + i)
        .ok_or_else(missing)?;
    Ok(format!("{}{}{}", &svg[..start], css, &svg[end..]))
}

fn png(tree: &usvg::Tree, scale: f32) -> Result<Vec<u8>, CoreError> {
    let width = (tree.size().width() * scale).ceil() as u32;
    let height = (tree.size().height() * scale).ceil() as u32;
    if width > MAX_PNG_SIDE || height > MAX_PNG_SIDE {
        return Err(CoreError::Render(format!(
            "PNG が大きすぎます ({width}×{height} px。一辺の上限は {MAX_PNG_SIDE} px)。scale を下げてください"
        )));
    }
    let mut pixmap = resvg::tiny_skia::Pixmap::new(width.max(1), height.max(1))
        .ok_or_else(|| CoreError::Render("PNG の画素領域を確保できません".to_string()))?;
    resvg::render(
        tree,
        resvg::tiny_skia::Transform::from_scale(scale, scale),
        &mut pixmap.as_mut(),
    );
    pixmap
        .encode_png()
        .map_err(|err| CoreError::Render(err.to_string()))
}

fn pdf(tree: &usvg::Tree) -> Result<Vec<u8>, CoreError> {
    use krilla_svg::SurfaceExt;

    let size = krilla::geom::Size::from_wh(tree.size().width(), tree.size().height())
        .ok_or_else(|| CoreError::Render("PDF のページ寸法が不正です".to_string()))?;
    let mut document = krilla::Document::new();
    let mut page = document.start_page_with(krilla::page::PageSettings::new(size));
    let mut surface = page.surface();
    surface
        .draw_svg(tree, size, krilla_svg::SvgSettings::default())
        .ok_or_else(|| CoreError::Render("SVG を PDF に描けませんでした".to_string()))?;
    surface.finish();
    page.finish();
    document
        .finish()
        .map_err(|err| CoreError::Render(format!("PDF の生成に失敗しました: {err:?}")))
}
