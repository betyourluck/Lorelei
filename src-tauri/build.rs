// Windows の cargo test 対策: tauri-build は Common-Controls v6 の manifest をアプリの exe にしか埋め込まない。
// Tauri を含むテスト用の exe は manifest なしで System32 の comctl32 5.82 に繋がり、読み込みの時点で
// STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139) で落ちる。そこで tauri-build の埋め込みを止め、
// 同じ manifest (tauri-build 2.6.3 の既定を写したもの) をリンカで全ての exe (テスト含む) に埋め込む。
// 出典: https://github.com/orgs/tauri-apps/discussions/11179
fn main() {
    let is_windows_msvc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");

    let mut attributes = tauri_build::Attributes::new();
    if is_windows_msvc {
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        let manifest = std::path::Path::new(&std::env::var("CARGO_MANIFEST_DIR").unwrap())
            .join("windows-app-manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    }
    tauri_build::try_build(attributes).expect("tauri-build");
}
