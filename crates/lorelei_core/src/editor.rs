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

fn direction_drop(drops: &mut Drops, model: &Value) {
    let dir = str_of(model, "direction");
    if !dir.is_empty() && dir != "TB" && dir != "TD" {
        drops.add(format!("direction:{dir}"), 1);
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
    direction_drop(&mut drops, model);
    accessibility_drop(&mut drops, model);
    drops.add("subgraph", arr(model, "subgraphs").len());
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

    let mut edges = Vec::new();
    let mut seen: HashMap<(String, String), usize> = HashMap::new();
    for e in arr(model, "edges") {
        let source = e
            .get("from")
            .and_then(Value::as_str)
            .ok_or_else(|| shape_error("edge.from"))?;
        let target = e
            .get("to")
            .and_then(Value::as_str)
            .ok_or_else(|| shape_error("edge.to"))?;
        if !ids.contains(source) || !ids.contains(target) {
            drops.add("edge_to_subgraph", 1);
            continue;
        }
        let arrow_type = arrow_type(e, &mut drops);
        drops.add("class", usize::from(non_empty(e, "classes")));
        drops.add("style", usize::from(non_empty(e, "style")));
        let length = e.get("length").and_then(Value::as_u64).unwrap_or(1);
        drops.add("edge_length", usize::from(length > 1));

        let n = seen
            .entry((source.to_string(), target.to_string()))
            .or_default();
        *n += 1;
        let id = if *n == 1 {
            format!("{source}-{target}")
        } else {
            format!("{source}-{target}-{n}")
        };
        edges.push(FlowEdge {
            id,
            source: source.to_string(),
            target: target.to_string(),
            label: str_of(e, "label").to_string(),
            arrow_type,
        });
    }

    Ok(EditorPayload::Flowchart {
        data: FlowData { nodes, edges },
        dropped: drops.into_vec(),
    })
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
    direction_drop(&mut drops, model);
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

    let mut name_of_id = HashMap::new();
    let mut nodes = Vec::new();
    for (name, e) in ordered {
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
            drops.add("fk", usize::from(keys.contains(&"FK")));
            drops.add("attribute_comment", usize::from(non_empty(a, "comment")));
            columns.push(ErColumn {
                name: str_of(a, "name").to_string(),
                kind: str_of(a, "type").to_string(),
                pk: keys.contains(&"PK"),
                uk: keys.contains(&"UK"),
            });
        }
        nodes.push(ErNode {
            id: name.clone(),
            name: name.clone(),
            columns,
        });
    }

    let mut edges = Vec::new();
    for (i, r) in arr(model, "relationships").iter().enumerate() {
        let lookup = |key: &str| {
            name_of_id
                .get(str_of(r, key))
                .cloned()
                .ok_or_else(|| shape_error("relationships の entity id"))
        };
        let (source, target) = (lookup("entityA")?, lookup("entityB")?);
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
                label: str_of(r, "roleA").to_string(),
                cardinality,
            },
        });
    }

    Ok(EditorPayload::ErDiagram {
        data: ErData { nodes, edges },
        dropped: drops.into_vec(),
    })
}
