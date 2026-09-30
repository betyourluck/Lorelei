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
