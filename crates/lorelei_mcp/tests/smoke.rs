//! バイナリ単体のスモークテスト (spec 01 P2): initialize → tools/list → tools/call を stdio で通し、
//! stdout に JSON-RPC 以外が 1 行も出ないことを検査する (受け入れ条件 7)。

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

use serde_json::{Value, json};

struct Client {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
}

impl Client {
    fn start() -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_lorelei-mcp"))
            .env_remove("LORELEI_GUI_EXE")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("spawn lorelei-mcp");
        let stdin = child.stdin.take().unwrap();
        let stdout = BufReader::new(child.stdout.take().unwrap());
        let mut client = Self {
            child,
            stdin,
            stdout,
            next_id: 1,
        };
        let init = client.request(
            "initialize",
            json!({
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": { "name": "lorelei-smoke", "version": "0" }
            }),
        );
        assert_eq!(init["result"]["serverInfo"]["name"], "Lorelei", "{init}");
        client.send(json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }));
        client
    }

    fn send(&mut self, msg: Value) {
        writeln!(self.stdin, "{msg}").unwrap();
        self.stdin.flush().unwrap();
    }

    /// 応答が来るまで読む。**stdout の行は全部 JSON-RPC でなければならない**。
    fn request(&mut self, method: &str, params: Value) -> Value {
        let id = self.next_id;
        self.next_id += 1;
        self.send(json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }));
        loop {
            let mut line = String::new();
            let n = self.stdout.read_line(&mut line).unwrap();
            assert!(n > 0, "サーバーが応答前に stdout を閉じた");
            let msg: Value = serde_json::from_str(line.trim())
                .unwrap_or_else(|e| panic!("stdout に JSON-RPC 以外が出た ({e}): {line:?}"));
            assert_eq!(msg["jsonrpc"], "2.0", "{msg}");
            if msg["id"] == json!(id) {
                return msg;
            }
        }
    }

    fn call(&mut self, tool: &str, args: Value) -> Value {
        let res = self.request("tools/call", json!({ "name": tool, "arguments": args }));
        assert!(res.get("error").is_none(), "プロトコルのエラー: {res}");
        res["result"].clone()
    }
}

impl Drop for Client {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

const FLOW: &str = "flowchart TD\n  開始 --> 判定{在庫はあるか}\n  判定 -->|はい| 出荷\n";

#[test]
fn lists_exactly_three_tools() {
    let mut c = Client::start();
    let list = c.request("tools/list", json!({}));
    let mut names: Vec<&str> = list["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    names.sort();
    assert_eq!(names, ["open_in_editor", "render", "validate"]);
}

#[test]
fn validate_reports_ok_and_errors_as_tool_results() {
    let mut c = Client::start();
    let ok = c.call("validate", json!({ "source": FLOW }));
    assert_eq!(ok["isError"], false);
    assert_eq!(ok["structuredContent"]["ok"], true);
    assert_eq!(ok["structuredContent"]["family"], "flowchart-v2");
    assert_eq!(ok["structuredContent"]["editor"]["editable"], true);

    let bad = c.call(
        "validate",
        json!({ "source": "flowchart TD\n  A[a --> B\n" }),
    );
    assert_eq!(bad["structuredContent"]["ok"], false);
    assert_eq!(bad["structuredContent"]["errors"][0]["line"], 2);
}

#[test]
fn render_returns_svg_text_or_writes_a_file() {
    let mut c = Client::start();
    let svg = c.call("render", json!({ "source": FLOW, "format": "svg" }));
    assert_eq!(svg["isError"], false, "{svg}");
    assert!(
        svg["structuredContent"]["svg"]
            .as_str()
            .unwrap()
            .starts_with("<svg")
    );

    let dir = std::env::temp_dir().join(format!("lorelei-mcp-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let pdf = dir.join("図.pdf");
    let res = c.call(
        "render",
        json!({ "source": FLOW, "format": "pdf", "output_path": pdf.to_str().unwrap() }),
    );
    assert_eq!(res["isError"], false, "{res}");
    assert!(std::fs::read(&pdf).unwrap().starts_with(b"%PDF"));
    assert_eq!(res["structuredContent"]["svg"], Value::Null);

    // 同じパスへ overwrite なし → ツール結果のエラー (プロトコルのエラーではない)
    let again = c.call(
        "render",
        json!({ "source": FLOW, "format": "pdf", "output_path": pdf.to_str().unwrap() }),
    );
    assert_eq!(again["isError"], true, "{again}");
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn render_rejects_binary_formats_without_a_path_and_reports_syntax_lines() {
    let mut c = Client::start();
    let png = c.call("render", json!({ "source": FLOW, "format": "png" }));
    assert_eq!(png["isError"], true);

    let bad = c.call(
        "render",
        json!({ "source": "flowchart TD\n  A[a --> B\n", "format": "svg" }),
    );
    assert_eq!(bad["isError"], true);
    assert_eq!(bad["structuredContent"]["line"], 2);
}

#[test]
fn preview_comes_back_as_a_png_image() {
    let mut c = Client::start();
    let res = c.call(
        "render",
        json!({ "source": FLOW, "format": "svg", "preview": true }),
    );
    let image = res["content"]
        .as_array()
        .unwrap()
        .iter()
        .find(|b| b["type"] == "image")
        .expect("image content");
    assert_eq!(image["mimeType"], "image/png");
    assert!(image["data"].as_str().unwrap().len() > 100);
}

#[test]
fn open_in_editor_without_a_gui_explains_why() {
    let mut c = Client::start();
    let res = c.call("open_in_editor", json!({ "source": FLOW }));
    let out = &res["structuredContent"];
    assert_eq!(out["opened"], false);
    assert_eq!(out["editor"], "flowchart");
    assert!(out["reason"].as_str().unwrap().contains("GUI"));

    let seq = c.call(
        "open_in_editor",
        json!({ "source": "sequenceDiagram\n  A->>B: hi\n" }),
    );
    assert_eq!(seq["structuredContent"]["opened"], false);
    assert_eq!(seq["structuredContent"]["editor"], Value::Null);
}
