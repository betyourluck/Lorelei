//! GUI の中で待ち受ける HTTP の MCP (spec 03 P1、data_contract `McpServer.http`)。
//! 検査の 3 つ (トークン・Host・Origin) と、initialize → tools/list → tools/call の往復。

use std::sync::{Arc, Mutex};

use lorelei_mcp::{Diagram, DiagramSummary, EditorPort, start_http};
use serde_json::{Value, json};

const TOKEN: &str = "test-token-0123456789abcdef";
const AI_ID: &str = "00000000-0000-4000-8000-000000000001";
const NEW_ID: &str = "00000000-0000-4000-8000-000000000002";

fn summary(id: &str, origin: &str, open: bool) -> DiagramSummary {
    DiagramSummary {
        id: id.into(),
        title: format!("図 {origin}"),
        editor: "flowchart".into(),
        origin: origin.into(),
        created_at: "2026-09-25T10:00:00+09:00".into(),
        updated_at: "2026-09-25T10:05:00+09:00".into(),
        saved_at: None,
        unsaved: true,
        open,
    }
}

/// 図の一覧を持つ偽のエディタ。open_in_editor が届けた図と、read に渡された id を覚える
#[derive(Default)]
struct Recorder {
    opened: Mutex<Vec<(String, Option<String>)>>,
    reads: Mutex<Vec<Option<String>>>,
}

impl EditorPort for Recorder {
    fn open(&self, source: String, title: Option<String>) -> Result<String, String> {
        self.opened.lock().unwrap().push((source, title));
        Ok(AI_ID.into())
    }
    fn list(&self) -> Result<Vec<DiagramSummary>, String> {
        Ok(vec![summary(AI_ID, "ai", true), summary(NEW_ID, "new", false)])
    }
    fn read(&self, id: Option<String>) -> Result<Diagram, String> {
        self.reads.lock().unwrap().push(id.clone());
        match id.as_deref().unwrap_or(AI_ID) {
            AI_ID => Ok(Diagram {
                summary: summary(AI_ID, "ai", true),
                source: "flowchart TD
    受付[受付]
".into(),
                original_source: Some("flowchart LR
  受付 --> 完了
".into()),
            }),
            NEW_ID => Ok(Diagram {
                summary: summary(NEW_ID, "new", false),
                source: String::new(),
                original_source: None,
            }),
            other => Err(format!("図が見つかりません（id: {other}）")),
        }
    }
}

struct Refuser;
impl EditorPort for Refuser {
    fn open(&self, _: String, _: Option<String>) -> Result<String, String> {
        Err("図の一覧に足せませんでした".into())
    }
    fn list(&self) -> Result<Vec<DiagramSummary>, String> {
        Ok(Vec::new())
    }
    fn read(&self, _: Option<String>) -> Result<Diagram, String> {
        Err("今開いている図がありません。id を指定するか、GUI で図を開いてください".into())
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
    assert_eq!(names, ["list_diagrams", "open_in_editor", "read_diagram", "render", "validate"]);

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
    // 作った図の id が返り、そのまま read_diagram に渡せる (spec 04 D2)
    assert_eq!(out["document_id"], AI_ID);
    let got = recorder.opened.lock().unwrap().clone();
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
    assert_eq!(refused["result"]["structuredContent"]["document_id"], Value::Null);
    running.stop();

    // GUI で開けない種類は、エディタへ届ける前に断る
    let recorder = Arc::new(Recorder::default());
    let (running, url) = start(recorder.clone()).await;
    let sid = session(&url).await;
    let seq = call(&url, &sid, 2, "tools/call", json!({"name":"open_in_editor","arguments":{"source":"sequenceDiagram\n  A->>B: hi"}})).await;
    assert_eq!(seq["result"]["structuredContent"]["opened"], false);
    assert!(recorder.opened.lock().unwrap().is_empty());
    assert_eq!(seq["result"]["structuredContent"]["document_id"], Value::Null);
    running.stop();
}

// spec 04 D2: 人が GUI で直した今の図を読み戻す
#[tokio::test]
async fn diagrams_are_listed_and_read_back_over_http() {
    let recorder = Arc::new(Recorder::default());
    let (running, url) = start(recorder.clone()).await;
    let sid = session(&url).await;

    let list = call(&url, &sid, 2, "tools/call", json!({"name":"list_diagrams","arguments":{}})).await;
    let diagrams = list["result"]["structuredContent"]["diagrams"].as_array().unwrap().clone();
    assert_eq!(diagrams.len(), 2, "{list}");
    assert_eq!(diagrams[0]["id"], AI_ID);
    assert_eq!(diagrams[0]["open"], true);
    assert_eq!(diagrams[0]["saved_at"], Value::Null);
    assert_eq!(diagrams[1]["unsaved"], true);

    // id を省くと今開いている図。include_original を付けなければ original_source のキーごと出さない
    let r = call(&url, &sid, 3, "tools/call", json!({"name":"read_diagram","arguments":{}})).await;
    let d = &r["result"]["structuredContent"];
    assert_eq!(d["id"], AI_ID, "{r}");
    assert_eq!(d["source"], "flowchart TD
    受付[受付]
");
    assert_eq!(d["editor"], "flowchart");
    assert!(d.get("original_source").is_none(), "{d}");

    // include_original: ai は原文、new は null
    let r = call(&url, &sid, 4, "tools/call", json!({"name":"read_diagram","arguments":{"id":AI_ID,"include_original":true}})).await;
    assert_eq!(r["result"]["structuredContent"]["original_source"], "flowchart LR
  受付 --> 完了
");
    let r = call(&url, &sid, 5, "tools/call", json!({"name":"read_diagram","arguments":{"id":NEW_ID,"include_original":true}})).await;
    let d = &r["result"]["structuredContent"];
    assert_eq!(d["original_source"], Value::Null);
    assert!(d.get("original_source").is_some(), "true なら null でもキーは出す: {d}");
    assert_eq!(d["source"], "", "空の図はエラーにしない");

    // 口へは id をそのまま渡す (省いたら None)
    assert_eq!(
        *recorder.reads.lock().unwrap(),
        vec![None, Some(AI_ID.to_string()), Some(NEW_ID.to_string())]
    );
    running.stop();
}

#[tokio::test]
async fn read_errors_are_tool_errors() {
    let (running, url) = start(Arc::new(Recorder::default())).await;
    let sid = session(&url).await;
    let r = call(&url, &sid, 2, "tools/call", json!({"name":"read_diagram","arguments":{"id":"../state"}})).await;
    assert_eq!(r["result"]["isError"], true, "{r}");
    assert!(r["result"]["structuredContent"]["error"].as_str().unwrap().contains("見つかりません"));
    running.stop();

    let (running, url) = start(Arc::new(Refuser)).await;
    let sid = session(&url).await;
    let r = call(&url, &sid, 2, "tools/call", json!({"name":"read_diagram","arguments":{}})).await;
    assert_eq!(r["result"]["isError"], true, "{r}");
    assert!(r["result"]["structuredContent"]["error"].as_str().unwrap().contains("今開いている図がありません"));
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
