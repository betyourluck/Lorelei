use std::path::PathBuf;

use lorelei_core::output::{OutputPathError, write_file, write_output};
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

/// 韓国語・簡体字のラベル (普通と Markdown の太字)。ハングルと JP に無い簡体字 (这・简・们) を含む (spec 35 D4)
const CJK: &str = "flowchart TD\n  A[\"사용자 목록\"] --> B[\"这是简体们\"]\n  B --> C[\"`**굵은 한글** **简体们**`\"]\n";

#[test]
fn pdf_embeds_only_the_bundled_font() {
    for src in [FLOW, ER] {
        let out = render(src, RenderFormat::Pdf, &RenderOptions::default()).unwrap();
        assert!(out.bytes.starts_with(b"%PDF"));
        let fonts = base_fonts(&out.bytes);
        assert!(!fonts.is_empty());
        // P0 で見た太字化 (BIZ-UDGothic-Bold) やシステムフォントが紛れ込まないこと。日本語の図は JP だけで描く
        for font in &fonts {
            assert!(
                font.contains("NotoSansJP-"),
                "同梱以外のフォント: {fonts:?}"
            );
        }
    }
}

// spec 35 D4: 韓国語・簡体字の字は同梱の KR・SC で描き、太字は Bold で描く (usvg の既定は太さを見ずに代わりを選ぶ)
#[test]
fn pdf_draws_korean_and_chinese_with_the_bundled_fonts_of_the_same_weight() {
    let out = render(CJK, RenderFormat::Pdf, &RenderOptions::default()).unwrap();
    let fonts: Vec<String> = base_fonts(&out.bytes)
        .into_iter()
        .map(|f| {
            f.split_once('+')
                .map_or(f.clone(), |(_, name)| name.to_string())
        })
        .collect();
    for want in [
        "NotoSansKR-Regular",
        "NotoSansKR-Bold",
        "NotoSansSC-Regular",
        "NotoSansSC-Bold",
    ] {
        assert!(fonts.iter().any(|f| f == want), "{want}: {fonts:?}");
    }
    for font in &fonts {
        assert!(
            ["NotoSansJP-", "NotoSansSC-", "NotoSansKR-"]
                .iter()
                .any(|p| font.starts_with(p)),
            "同梱以外のフォント: {fonts:?}"
        );
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

// ---------- テーマ (spec 24) ----------

const FLOW_BODY: &str = "flowchart LR\n  A[開始] --> B{判定}\n";

fn svg_of(src: &str, options: &RenderOptions) -> String {
    String::from_utf8(render(src, RenderFormat::Svg, options).unwrap().bytes).unwrap()
}

fn root_of(svg: &str) -> &str {
    &svg[..svg.find('>').unwrap()]
}

fn png_corner(src: &str, options: &RenderOptions) -> (u8, u8, u8, u8) {
    let out = render(src, RenderFormat::Png, options).unwrap();
    let pixmap = resvg::tiny_skia::Pixmap::decode_png(&out.bytes).unwrap();
    let px = pixmap.pixel(0, 0).unwrap();
    (px.red(), px.green(), px.blue(), px.alpha())
}

#[test]
fn theme_variables_in_the_source_reach_the_export() {
    // D4-2: 書き出しの守りから themeVariables を外す。プレビュー (mermaid.js) と同じく色が効く
    let src = format!(
        "---\nconfig:\n  theme: base\n  themeVariables:\n    primaryColor: \"#6A7FAB\"\n    lineColor: \"#ff0000\"\n---\n{FLOW_BODY}"
    );
    let svg = svg_of(&src, &RenderOptions::default()).to_ascii_lowercase();
    assert!(svg.contains("#6a7fab"), "primaryColor が効いていない");
    assert!(svg.contains("#ff0000"), "lineColor が効いていない");
    // init でも効く (参考の Zenn の記事の形。default のテーマはノードの塗りを primaryColor から作らないので base にする)
    let init = format!(
        "%%{{init: {{\"theme\": \"base\", \"themeVariables\": {{\"primaryColor\": \"#123abc\"}}}}}}%%\n{FLOW_BODY}"
    );
    assert!(
        svg_of(&init, &RenderOptions::default())
            .to_ascii_lowercase()
            .contains("#123abc")
    );
}

#[test]
fn theme_css_and_font_family_stay_guarded_in_the_export() {
    // themeCSS・fontFamily は守りに残す (D4-2)
    let src = format!(
        "%%{{init: {{\"themeCSS\": \".node rect {{ fill: #abcdef; }}\", \"fontFamily\": \"Comic Sans MS\"}}}}%%\n{FLOW_BODY}"
    );
    let svg = svg_of(&src, &RenderOptions::default());
    assert!(
        !svg.to_ascii_lowercase().contains("#abcdef"),
        "themeCSS が効いた"
    );
    assert!(!svg.contains("Comic Sans MS"), "fontFamily が効いた");
}

#[test]
fn unreadable_theme_variable_colors_fail_validate_and_render_alike() {
    // 色として読めない値は書き出しがエラーになる。validate も同じ設定で読むので、validate が通って render がエラーになる食い違いを作らない
    let src = format!(
        "%%{{init: {{\"themeVariables\": {{\"primaryColor\": \"nope\"}}}}}}%%\n{FLOW_BODY}"
    );
    let v = validate(&src).unwrap();
    assert!(!v.ok, "{v:?}");
    assert_eq!(v.family.as_deref(), Some("flowchart-v2"));
    assert!(v.errors[0].message.contains("nope"), "{:?}", v.errors);
    assert!(
        v.errors[0].message.contains("themeVariables"),
        "{:?}",
        v.errors
    );
    let err = render(&src, RenderFormat::Svg, &RenderOptions::default()).unwrap_err();
    assert!(matches!(err, CoreError::Parse(_)), "{err:?}");
}

#[test]
fn dark_theme_exports_on_its_own_background() {
    // D5: 効いているテーマ (図の中が勝つ) が dark なら #333。ほかは今と同じ白
    let dark_fm = format!("---\nconfig:\n  theme: dark\n---\n{FLOW_BODY}");
    let dark_init = format!("%%{{init: {{\"theme\": \"dark\"}}}}%%\n{FLOW_BODY}");
    let dark_er = format!("---\nconfig:\n  theme: dark\n---\n{ER}");
    let d = RenderOptions::default();
    for src in [&dark_fm, &dark_init, &dark_er] {
        assert_eq!(png_corner(src, &d), (51, 51, 51, 255), "{src}");
        let svg = svg_of(src, &d);
        assert!(
            root_of(&svg).contains("background-color:rgba(51,51,51,1)"),
            "{}",
            root_of(&svg)
        );
    }
    // options.theme が dark で、図にテーマが無い
    let dark = RenderOptions {
        theme: lorelei_core::Theme::Dark,
        ..RenderOptions::default()
    };
    assert_eq!(png_corner(FLOW_BODY, &dark), (51, 51, 51, 255));
    // 図の中のテーマが勝つ (options は dark、図は forest → 白)
    let forest = format!("---\nconfig:\n  theme: forest\n---\n{FLOW_BODY}");
    assert_eq!(png_corner(&forest, &dark), (255, 255, 255, 255));
    // options.background を渡した時はそれが勝つ
    let red = RenderOptions {
        background: Some("#ff0000".into()),
        ..RenderOptions::default()
    };
    assert_eq!(png_corner(&dark_fm, &red), (255, 0, 0, 255));
    // neutral・forest・default は今と同じ白
    for theme in ["neutral", "forest", "default"] {
        let src = format!("---\nconfig:\n  theme: {theme}\n---\n{FLOW_BODY}");
        assert_eq!(png_corner(&src, &d), (255, 255, 255, 255), "{theme}");
    }
    // プレビューの PNG (MCP render の preview) も同じ背景
    let preview = render_preview_png(&dark_fm, &d, 400).unwrap();
    let pixmap = resvg::tiny_skia::Pixmap::decode_png(&preview).unwrap();
    let px = pixmap.pixel(0, 0).unwrap();
    assert_eq!((px.red(), px.green(), px.blue()), (51, 51, 51));
}

#[test]
fn diagrams_without_a_theme_export_the_same_bytes() {
    // 受け入れ条件 6: テーマを選ばない図の書き出しは今と同じ (ルートの背景は Mermaid の既定の白のまま)
    let svg = svg_of(FLOW, &RenderOptions::default());
    assert!(
        root_of(&svg).contains("background-color:white"),
        "{}",
        root_of(&svg)
    );
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

// spec 25 D2: GUI の書き出しの .mmd は RenderFormat を通らず、拡張子を渡して同じ規則で書く
#[test]
fn write_file_checks_the_given_extension() {
    let dir = scratch_dir();
    let path = dir.join("図.mmd");
    write_file(
        &path,
        "mmd",
        "flowchart TD
"
        .as_bytes(),
        false,
    )
    .unwrap();
    assert_eq!(
        std::fs::read(&path).unwrap(),
        b"flowchart TD
"
    );
    // 大文字の拡張子も通る (write_output と同じ)
    write_file(&dir.join("大文字.MMD"), "mmd", b"x", false).unwrap();
    let err = write_file(&dir.join("図.svg"), "mmd", b"x", false).unwrap_err();
    assert_eq!(
        err,
        OutputPathError::ExtensionMismatch {
            expected: "mmd",
            path: dir.join("図.svg").display().to_string(),
        }
    );
    // 上書きの規則も同じ
    assert!(matches!(
        write_file(&path, "mmd", b"y", false).unwrap_err(),
        OutputPathError::AlreadyExists(_)
    ));
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
