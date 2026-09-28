/**
 * spec 11 D1: フローチャートの取り込みを mermaid.js の解析の結果から作る。
 * 対応は MCP の経路 (Rust の lorelei_core::editor::to_editor) と同じ。crates/lorelei_core/tests/editor.rs と同じ入力で同じ出力になることを確かめる。
 * 本物の mermaid を使う (境界 mermaid-render は __tests__/setup.ts で模擬しているので、このファイルでは外す)
 */
import { describe, expect, test, vi } from "vitest";
import { readMermaidDiagram } from "@/components/ui/mermaid-render";
import { flowFromMermaid } from "@/features/flowchart/utils/from-mermaid";

vi.unmock("@/components/ui/mermaid-render");

async function flow(source: string) {
  const snapshot = await readMermaidDiagram(source);
  if (snapshot.kind !== "flowchart") throw new Error(`not flowchart: ${snapshot.kind}`);
  return flowFromMermaid(snapshot);
}
const d = (construct: string, count: number) => ({ construct, count });
const ids = (r: Awaited<ReturnType<typeof flow>>) => r.data.nodes.map((n) => n.id);
const pairs = (r: Awaited<ReturnType<typeof flow>>) => r.data.edges.map((e) => [e.source, e.target]);

describe("flowFromMermaid — フォーク元が壊した入力", () => {
  test("連鎖した矢印で真ん中のノードが残る", async () => {
    const r = await flow("flowchart TD\n  A[a] --> B[b] --> C[c]\n");
    expect(ids(r)).toEqual(["A", "B", "C"]);
    expect(pairs(r)).toEqual([
      ["A", "B"],
      ["B", "C"],
    ]);
    expect(r.dropped).toEqual([]);
  });

  test("& ・ --- ・ 行末の ; ・ ::: で図が空にならない", async () => {
    expect(pairs(await flow("flowchart TD\n  A[a] & B[b] --> C[c]\n"))).toEqual([
      ["A", "C"],
      ["B", "C"],
    ]);
    const open = await flow("flowchart TD\n  A[a] --- B[b]\n");
    expect(pairs(open)).toEqual([["A", "B"]]);
    expect(open.dropped).toEqual([d("edge:---", 1)]);
    expect(pairs(await flow("graph TD;\n  A[a]-->B[b];\n"))).toEqual([["A", "B"]]);
    const cls = await flow("flowchart TD\n  A[a]:::hot --> B[b]\n  classDef hot fill:#f96\n");
    expect(pairs(cls)).toEqual([["A", "B"]]);
    expect(cls.dropped).toEqual([d("class", 1), d("classDef", 1)]);
  });

  test("subgraph は知らせ、ノードにならない (end も)", async () => {
    const r = await flow(
      "flowchart TD\n  subgraph S1[受注]\n    A[受付] --> B[確認]\n  end\n  B --> C[出荷]\n  C --> S1\n"
    );
    expect(ids(r)).toEqual(["A", "B", "C"]);
    expect(pairs(r)).toEqual([
      ["A", "B"],
      ["B", "C"],
    ]);
    expect(r.dropped).toEqual([d("edge_to_subgraph", 1), d("subgraph", 1)]);
  });

  test("style ・ linkStyle ・ click を数え、向きを写す", async () => {
    const r = await flow(
      'flowchart LR\n  %% コメントは数えない\n  A[a] --> B[b]\n  style A fill:#f9f\n  linkStyle 0 stroke:#f00\n  click B "https://example.com"\n'
    );
    expect(r.dropped).toEqual([d("click", 1), d("style", 2)]);
    expect(r.data.direction).toBe("LR");
  });
});

describe("flowFromMermaid — 対応表", () => {
  test("向き: TB は TD と同じ意味で、TD の時は持たない", async () => {
    for (const [src, want] of [
      ["flowchart LR\n  A --> B\n", "LR"],
      ["flowchart RL\n  A --> B\n", "RL"],
      ["flowchart BT\n  A --> B\n", "BT"],
      ["graph LR\n  A --> B\n", "LR"],
      ["flowchart TB\n  A --> B\n", undefined],
      ["flowchart TD\n  A --> B\n", undefined],
    ] as const) {
      const r = await flow(src);
      expect(r.data.direction, src).toBe(want);
      expect(r.dropped, src).toEqual([]);
    }
  });

  test("形と矢印", async () => {
    const r = await flow(
      "flowchart TD\n  a[sq] --> b(round)\n  b ==> c{dia}\n  c -.-> d((circ))\n  d ~~~ e{{hex}}\n  e <--> f([stad])\n  f <==> g[[sub]]\n  g --o h[(cyl)]\n"
    );
    expect(r.data.nodes.map((n) => n.shapeType)).toEqual([
      "rectangle",
      "rounded",
      "diamond",
      "circle",
      "hexagon",
      "stadium",
      "rectangle",
      "rectangle",
    ]);
    expect(r.data.edges.map((e) => e.arrowType)).toEqual([
      "arrow",
      "thick",
      "dotted",
      "invisible",
      "bidirectional",
      "bidirectional-thick",
      "arrow",
    ]);
    expect(r.dropped).toEqual([d("edge:--o", 1), d("shape:cylinder", 1), d("shape:subroutine", 1)]);
  });

  test("ラベルを保ち、同じ組の線に別の ID を付ける", async () => {
    const r = await flow("flowchart TD\n  A[開始] -->|はい| B[完了]\n  A -- いいえ --> B\n");
    expect(r.data.nodes[0]).toMatchObject({ id: "A", variableName: "A", label: "開始" });
    expect(r.data.edges.map((e) => e.id)).toEqual(["A-B", "A-B-2"]);
    expect(r.data.edges.map((e) => e.label)).toEqual(["はい", "いいえ"]);
  });

  test("日本語のノード ID と、subgraph ・ class ・ style ・ click の中の日本語", async () => {
    const r = await flow(
      'flowchart TD\n  subgraph 受注\n    受付 --> 確認\n  end\n  確認 --> 受注\n  classDef 強調 fill:#f96\n  class 受付 強調\n  style 確認 fill:#9f6\n  click 確認 "https://example.com"\n  受付:::強調 --> 完了ー\n'
    );
    expect(ids(r)).toEqual(["受付", "確認", "完了ー"]);
    expect(pairs(r)).toEqual([
      ["受付", "確認"],
      ["受付", "完了ー"],
    ]);
    expect(r.dropped).toEqual([
      d("class", 1),
      d("classDef", 1),
      d("click", 1),
      d("edge_to_subgraph", 1),
      d("style", 1),
      d("subgraph", 1),
    ]);
  });

  test("括弧の無いノードは四角で、落としたものにしない", async () => {
    const r = await flow("flowchart TD\n  A --> B\n");
    expect(r.data.nodes.map((n) => n.shapeType)).toEqual(["rectangle", "rectangle"]);
    expect(r.dropped).toEqual([]);
  });

  test("引用符の中の特殊文字と #quot; は元の文字に戻す", async () => {
    const r = await flow('flowchart TD\n  A["処理(1)"] -->|"say #quot;hi#quot;"| B["x[y] & {z}"]\n');
    expect(r.data.nodes.map((n) => n.label)).toEqual(["処理(1)", "x[y] & {z}"]);
    expect(r.data.edges[0].label).toBe('say "hi"');
  });

  // ---------- rev1 (査読) ----------

  test("関数の click も数える (strict では haveCallback が付かず、印は class の clickable だけ)", async () => {
    const r = await flow("flowchart TD\n  A --> B\n  click A callback\n");
    expect(r.dropped).toEqual([d("click", 1)]);
  });

  test("@{ shape } の書き方の形もエディタの形に写す", async () => {
    const r = await flow(
      "flowchart TD\n  A@{ shape: rect } --> B@{ shape: rounded }\n  C@{ shape: diam } --> D@{ shape: hex }\n  E@{ shape: stadium } --> F@{ shape: circle }\n"
    );
    expect(r.data.nodes.map((n) => n.shapeType)).toEqual(["rectangle", "rounded", "diamond", "hexagon", "stadium", "circle"]);
    expect(r.dropped).toEqual([]);
  });

  test("線の ID は - を含むノード ID でもぶつからない", async () => {
    const r = await flow("flowchart TD\n  a-b --> c\n  a --> b-c\n");
    const edgeIds = r.data.edges.map((e) => e.id);
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
    expect(edgeIds[0]).toBe("a-b-c");
  });

  test("空白だけのラベルは空にする (生成器は空のラベルを [\" \"] と書く)", async () => {
    const r = await flow('flowchart TD\n  A[" "] --> B\n');
    expect(r.data.nodes[0].label).toBe("");
  });

  test("長い矢印は知らせる", async () => {
    const r = await flow("flowchart TD\n  A ---> B\n");
    expect(r.data.edges[0].arrowType).toBe("arrow");
    expect(r.dropped).toEqual([d("edge_length", 1)]);
  });
});
