//! 人が GUI で直した図を AI が読み戻す (spec 04 D1〜D3、data_contract `McpServer.tools.list_diagrams` / `read_diagram`)。
//!
//! 読むのは `documents/` と `state.json` だけ。GUI の画面には問い合わせない (D1。最後の 1 秒の編集は自動保存を待つ)。
//! エラーの文字列はそのまま AI に見せるので、ファイルのパスを載せない。

use lorelei_mcp::{Diagram, DiagramSummary};

use crate::documents::{Document, DocumentSummary, Editor, Origin, Store};

/// 一覧。並びは GUI の一覧と同じ (`Store::list`)。open = 今 GUI で開いている図 (`last_opened`)
pub fn list(store: &Store) -> Result<Vec<DiagramSummary>, String> {
    let open = store.last_opened();
    Ok(store
        .list()?
        .iter()
        .map(|d| summary(d, open.as_deref()))
        .collect())
}

/// 1 枚の図。id を省くと今 GUI で開いている図。original_source は常に詰める (省くのはツールの層)
pub fn read(store: &Store, id: Option<String>) -> Result<Diagram, String> {
    let id = match id {
        Some(id) if store.contains(&id) => id,
        Some(id) => return Err(format!("図が見つかりません（id: {id}）")),
        None => store.last_opened().filter(|id| store.contains(id)).ok_or_else(|| {
            "今開いている図がありません。id を指定するか、GUI で図を開いてください".to_string()
        })?,
    };
    let doc: Document = store.load(&id)?;
    let open = store.last_opened();
    Ok(Diagram {
        summary: summary(&DocumentSummary::from(&doc), open.as_deref()),
        source: doc.source,
        original_source: doc.original_source,
    })
}

fn summary(d: &DocumentSummary, open: Option<&str>) -> DiagramSummary {
    DiagramSummary {
        id: d.id.clone(),
        title: d.title.clone(),
        editor: editor_name(d.editor).into(),
        origin: origin_name(d.origin).into(),
        created_at: d.created_at.clone(),
        updated_at: d.updated_at.clone(),
        saved_at: d.saved_at.clone(),
        unsaved: d.unsaved,
        open: open == Some(d.id.as_str()),
    }
}

// data_contract の enum の値 (documents の serde の名前と同じ)
fn editor_name(e: Editor) -> &'static str {
    match e {
        Editor::Flowchart => "flowchart",
        Editor::ErDiagram => "erDiagram",
    }
}

fn origin_name(o: Origin) -> &'static str {
    match o {
        Origin::New => "new",
        Origin::Ai => "ai",
        Origin::Import => "import",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn store() -> Store {
        let root = std::env::temp_dir().join(format!("lorelei-readback-{}", uuid::Uuid::new_v4()));
        Store::new(root)
    }

    #[test]
    fn list_follows_the_gui_order_and_marks_the_open_diagram() {
        let s = store();
        let a = s.create(Editor::Flowchart, Some("A".into()), Origin::New, None).unwrap();
        let b = s
            .create(Editor::ErDiagram, Some("B".into()), Origin::Ai, Some("erDiagram\n  会員 {\n  }\n".into()))
            .unwrap();
        s.set_last_opened(&a.id).unwrap();

        let got = list(&s).unwrap();
        let ids: Vec<_> = got.iter().map(|d| d.id.clone()).collect();
        let gui: Vec<_> = s.list().unwrap().into_iter().map(|d| d.id).collect();
        assert_eq!(ids, gui, "GUI の一覧と同じ並び");
        let a_row = got.iter().find(|d| d.id == a.id).unwrap();
        let b_row = got.iter().find(|d| d.id == b.id).unwrap();
        assert!(a_row.open);
        assert!(!b_row.open);
        assert_eq!(b_row.editor, "erDiagram");
        assert_eq!(b_row.origin, "ai");
        assert_eq!(a_row.origin, "new");
        assert_eq!(a_row.editor, "flowchart");
        assert_eq!(b_row.title, "B");
        assert_eq!(b_row.saved_at, None);
    }

    #[test]
    fn nothing_is_open_when_last_opened_points_nowhere() {
        let s = store();
        let a = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        s.set_last_opened(&a.id).unwrap();
        s.trash(&a.id).unwrap();
        s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        assert!(list(&s).unwrap().iter().all(|d| !d.open));
    }

    #[test]
    fn read_returns_the_edited_source_and_the_original() {
        let s = store();
        let original = "flowchart LR\n  受付 --> 完了\n";
        let d = s.create(Editor::Flowchart, Some("届いた図".into()), Origin::Ai, Some(original.into())).unwrap();
        // エディタに載る前 (source が空) はエラーにしない
        let before = read(&s, Some(d.id.clone())).unwrap();
        assert_eq!(before.source, "");
        assert_eq!(before.original_source.as_deref(), Some(original));
        assert!(!before.summary.open);

        // エディタに載って最初の自動保存 (利用者の変更ではないので unsaved にならない)、その後に人が直す
        s.save(&d.id, "flowchart TD\n    受付[受付]\n".into(), BTreeMap::new()).unwrap();
        assert!(!read(&s, Some(d.id.clone())).unwrap().summary.unsaved);
        s.save(&d.id, "flowchart TD\n    受付[受付]\n    検品[検品]\n".into(), BTreeMap::new()).unwrap();
        s.set_last_opened(&d.id).unwrap();
        let after = read(&s, None).unwrap();
        assert_eq!(after.summary.id, d.id);
        assert!(after.summary.open);
        assert_eq!(after.source, "flowchart TD\n    受付[受付]\n    検品[検品]\n");
        assert!(after.summary.unsaved, "最後の「保存」の後に変わった");
        s.mark_saved(&d.id).unwrap();
        assert!(!read(&s, None).unwrap().summary.unsaved);
    }

    #[test]
    fn a_new_diagram_has_no_original() {
        let s = store();
        let d = s.create(Editor::ErDiagram, None, Origin::New, None).unwrap();
        assert_eq!(read(&s, Some(d.id)).unwrap().original_source, None);
    }

    #[test]
    fn missing_malformed_and_trashed_ids_are_not_found_without_paths() {
        let s = store();
        let d = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        s.trash(&d.id).unwrap();
        for id in [d.id.clone(), "../state".into(), uuid::Uuid::new_v4().to_string()] {
            let err = read(&s, Some(id.clone())).unwrap_err();
            assert!(err.starts_with("図が見つかりません"), "{id}: {err}");
            assert!(!err.contains(&*s.root.to_string_lossy()), "パスを載せない: {err}");
        }
    }

    #[test]
    fn omitting_the_id_without_an_open_diagram_is_an_error() {
        let s = store();
        // last_opened が無い
        let err = read(&s, None).unwrap_err();
        assert!(err.starts_with("今開いている図がありません"), "{err}");
        // 指している図がごみ箱にある
        let d = s.create(Editor::Flowchart, None, Origin::New, None).unwrap();
        s.set_last_opened(&d.id).unwrap();
        s.trash(&d.id).unwrap();
        assert!(read(&s, None).unwrap_err().starts_with("今開いている図がありません"));
    }
}
