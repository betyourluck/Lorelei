// 配布ビルドは GUI サブシステム (コンソール窓を出さない)。
// MCP は GUI の中で HTTP として待ち受ける (spec 03)。stdio の `--mcp` は spec 03 P3 で撤去した。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lorelei_lib::run_gui();
}
