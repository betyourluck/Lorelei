//! 意味モデル → エディタのデータ形 (spec 01 D5')。入力の多くは P0-5 でフォーク元パーサーが壊したもの。

use lorelei_core::{EditorPayload, ErData, FlowData, to_editor, validate};

fn flow(src: &str) -> (FlowData, Vec<(String, usize)>) {
    match to_editor(src).unwrap().expect("editable") {
        EditorPayload::Flowchart { data, dropped } => (
            data,
            dropped
                .into_iter()
                .map(|d| (d.construct, d.count))
                .collect(),
        ),
        other => panic!("{other:?}"),
    }
}

fn er(src: &str) -> (ErData, Vec<(String, usize)>) {
    match to_editor(src).unwrap().expect("editable") {
        EditorPayload::ErDiagram { data, dropped } => (
            data,
            dropped
                .into_iter()
                .map(|d| (d.construct, d.count))
                .collect(),
        ),
        other => panic!("{other:?}"),
    }
}

fn edge_pairs(data: &FlowData) -> Vec<(&str, &str)> {
    data.edges
        .iter()
        .map(|e| (e.source.as_str(), e.target.as_str()))
        .collect()
}

fn node_ids(data: &FlowData) -> Vec<&str> {
    data.nodes.iter().map(|n| n.id.as_str()).collect()
}

fn d(construct: &str, count: usize) -> (String, usize) {
    (construct.to_string(), count)
}

// ---------- flowchart: P0-5 でフォーク元が壊した入力 ----------

#[test]
fn chained_edges_keep_the_middle_node() {
    let (data, dropped) = flow("flowchart TD\n  A[a] --> B[b] --> C[c]\n");
    assert_eq!(node_ids(&data), ["A", "B", "C"]);
    assert_eq!(edge_pairs(&data), [("A", "B"), ("B", "C")]);
    assert!(dropped.is_empty(), "{dropped:?}");
}

#[test]
fn ampersand_open_link_semicolon_and_inline_class_do_not_empty_the_diagram() {
    let (data, _) = flow("flowchart TD\n  A[a] & B[b] --> C[c]\n");
    assert_eq!(edge_pairs(&data), [("A", "C"), ("B", "C")]);

    let (data, dropped) = flow("flowchart TD\n  A[a] --- B[b]\n");
    assert_eq!(edge_pairs(&data), [("A", "B")]);
    assert_eq!(dropped, [d("edge:---", 1)]);

    let (data, _) = flow("graph TD;\n  A[a]-->B[b];\n");
    assert_eq!(edge_pairs(&data), [("A", "B")]);

    let (data, dropped) = flow("flowchart TD\n  A[a]:::hot --> B[b]\n  classDef hot fill:#f96\n");
    assert_eq!(edge_pairs(&data), [("A", "B")]);
    assert_eq!(dropped, [d("class", 1), d("classDef", 1)]);
}

#[test]
fn subgraph_is_reported_and_does_not_become_a_node() {
    // subgraph の ID は ASCII にする (merman は日本語のノード ID を受け付けない。spec 01 の P1 記録)
    let src = "flowchart TD\n  subgraph S1[受注]\n    A[受付] --> B[確認]\n  end\n  B --> C[出荷]\n  C --> S1\n";
    let (data, dropped) = flow(src);
    assert_eq!(
        node_ids(&data),
        ["A", "B", "C"],
        "end や subgraph がノードになっている"
    );
    assert_eq!(edge_pairs(&data), [("A", "B"), ("B", "C")]);
    assert_eq!(dropped, [d("edge_to_subgraph", 1), d("subgraph", 1)]);
}

#[test]
fn styling_and_interaction_are_counted() {
    let src = "flowchart LR\n  %% コメントは構文ではないので数えない\n  A[a] --> B[b]\n  style A fill:#f9f\n  linkStyle 0 stroke:#f00\n  click B \"https://example.com\"\n";
    let (data, dropped) = flow(src);
    // 向きは spec 07 で写すようにした (落とさない)
    assert_eq!(dropped, [d("click", 1), d("style", 2)]);
    assert_eq!(data.direction.as_deref(), Some("LR"));
}

// spec 07 D1: 向きを写す。TB は TD と同じ意味なので TD にそろえ、TD の時は持たない (無ければ TD)
#[test]
fn flowchart_direction_is_carried_and_tb_means_td() {
    for (src, want) in [
        ("flowchart LR\n  A --> B\n", Some("LR")),
        ("flowchart RL\n  A --> B\n", Some("RL")),
        ("flowchart BT\n  A --> B\n", Some("BT")),
        ("graph LR\n  A --> B\n", Some("LR")),
        ("flowchart TB\n  A --> B\n", None),
        ("flowchart TD\n  A --> B\n", None),
    ] {
        let (data, dropped) = flow(src);
        assert_eq!(data.direction.as_deref(), want, "{src}");
        assert!(dropped.is_empty(), "{src}: {dropped:?}");
    }
}

#[test]
fn shapes_and_arrows_map_to_the_editor_types() {
    let src = "flowchart TD\n  a[sq] --> b(round)\n  b ==> c{dia}\n  c -.-> d((circ))\n  d ~~~ e{{hex}}\n  e <--> f([stad])\n  f <==> g[[sub]]\n  g --o h[(cyl)]\n";
    let (data, dropped) = flow(src);
    let shapes: Vec<_> = data.nodes.iter().map(|n| n.shape_type).collect();
    assert_eq!(
        shapes,
        [
            "rectangle",
            "rounded",
            "diamond",
            "circle",
            "hexagon",
            "stadium",
            "rectangle",
            "rectangle"
        ]
    );
    let arrows: Vec<_> = data.edges.iter().map(|e| e.arrow_type).collect();
    assert_eq!(
        arrows,
        [
            "arrow",
            "thick",
            "dotted",
            "invisible",
            "bidirectional",
            "bidirectional-thick",
            "arrow"
        ]
    );
    assert_eq!(
        dropped,
        [
            d("edge:--o", 1),
            d("shape:cylinder", 1),
            d("shape:subroutine", 1)
        ]
    );
}

#[test]
fn labels_are_kept_and_duplicate_edges_get_unique_ids() {
    let (data, _) = flow("flowchart TD\n  A[開始] -->|はい| B[完了]\n  A -- いいえ --> B\n");
    assert_eq!(data.nodes[0].label, "開始");
    assert_eq!(data.nodes[0].variable_name, "A");
    let ids: Vec<_> = data.edges.iter().map(|e| e.id.as_str()).collect();
    assert_eq!(ids, ["A-B", "A-B-2"]);
    let labels: Vec<_> = data.edges.iter().map(|e| e.label.as_str()).collect();
    assert_eq!(labels, ["はい", "いいえ"]);
}

// ---------- erDiagram ----------

/// フォーク元が出す 7 記号は、そのまま同じカーディナリティに戻る (往復で意味が変わらない)。
#[test]
fn every_fork_cardinality_symbol_round_trips() {
    let table = [
        ("||--||", "one-to-one"),
        ("||--o{", "one-to-many"),
        ("}o--||", "many-to-one"),
        ("}o--o{", "many-to-many"),
        ("o|--||", "zero-to-one"),
        ("||--o|", "one-to-zero"),
        ("||--|{", "one-to-many-mandatory"),
    ];
    for (symbol, expected) in table {
        let (data, dropped) = er(&format!("erDiagram\n  A {symbol} B : r\n"));
        let edge = &data.edges[0];
        assert_eq!(edge.data.cardinality, expected, "{symbol}");
        assert_eq!((edge.source.as_str(), edge.target.as_str()), ("A", "B"));
        assert!(dropped.is_empty(), "{symbol}: {dropped:?}");
    }
}

#[test]
fn unsupported_cardinality_and_non_identifying_are_reported() {
    let (data, dropped) = er("erDiagram\n  A |o..|{ B : r\n");
    assert_eq!(data.edges[0].data.cardinality, "one-to-many");
    assert_eq!(
        dropped,
        [d("cardinality_unsupported", 1), d("non_identifying", 1)]
    );
}

#[test]
fn japanese_attributes_keys_and_entity_order_survive() {
    let src = "erDiagram\n  顧客 ||--o{ 注文 : \"行う\"\n  顧客 {\n    int id PK \"主キー\"\n    string 氏名 UK\n    int 会社_id FK\n  }\n  注文 {\n    date 注文日\n  }\n";
    let (data, dropped) = er(src);
    let names: Vec<_> = data.nodes.iter().map(|n| n.name.as_str()).collect();
    assert_eq!(
        names,
        ["顧客", "注文"],
        "エンティティが重複している、または順序が崩れた"
    );
    let cols: Vec<_> = data.nodes[0]
        .columns
        .iter()
        .map(|c| (c.kind.as_str(), c.name.as_str(), c.pk, c.uk, c.fk))
        .collect();
    assert_eq!(
        cols,
        [
            ("int", "id", true, false, false),
            ("string", "氏名", false, true, false),
            // FK は spec 07 で写すようにした (落とさない)
            ("int", "会社_id", false, false, true)
        ]
    );
    assert_eq!(data.nodes[1].columns[0].name, "注文日");
    assert_eq!(data.edges[0].data.label, "行う");
    assert_eq!(dropped, [d("attribute_comment", 1)]);
}

#[test]
fn er_alias_class_style_and_direction_are_reported() {
    let src = "erDiagram\n  direction LR\n  A[\"顧客\"] {\n    int id\n  }\n  A ||--o{ B : has\n  classDef hot fill:#f00\n  class A hot\n  style B fill:#0f0\n";
    let (data, dropped) = er(src);
    assert_eq!(data.nodes[0].name, "A", "alias ではなく識別子を名前に使う");
    // 向きは spec 07 で写すようにした (落とさない)
    assert_eq!(
        dropped,
        [d("alias", 1), d("class", 1), d("classDef", 1), d("style", 1)]
    );
    assert_eq!(data.direction.as_deref(), Some("LR"));
}

// spec 07 D2: 複数のキー (順は問わない) と FK を写す
#[test]
fn er_keys_are_carried_in_any_order() {
    let (data, dropped) = er("erDiagram\n  注文 {\n    int 顧客_id PK, FK\n    int 店_id FK, PK\n    string 番号 UK, FK\n  }\n");
    let keys: Vec<_> = data.nodes[0].columns.iter().map(|c| (c.pk, c.uk, c.fk)).collect();
    assert_eq!(keys, [(true, false, true), (true, false, true), (false, true, true)]);
    assert!(dropped.is_empty(), "{dropped:?}");
    assert_eq!(data.direction, None);
}

// ---------- 共通 ----------

#[test]
fn other_diagram_types_are_not_editable() {
    let src = "sequenceDiagram\n  Alice->>Bob: こんにちは\n";
    assert!(to_editor(src).unwrap().is_none());
    let v = validate(src).unwrap();
    assert!(v.ok);
    assert!(!v.editor.editable);
    assert!(v.editor.dropped.is_empty());
}

#[test]
fn validate_carries_the_same_dropped_list_as_the_payload() {
    let src = "flowchart TD\n  subgraph S\n    A --> B\n  end\n";
    let from_validate = validate(src).unwrap().editor.dropped;
    let from_payload = to_editor(src).unwrap().unwrap().dropped().to_vec();
    assert_eq!(from_validate, from_payload);
    assert!(validate(src).unwrap().editor.editable);
}

#[test]
fn payload_serializes_in_the_fork_parser_shape() {
    let json = serde_json::to_value(to_editor("flowchart TD\n  A[a] --> B[b]\n").unwrap()).unwrap();
    assert_eq!(json["editor"], "flowchart");
    assert_eq!(json["data"]["nodes"][0]["variableName"], "A");
    assert_eq!(json["data"]["nodes"][0]["shapeType"], "rectangle");
    assert_eq!(json["data"]["edges"][0]["arrowType"], "arrow");

    let json = serde_json::to_value(to_editor("erDiagram\n  A ||--o{ B : has\n").unwrap()).unwrap();
    assert_eq!(json["editor"], "erDiagram");
    assert_eq!(json["data"]["edges"][0]["type"], "erEdge");
    assert_eq!(
        json["data"]["edges"][0]["data"]["cardinality"],
        "one-to-many"
    );
}

// ---------- 日本語のノード ID (vendor/merman-core の修正。mermaid.js 11.17.2 は受け付ける) ----------

#[test]
fn japanese_node_ids_are_accepted() {
    let (data, dropped) =
        flow("flowchart TD\n  開始 --> 在庫確認{在庫はあるか}\n  在庫確認 -->|はい| 出荷\n");
    assert_eq!(node_ids(&data), ["開始", "在庫確認", "出荷"]);
    assert_eq!(
        edge_pairs(&data),
        [("開始", "在庫確認"), ("在庫確認", "出荷")]
    );
    assert_eq!(data.nodes[1].label, "在庫はあるか");
    assert!(dropped.is_empty(), "{dropped:?}");
}

#[test]
fn japanese_ids_work_in_subgraph_class_style_and_click_statements() {
    let src = "flowchart TD\n  subgraph 受注\n    受付 --> 確認\n  end\n  確認 --> 受注\n  classDef 強調 fill:#f96\n  class 受付 強調\n  style 確認 fill:#9f6\n  click 確認 \"https://example.com\"\n  受付:::強調 --> 完了ー\n";
    let (data, dropped) = flow(src);
    assert_eq!(node_ids(&data), ["受付", "確認", "完了ー"]);
    assert_eq!(edge_pairs(&data), [("受付", "確認"), ("受付", "完了ー")]);
    assert_eq!(
        dropped,
        [
            d("class", 1),
            d("classDef", 1),
            d("click", 1),
            d("edge_to_subgraph", 1),
            d("style", 1),
            d("subgraph", 1)
        ]
    );
}

#[test]
fn bare_node_ids_are_rectangles_without_a_drop() {
    let (data, dropped) = flow("flowchart TD\n  A --> B\n");
    let shapes: Vec<_> = data.nodes.iter().map(|n| n.shape_type).collect();
    assert_eq!(shapes, ["rectangle", "rectangle"]);
    assert!(dropped.is_empty(), "{dropped:?}");
}

/// mermaid.js 11.17.2 と同じく、ASCII 以外の数字と句読点は ID に使えない (広げすぎていないことの見張り)。
#[test]
fn fullwidth_digits_and_touten_in_ids_are_rejected_like_mermaid_js() {
    for src in [
        "flowchart TD\n  手順１ --> 手順２\n",
        "flowchart TD\n  開始、 --> 終了\n",
    ] {
        assert!(!validate(src).unwrap().ok, "{src}");
    }
}
