/**
 * mermaid.js の解析の結果 (ErSnapshot) をエディタの取り込みの形 (ParsedMermaidERData) にする (spec 11 D1)。
 * 対応は MCP の経路 (Rust の lorelei_core::editor::er、data_contract の EditorPayload.mapping.erDiagram) と同じ
 */
import { DropCounter, type DroppedItem } from "@/components/ui/mermaid-dropped";
import type { ErSnapshot } from "@/components/ui/mermaid-snapshot";
import { directionOf } from "@/features/flowchart/utils/from-mermaid";
import type { ERColumn } from "../components/node/er-table-content";
import type { ParsedMermaidERData } from "./import-mermaid-to-er";

/** (左側 = cardB, 右側 = cardA) → エディタの多重度。表に無い組は one-to-many にして知らせる */
export const CARDINALITY: Record<string, string> = {
  "ONLY_ONE,ONLY_ONE": "one-to-one",
  "ONLY_ONE,ZERO_OR_MORE": "one-to-many",
  "ZERO_OR_MORE,ONLY_ONE": "many-to-one",
  "ZERO_OR_MORE,ZERO_OR_MORE": "many-to-many",
  "ZERO_OR_ONE,ONLY_ONE": "zero-to-one",
  "ONLY_ONE,ZERO_OR_ONE": "one-to-zero",
  "ONLY_ONE,ONE_OR_MORE": "one-to-many-mandatory",
};

export function erFromMermaid(snapshot: ErSnapshot): { data: ParsedMermaidERData; dropped: DroppedItem[] } {
  const drops = new DropCounter();
  drops.add("accessibility", snapshot.accessibility);
  drops.add("classDef", snapshot.classDefs);

  // subgraph を関係の行き先にすると、mermaid は同じ名前のテーブルも作り、関係はその subgraph の id を指す (rev1、査読 2)
  const subgraphIds = new Set(snapshot.subgraphs.map((s) => s.id));
  drops.add("subgraph", snapshot.subgraphs.length);
  const tables = snapshot.entities.filter((e) => !subgraphIds.has(e.name));
  const names = new Set(tables.map((e) => e.name));

  const nodes = tables.map((e) => {
    drops.add("alias", e.alias ? 1 : 0);
    drops.add("class", e.classes.length > 0 ? 1 : 0);
    drops.add("style", e.styles.length > 0 ? 1 : 0);
    const columns: ERColumn[] = e.attributes.map((a) => {
      drops.add("attribute_comment", a.comment ? 1 : 0);
      const pk = a.keys.includes("PK");
      // PK と UK はエディタで排他 (PK を優先。フォーク元の読み込みと同じ)
      const uk = !pk && a.keys.includes("UK");
      return { name: a.name, type: a.type, pk, uk, fk: a.keys.includes("FK") };
    });
    // 別名ではなく識別子を名前にする
    return { id: e.name, name: e.name, columns };
  });

  const relationships = snapshot.relationships.filter((r) => {
    if (names.has(r.from) && names.has(r.to)) return true;
    drops.add("edge_to_subgraph");
    return false;
  });
  const edges = relationships.map((r, i) => {
    if (r.relType === "NON_IDENTIFYING") drops.add("non_identifying");
    let cardinality = CARDINALITY[`${r.cardB},${r.cardA}`];
    if (!cardinality) {
      drops.add("cardinality_unsupported");
      cardinality = "one-to-many";
    }
    return {
      id: `edge-${i}`,
      type: "erEdge",
      source: r.from,
      target: r.to,
      data: { label: r.label, cardinality },
    };
  });

  const direction = directionOf(snapshot.direction);
  return { data: direction ? { nodes, edges, direction } : { nodes, edges }, dropped: drops.toList() };
}
