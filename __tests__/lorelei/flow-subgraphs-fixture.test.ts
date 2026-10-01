/**
 * spec 15 P2: フローチャートの生成器の枠の出力を、Rust の取り込み (lorelei_core::to_editor) のテストへ渡す fixture。
 * 生成器のコードは mermaid.js (TS の取り込み) と merman (デスクトップで開き直す・MCP) の両方が読む。TS の往復は
 * features/flowchart/__tests__/utils/mermaid/round-trip-mermaid.test.ts の「枠」、Rust は crates/lorelei_core/tests/editor.rs が
 * 同じ入力で、fixture の nodes・subgraphs に戻ることを検める。
 * 生成器を変えてこのテストが落ちたら、LORELEI_UPDATE_FIXTURES=1 で回して fixture を書き直し、Rust のテストも回す
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { FlowData } from "@/features/flowchart/hooks/flow-helpers";
import { generateMermaidCode, type ParsedMermaidSubgraph } from "@/features/flowchart/hooks/mermaid";

const FIXTURE = path.resolve(__dirname, "../../crates/lorelei_core/tests/fixtures/flow_subgraphs.json");

const node = (id: string, parentId?: string) => ({
  id,
  type: "editableNode",
  position: { x: 0, y: 0 },
  ...(parentId ? { parentId: `f-${parentId}` } : {}),
  data: { label: id.toLowerCase(), variableName: id, shapeType: "rectangle" },
});
const frame = (id: string, title: string, parentId?: string, direction?: string) => ({
  id: `f-${id}`,
  type: "subgraphNode",
  position: { x: 0, y: 0 },
  ...(parentId ? { parentId: `f-${parentId}` } : {}),
  data: { variableName: id, title, ...(direction ? { direction } : {}) },
});
const edge = (source: string, target: string) => ({
  id: `${source}-${target}`,
  source,
  target,
  data: { label: "", arrowType: "arrow" },
});

interface Case {
  name: string;
  flow: { nodes: unknown[]; edges: unknown[] };
  nodes: string[];
  subgraphs: ParsedMermaidSubgraph[];
  /** 戻るべき線の端 (spec 16 から。無い場面は線を確かめない) */
  edges?: [string, string][];
}

// round-trip-mermaid.test.ts の TITLES と同じ
const TITLES = [
  "受付 審査", "a(b)", "a[b]", "a{b}", 'say "hi"', "#1;", "#quot;", "a;b", "a:b", "a|b", "end", "subgraph",
  "direction LR", "x direction TB", "a-->b", "", "1abc", "a\\b", "50%", "a&b", "a%%b", "S",
];

const CASES: Case[] = [
  {
    name: "入れ子・空の枠・枠の外のノード・枠をまたぐ線",
    flow: {
      nodes: [frame("O", "外"), frame("I", "内", "O"), frame("E", "空"), node("A", "I"), node("B", "O"), node("C")],
      edges: [edge("A", "B"), edge("B", "C"), edge("A", "C")],
    },
    nodes: ["A", "B", "C"],
    subgraphs: [
      { id: "O", title: "外", nodes: ["B"] },
      { id: "I", title: "内", nodes: ["A"], parent: "O" },
      { id: "E", title: "空", nodes: [] },
    ],
  },
  {
    name: "安全な ID (end)",
    flow: { nodes: [frame("end", "e"), node("A", "end")], edges: [] },
    nodes: ["A"],
    subgraphs: [{ id: "node_end", title: "e", nodes: ["A"] }],
  },
  // spec 16 D3: 枠の中の向きと枠を指す線 (round-trip-mermaid.test.ts の「枠の向き・枠を指す線」と同じ)
  {
    name: "枠の向きと枠を指す線 (外 → 枠・枠 → 枠・枠 → 外・自己ループ)",
    flow: {
      nodes: [
        frame("S", "受付", undefined, "LR"),
        frame("T", "審査", "S", "BT"),
        frame("U", "通知"),
        node("A", "S"),
        node("B", "T"),
        node("C"),
      ],
      edges: [edge("C", "f-S"), edge("f-S", "f-U"), edge("f-U", "C"), edge("f-U", "f-U"), edge("A", "B")],
    },
    // 最初に出た順 (子の枠 T の中の B を A より前に書く。mermaid.js も同じ)
    nodes: ["B", "A", "C"],
    subgraphs: [
      { id: "S", title: "受付", nodes: ["A"], direction: "LR" },
      { id: "T", title: "審査", nodes: ["B"], parent: "S", direction: "BT" },
      { id: "U", title: "通知", nodes: [] },
    ],
    edges: [
      ["C", "S"],
      ["S", "U"],
      ["U", "C"],
      ["U", "U"],
      ["A", "B"],
    ],
  },
  ...(["TB", "BT", "LR", "RL"] as const).map((direction) => ({
    name: `向き ${direction}`,
    flow: { nodes: [frame("S", "s", undefined, direction), node("A", "S")], edges: [] },
    nodes: ["A"],
    subgraphs: [{ id: "S", title: "s", nodes: ["A"], direction }],
  })),
  {
    name: "枠を指す線の端は安全な変数名 (end)",
    flow: { nodes: [frame("end", "e"), node("A", "end"), node("B")], edges: [edge("B", "f-end")] },
    nodes: ["A", "B"],
    subgraphs: [{ id: "node_end", title: "e", nodes: ["A"] }],
    edges: [["B", "node_end"]],
  },
  ...TITLES.map((title) => ({
    name: `題 ${JSON.stringify(title)}`,
    flow: { nodes: [frame("S", title), node("A", "S")], edges: [] },
    nodes: ["A"],
    subgraphs: [{ id: "S", title, nodes: ["A"] }],
  })),
];

describe("Rust の取り込みのテストへ渡す fixture (spec 15 P2)", () => {
  test("fixture が今の生成器の出力と同じ", () => {
    const expected = CASES.map(({ name, flow, nodes, subgraphs, edges }) => ({
      name,
      source: generateMermaidCode(flow as unknown as FlowData, "TD"),
      nodes,
      subgraphs,
      ...(edges ? { edges } : {}),
    }));
    if (process.env.LORELEI_UPDATE_FIXTURES) {
      writeFileSync(FIXTURE, `${JSON.stringify(expected, null, 2)}\n`);
    }
    expect(JSON.parse(readFileSync(FIXTURE, "utf8"))).toEqual(expected);
  });
});
