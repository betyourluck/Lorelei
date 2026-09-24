//! GUI の中で待ち受ける HTTP の MCP (spec 03 P1、data_contract `McpServer.http`)。
//! 検査の 3 つ (トークン・Host・Origin) と、initialize → tools/list → tools/call の往復。

use std::sync::{Arc, Mutex};

use lorelei_mcp::{EditorPort, start_http};
use serde_json::{Value, json};

const TOKEN: &str = "test-token-0123456789abcdef";

/// open_in_editor が届けた図を覚える偽のエディタ
#[derive(Default)]
struct Recorder(Mutex<Vec<(String, Option<String>)>>);

impl EditorPort for Recorder {
    fn open(&self, source: String, title: Option<String>) -> Result<(), String> {
        self.0.lock().unwrap().push((source, title));
        Ok(())
    }
}

struct Refuser;
impl EditorPort for Refuser {
    fn open(&self, _: String, _: Option<String>) -> Result<(), String> {
        Err("図の一覧に足せませんでした".into())
    }
}

async fn start(editor: Arc<dyn EditorPort>) -> (lorelei_mcp::RunningHttp, String) {
    // ポート 0 = OS に空きを選ばせる (テストが並んでもぶつからない)
    let running = start_http(0, TOKEN.into(), editor).await.expect("bind");
    let url = format!("http://127.0.0.1:{}/mcp", running.addr().port());
    (running, url)
}

fn post(url: &str) -> reqwest::RequestBuilder {
    reqwest::Client::new()
        .post(url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream")
}

fn initialize_body() -> Value {
    json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{
        "protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"0"}}})
}

/// SSE でも JSON でも、最後の JSON-RPC の応答を取り出す
fn rpc_result(body: &str) -> Value {
    let json_line = body
        .lines()
        .filter_map(|l| l.strip_prefix("data: "))
        .rfind(|l| l.starts_with('{'))
        .map(str::to_owned)
        .unwrap_or_else(|| body.to_owned());
    serde_json::from_str(&json_line).unwrap_or_else(|e| panic!("{e}: {body}"))
}

/// initialize してセッションを張る
async fn session(url: &str) -> String {
    let res = post(url).bearer_auth(TOKEN).json(&initialize_body()).send().await.unwrap();
    assert_eq!(res.status(), 200);
    let sid = res.headers()["mcp-session-id"].to_str().unwrap().to_owned();
    let initialized = json!({"jsonrpc":"2.0","method":"notifications/initialized"});
    post(url).bearer_auth(TOKEN).header("Mcp-Session-Id", &sid).json(&initialized).send().await.unwrap();
    sid
}

async fn call(url: &str, sid: &str, id: u64, method: &str, params: Value) -> Value {
    let body = json!({"jsonrpc":"2.0","id":id,"method":method,"params":params});
    let res = post(url).bearer_auth(TOKEN).header("Mcp-Session-Id", sid).json(&body).send().await.unwrap();
    assert_eq!(res.status(), 200);
    rpc_result(&res.text().await.unwrap())
}

#[tokio::test]
async fn listens_only_on_loopback() {
    let (running, _) = start(Arc::new(Recorder::default())).await;
    assert!(running.addr().ip().is_loopback(), "{}", running.addr());
    running.stop();
}

#[tokio::test]
async fn requests_without_the_token_are_refused() {
    let (running, url) = start(Arc::new(Recorder::default())).await;
    let none = post(&url).json(&initialize_body()).send().await.unwrap();
    assert_eq!(none.status(), 401);
    let wrong = post(&url).bearer_auth("not-the-token").json(&initialize_body()).send().await.unwrap();
    assert_eq!(wrong.status(), 401);
    running.stop();
}

#[tokio::test]
async fn foreign_origin_and_host_are_refused() {
    let (running, url) = start(Arc::new(Recorder::default())).await;
    let origin = post(&url)
        .bearer_auth(TOKEN)
        .header("Origin", "http://evil.example")
        .json(&initialize_body())
        .send()
        .await
        .unwrap();
    assert_eq!(origin.status(), 403, "ブラウザ経由の要求 (DNS rebinding 等)");
    let host = post(&url)
        .bearer_auth(TOKEN)
        .header("Host", "evil.example")
        .json(&initialize_body())
        .send()
        .await
        .unwrap();
    assert_eq!(host.status(), 403);
    // Origin の無い要求 (CLI のクライアント) と loopback の Origin は通る
    let local = post(&url)
        .bearer_auth(TOKEN)
        .header("Origin", format!("http://127.0.0.1:{}", running.addr().port()))
        .json(&initialize_body())
        .send()
        .await
        .unwrap();
    assert_eq!(local.status(), 200);
    running.stop();
}

#[tokio::test]
async fn tools_are_listed_and_called_over_http() {
    let recorder = Arc::new(Recorder::default());
    let (running, url) = start(recorder.clone()).await;
    let sid = session(&url).await;

    let list = call(&url, &sid, 2, "tools/list", json!({})).await;
    let mut names: Vec<_> = list["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap().to_owned())
        .collect();
    names.sort();
    assert_eq!(names, ["open_in_editor", "render", "validate"]);

    let v = call(&url, &sid, 3, "tools/call", json!({"name":"validate","arguments":{"source":"flowchart TD\n  開始 --> 終了"}})).await;
    assert_eq!(v["result"]["structuredContent"]["ok"], true);

    // open_in_editor は GUI (EditorPort) へじかに届く。inbox も exe の起動も通らない (spec 03 D1・D5)
    let o = call(
        &url,
        &sid,
        4,
        "tools/call",
        json!({"name":"open_in_editor","arguments":{"source":"erDiagram\n  会員 ||--o{ 注文 : places","title":"会員と注文"}}),
    )
    .await;
    let out = &o["result"]["structuredContent"];
    assert_eq!(out["opened"], true, "{o}");
    assert_eq!(out["editor"], "erDiagram");
    let got = recorder.0.lock().unwrap().clone();
    assert_eq!(got.len(), 1);
    assert!(got[0].0.starts_with("erDiagram"));
    assert_eq!(got[0].1.as_deref(), Some("会員と注文"));
    running.stop();
}

#[tokio::test]
async fn editor_refusal_and_unsupported_diagrams_are_reported_not_delivered() {
    let (running, url) = start(Arc::new(Refuser)).await;
    let sid = session(&url).await;
    let refused = call(&url, &sid, 2, "tools/call", json!({"name":"open_in_editor","arguments":{"source":"flowchart TD\n  A --> B"}})).await;
    assert_eq!(refused["result"]["structuredContent"]["opened"], false);
    assert!(refused["result"]["structuredContent"]["reason"].as_str().unwrap().contains("足せません"));
    running.stop();

    // GUI で開けない種類は、エディタへ届ける前に断る
    let recorder = Arc::new(Recorder::default());
    let (running, url) = start(recorder.clone()).await;
    let sid = session(&url).await;
    let seq = call(&url, &sid, 2, "tools/call", json!({"name":"open_in_editor","arguments":{"source":"sequenceDiagram\n  A->>B: hi"}})).await;
    assert_eq!(seq["result"]["structuredContent"]["opened"], false);
    assert!(recorder.0.lock().unwrap().is_empty());
    running.stop();
}

#[tokio::test]
async fn shutdown_frees_the_port_for_an_immediate_restart() {
    // トークンの作り直し・ポートの変更は「止めて、すぐ同じポートで待ち受け直す」。
    // stop が合図を出すだけだと、まだ離していないポートに bind して失敗した (spec 03 P2 のテストで発覚)
    let (running, url) = start(Arc::new(Recorder::default())).await;
    let sid = session(&url).await; // セッションを開いたまま止める
    let _ = sid;
    let port = running.addr().port();
    running.shutdown().await;
    let again = start_http(port, TOKEN.into(), Arc::new(Recorder::default())).await;
    assert!(again.is_ok(), "{:?}", again.err());
    again.unwrap().shutdown().await;
}

#[tokio::test]
async fn stop_closes_the_port() {
    let (running, url) = start(Arc::new(Recorder::default())).await;
    running.stop();
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    let res = post(&url).bearer_auth(TOKEN).json(&initialize_body()).send().await;
    assert!(res.is_err(), "止めた後も応答した");
}
