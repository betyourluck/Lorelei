//! 開発用: merman の意味モデル (JSON) を標準出力へ出す。
use merman::{Engine, ParseOptions};
fn main() {
    let src = std::env::args().nth(1).expect("mermaid source");
    let parsed = Engine::new()
        .parse_diagram_sync(&src, ParseOptions::strict())
        .expect("parse")
        .expect("diagram");
    println!("{}", serde_json::to_string(&parsed.model).unwrap());
}
