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

use crate::error::{self, DesktopError};

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
    /// 最後に「確定」した時の中身 (spec 32 D1)。「確定へ戻す」で戻す先、● の比べる先。古いファイルに無ければ None
    /// (読む時に移行する: read_doc)。MCP の読み戻しには出さない
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirmed: Option<Confirmed>,
}

/// 確定した時の中身 (spec 32 D1)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Confirmed {
    pub source: String,
    #[serde(default)]
    pub layout: Layout,
}

/// 位置が同じと見てよい (spec 32 D2)。キーの集合が同じで、各値の差が 1e-6 以下。
/// フロントの位置の往復 (絶対 → 相対 → 絶対) は浮動小数点で一致しないことがある
fn layout_close(a: &Layout, b: &Layout) -> bool {
    let near = |p: f64, q: f64| (p - q).abs() <= 1e-6;
    let near_opt = |p: Option<f64>, q: Option<f64>| match (p, q) {
        (Some(p), Some(q)) => near(p, q),
        (None, None) => true,
        _ => false,
    };
    a.len() == b.len()
        && a.iter().all(|(k, p)| {
            b.get(k).is_some_and(|q| {
                near(p.x, q.x) && near(p.y, q.y) && near_opt(p.width, q.width) && near_opt(p.height, q.height)
            })
        })
}

impl Document {
    /// 一覧の並びの鍵。見たり自動保存したりしても動かない
    fn order_key(&self) -> &str {
        self.saved_at.as_deref().unwrap_or(&self.created_at)
    }

    /// ● (spec 32 D2)。確定した中身があれば、今の中身がそれと違う (source は完全一致、位置は layout_close)。
    /// 無ければ今までどおり、最後の「確定」(無ければ作った時) より後に中身が変わった
    fn unsaved(&self) -> bool {
        match &self.confirmed {
            Some(c) => !(c.source == self.source && layout_close(&c.layout, &self.layout)),
            None => self.updated_at.as_str() > self.order_key(),
        }
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
    /// 最後の「確定」と中身が違う (一覧とタイトルの ●。spec 32 D2)
    pub unsaved: bool,
    /// 確定した中身がある (「確定へ戻す」を出せる。spec 32 D3)
    pub has_confirmed: bool,
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
            has_confirmed: d.confirmed.is_some(),
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

    fn doc_path(&self, id: &str) -> Result<PathBuf, DesktopError> {
        check_id(id)?;
        Ok(self.documents().join(format!("{id}.json")))
    }

    /// documents/ 直下の *.json だけを読む。壊れたファイルは飛ばす (一覧ごと失敗させない)
    pub fn list(&self) -> Result<Vec<DocumentSummary>, DesktopError> {
        let entries = match std::fs::read_dir(self.documents()) {
            Ok(e) => e,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(DesktopError::new(error::DOC_LIST_FAILED, format!("図の一覧を読めません: {e}")).detail(&e)),
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
    ) -> Result<Document, DesktopError> {
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
            confirmed: None,
        };
        self.write(&doc)?;
        Ok(doc)
    }

    /// その id の図が一覧 (documents/) にある。uuid の形でない id・ごみ箱の図は false
    pub fn contains(&self, id: &str) -> bool {
        self.doc_path(id).is_ok_and(|p| p.is_file())
    }

    pub fn load(&self, id: &str) -> Result<Document, DesktopError> {
        read_doc(&self.doc_path(id)?)
    }

    /// 自動保存。書き換えるのは source と layout だけ。title / editor / origin / original_source は触らない (update だけが触る)。
    /// 中身が同じなら書かない (図を開いただけで「変更あり」にしない)。ただし normalize_pending を消す時は書く。
    /// updated_at を進めない書き込みは 2 つ — source が空だった図の最初の書き込み (first_fill: 新規作成の初期図・
    /// AI / インポートで届いた図がエディタに載った時) と、update の後の最初の書き込み (揃え書き。印が立っている) — で、
    /// どちらか 1 回だけ (update は source を非空にするので重ならない)。
    /// base_updated_at はフロントが読んだ版 (spec 08 D2)。ファイルが進んでいれば STALE_BASE で拒む。
    /// normalize はフロントが「図の準備ができてから最初の保存 (揃え書き)」に付ける印 (spec 33)。印の無い保存は人の編集なので、
    /// normalize_pending が立っていても揃え書きにせず、中身が違えば updated_at を進めて印を消す
    /// (揃え書きとして通すと AI の古い expected_updated_at が通り、人の編集が知らされずに上書きされる)
    pub fn save(
        &self,
        id: &str,
        source: String,
        layout: Layout,
        base_updated_at: &str,
        normalize: bool,
    ) -> Result<DocumentSummary, DesktopError> {
        let _lock = lock();
        let doc = self.save_unlocked(id, source, layout, base_updated_at, normalize)?;
        Ok((&doc).into())
    }

    /// 利用者の「確定」(spec 02 D12、spec 32 D1)。今の中身を自動保存と同じ規則で書き (印の無い保存 = 人の操作)、
    /// 同じ鍵の中で saved_at と confirmed を書く。一覧の先頭へ動き、● が消える。
    /// STALE_BASE・INITIAL_FIGURE_REJECTED・DOCUMENT_GONE は save と同じく拒み、何も書かない。空の中身は確定しない
    pub fn confirm(&self, id: &str, source: String, layout: Layout, base_updated_at: &str) -> Result<DocumentSummary, DesktopError> {
        let _lock = lock();
        if source.trim().is_empty() {
            return Err(DesktopError::new(error::NOTHING_TO_CONFIRM, "確定する中身がありません"));
        }
        let mut doc = self.save_unlocked(id, source, layout, base_updated_at, false)?;
        doc.saved_at = Some(now());
        doc.confirmed = Some(Confirmed { source: doc.source.clone(), layout: doc.layout.clone() });
        self.write(&doc)?;
        Ok((&doc).into())
    }

    /// save の本体 (鍵は呼び手が持つ)。書いた (または同じだった) Document を返す
    fn save_unlocked(
        &self,
        id: &str,
        source: String,
        layout: Layout,
        base_updated_at: &str,
        normalize: bool,
    ) -> Result<Document, DesktopError> {
        // ごみ箱へ移した・消えた図への書き込みは、書き直しても通らない。フロントが見分けて捨てる印を付ける
        if !self.contains(id) {
            return Err(DesktopError::new(
                error::DOCUMENT_GONE,
                format!("{}: 図が一覧にありません（ごみ箱へ移したか、消えました）", error::DOCUMENT_GONE),
            ));
        }
        let mut doc = self.load(id)?;
        // 古い版を添えた書き込み (走り出した古い保存・別の図を開く途中に来た update の後の保存) は届かせない。今の値を載せる
        if !same_instant(base_updated_at, &doc.updated_at) {
            return Err(DesktopError::new(error::STALE_BASE, format!("{}: {}", error::STALE_BASE, doc.updated_at))
                .param("currentUpdatedAt", doc.updated_at.clone()));
        }
        let first_fill = doc.source.is_empty();
        // 保険 (spec 04 D4-2、spec 08 D1 で first_fill の時だけに絞った): AI / インポートの図を、空への最初の書き込みで
        // エディタの初期図で潰さない (現況 4 の 1 件目の形)。中身のある図の上書きは保険の外 (門が受け持つ)
        if first_fill && doc.origin != Origin::New && source == initial_source(doc.editor) {
            return Err(DesktopError::new(
                error::INITIAL_FIGURE_REJECTED,
                format!(
                    "{}: AI やインポートで届いた図を、エディタの初期図で上書きしかけたので止めました",
                    error::INITIAL_FIGURE_REJECTED
                ),
            ));
        }
        let pending = doc.normalize_pending;
        let unchanged = doc.source == source && doc.layout == layout;
        if unchanged && !pending {
            return Ok(doc);
        }
        doc.source = source;
        doc.layout = layout;
        // 印は どの保存でも消す。進めないのは、揃え書き (印付き)・中身が同じ・最初の書き込みの時だけ
        doc.normalize_pending = false;
        if !(pending && normalize) && !unchanged && !first_fill {
            doc.updated_at = now();
        }
        self.write(&doc)?;
        Ok(doc)
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
        let mut doc = self.load(id).map_err(|e| UpdateError::Other(e.to_string()))?;
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
        self.write(&doc).map_err(|e| UpdateError::Other(e.to_string()))?;
        Ok(doc)
    }

    /// 名前を変える。並びも ● も動かさない
    pub fn rename(&self, id: &str, title: String) -> Result<(), DesktopError> {
        let _lock = lock();
        let mut doc = self.load(id)?;
        doc.title = title;
        self.write(&doc)
    }

    /// 物理削除しない。documents/ の外 (trash/) へ移すので一覧に出なくなる。history/ は動かさない
    pub fn trash(&self, id: &str) -> Result<(), DesktopError> {
        let _lock = lock();
        let from = self.doc_path(id)?;
        let dir = self.root.join("trash");
        std::fs::create_dir_all(&dir)
            .map_err(|e| DesktopError::new(error::TRASH_FAILED, format!("ごみ箱を作れません: {e}")).detail(&e))?;
        std::fs::rename(&from, dir.join(format!("{id}.json")))
            .map_err(|e| DesktopError::new(error::TRASH_FAILED, format!("ごみ箱へ移せません: {e}")).detail(&e))
    }

    pub fn last_opened(&self) -> Option<String> {
        let text = std::fs::read_to_string(self.root.join("state.json")).ok()?;
        let state: DocumentState = serde_json::from_str(&text).ok()?;
        state.last_opened.filter(|id| check_id(id).is_ok())
    }

    pub fn set_last_opened(&self, id: &str) -> Result<(), DesktopError> {
        check_id(id)?;
        let state = DocumentState {
            last_opened: Some(id.to_string()),
        };
        let json = serde_json::to_vec_pretty(&state).map_err(|e| DesktopError::from(e.to_string()))?;
        write_atomic(&self.root.join("state.json"), &json)
    }

    fn write(&self, doc: &Document) -> Result<(), DesktopError> {
        let json = serde_json::to_vec_pretty(doc).map_err(|e| DesktopError::from(e.to_string()))?;
        write_atomic(&self.doc_path(&doc.id)?, &json)
    }
}

fn check_id(id: &str) -> Result<(), DesktopError> {
    uuid::Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| DesktopError::new(error::INVALID_ID, format!("図の id が不正です: {id:?}")).param("id", id))
}

fn read_doc(path: &Path) -> Result<Document, DesktopError> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| DesktopError::new(error::DOC_READ_FAILED, format!("図を読めません: {e}")).detail(&e))?;
    let mut doc: Document = serde_json::from_str(&text)
        .map_err(|e| DesktopError::new(error::DOC_CORRUPT, format!("図のファイルが壊れています: {e}")).detail(&e))?;
    migrate_confirmed(&mut doc);
    Ok(doc)
}

/// この版より前に確定した図の移行 (spec 32 D1)。確定の後に中身が変わっていなければ (updated_at ≤ saved_at)、
/// 今の中身が確定した中身そのもの。読む時に埋める (次の書き込みでファイルに残る)
fn migrate_confirmed(doc: &mut Document) {
    if doc.confirmed.is_some() || doc.source.is_empty() {
        return;
    }
    if let Some(saved) = &doc.saved_at {
        if doc.updated_at.as_str() <= saved.as_str() {
            doc.confirmed = Some(Confirmed { source: doc.source.clone(), layout: doc.layout.clone() });
        }
    }
}

/// 同じフォルダの一時ファイルへ書いてから rename する (途中で切れた壊れファイルを残さない。OutputPathPolicy と同じ)
pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), DesktopError> {
    let dir = path
        .parent()
        .ok_or_else(|| DesktopError::new(error::DOC_WRITE_FAILED, "保存先のフォルダがありません"))?;
    std::fs::create_dir_all(dir)
        .map_err(|e| DesktopError::new(error::DOC_WRITE_FAILED, format!("フォルダを作れません: {e}")).detail(&e))?;
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("doc");
    let tmp = dir.join(format!(".{name}.tmp.{}", uuid::Uuid::new_v4()));
    std::fs::write(&tmp, bytes)
        .map_err(|e| DesktopError::new(error::DOC_WRITE_FAILED, format!("保存できません: {e}")).detail(&e))?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        DesktopError::new(error::DOC_WRITE_FAILED, format!("保存できません: {e}")).detail(&e)
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
    use crate::error::{DOCUMENT_GONE, INITIAL_FIGURE_REJECTED, STALE_BASE};
    use std::collections::BTreeMap;

    fn store() -> Store {
        let root = std::env::temp_dir().join(format!("lorelei-docs-{}", uuid::Uuid::new_v4()));
        Store::new(root)
    }

    /// 自動保存の形: 今のファイルの updated_at を base に添える (spec 08 D2)。無い図は空の base。
    /// 揃え書きの印を付ける (フロントの「準備ができてから最初の保存」と同じ。印の無い保存は spec 33 のテストで見る)
    fn sv(s: &Store, id: &str, source: &str, layout: Layout) -> Result<DocumentSummary, DesktopError> {
        let base = s.load(id).map(|d| d.updated_at).unwrap_or_default();
        s.save(id, source.into(), layout, &base, true)
    }

    /// 「確定」の形: 今のファイルの中身と版で確定する (spec 32 D1)
    fn cf(s: &Store, id: &str) -> DocumentSummary {
        let d = s.load(id).unwrap();
        s.confirm(id, d.source, d.layout, &d.updated_at).unwrap()
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
        assert!(err.code == "INITIAL_FIGURE_REJECTED", "{err}");
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
        cf(&s, &d.id);
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

        let err = s.save(&d.id, "flowchart TD\n    old[old]\n".into(), BTreeMap::new(), "2026-09-25T10:00:00+09:00", true).unwrap_err();
        assert!(err.code == STALE_BASE, "{err}");
        assert!(err.to_string().ends_with(&cur), "今の値を載せる (MCP・ログの文): {err}");
        // 画面へは params で (spec 34 D3)
        assert_eq!(err.params.as_ref().and_then(|p| p.get("currentUpdatedAt")), Some(&serde_json::json!(cur)));
        assert_eq!(s.load(&d.id).unwrap().source, "flowchart TD\n    A[A]\n");
        // 時刻として同じ瞬間なら通る。読めない base は拒む
        let utc = chrono::DateTime::parse_from_rfc3339(&cur).unwrap().to_utc().to_rfc3339();
        s.save(&d.id, "flowchart TD\n    B[B]\n".into(), BTreeMap::new(), &utc, true).unwrap();
        assert!(s.save(&d.id, "flowchart TD\n    C[C]\n".into(), BTreeMap::new(), "", true).unwrap_err().code == STALE_BASE);
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

    // spec 33: 印の無い保存 (人の編集) は、update の後の印 (normalize_pending) が立っていても揃え書きにしない。
    // 揃え書きとして updated_at を進めずに書くと、AI の古い expected_updated_at が通り、人の編集が知らされずに上書きされる
    #[test]
    fn an_unmarked_save_after_update_is_a_human_edit() {
        let s = store();
        let d = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        sv(&s, &d.id, "flowchart TD\n    A[A]\n", BTreeMap::new()).unwrap();
        let cur = s.load(&d.id).unwrap().updated_at;
        let updated = s.update(&d.id, "flowchart LR\n  A --> B\n".into(), Editor::Flowchart, &cur).unwrap();

        // 中身の違う印の無い保存は進め、印を消す
        let edit = "flowchart LR\n    A[A]\n    B[B]\n    C[C]\n";
        let saved = s.save(&d.id, edit.into(), BTreeMap::new(), &updated.updated_at, false).unwrap();
        assert!(saved.updated_at > updated.updated_at, "人の編集は AI の版に数えない");
        assert!(!s.load(&d.id).unwrap().normalize_pending);
        // AI が古い版のまま書き換えようとすると断られる
        assert!(matches!(
            s.update(&d.id, "flowchart LR\n  X\n".into(), Editor::Flowchart, &updated.updated_at),
            Err(UpdateError::Conflict { .. })
        ));

        // 印の無い保存でも、中身がファイルと同じなら進めず、印だけ消す (開いただけで「変更あり」にしない)
        let cur = saved.updated_at;
        let updated = s.update(&d.id, "flowchart LR\n    A[A]\n".into(), Editor::Flowchart, &cur).unwrap();
        let same = "flowchart LR\n    A[A]\n";
        let saved = s.save(&d.id, same.into(), BTreeMap::new(), &updated.updated_at, false).unwrap();
        assert_eq!(saved.updated_at, updated.updated_at);
        assert!(!s.load(&d.id).unwrap().normalize_pending);
    }

    #[test]
    fn saving_a_trashed_diagram_says_it_is_gone() {
        let s = store();
        let d = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        s.trash(&d.id).unwrap();
        let err = sv(&s, &d.id, "flowchart TD\n    a[a]\n", BTreeMap::new()).unwrap_err();
        assert!(err.code == "DOCUMENT_GONE", "{err}");
        assert!(!err.to_string().contains(&*s.root.to_string_lossy()), "パスを載せない: {err}");
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
        cf(&s, &a.id);
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
        cf(&s, &d.id);
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

    // spec 32 D1・D2: 確定は中身を残し、● は確定した中身との違い。戻せば ● が消える。位置は浮動小数点のずれを許す
    #[test]
    fn confirm_keeps_the_content_and_unsaved_compares_with_it() {
        let s = store();
        let d = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        let mut layout = BTreeMap::new();
        layout.insert("A".to_string(), Pos { x: 453.18, y: 2.0, width: None, height: None });
        sv(&s, &d.id, "flowchart TD\n    A[A]\n", layout.clone()).unwrap();
        let summary = cf(&s, &d.id);
        assert!(!summary.unsaved);
        assert!(summary.has_confirmed);
        let doc = s.load(&d.id).unwrap();
        assert_eq!(doc.confirmed.as_ref().unwrap().source, "flowchart TD\n    A[A]\n");
        assert_eq!(doc.confirmed.as_ref().unwrap().layout, layout);

        let edit = |s: &Store, src: &str, l: Layout| {
            let base = s.load(&d.id).unwrap().updated_at;
            s.save(&d.id, src.into(), l, &base, false).unwrap()
        };
        assert!(edit(&s, "flowchart TD\n    A[A]\n    B[B]\n", layout.clone()).unsaved);
        // 確定と同じ中身へ戻すと ● が消える (時刻は進んでいても)。位置は往復のずれ (1e-13) を許す
        let mut back = layout.clone();
        back.get_mut("A").unwrap().x = 453.18000000000006;
        assert!(!edit(&s, "flowchart TD\n    A[A]\n", back).unsaved);
        // 位置だけの変更も ●
        let mut moved = layout.clone();
        moved.get_mut("A").unwrap().x = 460.0;
        assert!(edit(&s, "flowchart TD\n    A[A]\n", moved).unsaved);
    }

    // spec 32 D1: 確定は自動保存と同じ規則で拒む (古い版・初期図の保険・ごみ箱)。拒んだら何も書かない。空の中身は確定しない。
    // update の印が立っていても、確定は人の操作なので揃え書きにしない
    #[test]
    fn confirm_refuses_like_save_and_writes_nothing() {
        let s = store();
        let d = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        sv(&s, &d.id, "flowchart TD\n    A[A]\n", BTreeMap::new()).unwrap();
        let err = s.confirm(&d.id, "flowchart TD\n    B[B]\n".into(), BTreeMap::new(), "2026-01-01T00:00:00+09:00").unwrap_err();
        assert!(err.code == STALE_BASE, "{err}");
        let doc = s.load(&d.id).unwrap();
        assert!(doc.confirmed.is_none() && doc.saved_at.is_none());
        assert_eq!(doc.source, "flowchart TD\n    A[A]\n");

        assert!(s.confirm(&d.id, "  \n".into(), BTreeMap::new(), &doc.updated_at).is_err());
        assert!(s.load(&d.id).unwrap().confirmed.is_none());

        let ai = s.create(Editor::Flowchart, None, Origin::Ai, Some("flowchart LR\n  A --> B\n".into())).unwrap();
        let err = s.confirm(&ai.id, initial_source(Editor::Flowchart).into(), BTreeMap::new(), &ai.updated_at).unwrap_err();
        assert!(err.code == INITIAL_FIGURE_REJECTED, "{err}");

        let cur = s.load(&d.id).unwrap().updated_at;
        let updated = s.update(&d.id, "flowchart LR\n  A --> B\n".into(), Editor::Flowchart, &cur).unwrap();
        let confirmed = s
            .confirm(&d.id, "flowchart LR\n    A[A]\n    B[B]\n    C[C]\n".into(), BTreeMap::new(), &updated.updated_at)
            .unwrap();
        assert!(confirmed.updated_at > updated.updated_at, "確定は揃え書きにしない");
        assert!(!s.load(&d.id).unwrap().normalize_pending);

        s.trash(&d.id).unwrap();
        let err = s.confirm(&d.id, "flowchart TD\n    x[x]\n".into(), BTreeMap::new(), &confirmed.updated_at).unwrap_err();
        assert!(err.code == DOCUMENT_GONE, "{err}");
    }

    // spec 32 D1: この版より前に確定した図。確定の後に中身が変わっていなければ今の中身を確定した中身として埋める
    #[test]
    fn old_confirmed_diagrams_are_migrated_on_read() {
        let s = store();
        let d = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        sv(&s, &d.id, "flowchart TD\n    A[A]\n", BTreeMap::new()).unwrap();
        // 前の版の確定 (saved_at だけを書いた) を写す
        let mut doc = s.load(&d.id).unwrap();
        doc.saved_at = Some(now());
        doc.confirmed = None;
        let path = s.doc_path(&d.id).unwrap();
        std::fs::write(&path, serde_json::to_vec(&doc).unwrap()).unwrap();
        assert!(!std::fs::read_to_string(&path).unwrap().contains("confirmed"), "古いファイルの形");
        let read = s.load(&d.id).unwrap();
        assert_eq!(read.confirmed.as_ref().unwrap().source, "flowchart TD\n    A[A]\n");
        assert!(s.list().unwrap()[0].has_confirmed);

        // 確定の後に変わっていた図は埋めない (今の中身は確定した中身ではない)
        let mut doc = s.load(&d.id).unwrap();
        doc.confirmed = None;
        doc.saved_at = Some("2026-01-01T00:00:00+09:00".into());
        std::fs::write(&path, serde_json::to_vec(&doc).unwrap()).unwrap();
        let read = s.load(&d.id).unwrap();
        assert!(read.confirmed.is_none());
        assert!(read.unsaved(), "今までどおり時刻で ●");
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
        assert_eq!(summary["hasConfirmed"], false);
        // 確定していない図のファイルに confirmed を書かない (前の版と同じ形)
        assert!(v.get("confirmed").is_none());
        assert_eq!(summary["updatedAt"], v["updatedAt"]);
    }
}
