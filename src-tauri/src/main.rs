// 配布ビルドは GUI サブシステム (コンソール窓を出さない)。パイプで渡された stdio はそのまま使える
// (spec 01 現況 5 で実測)。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // **tauri::Builder に入る前に** MCP モードを判定する (spec 01 D1)。
    // MCP モードでは WebView も single-instance プラグインも作らない
    if std::env::args_os().skip(1).any(|a| a == "--mcp") {
        std::process::exit(lorelei_lib::run_mcp());
    }
    lorelei_lib::run_gui();
}
