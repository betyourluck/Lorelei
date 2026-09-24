//! GUI の中の MCP の待ち受けを管理する (spec 03 D2・D4、data_contract `McpServerConfig` / `McpStatus`)。
//!
//! 作りは Fuseforks の mcp_server.rs に揃える。違いは既定で ON なこと (利用者裁定 2026-09-25)。

use std::path::{Path, PathBuf};
use std::sync::Arc;

use lorelei_mcp::{EditorPort, RunningHttp, start_http};
use serde::{Deserialize, Serialize};

pub const CONFIG_FILE: &str = "mcp_server.json";
pub const DEFAULT_PORT: u16 = 39642;
const MIN_PORT: u16 = 1024;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default = "default_port")]
    pub port: u16,
    /// 初めて待ち受ける時に 1 回だけ作る。毎回作り直すとクライアントの設定が毎回無効になる
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

fn default_enabled() -> bool {
    true
}

fn default_port() -> u16 {
    DEFAULT_PORT
}

impl Default for McpServerConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            port: DEFAULT_PORT,
            token: None,
        }
    }
}

fn new_token() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// `mcp_server.json` の読み書き。**読めなかったら書き込みを拒む** — 既定値で書き戻すと、
/// 人が手で直せば戻ったはずのトークンとポートを消すことになる (Fuseforks failures #70)
#[derive(Debug)]
pub struct ConfigStore {
    path: PathBuf,
    blocked: Option<String>,
    config: McpServerConfig,
}

impl ConfigStore {
    pub fn load(dir: &Path) -> Self {
        let path = dir.join(CONFIG_FILE);
        let (config, blocked) = match std::fs::read_to_string(&path) {
            Ok(raw) => match serde_json::from_str::<McpServerConfig>(&raw) {
                Ok(c) => (c, None),
                // 中身は載せない (トークンが入っているファイル)。行と列だけ
                Err(e) => (
                    McpServerConfig::default(),
                    Some(format!(
                        "{CONFIG_FILE} を読めません ({} 行 {} 列)。手で直すか消してください",
                        e.line(),
                        e.column()
                    )),
                ),
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (McpServerConfig::default(), None),
            Err(e) => (
                McpServerConfig::default(),
                Some(format!("{CONFIG_FILE} を読めません ({})", e.kind())),
            ),
        };
        Self {
            path,
            blocked,
            config,
        }
    }

    /// `{app_data_dir}` の設定。決められない時は書けない場所として扱う
    pub fn load_default() -> Self {
        match lorelei_core::paths::app_data_dir() {
            Some(dir) => Self::load(&dir),
            None => Self {
                path: PathBuf::new(),
                blocked: Some("アプリのデータフォルダを決められません".into()),
                config: McpServerConfig::default(),
            },
        }
    }

    pub fn config(&self) -> &McpServerConfig {
        &self.config
    }

    pub fn blocked(&self) -> Option<&str> {
        self.blocked.as_deref()
    }

    /// 変えてから書く。読めなかったファイルには書かない
    fn update(&mut self, change: impl FnOnce(&mut McpServerConfig)) -> Result<(), String> {
        if let Some(reason) = &self.blocked {
            return Err(reason.clone());
        }
        let mut next = self.config.clone();
        change(&mut next);
        let json = serde_json::to_vec_pretty(&next).map_err(|e| e.to_string())?;
        crate::documents::write_atomic(&self.path, &json)?;
        self.config = next;
        Ok(())
    }
}

/// 設定と、今の待ち受け
pub struct McpHost {
    store: ConfigStore,
    editor: Arc<dyn EditorPort>,
    running: Option<RunningHttp>,
    failure: Option<String>,
}

/// data_contract `McpStatus`
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub enabled: bool,
    pub port: u16,
    pub token: Option<String>,
    pub state: &'static str,
    pub detail: Option<String>,
}

impl McpHost {
    pub fn new(store: ConfigStore, editor: Arc<dyn EditorPort>) -> Self {
        Self {
            store,
            editor,
            running: None,
            failure: None,
        }
    }

    pub fn status(&self) -> McpStatus {
        let c = self.store.config();
        let (state, detail) = if let Some(reason) = self.store.blocked() {
            ("blocked", Some(reason.to_owned()))
        } else if self.running.is_some() {
            ("listening", None)
        } else if let Some(f) = &self.failure {
            ("failed", Some(f.clone()))
        } else {
            ("stopped", None)
        };
        McpStatus {
            enabled: c.enabled,
            port: self
                .running
                .as_ref()
                .map_or(c.port, |r| r.addr().port()),
            token: c.token.clone(),
            state,
            detail,
        }
    }

    /// 待ち受けを閉じ、ポートが空くまで待つ
    pub async fn shutdown(&mut self) {
        if let Some(r) = self.running.take() {
            r.shutdown().await;
        }
    }

    /// 設定どおりにする: 止めて**ポートが空くのを待って**から、有効なら待ち受ける。
    /// ポートが使われていても GUI は止めない (失敗として見せる)
    pub async fn apply(&mut self) {
        self.shutdown().await;
        self.failure = None;
        if self.store.blocked().is_some() || !self.store.config().enabled {
            return;
        }
        let token = match self.store.config().token.clone() {
            Some(t) => t,
            None => {
                let t = new_token();
                let saved = t.clone();
                if let Err(e) = self.store.update(|c| c.token = Some(saved)) {
                    self.failure = Some(format!("トークンを保存できません: {e}"));
                    return;
                }
                t
            }
        };
        let port = self.store.config().port;
        match start_http(port, token, Arc::clone(&self.editor)).await {
            Ok(r) => self.running = Some(r),
            Err(e) => self.failure = Some(format!("127.0.0.1:{port} で待ち受けられません ({e})")),
        }
    }

    pub async fn set_enabled(&mut self, enabled: bool) -> Result<McpStatus, String> {
        self.store.update(|c| c.enabled = enabled)?;
        self.apply().await;
        Ok(self.status())
    }

    pub async fn set_port(&mut self, port: u16) -> Result<McpStatus, String> {
        if port < MIN_PORT {
            return Err(format!("ポートは {MIN_PORT}〜65535 で指定してください"));
        }
        self.store.update(|c| c.port = port)?;
        self.apply().await;
        Ok(self.status())
    }

    /// 今のトークンで開いている接続は次の要求から弾かれる (待ち受け直す)
    pub async fn regenerate_token(&mut self) -> Result<McpStatus, String> {
        let t = new_token();
        self.store.update(|c| c.token = Some(t))?;
        self.apply().await;
        Ok(self.status())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    struct NoEditor;
    impl lorelei_mcp::EditorPort for NoEditor {
        fn open(&self, _: String, _: Option<String>) -> Result<(), String> {
            Err("test".into())
        }
    }

    fn dir() -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("lorelei-mcp-host-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn free_port() -> u16 {
        std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port()
    }

    fn write_config(dir: &std::path::Path, json: &str) {
        std::fs::write(dir.join(CONFIG_FILE), json).unwrap();
    }

    fn host(dir: &std::path::Path) -> McpHost {
        McpHost::new(ConfigStore::load(dir), Arc::new(NoEditor))
    }

    #[test]
    fn defaults_when_the_file_is_missing() {
        let store = ConfigStore::load(&dir());
        assert!(store.blocked().is_none());
        let c = store.config();
        assert!(c.enabled, "利用者裁定: 既定で ON");
        assert_eq!(c.port, DEFAULT_PORT);
        assert_eq!(DEFAULT_PORT, 39642);
        assert!(c.token.is_none());
    }

    #[tokio::test]
    async fn listening_creates_the_token_once_and_keeps_it() {
        let d = dir();
        write_config(&d, &format!(r#"{{"enabled":true,"port":{}}}"#, free_port()));
        let mut h = host(&d);
        h.apply().await;
        let s = h.status();
        assert_eq!(s.state, "listening", "{s:?}");
        let token = s.token.clone().expect("token");
        assert_eq!(token.len(), 32);
        h.shutdown().await;

        // 起動し直しても同じトークン (クライアントの設定を無効にしない)
        let mut again = host(&d);
        again.apply().await;
        assert_eq!(again.status().token, Some(token));
        again.shutdown().await;
    }

    #[tokio::test]
    async fn a_port_in_use_is_reported_not_fatal() {
        let d = dir();
        let busy = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = busy.local_addr().unwrap().port();
        write_config(&d, &format!(r#"{{"enabled":true,"port":{port}}}"#));
        let mut h = host(&d);
        h.apply().await;
        let s = h.status();
        assert_eq!(s.state, "failed");
        assert!(s.detail.is_some());
    }

    #[tokio::test]
    async fn disabling_stops_listening() {
        let d = dir();
        let port = free_port();
        write_config(&d, &format!(r#"{{"enabled":true,"port":{port}}}"#));
        let mut h = host(&d);
        h.apply().await;
        assert_eq!(h.status().state, "listening");
        let s = h.set_enabled(false).await.unwrap();
        assert_eq!(s.state, "stopped");
        assert!(!s.enabled);
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        assert!(std::net::TcpStream::connect(("127.0.0.1", port)).is_err(), "止めたのにつながる");
        // 設定に残る
        assert!(!ConfigStore::load(&d).config().enabled);
    }

    #[tokio::test]
    async fn regenerating_changes_and_persists_the_token() {
        let d = dir();
        write_config(&d, &format!(r#"{{"enabled":true,"port":{}}}"#, free_port()));
        let mut h = host(&d);
        h.apply().await;
        let before = h.status().token.unwrap();
        let s = h.regenerate_token().await.unwrap();
        let after = s.token.clone().unwrap();
        assert_ne!(before, after);
        assert_eq!(s.state, "listening");
        assert_eq!(ConfigStore::load(&d).config().token, Some(after));
        h.shutdown().await;
    }

    #[tokio::test]
    async fn port_must_be_in_range() {
        let mut h = host(&dir());
        assert!(h.set_port(80).await.is_err());
        assert!(h.set_port(0).await.is_err());
    }

    #[tokio::test]
    async fn a_broken_file_blocks_listening_and_saving_without_leaking_it() {
        let d = dir();
        let secret = "0123456789abcdef0123456789abcdef";
        write_config(&d, &format!(r#"{{"enabled":true,"token":"{secret}", broken"#));
        let mut h = host(&d);
        h.apply().await;
        let s = h.status();
        assert_eq!(s.state, "blocked");
        let detail = s.detail.unwrap();
        assert!(!detail.contains(secret), "エラーにトークンが出ている: {detail}");
        // 保存を拒む (手で直せば戻るはずの値を既定値で潰さない)
        assert!(h.set_enabled(false).await.is_err());
        assert!(std::fs::read_to_string(d.join(CONFIG_FILE)).unwrap().contains(secret));
    }
}
