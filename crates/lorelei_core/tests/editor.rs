//! 意味モデル → エディタのデータ形 (spec 01 D5')。入力の多くは P0-5 でフォーク元パーサーが壊したもの。

use lorelei_core::{
    EditorPayload, ErData, FlowData, FlowSubgraph, SubgraphDirection, to_editor, validate,
};

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
fn subgraph_becomes_a_frame_and_not_a_node() {
    // subgraph の ID は ASCII にする (merman は日本語のノード ID を受け付けない。spec 01 の P1 記録)
    let src = "flowchart TD\n  subgraph S1[受注]\n    A[受付] --> B[確認]\n  end\n  B --> C[出荷]\n  C --> S1\n";
    let (data, dropped) = flow(src);
    assert_eq!(
        node_ids(&data),
        ["A", "B", "C"],
        "end や subgraph がノードになっている"
    );
    // spec 15 D1: 枠にする (TS の取り込み from-mermaid.ts と同じ)。spec 16 D2: 枠を指す線は枠につなぐ
    assert_eq!(edge_pairs(&data), [("A", "B"), ("B", "C"), ("C", "S1")]);
    assert_eq!(data.subgraphs, [sg("S1", "受注", &["A", "B"], None)]);
    assert!(dropped.is_empty(), "{dropped:?}");
}

fn sg(id: &str, title: &str, nodes: &[&str], parent: Option<&str>) -> FlowSubgraph {
    FlowSubgraph {
        id: id.to_string(),
        title: title.to_string(),
        nodes: nodes.iter().map(|n| n.to_string()).collect(),
        parent: parent.map(str::to_string),
        direction: None,
    }
}

fn sg_dir(id: &str, nodes: &[&str], direction: SubgraphDirection) -> FlowSubgraph {
    FlowSubgraph {
        direction: Some(direction),
        ..sg(id, id, nodes, None)
    }
}

// ---------- flowchart: 枠 (spec 15 D1。TS の from-mermaid.test.ts の「枠」と同じ入力) ----------

#[test]
fn nested_frames_are_ordered_parent_first() {
    let (data, _) = flow(
        "flowchart TD\n  subgraph X[\"x\"]\n    subgraph Y[\"y\"]\n      subgraph Z[\"z\"]\n        A\n      end\n    end\n    B\n  end\n  C\n",
    );
    assert_eq!(
        data.subgraphs,
        [
            sg("X", "x", &["B"], None),
            sg("Y", "y", &[], Some("X")),
            sg("Z", "z", &["A"], Some("Y")),
        ]
    );
}

#[test]
fn a_node_belongs_to_one_frame() {
    let (data, _) = flow("flowchart TD\n  subgraph X\n    A\n  end\n  subgraph Y\n    A\n  end\n");
    assert_eq!(
        data.subgraphs,
        [sg("X", "X", &["A"], None), sg("Y", "Y", &[], None)]
    );
    let (data, _) =
        flow("flowchart TD\n  subgraph X\n    A\n    subgraph Y\n      A\n    end\n  end\n");
    assert_eq!(
        data.subgraphs,
        [sg("X", "X", &[], None), sg("Y", "Y", &["A"], Some("X"))]
    );
}

#[test]
fn a_frame_listing_itself_ignores_that_entry() {
    let (data, _) = flow("flowchart TD\n  subgraph X[\"x\"]\n    X\n    A\n  end\n");
    assert_eq!(node_ids(&data), ["A"]);
    assert_eq!(data.subgraphs, [sg("X", "x", &["A"], None)]);
}

#[test]
fn empty_frames_blank_titles_and_title_only_frames() {
    let (data, _) =
        flow("flowchart TD\n  subgraph X[\" \"]\n  end\n  subgraph 受付 審査\n    A\n  end\n");
    assert_eq!(
        data.subgraphs,
        [
            sg("X", "", &[], None),
            sg("subGraph1", "受付 審査", &["A"], None)
        ]
    );
}

#[test]
fn direction_inside_a_frame_is_carried_and_members_follow_node_order() {
    // spec 16 D1: 枠の中の向きを写す
    let (data, dropped) =
        flow("flowchart TD\n  subgraph X\n    direction LR\n    A --> B\n  end\n");
    assert_eq!(
        data.subgraphs,
        [sg_dir("X", &["A", "B"], SubgraphDirection::LR)]
    );
    assert!(dropped.is_empty(), "{dropped:?}");
}

#[test]
fn frame_direction_td_becomes_tb_and_the_last_one_wins() {
    // spec 16 裁定 3: TD は TB にそろえる (merman も TD のまま持つ, P0)
    for (dir, want) in [
        ("TB", SubgraphDirection::TB),
        ("TD", SubgraphDirection::TB),
        ("BT", SubgraphDirection::BT),
        ("RL", SubgraphDirection::RL),
        ("LR", SubgraphDirection::LR),
    ] {
        let (data, _) = flow(&format!(
            "flowchart TD\n  subgraph X\n    direction {dir}\n    A\n  end\n"
        ));
        assert_eq!(data.subgraphs[0].direction, Some(want), "{dir}");
    }
    let (data, _) =
        flow("flowchart TD\n  subgraph X\n    direction LR\n    A\n    direction RL\n  end\n");
    assert_eq!(data.subgraphs[0].direction, Some(SubgraphDirection::RL));
    let json = serde_json::to_value(
        to_editor("flowchart TD\n  subgraph X\n    direction TD\n    A\n  end\n").unwrap(),
    )
    .unwrap();
    assert_eq!(json["data"]["subgraphs"][0]["direction"], "TB");
}

// ---------- flowchart: 枠を指す線 (spec 16 D2。TS の from-mermaid.test.ts の「枠を指す線」と同じ入力) ----------

const FRAME_S: &str = "  subgraph S[\"S\"]\n    s1 --> s2\n  end\n";
const FRAME_P: &str =
    "  subgraph P[\"P\"]\n    p1\n    subgraph S[\"S\"]\n      s1 --> s2\n    end\n  end\n";

#[test]
fn edges_to_frames_connect_to_the_frame() {
    let (data, dropped) = flow(&format!(
        "flowchart TD\n  A\n  B\n{FRAME_S}  subgraph T[\"T\"]\n    t1\n  end\n  A --> S\n  S --> B\n  S -->|次へ| T\n  S --> S\n"
    ));
    assert_eq!(node_ids(&data), ["A", "B", "s1", "s2", "t1"]);
    assert_eq!(
        edge_pairs(&data),
        [("s1", "s2"), ("A", "S"), ("S", "B"), ("S", "T"), ("S", "S")]
    );
    assert_eq!(
        data.edges.iter().find(|e| e.id == "S-T").unwrap().label,
        "次へ"
    );
    assert!(dropped.is_empty(), "{dropped:?}");
}

#[test]
fn edges_before_the_frame_and_to_title_only_frames_connect() {
    let (data, dropped) = flow(&format!(
        "flowchart TD\n  A --> S\n{FRAME_S}  subgraph 受付 審査\n    u1\n  end\n  A --> subGraph1\n"
    ));
    assert_eq!(
        edge_pairs(&data),
        [("A", "S"), ("s1", "s2"), ("A", "subGraph1")]
    );
    assert!(dropped.is_empty(), "{dropped:?}");
}

#[test]
fn edges_between_a_frame_and_its_own_inside_are_dropped() {
    // spec 16 裁定 2: 描画では長さ 0 の線で見えず、枠の中の向きを変える (P0)
    for edge in [
        "S --> s1", "s2 --> S", "P --> S", "S --> P", "P --> s1", "s1 --> P",
    ] {
        let (data, dropped) = flow(&format!("flowchart TD\n{FRAME_P}  {edge}\n"));
        assert_eq!(edge_pairs(&data), [("s1", "s2")], "{edge}");
        assert_eq!(dropped, [d("edge_into_own_subgraph", 1)], "{edge}");
    }
}

#[test]
fn edges_into_sibling_frames_are_kept() {
    let (data, dropped) = flow(&format!(
        "flowchart TD\n{FRAME_P}  subgraph Q[\"Q\"]\n    q1\n  end\n  Q --> s1\n  p1 --> Q\n"
    ));
    assert_eq!(edge_pairs(&data), [("s1", "s2"), ("Q", "s1"), ("p1", "Q")]);
    assert!(dropped.is_empty(), "{dropped:?}");
}

#[test]
fn diagrams_without_frames_do_not_serialize_subgraphs() {
    let json = serde_json::to_value(to_editor("flowchart TD\n  A --> B\n").unwrap()).unwrap();
    assert!(json["data"].get("subgraphs").is_none());
    let json =
        serde_json::to_value(to_editor("flowchart TD\n  subgraph S\n    A\n  end\n").unwrap())
            .unwrap();
    assert_eq!(
        json["data"]["subgraphs"],
        serde_json::json!([{ "id": "S", "title": "S", "nodes": ["A"] }])
    );
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
    let src = "flowchart TD\n  subgraph S\n    A --> B\n  end\n  B --> S\n  style A fill:#f00\n";
    let from_validate = validate(src).unwrap().editor.dropped;
    let from_payload = to_editor(src).unwrap().unwrap().dropped().to_vec();
    assert!(!from_validate.is_empty());
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
    assert_eq!(data.subgraphs, [sg("受注", "受注", &["受付", "確認"], None)]);
    assert_eq!(
        dropped,
        [
            d("class", 1),
            d("classDef", 1),
            d("click", 1),
            d("edge_into_own_subgraph", 1),
            d("style", 1),
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

/// mermaid.js 11.17.2 と同じく、ASCII 以外の数字・句読点・結合記号・BMP の外の文字は ID に使えない
/// (広げすぎていないことの見張り。上流 Latias94/merman#146 のマージ版と同じ 4 例)。
#[test]
fn fullwidth_digits_and_touten_in_ids_are_rejected_like_mermaid_js() {
    for src in [
        "flowchart TD\n  手順１ --> 手順２\n",
        "flowchart TD\n  開始、 --> 終了\n",
        "flowchart TD\n  Aͅ --> B\n",
        "flowchart TD\n  𠀀 --> B\n",
    ] {
        assert!(!validate(src).unwrap().ok, "{src}");
    }
}

/// mermaid.js 11.17.2 では、ASCII のキーワード・向きの直後に Unicode の文字が来ても語は続かない
/// (`end開始` は `end` + `開始` で誤り、`TD開始` は向き TD + ノード `開始`)。上流 #146 のマージ版と同じ。
#[test]
fn ascii_keyword_boundaries_are_kept_before_unicode_like_mermaid_js() {
    assert!(!validate("flowchart TD\nend開始 --> B\n").unwrap().ok);

    let (data, dropped) = flow("flowchart TD開始 --> B\n");
    assert_eq!(data.direction.as_deref(), None, "TD は向きとして読まれる");
    assert_eq!(node_ids(&data), ["開始", "B"]);
    assert!(dropped.is_empty(), "{dropped:?}");
}

// ---------- spec 11 で見つけた穴 (TS の取り込みの査読 2・8 と同じ入力) ----------

/// ER 図の subgraph を関係の行き先にしても止まらず、TS の取り込み (erFromMermaid) と同じく落として知らせる
#[test]
fn er_subgraph_is_reported_like_the_ts_import() {
    let (data, dropped) =
        er("erDiagram\n  subgraph G[グループ]\n    A\n  end\n  B ||--o{ G : r\n  A ||--o{ B : s\n");
    let names: Vec<_> = data.nodes.iter().map(|n| n.name.as_str()).collect();
    assert_eq!(names, ["A", "B"]);
    let pairs: Vec<_> = data
        .edges
        .iter()
        .map(|e| (e.source.as_str(), e.target.as_str()))
        .collect();
    assert_eq!(pairs, [("A", "B")]);
    assert_eq!(dropped, [d("edge_to_subgraph", 1), d("subgraph", 1)]);
}

/// 線の ID は `-` を含むノード ID でもぶつからない (TS の取り込みと同じく、空くまで番号を足す)
#[test]
fn edge_ids_stay_unique_with_dashed_node_ids() {
    let (data, _) = flow("flowchart TD\n  a-b --> c\n  a --> b-c\n");
    let ids: Vec<_> = data.edges.iter().map(|e| e.id.as_str()).collect();
    assert_eq!(ids, ["a-b-c", "a-b-c-2"]);
}

// ---------- spec 14: merman の ER 図の字句解析で to / one / many を語の境界で取る ----------

/// to / one / many で始まるテーブル名・関係のラベルが、mermaid.js と同じく通る (写しの修正前は merman だけが誤りにした)
#[test]
fn er_names_may_start_with_cardinality_words_like_mermaid_js() {
    for name in ["tokens", "topic", "total", "toy", "oneshot", "manyToMany", "many_items", "TOTAL"] {
        let (data, dropped) = er(&format!("erDiagram\n  A ||--o{{ {name} : has\n  {name} ||--|| B : {name}\n"));
        let names: Vec<_> = data.nodes.iter().map(|n| n.name.as_str()).collect();
        assert_eq!(names, ["A", name, "B"], "{name}");
        let labels: Vec<_> = data.edges.iter().map(|e| e.data.label.as_str()).collect();
        assert_eq!(labels, ["has", name], "{name}");
        assert!(dropped.is_empty(), "{name}: {dropped:?}");
    }
}

/// 境界は ASCII のまま (mermaid.js の \b と同じ)。境界のある語はこれまでどおり多重度として取り、名前が黙って化けない
#[test]
fn er_cardinality_word_boundary_is_ascii_like_mermaid_js() {
    for line in [
        "A ||--o{ to : has",
        "A ||--o{ one : has",
        "A ||--o{ to注文 : has",
        "A ||--o{ B : one-to-one",
        // 写しの修正前は通り、テーブル名が rous / self に化けていた
        "A one to onerous : x",
        "A only one to oneself : has",
    ] {
        assert!(!validate(&format!("erDiagram\n  {line}\n")).unwrap().ok, "{line}");
    }
    let (data, _) = er("erDiagram\n  A one to many tokens : has\n");
    let names: Vec<_> = data.nodes.iter().map(|n| n.name.as_str()).collect();
    assert_eq!(names, ["A", "tokens"]);
    assert_eq!(data.edges[0].data.cardinality, "one-to-many");
}

// ---------- spec 13 P3: ER 図の生成器の出力を merman で取り込む (TS の往復と同じ入力) ----------

/// fixtures/er_names.json は TS の生成器の出力 (__tests__/lorelei/er-names-fixture.test.ts が今の生成器と突き合わせる)。
/// テーブル名と関係のラベルが、囲み・実体参照 (#quot; #35; #38; #37; #92; #32;) を戻して元の文字になる
#[test]
fn er_generator_names_round_trip_through_merman() {
    let cases: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/er_names.json")).expect("fixture");
    for case in cases.as_array().expect("array") {
        let name = case["name"].as_str().unwrap();
        let source = case["source"].as_str().unwrap();
        let (data, dropped) = er(source);
        let names: Vec<_> = data.nodes.iter().map(|n| n.name.as_str()).collect();
        assert_eq!(names, [name, "B"], "{source}");
        let edges: Vec<_> = data
            .edges
            .iter()
            .map(|e| (e.source.as_str(), e.target.as_str(), e.data.label.as_str()))
            .collect();
        assert_eq!(edges, [("B", name, name)], "{source}");
        assert!(dropped.is_empty(), "{source}: {dropped:?}");
    }
}

/// TS の生成器が書いた枠 (spec 15 D2) を merman で読み、fixture の nodes・subgraphs に戻る (TS の往復は mermaid.js で同じ期待値を検める)。
/// fixture は __tests__/lorelei/flow-subgraphs-fixture.test.ts が書く (LORELEI_UPDATE_FIXTURES=1)
#[test]
fn flow_generator_frames_round_trip_through_merman() {
    let cases: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/flow_subgraphs.json")).expect("fixture");
    for case in cases.as_array().expect("array") {
        let name = case["name"].as_str().unwrap();
        let source = case["source"].as_str().unwrap();
        let (data, dropped) = flow(source);
        let expected_nodes: Vec<&str> = case["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| n.as_str().unwrap())
            .collect();
        assert_eq!(node_ids(&data), expected_nodes, "{name}: {source}");
        assert_eq!(
            serde_json::to_value(&data.subgraphs).unwrap(),
            case["subgraphs"],
            "{name}: {source}"
        );
        // 線の端 (spec 16: 枠を指す線も)。fixture に edges のある場面だけ
        if let Some(edges) = case["edges"].as_array() {
            let expected: Vec<(&str, &str)> = edges
                .iter()
                .map(|e| (e[0].as_str().unwrap(), e[1].as_str().unwrap()))
                .collect();
            assert_eq!(edge_pairs(&data), expected, "{name}: {source}");
        }
        assert!(dropped.is_empty(), "{name}: {dropped:?}");
    }
}
