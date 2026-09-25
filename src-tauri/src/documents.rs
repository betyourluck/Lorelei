//! 図の一覧 (spec 02 D6、data_contract `Document` / `DocumentSummary` / `DocumentState`)。
//!
//! 置き場は `{app_data_dir}/documents/{id}.json`。JS からは読み書きさせない (plugin-fs を入れない)。
//! パスを受け取らず id だけを受け取り、その id は uuid の形に限る — フロントから任意のファイルに触れる口にしない。

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use chrono::{Local, SecondsFormat};
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

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Pos {
    pub x: f64,
    pub y: f64,
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
        };
        self.write(&doc)?;
        Ok(doc)
    }

    pub fn load(&self, id: &str) -> Result<Document, String> {
        read_doc(&self.doc_path(id)?)
    }

    /// 自動保存。書き換えるのは source と layout だけ。title / editor / origin / original_source は触らない。
    /// 中身が同じなら書かない (図を開いただけで「変更あり」にしない)。source が空だった図の最初の書き込み
    /// (新規作成の初期図・AI / インポートで届いた図がエディタに載った時) は利用者の変更ではないので updated_at を進めない
    pub fn save(&self, id: &str, source: String, layout: Layout) -> Result<DocumentSummary, String> {
        let mut doc = self.load(id)?;
        // 保険 (spec 04 D4-2): AI / インポートの図を、エディタの初期図で潰さない。止めるのは門の漏れの 1 つの形
        // (空への最初の書き込み) だけで、初期図の上で編集された形は止まらない — そちらはフロントの門が受け持つ
        if doc.origin != Origin::New && source == initial_source(doc.editor) {
            return Err(format!(
                "{INITIAL_FIGURE_REJECTED}: AI やインポートで届いた図を、エディタの初期図で上書きしかけたので止めました"
            ));
        }
        if doc.source == source && doc.layout == layout {
            return Ok((&doc).into());
        }
        let first_fill = doc.source.is_empty();
        doc.source = source;
        doc.layout = layout;
        if !first_fill {
            doc.updated_at = now();
        }
        self.write(&doc)?;
        Ok((&doc).into())
    }

    /// 利用者が「保存」を押した (D12)。一覧の先頭へ動き、● が消える
    pub fn mark_saved(&self, id: &str) -> Result<DocumentSummary, String> {
        let mut doc = self.load(id)?;
        doc.saved_at = Some(now());
        self.write(&doc)?;
        Ok((&doc).into())
    }

    /// 名前を変える。並びも ● も動かさない
    pub fn rename(&self, id: &str, title: String) -> Result<(), String> {
        let mut doc = self.load(id)?;
        doc.title = title;
        self.write(&doc)
    }

    /// 物理削除しない。documents/ の外 (trash/) へ移すので一覧に出なくなる
    pub fn trash(&self, id: &str) -> Result<(), String> {
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

        // 空の source への最初の書き込み (1 件目の形) も、中身のある source の上書きも拒む
        let err = s.save(&ai.id, flow.into(), BTreeMap::new()).unwrap_err();
        assert!(err.starts_with("INITIAL_FIGURE_REJECTED"), "{err}");
        s.save(&ai.id, "flowchart TD\n    受付[受付]\n".into(), BTreeMap::new()).unwrap();
        assert!(s.save(&ai.id, flow.into(), BTreeMap::new()).is_err());
        assert_eq!(s.load(&ai.id).unwrap().source, "flowchart TD\n    受付[受付]\n");
        assert!(s.save(&imported.id, er.into(), BTreeMap::new()).is_err());
        assert_eq!(s.load(&imported.id).unwrap().source, "");

        // 新規作成の図は初期図で始まるのが正しい
        let new = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        s.save(&new.id, flow.into(), BTreeMap::new()).unwrap();
        // 種類の違う初期図は対象外 (その種類の初期図だけを拒む)
        s.save(&ai.id, er.into(), BTreeMap::new()).unwrap();
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
        s.save(&a.id, "flowchart TD\n    x[x]\n".into(), BTreeMap::new()).unwrap();
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
        s.save(&d.id, "flowchart TD\n    startNode[Start]\n".into(), BTreeMap::new()).unwrap();
        assert!(!unsaved(&s));
        s.save(&d.id, "flowchart TD\n    a[a]\n".into(), BTreeMap::new()).unwrap();
        assert!(unsaved(&s), "作った後に編集した");
        s.mark_saved(&d.id).unwrap();
        assert!(!unsaved(&s));

        // 中身が同じ保存 (図を開いただけ) では変更にならない
        s.save(&d.id, "flowchart TD\n    a[a]\n".into(), BTreeMap::new()).unwrap();
        assert!(!unsaved(&s), "開いただけで印が付いた");

        s.save(&d.id, "flowchart TD\n    b[b]\n".into(), BTreeMap::new()).unwrap();
        assert!(unsaved(&s));
    }

    #[test]
    fn first_fill_of_an_incoming_document_is_not_a_change() {
        // AI / インポートで届いた図は source が空で作られ、エディタに載った時の最初の保存で埋まる。それは利用者の変更ではない
        let s = store();
        let d = s
            .create(Editor::Flowchart, None, Origin::Ai, Some("flowchart LR\n  A-->B\n".into()))
            .unwrap();
        s.save(&d.id, "flowchart TD\n    A[A]\n".into(), BTreeMap::new()).unwrap();
        assert!(!s.list().unwrap()[0].unsaved);
    }

    #[test]
    fn save_changes_only_source_and_layout() {
        let s = store();
        let d = s
            .create(Editor::Flowchart, None, Origin::Ai, Some("flowchart LR\n  A-->B\n".into()))
            .unwrap();
        let mut layout = BTreeMap::new();
        layout.insert("A".to_string(), Pos { x: 1.5, y: 2.0 });
        let updated = s.save(&d.id, "flowchart TD\n    A[A]\n".into(), layout.clone()).unwrap();
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
            assert!(s.save(bad, String::new(), BTreeMap::new()).is_err(), "{bad}");
            assert!(s.trash(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn save_leaves_no_temp_files() {
        let s = store();
        let d = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        s.save(&d.id, "flowchart TD\n".into(), BTreeMap::new()).unwrap();
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
