/**
 * spec 24 P2: 図の先頭のテーマを、TS の取り込み (mermaid.js) と Rust の取り込み (lorelei_core::to_editor) が同じに読むことを
 * 確かめる fixture。生成器の出力 (テーマを frontmatter で書く) と、AI が書きうる形 (init・base・themeVariables など) を、
 * ここで本物の mermaid.js の取り込みに通して期待どおりかを検め、crates/lorelei_core/tests/editor.rs が同じ入力で
 * 同じテーマと消えるものになることを検める。
 * 生成器か取り込みを変えてこのテストが落ちたら、LORELEI_UPDATE_FIXTURES=1 で回して fixture を書き直し、Rust のテストも回す
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Edge, Node } from "@xyflow/react";
import { describe, expect, test, vi } from "vitest";
import type { DroppedItem } from "@/components/ui/mermaid-dropped";
import { MERMAID_THEMES } from "@/components/ui/mermaid-theme";
import type { ERTableNodeProps } from "@/features/er-diagram/components/node/er-table-node";
import { generateERDiagramMermaidCode } from "@/features/er-diagram/utils/generate-mermaid-code";
import { readErForImport } from "@/features/er-diagram/utils/import-er";
import { generateMermaidCode } from "@/features/flowchart/hooks/mermaid";
import { readFlowchartForImport } from "@/features/flowchart/utils/import-flowchart";

vi.unmock("@/components/ui/mermaid-render");

const FIXTURE = path.resolve(__dirname, "../../crates/lorelei_core/tests/fixtures/themes.json");

const flowNodes: Node[] = [
  {
    id: "A",
    type: "editableNode",
    position: { x: 0, y: 0 },
    data: { label: "開始", variableName: "A", shapeType: "rectangle" },
  },
  {
    id: "B",
    type: "editableNode",
    position: { x: 0, y: 100 },
    data: { label: "判定", variableName: "B", shapeType: "diamond" },
  },
];
const flowEdges: Edge[] = [
  { id: "A-B", source: "A", target: "B", data: { label: "", arrowType: "arrow" } },
];

const erNodes = [
  {
    id: "1",
    type: "erTable",
    position: { x: 0, y: 0 },
    data: { name: "顧客", columns: [{ id: "c1", name: "id", type: "int", pk: true, uk: false }] },
  },
  {
    id: "2",
    type: "erTable",
    position: { x: 0, y: 100 },
    data: { name: "注文", columns: [{ id: "c2", name: "id", type: "int", pk: true, uk: false }] },
  },
] as unknown as Node<ERTableNodeProps>[];
const erEdges: Edge[] = [
  {
    id: "e",
    source: "1",
    target: "2",
    type: "erEdge",
    data: { label: "行う", cardinality: "one-to-many" },
  },
];

const FLOW = "flowchart LR\n  A --> B\n";
const ER = "erDiagram\n  A ||--o{ B : has\n";

interface Case {
  name: string;
  kind: "flowchart" | "erDiagram";
  source: string;
  /** エディタが持つテーマ (default と書いていない時は null) */
  theme: string | null;
  dropped: DroppedItem[];
}

const drop = (construct: string): DroppedItem => ({ construct, count: 1 });

const CASES: Case[] = [
  // 生成器の出力 (default は何も書かない)
  ...MERMAID_THEMES.map((theme) => ({
    name: `生成器 フローチャート ${theme}`,
    kind: "flowchart" as const,
    source: generateMermaidCode({ nodes: flowNodes, edges: flowEdges }, "LR", theme),
    theme: theme === "default" ? null : theme,
    dropped: [],
  })),
  ...MERMAID_THEMES.map((theme) => ({
    name: `生成器 ER 図 ${theme}`,
    kind: "erDiagram" as const,
    source: generateERDiagramMermaidCode(erNodes, erEdges, "TD", theme),
    theme: theme === "default" ? null : theme,
    dropped: [],
  })),
  // AI が書きうる形
  {
    name: "init のテーマ",
    kind: "flowchart",
    source: `%%{init: {"theme": "forest"}}%%\n${FLOW}`,
    theme: "forest",
    dropped: [],
  },
  {
    name: "ER 図の init のテーマ",
    kind: "erDiagram",
    source: `%%{init: {"theme": "dark"}}%%\n${ER}`,
    theme: "dark",
    dropped: [],
  },
  {
    name: "frontmatter と init の両方 (init が勝つ)",
    kind: "flowchart",
    source: `---\nconfig:\n  theme: dark\n---\n%%{init: {"theme": "forest"}}%%\n${FLOW}`,
    theme: "forest",
    dropped: [],
  },
  {
    name: "base と themeVariables とフローチャートの設定 (title は設定ではない)",
    kind: "flowchart",
    source: `---\ntitle: T\nconfig:\n  theme: base\n  themeVariables:\n    primaryColor: "#6A7FAB"\n  flowchart:\n    rankSpacing: 80\n---\n${FLOW}`,
    theme: null,
    dropped: [drop("config:flowchart"), drop("config:themeVariables"), drop("theme:base")],
  },
  {
    name: "選べないテーマ",
    kind: "flowchart",
    source: `---\nconfig:\n  theme: neo\n---\n${FLOW}`,
    theme: null,
    dropped: [drop("theme:neo")],
  },
  {
    name: "文字でないテーマは黙って無視",
    kind: "flowchart",
    source: `%%{init: {"theme": 3}}%%\n${FLOW}`,
    theme: null,
    dropped: [],
  },
  {
    name: "wrap のディレクティブ",
    kind: "flowchart",
    source: `%%{wrap}%%\n${FLOW}`,
    theme: null,
    dropped: [drop("config:wrap")],
  },
  {
    name: "init の config は図の種類の設定になる",
    kind: "flowchart",
    source: `%%{init: {"config": {"rankSpacing": 10}}}%%\n${FLOW}`,
    theme: null,
    dropped: [drop("config:flowchart")],
  },
  {
    // securityLevel は mermaid.js が図の設定から消す (数えない)。fontFamily は themeVariables にも写る (mermaid.js も merman も)
    name: "守られる鍵",
    kind: "flowchart",
    source: `%%{init: {"securityLevel": "loose", "themeCSS": "x", "fontFamily": "y"}}%%\n${FLOW}`,
    theme: null,
    dropped: [drop("config:fontFamily"), drop("config:themeCSS"), drop("config:themeVariables")],
  },
];

const read = async (c: Case) => {
  const r =
    c.kind === "flowchart"
      ? await readFlowchartForImport(c.source)
      : await readErForImport(c.source);
  if (!r.ok) throw new Error(`${c.name}: ${r.error}`);
  return { theme: r.data.theme ?? null, dropped: r.dropped };
};

describe("Rust の取り込みのテストへ渡すテーマの fixture (spec 24 P2)", () => {
  test("TS の取り込みが期待どおりに読み、fixture が今の生成器の出力と同じ", async () => {
    for (const c of CASES) {
      expect(await read(c), c.name).toEqual({ theme: c.theme, dropped: c.dropped });
    }
    if (process.env.LORELEI_UPDATE_FIXTURES) {
      writeFileSync(FIXTURE, `${JSON.stringify(CASES, null, 2)}\n`);
    }
    expect(JSON.parse(readFileSync(FIXTURE, "utf8"))).toEqual(CASES);
  }, 60000);
});
