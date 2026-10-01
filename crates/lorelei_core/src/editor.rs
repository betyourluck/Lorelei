//! merman の意味モデル → フォーク元エディタのデータ形 (spec 01 D5', data_contract `EditorPayload`)。
//!
//! フォーク元パーサーは AI が普通に書く構文で図を壊す (P0-5) ので、MCP 経由で GUI に開く時は
//! 通さない。出力はフォーク元パーサーの出力と同じ形 (`ParsedMermaidData` / `ParsedMermaidERData`)
//! なので、エディタの既存の取り込み処理がそのまま使える。写せなかった要素は数えて `dropped` に返す。

use std::collections::{BTreeMap, HashMap, HashSet};

use serde::Serialize;
use serde_json::Value;

use crate::{CoreError, validate};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DroppedItem {
    pub construct: String,
    pub count: usize,
}

/// data_contract `EditorCompat`。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct EditorCompat {
    pub editable: bool,
    pub dropped: Vec<DroppedItem>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "editor", rename_all = "camelCase")]
pub enum EditorPayload {
    Flowchart {
        data: FlowData,
        dropped: Vec<DroppedItem>,
    },
    ErDiagram {
        data: ErData,
        dropped: Vec<DroppedItem>,
    },
}

impl EditorPayload {
    pub fn dropped(&self) -> &[DroppedItem] {
        match self {
            Self::Flowchart { dropped, .. } | Self::ErDiagram { dropped, .. } => dropped,
        }
    }
}

/// フォーク元 `ParsedMermaidData`。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FlowData {
    pub nodes: Vec<FlowNode>,
    pub edges: Vec<FlowEdge>,
    /// 図の向き (LR / RL / BT)。TD (と同じ意味の TB) の時は持たない (無ければ TD, spec 07 D1)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub direction: Option<String>,
    /// サブグラフ (枠, spec 15 D1)。親が子より前に並ぶ。無ければ持たない
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub subgraphs: Vec<FlowSubgraph>,
}

/// フォーク元 `ParsedMermaidSubgraph` (spec 15 D1)。nodes は直下のノードの ID だけで、入れ子は子の枠の parent で表す
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FlowSubgraph {
    pub id: String,
    pub title: String,
    pub nodes: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    /// 枠の中に書いた向き (spec 16 D1)。書いていなければ持たない
    #[serde(skip_serializing_if = "Option::is_none")]
    pub direction: Option<SubgraphDirection>,
}

/// 枠の中の向き (spec 16 D1、TS の `SubgraphDirection`)。TD は TB にそろえる (裁定 3)。
/// 小文字の `direction lr` は merman も mermaid.js も文法の誤りなので来ない (P0)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum SubgraphDirection {
    TB,
    BT,
    LR,
    RL,
}

impl SubgraphDirection {
    fn parse(dir: &str) -> Option<Self> {
        match dir {
            "TB" | "TD" => Some(Self::TB),
            "BT" => Some(Self::BT),
            "LR" => Some(Self::LR),
            "RL" => Some(Self::RL),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowNode {
    pub id: String,
    pub variable_name: String,
    pub label: String,
    pub shape_type: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub label: String,
    pub arrow_type: &'static str,
}

/// フォーク元 `ParsedMermaidERData`。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ErData {
    pub nodes: Vec<ErNode>,
    pub edges: Vec<ErEdge>,
    /// 図の向き。FlowData と同じ規則
    #[serde(skip_serializing_if = "Option::is_none")]
    pub direction: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ErNode {
    pub id: String,
    pub name: String,
    pub columns: Vec<ErColumn>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ErColumn {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub pk: bool,
    pub uk: bool,
    /// 外部キー (spec 07 D2)。無ければ持たない (無ければ false。フォーク元の読み込みと同じ形)
    #[serde(skip_serializing_if = "is_false")]
    pub fk: bool,
}

fn is_false(b: &bool) -> bool {
    !*b
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ErEdge {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub source: String,
    pub target: String,
    pub data: ErEdgeData,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ErEdgeData {
    pub label: String,
    pub cardinality: &'static str,
}

/// GUI エディタで開ける図なら変換する。開けない種類なら `Ok(None)`。
pub fn to_editor(source: &str) -> Result<Option<EditorPayload>, CoreError> {
    let parsed = validate::parse(source)?;
    convert(&parsed.meta.diagram_type, &parsed.model)
}

pub(crate) fn convert(family: &str, model: &Value) -> Result<Option<EditorPayload>, CoreError> {
    Ok(match family {
        "flowchart-v2" | "flowchart" => Some(flowchart(model)?),
        "er" => Some(er(model)?),
        _ => None,
    })
}

/// 構文ごとの件数。BTreeMap なので出力順が決まる。
#[derive(Default)]
struct Drops(BTreeMap<String, usize>);

impl Drops {
    fn add(&mut self, construct: impl Into<String>, n: usize) {
        if n > 0 {
            *self.0.entry(construct.into()).or_default() += n;
        }
    }
    fn into_vec(self) -> Vec<DroppedItem> {
        self.0
            .into_iter()
            .map(|(construct, count)| DroppedItem { construct, count })
            .collect()
    }
}

/// mermaid の前処理の符号 (`ﬂ°quot¶ß` など) と実体参照を元の文字に戻す。フローチャートのラベルは merman が解析の段階で戻すが、
/// ER 図のテーブルの名前と関係のラベルは符号のまま入る (spec 13 P0)
fn decode_text(s: &str) -> String {
    merman::entities::decode_mermaid_entities_to_unicode(s).into_owned()
}

fn shape_error(what: &str) -> CoreError {
    CoreError::Convert(format!("merman の意味モデルの形が想定と違います: {what}"))
}

fn arr<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    v.get(key)
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}

fn str_of<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}

fn non_empty(v: &Value, key: &str) -> bool {
    match v.get(key) {
        None | Some(Value::Null) => false,
        Some(Value::Array(a)) => !a.is_empty(),
        Some(Value::Object(o)) => !o.is_empty(),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

/// 図の向きを写す (spec 07 D1)。TD と、同じ意味の TB は持たない (無ければ TD)
fn direction_of(model: &Value) -> Option<String> {
    match str_of(model, "direction").to_ascii_uppercase().as_str() {
        d @ ("LR" | "RL" | "BT") => Some(d.to_string()),
        _ => None,
    }
}

fn accessibility_drop(drops: &mut Drops, model: &Value) {
    let n = ["accTitle", "accDescr"]
        .iter()
        .filter(|k| non_empty(model, k))
        .count();
    drops.add("accessibility", n);
}

// ---------- flowchart ----------

fn flowchart(model: &Value) -> Result<EditorPayload, CoreError> {
    let mut drops = Drops::default();
    accessibility_drop(&mut drops, model);
    // 枠は写す (spec 15 D1)。枠の中の direction も枠に写す (spec 16 D1)
    drops.add(
        "classDef",
        model
            .get("classDefs")
            .and_then(Value::as_object)
            .map_or(0, |m| m.len()),
    );
    drops.add(
        "tooltip",
        model
            .get("tooltips")
            .and_then(Value::as_object)
            .map_or(0, |m| m.len()),
    );

    // subgraph を辺の行き先にすると、merman はその subgraph をノード一覧にも入れる
    let subgraph_ids: HashSet<&str> = arr(model, "subgraphs")
        .iter()
        .filter_map(|s| s.get("id").and_then(Value::as_str))
        .collect();
    let mut nodes = Vec::new();
    let mut ids = HashSet::new();
    for n in arr(model, "nodes") {
        let id = n
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| shape_error("node.id"))?;
        if subgraph_ids.contains(id) {
            continue;
        }
        // 括弧の無い裸のノード (`A --> B`) は shape が null (layoutShape は squareRect)
        let shape = match str_of(n, "shape") {
            "" => "square",
            s => s,
        };
        let shape_type = match shape {
            "square" => "rectangle",
            "round" => "rounded",
            "diamond" => "diamond",
            "circle" => "circle",
            "hexagon" => "hexagon",
            "stadium" => "stadium",
            other => {
                drops.add(format!("shape:{other}"), 1);
                "rectangle"
            }
        };
        // click を付けたノードには merman が clickable を自動で付ける (ユーザーの class ではない)
        let user_classes = arr(n, "classes")
            .iter()
            .filter(|c| c.as_str() != Some("clickable"))
            .count();
        drops.add("class", usize::from(user_classes > 0));
        drops.add("style", usize::from(non_empty(n, "styles")));
        let clickable = non_empty(n, "link") || n.get("haveCallback") == Some(&Value::Bool(true));
        drops.add("click", usize::from(clickable));
        ids.insert(id.to_string());
        nodes.push(FlowNode {
            id: id.to_string(),
            variable_name: id.to_string(),
            label: str_of(n, "label").to_string(),
            shape_type,
        });
    }

    let node_order: Vec<String> = nodes.iter().map(|n| n.id.clone()).collect();
    let subgraphs = subgraphs_of(model, &node_order);
    let frame_ids: HashSet<&str> = subgraphs.iter().map(|s| s.id.as_str()).collect();
    let mut parent_of: HashMap<&str, &str> = HashMap::new();
    for s in &subgraphs {
        if let Some(p) = &s.parent {
            parent_of.insert(s.id.as_str(), p.as_str());
        }
        for n in &s.nodes {
            parent_of.insert(n.as_str(), s.id.as_str());
        }
    }
    let mut edges = Vec::new();
    // ID は {source}-{target}。ID に - を含むノードがあるとぶつかりうるので、使った ID を持ち、空くまで番号を足す
    // (spec 11 で見つけた穴。TS の取り込み from-mermaid.ts と同じ)
    let mut used: HashSet<String> = HashSet::new();
    for e in arr(model, "edges") {
        let source = e
            .get("from")
            .and_then(Value::as_str)
            .ok_or_else(|| shape_error("edge.from"))?;
        let target = e
            .get("to")
            .and_then(Value::as_str)
            .ok_or_else(|| shape_error("edge.to"))?;
        // 線の端はノードか枠 (枠を指す線は枠につなぐ, spec 16 D2)。merman は線の端を必ずノードか枠にする
        let known = |id: &str| ids.contains(id) || frame_ids.contains(id);
        if !known(source) || !known(target) {
            continue;
        }
        // 枠と自分の中を結ぶ線は描画されない (P0) ので落とす (裁定 2。TS の edgeIntoOwnFrame と同じ)
        if edge_into_own_frame(source, target, &frame_ids, &parent_of) {
            drops.add("edge_into_own_subgraph", 1);
            continue;
        }
        let arrow_type = arrow_type(e, &mut drops);
        drops.add("class", usize::from(non_empty(e, "classes")));
        drops.add("style", usize::from(non_empty(e, "style")));
        let length = e.get("length").and_then(Value::as_u64).unwrap_or(1);
        drops.add("edge_length", usize::from(length > 1));

        let base = format!("{source}-{target}");
        let mut id = base.clone();
        let mut n = 2;
        while used.contains(&id) {
            id = format!("{base}-{n}");
            n += 1;
        }
        used.insert(id.clone());
        edges.push(FlowEdge {
            id,
            source: source.to_string(),
            target: target.to_string(),
            label: str_of(e, "label").to_string(),
            arrow_type,
        });
    }

    Ok(EditorPayload::Flowchart {
        data: FlowData {
            nodes,
            edges,
            direction: direction_of(model),
            subgraphs,
        },
        dropped: drops.into_vec(),
    })
}

/// 枠と自分の中 (子孫) を結ぶ線か (spec 16 裁定 2、TS の subgraph-tree.ts の edgeIntoOwnFrame と同じ)。枠の自己ループは当たらない
fn edge_into_own_frame(
    source: &str,
    target: &str,
    frame_ids: &HashSet<&str>,
    parent_of: &HashMap<&str, &str>,
) -> bool {
    if source == target {
        return false;
    }
    let inside = |id: &str, frame: &str| {
        let mut seen = HashSet::from([id]);
        let mut cur = parent_of.get(id).copied();
        while let Some(p) = cur {
            if p == frame {
                return true;
            }
            if !seen.insert(p) {
                return false;
            }
            cur = parent_of.get(p).copied();
        }
        false
    };
    (frame_ids.contains(source) && inside(target, source))
        || (frame_ids.contains(target) && inside(source, target))
}

/// 枠 (spec 15 D1。TS の from-mermaid.ts の subgraphsOf と同じ)。merman の一覧の nodes には子の枠の ID も入るので、
/// それを子の枠の親にする。自分自身を nodes に持つ枠はその 1 件を無視する。1 つのノードは 1 つの枠にだけ入れ (先に出た枠)、
/// 枠の中のノードは図のノードの順に並べる。題は merman が解析の段階で元の文字に戻している (P0)。空白だけの題は空にする
fn subgraphs_of(model: &Value, node_order: &[String]) -> Vec<FlowSubgraph> {
    let subs = arr(model, "subgraphs");
    let rank: HashMap<&str, usize> = node_order
        .iter()
        .enumerate()
        .map(|(i, id)| (id.as_str(), i))
        .collect();
    let sub_ids: HashSet<&str> = subs.iter().map(|s| str_of(s, "id")).collect();
    let mut parent_of: HashMap<&str, &str> = HashMap::new();
    let mut claimed: HashSet<&str> = HashSet::new();
    let mut items = Vec::new();
    for s in subs {
        let id = str_of(s, "id");
        let mut members: Vec<&str> = Vec::new();
        for m in arr(s, "nodes").iter().filter_map(Value::as_str) {
            if m == id {
                continue;
            }
            if sub_ids.contains(m) {
                parent_of.entry(m).or_insert(id);
            } else if rank.contains_key(m) && claimed.insert(m) {
                members.push(m);
            }
        }
        members.sort_by_key(|m| rank[m]);
        let title = str_of(s, "title");
        items.push(FlowSubgraph {
            id: id.to_string(),
            title: if title.trim().is_empty() {
                String::new()
            } else {
                title.to_string()
            },
            nodes: members.into_iter().map(str::to_string).collect(),
            parent: None,
            direction: SubgraphDirection::parse(str_of(s, "dir")),
        });
    }
    for item in &mut items {
        item.parent = parent_of.get(item.id.as_str()).map(|p| p.to_string());
    }
    order_parents_first(items)
}

/// 親が子より前に来るように並べ直す (TS の subgraph-tree.ts の orderParentsFirst と同じ)。
/// 親が一覧に無い・親子が輪になる枠は、親を外して図の直下に置く
fn order_parents_first(items: Vec<FlowSubgraph>) -> Vec<FlowSubgraph> {
    let index: HashMap<String, usize> = items
        .iter()
        .enumerate()
        .map(|(i, s)| (s.id.clone(), i))
        .collect();
    let mut placed = vec![false; items.len()];
    let mut path: HashSet<usize> = HashSet::new();
    let mut out = Vec::with_capacity(items.len());
    fn place(
        i: usize,
        items: &[FlowSubgraph],
        index: &HashMap<String, usize>,
        placed: &mut [bool],
        path: &mut HashSet<usize>,
        out: &mut Vec<FlowSubgraph>,
    ) {
        if placed[i] {
            return;
        }
        let mut item = items[i].clone();
        if let Some(parent) = &items[i].parent {
            match index.get(parent) {
                Some(&p) if !path.contains(&p) => {
                    path.insert(i);
                    place(p, items, index, placed, path, out);
                    path.remove(&i);
                    // 自分を親にした枠は、親を辿る途中で (親を外して) もう置かれている
                    if placed[i] {
                        return;
                    }
                }
                _ => item.parent = None,
            }
        }
        placed[i] = true;
        out.push(item);
    }
    for i in 0..items.len() {
        place(i, &items, &index, &mut placed, &mut path, &mut out);
    }
    out
}

fn arrow_type(edge: &Value, drops: &mut Drops) -> &'static str {
    let kind = str_of(edge, "type");
    let stroke = str_of(edge, "stroke");
    let exact = match (kind, stroke) {
        ("arrow_point", "normal") => Some("arrow"),
        ("arrow_point", "thick") => Some("thick"),
        ("arrow_point", "dotted") => Some("dotted"),
        ("arrow_open", "invisible") => Some("invisible"),
        ("double_arrow_point", "normal") => Some("bidirectional"),
        ("double_arrow_point", "thick") => Some("bidirectional-thick"),
        _ => None,
    };
    if let Some(t) = exact {
        return t;
    }
    let arrow = str_of(edge, "arrow");
    drops.add(
        format!("edge:{}", if arrow.is_empty() { kind } else { arrow }),
        1,
    );
    match (kind.starts_with("double_"), stroke) {
        (_, "invisible") => "invisible",
        (true, "thick") => "bidirectional-thick",
        (true, _) => "bidirectional",
        (false, "thick") => "thick",
        (false, "dotted") => "dotted",
        (false, _) => "arrow",
    }
}

// ---------- erDiagram ----------

fn er(model: &Value) -> Result<EditorPayload, CoreError> {
    let mut drops = Drops::default();
    accessibility_drop(&mut drops, model);
    drops.add(
        "classDef",
        model
            .get("classes")
            .and_then(Value::as_object)
            .map_or(0, |m| m.len()),
    );

    let entities = model
        .get("entities")
        .and_then(Value::as_object)
        .ok_or_else(|| shape_error("entities"))?;
    // serde_json の Map はキー順に並ぶので、merman が振った id の末尾 (出現順) で並べ直す
    let mut ordered: Vec<(&String, &Value)> = entities.iter().collect();
    ordered.sort_by_key(|(_, e)| {
        str_of(e, "id")
            .rsplit('-')
            .next()
            .and_then(|n| n.parse::<usize>().ok())
            .unwrap_or(usize::MAX)
    });

    // subgraph を関係の行き先にすると、関係はその subgraph の id を指し、同じ名前のテーブルも現れうる。
    // テーブルにせず、それを指す関係を落として数える (spec 11 で見つけた穴。以前は形の誤りで止まった。TS の取り込みと同じ)
    let subgraph_ids: HashSet<&str> = arr(model, "subgraphs")
        .iter()
        .filter_map(|s| s.get("id").and_then(Value::as_str))
        .collect();
    drops.add("subgraph", subgraph_ids.len());

    let mut name_of_id = HashMap::new();
    let mut nodes = Vec::new();
    for (name, e) in ordered {
        if subgraph_ids.contains(name.as_str()) {
            continue;
        }
        // 囲んだ名前の中の #quot; などは merman の内部の符号のまま入る。元の文字に戻す (spec 13 D1。TS の取り込みと同じ)
        let name = decode_text(name);
        name_of_id.insert(str_of(e, "id").to_string(), name.clone());
        drops.add("alias", usize::from(non_empty(e, "alias")));
        let classes = str_of(e, "cssClasses")
            .split_whitespace()
            .filter(|c| *c != "default")
            .count();
        drops.add("class", usize::from(classes > 0));
        drops.add("style", usize::from(non_empty(e, "cssStyles")));
        let mut columns = Vec::new();
        for a in arr(e, "attributes") {
            let keys: Vec<&str> = arr(a, "keys").iter().filter_map(Value::as_str).collect();
            drops.add("attribute_comment", usize::from(non_empty(a, "comment")));
            columns.push(ErColumn {
                name: str_of(a, "name").to_string(),
                kind: str_of(a, "type").to_string(),
                pk: keys.contains(&"PK"),
                // PK と UK はエディタで排他 (PK を優先。フォーク元の読み込みと同じ)
                uk: !keys.contains(&"PK") && keys.contains(&"UK"),
                fk: keys.contains(&"FK"),
            });
        }
        nodes.push(ErNode {
            id: name.clone(),
            name: name.clone(),
            columns,
        });
    }

    let mut edges = Vec::new();
    for r in arr(model, "relationships") {
        let (a, b) = (str_of(r, "entityA"), str_of(r, "entityB"));
        if subgraph_ids.contains(a) || subgraph_ids.contains(b) {
            drops.add("edge_to_subgraph", 1);
            continue;
        }
        let lookup = |id: &str| {
            name_of_id
                .get(id)
                .cloned()
                .ok_or_else(|| shape_error("relationships の entity id"))
        };
        let (source, target) = (lookup(a)?, lookup(b)?);
        let i = edges.len();
        let spec = r.get("relSpec").ok_or_else(|| shape_error("relSpec"))?;
        if str_of(spec, "relType") == "NON_IDENTIFYING" {
            drops.add("non_identifying", 1);
        }
        // cardB が左側 (source 側) の記号、cardA が右側の記号 (2026-09-24 実測)
        let cardinality = match (str_of(spec, "cardB"), str_of(spec, "cardA")) {
            ("ONLY_ONE", "ONLY_ONE") => "one-to-one",
            ("ONLY_ONE", "ZERO_OR_MORE") => "one-to-many",
            ("ZERO_OR_MORE", "ONLY_ONE") => "many-to-one",
            ("ZERO_OR_MORE", "ZERO_OR_MORE") => "many-to-many",
            ("ZERO_OR_ONE", "ONLY_ONE") => "zero-to-one",
            ("ONLY_ONE", "ZERO_OR_ONE") => "one-to-zero",
            ("ONLY_ONE", "ONE_OR_MORE") => "one-to-many-mandatory",
            _ => {
                drops.add("cardinality_unsupported", 1);
                "one-to-many"
            }
        };
        edges.push(ErEdge {
            id: format!("edge-{i}"),
            kind: "erEdge",
            source,
            target,
            data: ErEdgeData {
                label: decode_text(str_of(r, "roleA")),
                cardinality,
            },
        });
    }

    Ok(EditorPayload::ErDiagram {
        data: ErData {
            nodes,
            edges,
            direction: direction_of(model),
        },
        dropped: drops.into_vec(),
    })
}
