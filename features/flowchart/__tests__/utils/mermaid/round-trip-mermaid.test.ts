/**
 * spec 11 D5: コード生成のコードが mermaid.js で通り、インポート (mermaid.js の解析) で元に戻る。
 * 本物の mermaid を使う (境界 mermaid-render は __tests__/setup.ts で模擬しているので、このファイルでは外す)
 */
import { describe, expect, test, vi } from "vitest";
import { readMermaidDiagram } from "@/components/ui/mermaid-render";
import type { FlowData } from "@/features/flowchart/hooks/flow-helpers";
import { generateMermaidCode } from "@/features/flowchart/hooks/mermaid";
import type { MermaidArrowType, MermaidShapeType } from "@/features/flowchart/types/types";
import { flowFromMermaid } from "@/features/flowchart/utils/from-mermaid";

vi.unmock("@/components/ui/mermaid-render");

// `<b>` のような HTML は入れない: mermaid.js はラベルを HTML として扱い `<b></b>` に整える (`<br>` で改行したい人のために、生成器は < > をそのまま書く)
const LABELS = ["処理(1)", "a:b", 'say "hi"', "x[y]", "{z}", "A;B", "#1", "#1;", "a|b", "100%", "API/データ取得", "ユーザー入力？", ""];

// spec 15 D8: mermaid.js は囲みの中でも `direction` + 空白 + 向き を行のどこでも向きの指定として食い、その行のノードと線が黙って消える
const DIRECTION_LABELS = [
  "direction LR",
  "x direction TB",
  "direction  BT",
  "direction\tRL",
  "direction TD",
  "Direction LR",
  "DIRECTION LR",
  "direction lr",
  "向き direction LR (右へ)",
];

const flowData = (label: string, shapeType: MermaidShapeType, arrowType: MermaidArrowType): FlowData =>
  ({
    nodes: [
      { id: "n1", type: "default", position: { x: 0, y: 0 }, data: { label, variableName: "A", shapeType } },
      { id: "n2", type: "default", position: { x: 0, y: 0 }, data: { label: "B", variableName: "B", shapeType: "rectangle" } },
    ],
    edges: [{ id: "e", source: "n1", target: "n2", data: { label, arrowType } }],
  }) as unknown as FlowData;

describe("コード生成 → インポートの往復 (mermaid.js)", () => {
  test.each([...LABELS, ...DIRECTION_LABELS])("ラベル %s が形・矢印ごとに元に戻る", async (label) => {
    for (const [shapeType, arrowType] of [
      ["rectangle", "arrow"],
      ["circle", "thick"],
      ["diamond", "dotted"],
      ["stadium", "bidirectional"],
    ] as [MermaidShapeType, MermaidArrowType][]) {
      const code = generateMermaidCode(flowData(label, shapeType, arrowType), "TD");
      const snapshot = await readMermaidDiagram(code);
      if (snapshot.kind !== "flowchart") throw new Error(code);
      const { data, dropped } = flowFromMermaid(snapshot);
      expect(data.nodes[0], code).toMatchObject({ id: "A", label, shapeType });
      expect(data.edges[0], code).toMatchObject({ label, arrowType });
      expect(dropped, code).toEqual([]);
    }
  });
});

// spec 15 D2: 枠 (サブグラフ) の往復。生成器は枠を subgraph ID["題"] … end で囲み、線を全部外に書く
const node = (id: string, parentId?: string) => ({
  id,
  type: "editableNode",
  position: { x: 0, y: 0 },
  ...(parentId ? { parentId } : {}),
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

async function readBack(flowData: FlowData) {
  const code = generateMermaidCode(flowData, "TD");
  const snapshot = await readMermaidDiagram(code);
  if (snapshot.kind !== "flowchart") throw new Error(code);
  return { code, ...flowFromMermaid(snapshot) };
}

describe("枠のコード生成 → インポートの往復 (mermaid.js)", () => {
  test("入れ子・空の枠・枠の外のノード・枠をまたぐ線", async () => {
    const flowData = {
      nodes: [
        frame("O", "外"),
        frame("I", "内", "O"),
        frame("E", "空"),
        node("A", "f-I"),
        node("B", "f-O"),
        node("C"),
      ],
      edges: [edge("A", "B"), edge("B", "C"), edge("A", "C")],
    } as unknown as FlowData;
    const { code, data, dropped } = await readBack(flowData);
    expect(code).toBe(
      [
        "flowchart TD",
        '    subgraph O["外"]',
        '        subgraph I["内"]',
        "            A[a]",
        "        end",
        "        B[b]",
        "    end",
        '    subgraph E["空"]',
        "    end",
        "    C[c]",
        "    A --> B",
        "    B --> C",
        "    A --> C",
        "",
      ].join("\n")
    );
    expect(data.subgraphs).toEqual([
      { id: "O", title: "外", nodes: ["B"] },
      { id: "I", title: "内", nodes: ["A"], parent: "O" },
      { id: "E", title: "空", nodes: [] },
    ]);
    expect(data.nodes.map((n) => n.id)).toEqual(["A", "B", "C"]);
    expect(data.edges.map((e) => [e.source, e.target])).toEqual([
      ["A", "B"],
      ["B", "C"],
      ["A", "C"],
    ]);
    expect(dropped).toEqual([]);
  });

  const TITLES = [
    "受付 審査",
    "a(b)",
    "a[b]",
    "a{b}",
    'say "hi"',
    "#1;",
    "#quot;",
    "a;b",
    "a:b",
    "a|b",
    "end",
    "subgraph",
    "direction LR",
    "x direction TB",
    "a-->b",
    "",
    "1abc",
    "a\\b",
    "50%",
    "a&b",
    "a%%b",
    "S",
  ];
  test.each(TITLES)("題 %s が元に戻る", async (title) => {
    const { code, data, dropped } = await readBack({
      nodes: [frame("S", title), node("A", "f-S")],
      edges: [],
    } as unknown as FlowData);
    expect(data.subgraphs, code).toEqual([{ id: "S", title, nodes: ["A"] }]);
    expect(dropped, code).toEqual([]);
  });

  test("枠の ID は安全な変数名にする", async () => {
    const { code, data } = await readBack({
      nodes: [frame("end", "e"), node("A", "f-end")],
      edges: [],
    } as unknown as FlowData);
    expect(code).toContain('subgraph node_end["e"]');
    expect(data.subgraphs).toEqual([{ id: "node_end", title: "e", nodes: ["A"] }]);
  });

  test("親子が輪になった枠も書き落とさない (図の直下に書く)", async () => {
    const { data } = await readBack({
      nodes: [frame("X", "x", "Y"), frame("Y", "y", "X"), node("A", "f-X")],
      edges: [],
    } as unknown as FlowData);
    expect(data.nodes.map((n) => n.id)).toEqual(["A"]);
    expect(data.subgraphs?.map((s) => s.id).sort()).toEqual(["X", "Y"]);
  });
});

// spec 16 D3: 枠の中の向きと、枠を指す線の往復。向きは subgraph の次の行、枠を指す線も全部最後に外
describe("枠の向き・枠を指す線のコード生成 → インポートの往復 (mermaid.js)", () => {
  test("向きと枠を指す線 (外 → 枠・枠 → 枠・枠 → 外・自己ループ) が戻る", async () => {
    const flowData = {
      nodes: [
        frame("S", "受付", undefined, "LR"),
        frame("T", "審査", "S", "BT"),
        frame("U", "通知"),
        node("A", "f-S"),
        node("B", "f-T"),
        node("C"),
      ],
      edges: [edge("C", "f-S"), edge("f-S", "f-U"), edge("f-U", "C"), edge("f-U", "f-U"), edge("A", "B")],
    } as unknown as FlowData;
    const { code, data, dropped } = await readBack(flowData);
    expect(code).toBe(
      [
        "flowchart TD",
        '    subgraph S["受付"]',
        "        direction LR",
        '        subgraph T["審査"]',
        "            direction BT",
        "            B[b]",
        "        end",
        "        A[a]",
        "    end",
        '    subgraph U["通知"]',
        "    end",
        "    C[c]",
        "    C --> S",
        "    S --> U",
        "    U --> C",
        "    U --> U",
        "    A --> B",
        "",
      ].join("\n")
    );
    expect(data.subgraphs).toEqual([
      { id: "S", title: "受付", nodes: ["A"], direction: "LR" },
      { id: "T", title: "審査", nodes: ["B"], parent: "S", direction: "BT" },
      { id: "U", title: "通知", nodes: [] },
    ]);
    // ノードは最初に出た順 (子の枠 T の中の B を A より前に書く)。merman も同じ (fixture flow_subgraphs.json)
    expect(data.nodes.map((n) => n.id)).toEqual(["B", "A", "C"]);
    expect(data.edges.map((e) => [e.source, e.target])).toEqual([
      ["C", "S"],
      ["S", "U"],
      ["U", "C"],
      ["U", "U"],
      ["A", "B"],
    ]);
    expect(dropped).toEqual([]);
  });

  test.each(["TB", "BT", "LR", "RL"])("向き %s が戻る", async (direction) => {
    const { code, data, dropped } = await readBack({
      nodes: [frame("S", "s", undefined, direction), node("A", "f-S")],
      edges: [],
    } as unknown as FlowData);
    expect(data.subgraphs, code).toEqual([{ id: "S", title: "s", nodes: ["A"], direction }]);
    expect(dropped, code).toEqual([]);
  });

  test("枠を指す線の端は枠の安全な変数名で書く", async () => {
    const { code, data } = await readBack({
      nodes: [frame("end", "e"), node("A", "f-end"), node("B")],
      edges: [edge("B", "f-end")],
    } as unknown as FlowData);
    expect(code).toContain("    B --> node_end\n");
    expect(data.edges.map((e) => [e.source, e.target])).toEqual([["B", "node_end"]]);
  });

  test("枠と自分の中を結ぶ線は書かない (描画されない, 裁定 2)", async () => {
    const { code } = await readBack({
      nodes: [frame("P", "p"), frame("S", "s", "P"), node("A", "f-S"), node("B")],
      edges: [edge("f-P", "A"), edge("A", "f-S"), edge("f-P", "f-S"), edge("B", "A")],
    } as unknown as FlowData);
    expect(code.split("\n").filter((l) => l.includes("-->"))).toEqual(["    B --> A"]);
  });
});
