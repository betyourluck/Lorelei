//! 開発用: Mermaid を SVG にして標準出力へ出す。`cargo run -p lorelei_core --example probe_svg -- "<mermaid>"`
fn main() {
    let src = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "flowchart TD\n  A[a] --> B[b]\n".into());
    let out = lorelei_core::render(&src, lorelei_core::RenderFormat::Svg, &Default::default())
        .expect("render");
    print!("{}", String::from_utf8(out.bytes).expect("utf-8"));
}
