use std::path::PathBuf;

use lorelei_core::output::{OutputPathError, write_output};
use lorelei_core::{
    CoreError, MAX_SOURCE_BYTES, RenderFormat, RenderOptions, render, render_preview_png, validate,
};

const FLOW: &str = "flowchart TD\n  A[開始] --> B{在庫はあるか？}\n  B -->|はい| C[注文を確定する]\n  B -->|いいえ| D[入荷待ちリストに登録]\n";
const ER: &str =
    "erDiagram\n  顧客 ||--o{ 注文 : \"行う\"\n  顧客 {\n    int id PK\n    string 氏名\n  }\n";
const LONG_WITH_HTML_LABELS: &str = "%%{init: {\"htmlLabels\": true, \"flowchart\": {\"htmlLabels\": true}}}%%\nflowchart LR\n  A[受注データを基幹システムから夜間バッチで取り込み、重複を排除する] --> B[短い]\n";

// ---------- validate ----------

#[test]
fn validate_reports_family_for_valid_sources() {
    let flow = validate(FLOW).unwrap();
    assert!(flow.ok);
    assert_eq!(flow.family.as_deref(), Some("flowchart-v2"));
    assert!(flow.errors.is_empty());

    let er = validate(ER).unwrap();
    assert!(er.ok);
    assert_eq!(er.family.as_deref(), Some("er"));
}

#[test]
fn validate_reports_the_line_of_a_syntax_error() {
    let result = validate("flowchart TD\n  A[a] --> B[b\n  B --> C\n").unwrap();
    assert!(!result.ok);
    assert_eq!(result.family.as_deref(), Some("flowchart-v2"));
    assert_eq!(result.errors[0].line, Some(2), "{:?}", result.errors);
}

#[test]
fn validate_counts_lines_from_the_original_source_when_a_directive_comes_first() {
    let src = "%%{init: {\"theme\": \"dark\"}}%%\nflowchart TD\n  A[a] --> B[b\n";
    let result = validate(src).unwrap();
    assert!(!result.ok);
    assert_eq!(result.errors[0].line, Some(3), "{:?}", result.errors);
}

#[test]
fn validate_rejects_text_without_a_diagram_type() {
    let result = validate("not a diagram\n").unwrap();
    assert!(!result.ok);
    assert_eq!(result.family, None);
    assert_eq!(result.errors[0].line, None);
}

#[test]
fn oversized_input_is_rejected_before_parsing() {
    let big = format!("flowchart TD\n{}", "%".repeat(MAX_SOURCE_BYTES));
    assert!(matches!(
        validate(&big),
        Err(CoreError::InputTooLarge { .. })
    ));
}

// ---------- render ----------

#[test]
fn html_labels_stay_off_even_when_the_source_asks_for_them() {
    let svg = render(
        LONG_WITH_HTML_LABELS,
        RenderFormat::Svg,
        &RenderOptions::default(),
    )
    .unwrap();
    let svg = String::from_utf8(svg.bytes).unwrap();
    assert!(!svg.contains("foreignObject"));
    // htmlLabels が true だと resvg-safe の代替テキスト (1 行・折り返しなし) になる (P0-2)
    assert!(!svg.contains("merman-foreignobject-fallback-text"));
    assert!(
        svg.matches("<tspan").count() >= 3,
        "長いラベルが複数行に折り返されていない"
    );
}

#[test]
fn png_has_the_requested_scale() {
    let out = render(FLOW, RenderFormat::Png, &RenderOptions::default()).unwrap();
    assert!(out.bytes.starts_with(b"\x89PNG"));
    let pixmap = resvg::tiny_skia::Pixmap::decode_png(&out.bytes).unwrap();
    assert_eq!(pixmap.width(), (out.width * 2.0).ceil() as u32);
    assert_eq!(pixmap.height(), (out.height * 2.0).ceil() as u32);
}

#[test]
fn background_follows_mermaid_default_and_can_be_overridden() {
    let corner = |options: &RenderOptions| {
        let out = render(FLOW, RenderFormat::Png, options).unwrap();
        let pixmap = resvg::tiny_skia::Pixmap::decode_png(&out.bytes).unwrap();
        let px = pixmap.pixel(0, 0).unwrap();
        (px.red(), px.green(), px.blue(), px.alpha())
    };
    // 既定は Mermaid と同じ白
    assert_eq!(corner(&RenderOptions::default()), (255, 255, 255, 255));
    let with = |bg: &str| RenderOptions {
        background: Some(bg.into()),
        ..RenderOptions::default()
    };
    assert_eq!(corner(&with("transparent")).3, 0);
    assert_eq!(corner(&with("#ff0000")), (255, 0, 0, 255));

    let svg = render(FLOW, RenderFormat::Svg, &with("transparent")).unwrap();
    let svg = String::from_utf8(svg.bytes).unwrap();
    let root = &svg[..svg.find('>').unwrap()];
    assert!(root.contains("background-color:transparent"), "{root}");
}

#[test]
fn pdf_embeds_only_the_bundled_font() {
    for src in [FLOW, ER] {
        let out = render(src, RenderFormat::Pdf, &RenderOptions::default()).unwrap();
        assert!(out.bytes.starts_with(b"%PDF"));
        let fonts = base_fonts(&out.bytes);
        assert!(!fonts.is_empty());
        // P0 で見た太字化 (BIZ-UDGothic-Bold) やシステムフォントが紛れ込まないこと
        for font in &fonts {
            assert!(
                font.contains("NotoSansJP-"),
                "同梱以外のフォント: {fonts:?}"
            );
        }
    }
}

#[test]
fn syntax_errors_surface_from_render_with_a_line() {
    let err = render(
        "flowchart TD\n  A[a --> B\n",
        RenderFormat::Svg,
        &RenderOptions::default(),
    )
    .unwrap_err();
    let CoreError::Parse(e) = err else {
        panic!("{err:?}")
    };
    assert_eq!(e.line, Some(2));
}

#[test]
fn out_of_range_scale_and_bad_background_are_rejected() {
    let too_big = RenderOptions {
        scale: 9.0,
        ..RenderOptions::default()
    };
    assert!(render(FLOW, RenderFormat::Png, &too_big).is_err());
    let bad_color = RenderOptions {
        background: Some("not-a-color".into()),
        ..RenderOptions::default()
    };
    assert!(render(FLOW, RenderFormat::Pdf, &bad_color).is_err());
}

#[test]
fn preview_fits_within_the_long_side() {
    let bytes = render_preview_png(LONG_WITH_HTML_LABELS, &RenderOptions::default(), 400).unwrap();
    let pixmap = resvg::tiny_skia::Pixmap::decode_png(&bytes).unwrap();
    assert!(pixmap.width().max(pixmap.height()) <= 400);
}

// ---------- output ----------

fn scratch_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("lorelei-test-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn output_rejects_unsafe_paths_without_writing() {
    let dir = scratch_dir();
    let existing = dir.join("exists.png");
    std::fs::write(&existing, b"old").unwrap();

    type Case = (PathBuf, fn(&OutputPathError) -> bool);
    let cases: Vec<Case> = vec![
        (PathBuf::from("relative/out.png"), |e| {
            matches!(e, OutputPathError::NotAbsolute(_))
        }),
        (PathBuf::from("/home/user/out.png"), |e| {
            // Windows では WSL のパスは絶対パスにならない。Unix では親フォルダが無いので落ちる
            matches!(
                e,
                OutputPathError::NotAbsolute(_) | OutputPathError::ParentMissing(_)
            )
        }),
        (dir.join("out.pdf"), |e| {
            matches!(e, OutputPathError::ExtensionMismatch { .. })
        }),
        (dir.join("missing").join("out.png"), |e| {
            matches!(e, OutputPathError::ParentMissing(_))
        }),
        (existing.clone(), |e| {
            matches!(e, OutputPathError::AlreadyExists(_))
        }),
    ];
    for (path, expected) in cases {
        let err = write_output(&path, RenderFormat::Png, b"new", false).unwrap_err();
        assert!(expected(&err), "{path:?}: {err:?}");
    }
    assert_eq!(std::fs::read(&existing).unwrap(), b"old");
    assert_eq!(
        std::fs::read_dir(&dir).unwrap().count(),
        1,
        "一時ファイルが残っている"
    );
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn output_writes_atomically_and_overwrites_only_when_asked() {
    let dir = scratch_dir();
    let path = dir.join("図.svg");
    write_output(&path, RenderFormat::Svg, b"first", false).unwrap();
    write_output(&path, RenderFormat::Svg, b"second", true).unwrap();
    assert_eq!(std::fs::read(&path).unwrap(), b"second");
    assert_eq!(
        std::fs::read_dir(&dir).unwrap().count(),
        1,
        "一時ファイルが残っている"
    );
    std::fs::remove_dir_all(dir).unwrap();
}

fn base_fonts(pdf: &[u8]) -> Vec<String> {
    let text = String::from_utf8_lossy(pdf);
    let mut fonts: Vec<String> = text
        .match_indices("/BaseFont")
        .filter_map(|(i, _)| {
            let rest = text[i + "/BaseFont".len()..]
                .trim_start()
                .strip_prefix('/')?;
            Some(
                rest.chars()
                    .take_while(|c| c.is_ascii_alphanumeric() || "+-_".contains(*c))
                    .collect(),
            )
        })
        .collect();
    fonts.sort();
    fonts.dedup();
    fonts
}
