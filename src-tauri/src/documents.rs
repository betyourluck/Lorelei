//! 図の一覧 (spec 02 D6、data_contract `Document` / `DocumentSummary` / `DocumentState`)。
//!
//! 置き場は `{app_data_dir}/documents/{id}.json`。JS からは読み書きさせない (plugin-fs を入れない)。
//! パスを受け取らず id だけを受け取り、その id は uuid の形に限る — フロントから任意のファイルに触れる口にしない。

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use chrono::{DateTime, Local, SecondsFormat};
use lorelei_mcp::{EditorKind, UpdateError};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Editor {
    Flowchart,
    ErDiagram,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Origin {
    New,
    Ai,
    Import,
}

/// 絶対座標 (spec 15 D4)。枠 (サブグラフ) だけ大きさも持つ。大きさの無い位置は width / height を書かない (今の版のファイルと同じ形)
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Pos {
    pub x: f64,
    pub y: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
}

pub type Layout = BTreeMap<String, Pos>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub title: String,
    pub editor: Editor,
    pub source: String,
    #[serde(default)]
    pub layout: Layout,
    pub origin: Origin,
    pub original_source: Option<String>,
    pub created_at: String,
    /// 中身 (source / layout) が最後に変わった時刻。自動保存で進む
    pub updated_at: String,
    /// 利用者が「保存」を押した時刻 (spec 02 D12)。一覧の並びはこれ (無ければ created_at) で決まる
    #[serde(default)]
    pub saved_at: Option<String>,
    /// update_diagram が立てる印 (spec 08 D1)。次の save は揃え書きなので updated_at を進めず、印を消す。古いファイルに無ければ false
    #[serde(default)]
    pub normalize_pending: bool,
}

impl Document {
    /// 一覧の並びの鍵。見たり自動保存したりしても動かない
    fn order_key(&self) -> &str {
        self.saved_at.as_deref().unwrap_or(&self.created_at)
    }

    /// 最後の「保存」(無ければ作った時) より後に中身が変わった
    fn unsaved(&self) -> bool {
        self.updated_at.as_str() > self.order_key()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSummary {
    pub id: String,
    pub title: String,
    pub editor: Editor,
    pub origin: Origin,
    pub created_at: String,
    pub updated_at: String,
    pub saved_at: Option<String>,
    /// 最後の「保存」より後の変更がある (一覧とタイトルの ●)
    pub unsaved: bool,
}

impl From<&Document> for DocumentSummary {
    fn from(d: &Document) -> Self {
        Self {
            id: d.id.clone(),
            title: d.title.clone(),
            editor: d.editor,
            origin: d.origin,
            created_at: d.created_at.clone(),
            updated_at: d.updated_at.clone(),
            saved_at: d.saved_at.clone(),
            unsaved: d.unsaved(),
        }
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentState {
    last_opened: Option<String>,
}

pub struct Store {
    pub root: PathBuf,
}

/// load → write を囲む、プロセスで 1 つの鍵 (data_contract `Document.store_lock`)。Store は呼ぶたび作られるので static。
/// MCP の update は spawn_blocking、自動保存は Tauri の command で、別スレッドから同じファイルに来る
static STORE_LOCK: Mutex<()> = Mutex::new(());

fn lock() -> MutexGuard<'static, ()> {
    // 鍵を持ったまま panic したテストがあっても、後の呼び手を巻き込まない
    STORE_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl Store {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    /// 実際の置き場 `{app_data_dir}` (lorelei_core::paths::app_data_dir。Tauri の app_data_dir と一致)
    pub fn open_default() -> Option<Self> {
        lorelei_core::paths::app_data_dir().map(Self::new)
    }

    fn documents(&self) -> PathBuf {
        self.root.join("documents")
    }

    fn doc_path(&self, id: &str) -> Result<PathBuf, String> {
        check_id(id)?;
        Ok(self.documents().join(format!("{id}.json")))
    }

    /// documents/ 直下の *.json だけを読む。壊れたファイルは飛ばす (一覧ごと失敗させない)
    pub fn list(&self) -> Result<Vec<DocumentSummary>, String> {
        let entries = match std::fs::read_dir(self.documents()) {
            Ok(e) => e,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(format!("図の一覧を読めません: {e}")),
        };
        let mut docs: Vec<Document> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_file() && p.extension().is_some_and(|x| x == "json"))
            .filter_map(|p| read_doc(&p).ok())
            .collect();
        // 「保存」を押した時刻 (未保存は作った時刻) の新しい順。見る・自動保存・改名では動かない (D12)
        docs.sort_by(|a, b| b.order_key().cmp(a.order_key()));
        Ok(docs.iter().map(DocumentSummary::from).collect())
    }

    pub fn create(
        &self,
        editor: Editor,
        title: Option<String>,
        origin: Origin,
        original_source: Option<String>,
    ) -> Result<Document, String> {
        let now = now();
        let doc = Document {
            id: uuid::Uuid::new_v4().to_string(),
            title: title.unwrap_or_else(|| default_title(editor, origin)),
            editor,
            source: String::new(),
            layout: Layout::new(),
            origin,
            original_source,
            created_at: now.clone(),
            updated_at: now,
            saved_at: None,
            normalize_pending: false,
        };
        self.write(&doc)?;
        Ok(doc)
    }

    /// その id の図が一覧 (documents/) にある。uuid の形でない id・ごみ箱の図は false
    pub fn contains(&self, id: &str) -> bool {
        self.doc_path(id).is_ok_and(|p| p.is_file())
    }

    pub fn load(&self, id: &str) -> Result<Document, String> {
        read_doc(&self.doc_path(id)?)
    }

    /// 自動保存。書き換えるのは source と layout だけ。title / editor / origin / original_source は触らない (update だけが触る)。
    /// 中身が同じなら書かない (図を開いただけで「変更あり」にしない)。ただし normalize_pending を消す時は書く。
    /// updated_at を進めない書き込みは 2 つ — source が空だった図の最初の書き込み (first_fill: 新規作成の初期図・
    /// AI / インポートで届いた図がエディタに載った時) と、update の後の最初の書き込み (揃え書き。印が立っている) — で、
    /// どちらか 1 回だけ (update は source を非空にするので重ならない)。
    /// base_updated_at はフロントが読んだ版 (spec 08 D2)。ファイルが進んでいれば STALE_BASE で拒む
    pub fn save(
        &self,
        id: &str,
        source: String,
        layout: Layout,
        base_updated_at: &str,
    ) -> Result<DocumentSummary, String> {
        let _lock = lock();
        // ごみ箱へ移した・消えた図への書き込みは、書き直しても通らない。フロントが見分けて捨てる印を付ける
        if !self.contains(id) {
            return Err(format!("{DOCUMENT_GONE}: 図が一覧にありません（ごみ箱へ移したか、消えました）"));
        }
        let mut doc = self.load(id)?;
        // 古い版を添えた書き込み (走り出した古い保存・別の図を開く途中に来た update の後の保存) は届かせない。今の値を載せる
        if !same_instant(base_updated_at, &doc.updated_at) {
            return Err(format!("{STALE_BASE}: {}", doc.updated_at));
        }
        let first_fill = doc.source.is_empty();
        // 保険 (spec 04 D4-2、spec 08 D1 で first_fill の時だけに絞った): AI / インポートの図を、空への最初の書き込みで
        // エディタの初期図で潰さない (現況 4 の 1 件目の形)。中身のある図の上書きは保険の外 (門が受け持つ)
        if first_fill && doc.origin != Origin::New && source == initial_source(doc.editor) {
            return Err(format!(
                "{INITIAL_FIGURE_REJECTED}: AI やインポートで届いた図を、エディタの初期図で上書きしかけたので止めました"
            ));
        }
        let normalizing = doc.normalize_pending;
        if doc.source == source && doc.layout == layout && !normalizing {
            return Ok((&doc).into());
        }
        doc.source = source;
        doc.layout = layout;
        if normalizing {
            doc.normalize_pending = false;
        } else if !first_fill {
            doc.updated_at = now();
        }
        self.write(&doc)?;
        Ok((&doc).into())
    }

    /// update_diagram の書き込み (spec 08 D1、data_contract `Document.update`)。届いた Mermaid で中身を丸ごと差し替える。
    /// 書くのは source (そのまま) / original_source (同じ) / updated_at (今) / normalize_pending (true)。他は変えない。
    /// 書く前に history/{id}.json へ 1 世代写す。断った時は何も書かない
    pub fn update(
        &self,
        id: &str,
        source: String,
        editor: Editor,
        expected_updated_at: &str,
    ) -> Result<Document, UpdateError> {
        let _lock = lock();
        if !self.contains(id) {
            return Err(UpdateError::NotFound);
        }
        let mut doc = self.load(id).map_err(UpdateError::Other)?;
        if doc.editor != editor {
            return Err(UpdateError::KindMismatch {
                actual: editor_kind(doc.editor),
            });
        }
        if !same_instant(expected_updated_at, &doc.updated_at) {
            return Err(UpdateError::Conflict {
                current_updated_at: doc.updated_at,
            });
        }
        let kept = serde_json::to_vec_pretty(&doc).map_err(|e| UpdateError::Other(e.to_string()))?;
        write_atomic(&self.root.join("history").join(format!("{id}.json")), &kept)
            .map_err(|e| UpdateError::Other(format!("書き換え前の図を残せません: {e}")))?;
        doc.original_source = Some(source.clone());
        doc.source = source;
        doc.updated_at = now();
        doc.normalize_pending = true;
        self.write(&doc).map_err(UpdateError::Other)?;
        Ok(doc)
    }

    /// 利用者が「保存」を押した (D12)。一覧の先頭へ動き、● が消える
    pub fn mark_saved(&self, id: &str) -> Result<DocumentSummary, String> {
        let _lock = lock();
        let mut doc = self.load(id)?;
        doc.saved_at = Some(now());
        self.write(&doc)?;
        Ok((&doc).into())
    }

    /// 名前を変える。並びも ● も動かさない
    pub fn rename(&self, id: &str, title: String) -> Result<(), String> {
        let _lock = lock();
        let mut doc = self.load(id)?;
        doc.title = title;
        self.write(&doc)
    }

    /// 物理削除しない。documents/ の外 (trash/) へ移すので一覧に出なくなる。history/ は動かさない
    pub fn trash(&self, id: &str) -> Result<(), String> {
        let _lock = lock();
        let from = self.doc_path(id)?;
        let dir = self.root.join("trash");
        std::fs::create_dir_all(&dir).map_err(|e| format!("ごみ箱を作れません: {e}"))?;
        std::fs::rename(&from, dir.join(format!("{id}.json")))
            .map_err(|e| format!("ごみ箱へ移せません: {e}"))
    }

    pub fn last_opened(&self) -> Option<String> {
        let text = std::fs::read_to_string(self.root.join("state.json")).ok()?;
        let state: DocumentState = serde_json::from_str(&text).ok()?;
        state.last_opened.filter(|id| check_id(id).is_ok())
    }

    pub fn set_last_opened(&self, id: &str) -> Result<(), String> {
        check_id(id)?;
        let state = DocumentState {
            last_opened: Some(id.to_string()),
        };
        let json = serde_json::to_vec_pretty(&state).map_err(|e| e.to_string())?;
        write_atomic(&self.root.join("state.json"), &json)
    }

    fn write(&self, doc: &Document) -> Result<(), String> {
        let json = serde_json::to_vec_pretty(doc).map_err(|e| e.to_string())?;
        write_atomic(&self.doc_path(&doc.id)?, &json)
    }
}

fn check_id(id: &str) -> Result<(), String> {
    uuid::Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| format!("図の id が不正です: {id:?}"))
}

fn read_doc(path: &Path) -> Result<Document, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("図を読めません: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("図のファイルが壊れています: {e}"))
}

/// 同じフォルダの一時ファイルへ書いてから rename する (途中で切れた壊れファイルを残さない。OutputPathPolicy と同じ)
pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = path.parent().ok_or("保存先のフォルダがありません")?;
    std::fs::create_dir_all(dir).map_err(|e| format!("フォルダを作れません: {e}"))?;
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("doc");
    let tmp = dir.join(format!(".{name}.tmp.{}", uuid::Uuid::new_v4()));
    std::fs::write(&tmp, bytes).map_err(|e| format!("保存できません: {e}"))?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("保存できません: {e}")
    })
}

fn now() -> String {
    Local::now().to_rfc3339_opts(SecondsFormat::Micros, false)
}

/// RFC 3339 を時刻として解釈して同じ瞬間か (表記の違いは吸収、丸めた値は別の瞬間)。読めなければ違う扱い
fn same_instant(a: &str, b: &str) -> bool {
    match (DateTime::parse_from_rfc3339(a), DateTime::parse_from_rfc3339(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

/// MCP の型 (lorelei_mcp::EditorKind) へ。値は serde の名前と同じ
pub fn editor_kind(e: Editor) -> EditorKind {
    match e {
        Editor::Flowchart => EditorKind::Flowchart,
        Editor::ErDiagram => EditorKind::ErDiagram,
    }
}

/// `save` の base_updated_at がファイルの updated_at と違う時のエラーの頭。後ろに今の updated_at を載せる (spec 08 D2)
pub const STALE_BASE: &str = "STALE_BASE";

/// `save` の相手の図が一覧に無い時のエラーの頭 (フロントはこれで見分けて、その書き込みを捨てる)
pub const DOCUMENT_GONE: &str = "DOCUMENT_GONE";

/// `save` が初期図での上書きを拒んだ時のエラーの頭 (フロントはこれで見分けて、その書き込みを捨てる)
pub const INITIAL_FIGURE_REJECTED: &str = "INITIAL_FIGURE_REJECTED";

/// data_contract `Document.initial_sources`。フォーク元のエディタの初期図を生成器にかけた出力 (vitest で突き合わせる)
pub fn initial_source(editor: Editor) -> &'static str {
    match editor {
        Editor::Flowchart => "flowchart TD\n    startNode[Start]\n",
        Editor::ErDiagram => "erDiagram\n  ユーザー {\n    int id PK\n    varchar(255) name UK\n  }",
    }
}

/// data_contract `Document.default_titles`
pub fn default_title(editor: Editor, origin: Origin) -> String {
    let time = Local::now().format("%H:%M:%S");
    match (origin, editor) {
        (Origin::New, Editor::Flowchart) => "無題のフローチャート".into(),
        (Origin::New, Editor::ErDiagram) => "無題の ER 図".into(),
        (Origin::Ai, _) => format!("AI の図 {time}"),
        (Origin::Import, _) => format!("インポート {time}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn store() -> Store {
        let root = std::env::temp_dir().join(format!("lorelei-docs-{}", uuid::Uuid::new_v4()));
        Store::new(root)
    }

    /// 自動保存の形: 今のファイルの updated_at を base に添える (spec 08 D2)。無い図は空の base
    fn sv(s: &Store, id: &str, source: &str, layout: Layout) -> Result<DocumentSummary, String> {
        let base = s.load(id).map(|d| d.updated_at).unwrap_or_default();
        s.save(id, source.into(), layout, &base)
    }

    // spec 15 D4: 枠 (サブグラフ) は位置に加えて大きさを持つ。フロントから届いた width / height を保存し、読み戻す。
    // 大きさの無い位置は width / height を書かない (今の版のファイルと同じ形)
    #[test]
    fn layout_keeps_frame_sizes_and_omits_them_for_plain_nodes() {
        let s = store();
        let d = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        let layout: Layout = serde_json::from_value(serde_json::json!({
            "O": { "x": 1.0, "y": 2.0, "width": 300.0, "height": 200.0 },
            "A": { "x": 3.0, "y": 4.0 }
        }))
        .unwrap();
        sv(&s, &d.id, "flowchart TD\n    subgraph O[\"o\"]\n        A[A]\n    end\n", layout).unwrap();
        let back = serde_json::to_value(&s.load(&d.id).unwrap().layout).unwrap();
        assert_eq!(
            back,
            serde_json::json!({
                "O": { "x": 1.0, "y": 2.0, "width": 300.0, "height": 200.0 },
                "A": { "x": 3.0, "y": 4.0 }
            })
        );
    }

    // spec 04 D4-2: AI の図がエディタの初期図で潰れた (現況 4)。門が漏れても保存の手前で止める保険
    #[test]
    fn an_ai_or_imported_diagram_is_not_overwritten_by_the_initial_figure() {
        let s = store();
        let flow = "flowchart TD\n    startNode[Start]\n";
        let er = "erDiagram\n  ユーザー {\n    int id PK\n    varchar(255) name UK\n  }";
        let ai = s
            .create(Editor::Flowchart, None, Origin::Ai, Some("flowchart LR\n  受付 --> 完了\n".into()))
            .unwrap();
        let imported = s
            .create(Editor::ErDiagram, None, Origin::Import, Some("erDiagram\n  会員 {\n  }\n".into()))
            .unwrap();

        // 空の source への最初の書き込み (1 件目の形) だけを拒む (spec 08 D1 で絞った)。中身のある source の上書きは、
        // 人が手で初期図と同じ図を作った場合や update_diagram の後の揃え書きで、拒まない
        let err = sv(&s, &ai.id, flow, BTreeMap::new()).unwrap_err();
        assert!(err.starts_with("INITIAL_FIGURE_REJECTED"), "{err}");
        sv(&s, &ai.id, "flowchart TD\n    受付[受付]\n", BTreeMap::new()).unwrap();
        sv(&s, &ai.id, flow, BTreeMap::new()).unwrap();
        assert_eq!(s.load(&ai.id).unwrap().source, flow);
        assert!(sv(&s, &imported.id, er, BTreeMap::new()).is_err());
        assert_eq!(s.load(&imported.id).unwrap().source, "");

        // 新規作成の図は初期図で始まるのが正しい
        let new = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        sv(&s, &new.id, flow, BTreeMap::new()).unwrap();
        // 種類の違う初期図は対象外 (その種類の初期図だけを拒む)
        sv(&s, &ai.id, er, BTreeMap::new()).unwrap();
    }

    // 2026-09-25 実機で観測: ごみ箱へ移した図が「今の図」に残り、その自動保存が「図を読めません」で失敗し続け、
    // 「保存できなければ切り替えない」に掛かって図を移れなくなった。フロントが見分けて捨てられるよう印を付ける
    // spec 08 D1: update_diagram は source / original_source / updated_at / normalize_pending だけを書き換え、他は変えない。書く前に history へ 1 世代
    #[test]
    fn update_replaces_the_content_and_keeps_the_rest_and_history() {
        let s = store();
        let d = s.create(Editor::Flowchart, Some("注文".into()), Origin::New, None).unwrap();
        let mut layout = BTreeMap::new();
        layout.insert("A".to_string(), Pos { x: 1.0, y: 2.0, width: None, height: None });
        sv(&s, &d.id, "flowchart TD\n    A[A]\n", layout.clone()).unwrap();
        s.mark_saved(&d.id).unwrap();
        let before = s.load(&d.id).unwrap();
        assert!(!before.unsaved());

        let after = s
            .update(&d.id, "flowchart LR\n  A --> B\n".into(), Editor::Flowchart, &before.updated_at)
            .unwrap();
        assert_eq!(after.source, "flowchart LR\n  A --> B\n", "届いた Mermaid そのもの");
        assert_eq!(after.original_source.as_deref(), Some("flowchart LR\n  A --> B\n"), "new の図も最後に届けた原文を持つ");
        assert!(after.normalize_pending);
        assert!(after.updated_at > before.updated_at);
        assert!(after.unsaved(), "● が付く");
        assert_eq!(after.layout, layout, "位置は残る");
        assert_eq!((after.title.as_str(), after.editor, after.origin), ("注文", Editor::Flowchart, Origin::New));
        assert_eq!((after.created_at.clone(), after.saved_at.clone()), (before.created_at.clone(), before.saved_at.clone()), "並びは動かない");
        assert_eq!(s.load(&d.id).unwrap(), after);

        // 書き換え前の中身が history/{id}.json に 1 世代 (次の update で上書き)
        let history = s.root.join("history").join(format!("{}.json", d.id));
        let kept: Document = serde_json::from_str(&std::fs::read_to_string(&history).unwrap()).unwrap();
        assert_eq!(kept, before);
        s.update(&d.id, "flowchart TD\n  C\n".into(), Editor::Flowchart, &after.updated_at).unwrap();
        let kept: Document = serde_json::from_str(&std::fs::read_to_string(&history).unwrap()).unwrap();
        assert_eq!(kept, after);
        // ごみ箱へ移しても history は動かさない
        s.trash(&d.id).unwrap();
        assert!(history.exists());
    }

    // spec 08 D1・D2: 種類の不一致 / updated_at の不一致 (時刻として比べる) / 無い id
    #[test]
    fn update_refuses_by_kind_conflict_and_not_found() {
        use lorelei_mcp::{EditorKind, UpdateError};
        let s = store();
        let d = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        sv(&s, &d.id, "flowchart TD\n    A[A]\n", BTreeMap::new()).unwrap();
        let cur = s.load(&d.id).unwrap().updated_at;

        let err = s.update(&d.id, "erDiagram\n  会員 {\n  }\n".into(), Editor::ErDiagram, &cur).unwrap_err();
        assert_eq!(err, UpdateError::KindMismatch { actual: EditorKind::Flowchart });

        // 古い版 → Conflict に今の値。丸めた値も別の瞬間
        let err = s.update(&d.id, "flowchart TD\n  B\n".into(), Editor::Flowchart, "2026-09-25T10:00:00+09:00").unwrap_err();
        assert_eq!(err, UpdateError::Conflict { current_updated_at: cur.clone() });
        let rounded = cur.split('.').next().unwrap().to_string() + "+09:00";
        assert!(matches!(
            s.update(&d.id, "flowchart TD\n  B\n".into(), Editor::Flowchart, &rounded).unwrap_err(),
            UpdateError::Conflict { .. }
        ));
        assert_eq!(s.load(&d.id).unwrap().source, "flowchart TD\n    A[A]\n", "ファイルは変わらない");
        assert!(!s.root.join("history").exists(), "断った時は history も書かない");

        // UTC に書き直した同じ瞬間は通る
        let utc = chrono::DateTime::parse_from_rfc3339(&cur).unwrap().to_utc().to_rfc3339();
        s.update(&d.id, "flowchart TD\n  B\n".into(), Editor::Flowchart, &utc).unwrap();

        // 無い id・ごみ箱・uuid の形でない id
        let cur = s.load(&d.id).unwrap().updated_at;
        assert_eq!(s.update("../state", "flowchart TD\n  B\n".into(), Editor::Flowchart, &cur).unwrap_err(), UpdateError::NotFound);
        s.trash(&d.id).unwrap();
        assert_eq!(s.update(&d.id, "flowchart TD\n  B\n".into(), Editor::Flowchart, &cur).unwrap_err(), UpdateError::NotFound);
    }

    // spec 08 D2: 古い版を添えた自動保存は STALE_BASE で拒み、今の updated_at を載せる
    #[test]
    fn stale_base_is_rejected_with_the_current_updated_at() {
        let s = store();
        let d = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        sv(&s, &d.id, "flowchart TD\n    A[A]\n", BTreeMap::new()).unwrap();
        let cur = s.load(&d.id).unwrap().updated_at;

        let err = s.save(&d.id, "flowchart TD\n    old[old]\n".into(), BTreeMap::new(), "2026-09-25T10:00:00+09:00").unwrap_err();
        assert!(err.starts_with(STALE_BASE), "{err}");
        assert!(err.ends_with(&cur), "今の値を載せる: {err}");
        assert_eq!(s.load(&d.id).unwrap().source, "flowchart TD\n    A[A]\n");
        // 時刻として同じ瞬間なら通る。読めない base は拒む
        let utc = chrono::DateTime::parse_from_rfc3339(&cur).unwrap().to_utc().to_rfc3339();
        s.save(&d.id, "flowchart TD\n    B[B]\n".into(), BTreeMap::new(), &utc).unwrap();
        assert!(s.save(&d.id, "flowchart TD\n    C[C]\n".into(), BTreeMap::new(), "").unwrap_err().starts_with(STALE_BASE));
    }

    // spec 08 D1: update の後の最初の save (揃え書き) は updated_at を進めず印を消す。中身が同じでも印を消すために書く
    #[test]
    fn the_first_save_after_an_update_normalizes_without_bumping() {
        let s = store();
        let d = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        sv(&s, &d.id, "flowchart TD\n    A[A]\n", BTreeMap::new()).unwrap();
        let cur = s.load(&d.id).unwrap().updated_at;
        let updated = s.update(&d.id, "flowchart LR\n  A --> B\n".into(), Editor::Flowchart, &cur).unwrap();

        // 揃え書き (生成器の出力) は進めない
        let mut layout = BTreeMap::new();
        layout.insert("A".to_string(), Pos { x: 3.0, y: 4.0, width: None, height: None });
        let saved = sv(&s, &d.id, "flowchart LR\n    A[A]\n    B[B]\n    A --> B\n", layout).unwrap();
        assert_eq!(saved.updated_at, updated.updated_at);
        assert!(!s.load(&d.id).unwrap().normalize_pending, "印は消える");
        // 次の保存は人の変更として進む
        let saved = sv(&s, &d.id, "flowchart LR\n    A[A]\n", BTreeMap::new()).unwrap();
        assert!(saved.updated_at > updated.updated_at);

        // AI が生成器の書き方で送ると揃え書きは中身が同じ。それでも印は消える (ファイルに書く)
        let cur = saved.updated_at;
        let updated = s.update(&d.id, "flowchart LR\n    A[A]\n".into(), Editor::Flowchart, &cur).unwrap();
        assert!(updated.normalize_pending);
        let saved = sv(&s, &d.id, "flowchart LR\n    A[A]\n", BTreeMap::new()).unwrap();
        assert_eq!(saved.updated_at, updated.updated_at);
        assert!(!s.load(&d.id).unwrap().normalize_pending);
        let saved = sv(&s, &d.id, "flowchart LR\n    A[A]\n    C[C]\n", BTreeMap::new()).unwrap();
        assert!(saved.updated_at > updated.updated_at, "人の最初の編集が飲み込まれない");

        // update で初期図と同じ図を送っても、揃え書きは拒まれない (保険は first_fill だけ)
        let ai = s.create(Editor::Flowchart, None, Origin::Ai, Some("flowchart LR\n  A --> B\n".into())).unwrap();
        sv(&s, &ai.id, "flowchart LR\n    A[A]\n", BTreeMap::new()).unwrap();
        let cur = s.load(&ai.id).unwrap().updated_at;
        s.update(&ai.id, "flowchart TD\n  startNode[Start]\n".into(), Editor::Flowchart, &cur).unwrap();
        sv(&s, &ai.id, initial_source(Editor::Flowchart), BTreeMap::new()).unwrap();
    }

    #[test]
    fn saving_a_trashed_diagram_says_it_is_gone() {
        let s = store();
        let d = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        s.trash(&d.id).unwrap();
        let err = sv(&s, &d.id, "flowchart TD\n    a[a]\n", BTreeMap::new()).unwrap_err();
        assert!(err.starts_with("DOCUMENT_GONE"), "{err}");
        assert!(!err.contains(&*s.root.to_string_lossy()), "パスを載せない: {err}");
    }

    #[test]
    fn create_then_list_and_load() {
        let s = store();
        let a = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        let b = s
            .create(Editor::ErDiagram, Some("会員".into()), Origin::Import, Some("erDiagram\n".into()))
            .unwrap();
        assert_eq!(a.title, "無題のフローチャート");
        assert_eq!(a.source, "");
        assert!(a.original_source.is_none());
        assert_eq!(b.title, "会員");
        assert_eq!(b.original_source.as_deref(), Some("erDiagram\n"));

        let list = s.list().unwrap();
        assert_eq!(list.len(), 2);
        // updated_at の新しい順
        assert_eq!(list[0].id, b.id);
        assert_eq!(s.load(&a.id).unwrap(), a);
    }

    // 利用者 FB (2026-09-24): 見るたびに並びが変わると、どれを見たか分からなくなる。
    // 並びは「保存」を押した時刻 (未保存は作った時刻) で決め、自動保存では動かさない (spec 02 D12)
    #[test]
    fn order_follows_explicit_save_not_autosave() {
        let s = store();
        let a = s.create(Editor::Flowchart, Some("A".into()), Origin::New, None).unwrap();
        let b = s.create(Editor::Flowchart, Some("B".into()), Origin::New, None).unwrap();
        let ids = |s: &Store| s.list().unwrap().into_iter().map(|d| d.id).collect::<Vec<_>>();
        assert_eq!(ids(&s), vec![b.id.clone(), a.id.clone()]);

        // 自動保存 (編集) では動かない
        sv(&s, &a.id, "flowchart TD\n    x[x]\n", BTreeMap::new()).unwrap();
        assert_eq!(ids(&s), vec![b.id.clone(), a.id.clone()]);

        // 「保存」を押すと先頭へ
        s.mark_saved(&a.id).unwrap();
        assert_eq!(ids(&s), vec![a.id.clone(), b.id.clone()]);

        // 名前を変えても動かない
        s.rename(&b.id, "B2".into()).unwrap();
        assert_eq!(ids(&s), vec![a.id.clone(), b.id.clone()]);
    }

    #[test]
    fn unsaved_mark_tracks_changes_after_explicit_save() {
        let s = store();
        let d = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        let unsaved = |s: &Store| s.list().unwrap()[0].unsaved;
        assert!(!unsaved(&s));

        // 新規作成の最初の書き込みはエディタの初期図 (利用者の変更ではない)
        sv(&s, &d.id, "flowchart TD\n    startNode[Start]\n", BTreeMap::new()).unwrap();
        assert!(!unsaved(&s));
        sv(&s, &d.id, "flowchart TD\n    a[a]\n", BTreeMap::new()).unwrap();
        assert!(unsaved(&s), "作った後に編集した");
        s.mark_saved(&d.id).unwrap();
        assert!(!unsaved(&s));

        // 中身が同じ保存 (図を開いただけ) では変更にならない
        sv(&s, &d.id, "flowchart TD\n    a[a]\n", BTreeMap::new()).unwrap();
        assert!(!unsaved(&s), "開いただけで印が付いた");

        sv(&s, &d.id, "flowchart TD\n    b[b]\n", BTreeMap::new()).unwrap();
        assert!(unsaved(&s));
    }

    #[test]
    fn first_fill_of_an_incoming_document_is_not_a_change() {
        // AI / インポートで届いた図は source が空で作られ、エディタに載った時の最初の保存で埋まる。それは利用者の変更ではない
        let s = store();
        let d = s
            .create(Editor::Flowchart, None, Origin::Ai, Some("flowchart LR\n  A-->B\n".into()))
            .unwrap();
        sv(&s, &d.id, "flowchart TD\n    A[A]\n", BTreeMap::new()).unwrap();
        assert!(!s.list().unwrap()[0].unsaved);
    }

    #[test]
    fn save_changes_only_source_and_layout() {
        let s = store();
        let d = s
            .create(Editor::Flowchart, None, Origin::Ai, Some("flowchart LR\n  A-->B\n".into()))
            .unwrap();
        let mut layout = BTreeMap::new();
        layout.insert("A".to_string(), Pos { x: 1.5, y: 2.0, width: None, height: None });
        let updated = sv(&s, &d.id, "flowchart TD\n    A[A]\n", layout.clone()).unwrap();
        let got = s.load(&d.id).unwrap();
        assert_eq!(got.source, "flowchart TD\n    A[A]\n");
        assert_eq!(got.layout, layout);
        assert_eq!(got.updated_at, updated.updated_at);
        // 届いた原文と来歴は書き換わらない
        assert_eq!(got.original_source, d.original_source);
        assert_eq!(got.origin, Origin::Ai);
        assert_eq!(got.title, d.title);
        assert_eq!(got.created_at, d.created_at);
    }

    #[test]
    fn rename_and_trash() {
        let s = store();
        let d = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        s.rename(&d.id, "注文フロー".into()).unwrap();
        assert_eq!(s.load(&d.id).unwrap().title, "注文フロー");

        s.trash(&d.id).unwrap();
        assert!(s.list().unwrap().is_empty());
        assert!(s.load(&d.id).is_err());
        // 物理削除ではなく trash/ へ移すだけ
        assert!(s.root.join("trash").join(format!("{}.json", d.id)).exists());
    }

    #[test]
    fn list_reads_only_json_directly_under_documents() {
        let s = store();
        let d = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        let docs = s.root.join("documents");
        std::fs::write(docs.join("note.txt"), "x").unwrap();
        std::fs::create_dir_all(docs.join("sub")).unwrap();
        std::fs::write(docs.join("sub").join(format!("{}.json", uuid::Uuid::new_v4())), "{}").unwrap();
        // 壊れた json は一覧から外す (一覧ごと失敗させない)
        std::fs::write(docs.join(format!("{}.json", uuid::Uuid::new_v4())), "{broken").unwrap();
        let list = s.list().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, d.id);
    }

    #[test]
    fn rejects_ids_that_are_not_uuids() {
        let s = store();
        for bad in ["../state", "..\\x", "a/b", "", "not-a-uuid"] {
            assert!(s.load(bad).is_err(), "{bad}");
            assert!(sv(&s, bad, "", BTreeMap::new()).is_err(), "{bad}");
            assert!(s.trash(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn save_leaves_no_temp_files() {
        let s = store();
        let d = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        sv(&s, &d.id, "flowchart TD\n", BTreeMap::new()).unwrap();
        let names: Vec<_> = std::fs::read_dir(s.root.join("documents"))
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        assert_eq!(names, vec![format!("{}.json", d.id)]);
    }

    #[test]
    fn last_opened_round_trip() {
        let s = store();
        assert_eq!(s.last_opened(), None);
        let d = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        s.set_last_opened(&d.id).unwrap();
        assert_eq!(s.last_opened().as_deref(), Some(d.id.as_str()));
        assert!(s.set_last_opened("../x").is_err());
    }

    #[test]
    fn serializes_with_contract_names() {
        let s = store();
        let d = s.create(Editor::ErDiagram, None, Origin::Import, Some("erDiagram\n".into())).unwrap();
        let v = serde_json::to_value(&d).unwrap();
        assert_eq!(v["editor"], "erDiagram");
        assert_eq!(v["origin"], "import");
        assert_eq!(v["originalSource"], "erDiagram\n");
        assert!(v["createdAt"].as_str().unwrap().contains('T'));
        let summary = serde_json::to_value(s.list().unwrap()[0].clone()).unwrap();
        assert!(summary.get("source").is_none());
        assert_eq!(summary["updatedAt"], v["updatedAt"]);
    }
}
