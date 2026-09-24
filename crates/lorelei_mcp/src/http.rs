//! GUI の中で待ち受ける Streamable HTTP の MCP (spec 03 D2・D3、data_contract `McpServer.http`)。
//! 作りは Fuseforks の mcp_server.rs と同じ (同じ rmcp 2.2)。
//!
//! 検査は 3 つ:
//! 1. `Authorization: Bearer <token>` を定数時間で比べる (ここのミドルウェア)。無い・違う → 401
//! 2. Host は rmcp の既定 (`allowed_hosts` = loopback 3 種、DNS rebinding 対策)
//! 3. Origin は loopback だけ。rmcp の既定は空 (= 検査しない) なので明示する。Origin の無い要求 (CLI) は通る
//!
//! bind は 127.0.0.1 固定。トークンはログに出さない。

use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;

use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager,
    tower::{StreamableHttpServerConfig, StreamableHttpService},
};
use tokio_util::sync::CancellationToken;

use crate::{EditorPort, LoreleiServer};

/// 待ち受けのパス (data_contract `McpServer.http.path`)
pub const MCP_PATH: &str = "/mcp";

/// 待ち受けている HTTP の MCP。`stop` で閉じる (セッションも一緒に畳まれる)
#[derive(Debug)]
pub struct RunningHttp {
    addr: SocketAddr,
    cancel: CancellationToken,
}

impl RunningHttp {
    /// 実際に待ち受けているアドレス (ポート 0 を渡した時は OS が選んだ番号)
    pub fn addr(&self) -> SocketAddr {
        self.addr
    }

    pub fn stop(&self) {
        self.cancel.cancel();
    }
}

/// `127.0.0.1:{port}/mcp` で待ち受けを始める。tokio のランタイムの中から呼ぶ
/// (Tauri の `async_runtime` も tokio)。
///
/// # Errors
/// ポートを bind できない時 (他のプロセスが使っている等)。
pub async fn start_http(
    port: u16,
    token: String,
    editor: Arc<dyn EditorPort>,
) -> std::io::Result<RunningHttp> {
    let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, port)).await?;
    let addr = listener.local_addr()?;
    let cancel = CancellationToken::new();

    let mut config = StreamableHttpServerConfig::default();
    config.allowed_origins = vec![
        format!("http://127.0.0.1:{}", addr.port()),
        format!("http://localhost:{}", addr.port()),
    ];
    config.cancellation_token = cancel.clone();

    let service = StreamableHttpService::new(
        move || Ok(LoreleiServer::new(Arc::clone(&editor))),
        Arc::new(LocalSessionManager::default()),
        config,
    );
    let app = axum::Router::new()
        .nest_service(MCP_PATH, service)
        .layer(axum::middleware::from_fn_with_state(
            Arc::new(token),
            require_bearer_token,
        ));

    let shutdown = cancel.clone();
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app)
            .with_graceful_shutdown(async move { shutdown.cancelled().await })
            .await
        {
            eprintln!("lorelei mcp: 待ち受けが終わりました ({e})");
        }
    });
    Ok(RunningHttp { addr, cancel })
}

/// 鍵が無いのか違うのかは教えない (どちらも 401)
async fn require_bearer_token(
    axum::extract::State(expected): axum::extract::State<Arc<String>>,
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let provided = request
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::trim);
    if !provided.is_some_and(|p| token_matches(&expected, p)) {
        return axum::response::IntoResponse::into_response(axum::http::StatusCode::UNAUTHORIZED);
    }
    next.run(request).await
}

/// 定数時間で比べる。効くのは別の利用者のプロセスに対してだけ — 同じ利用者のプロセスは
/// 設定ファイルそのものを読める (Fuseforks の注記と同じ)
fn token_matches(expected: &str, provided: &str) -> bool {
    let (a, b) = (expected.as_bytes(), provided.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[cfg(test)]
mod tests {
    use super::token_matches;

    #[test]
    fn token_comparison() {
        assert!(token_matches("abc", "abc"));
        assert!(!token_matches("abc", "abd"));
        assert!(!token_matches("abc", "ab"));
        assert!(!token_matches("abc", ""));
    }
}
