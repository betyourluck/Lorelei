//! 開発・スモークテスト用の単体 MCP サーバー。配布物では GUI の exe が `lorelei --mcp` で同じ
//! `run_stdio` を呼ぶ (spec 01 D1)。D1 の退路 (console サブシステムの別 bin) もこの形になる。
//!
//! GUI の場所は環境変数 `LORELEI_GUI_EXE`。無ければ open_in_editor は「GUI が見つからない」を返す。

#[tokio::main]
async fn main() {
    let launcher = lorelei_mcp::GuiLauncher {
        exe: std::env::var_os("LORELEI_GUI_EXE").map(Into::into),
        inbox: lorelei_core::paths::inbox_dir(),
    };
    if let Err(e) = lorelei_mcp::run_stdio(launcher).await {
        // stdout は JSON-RPC 専用。失敗は stderr へ
        eprintln!("lorelei-mcp: {e}");
        std::process::exit(1);
    }
}
