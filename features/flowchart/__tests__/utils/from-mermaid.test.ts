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

  test("subgraph は枠になり、ノードにならない (end も)。枠を指す線は枠につなぐ (spec 16)", async () => {
    const r = await flow(
      "flowchart TD\n  subgraph S1[受注]\n    A[受付] --> B[確認]\n  end\n  B --> C[出荷]\n  C --> S1\n"
    );
    expect(ids(r)).toEqual(["A", "B", "C"]);
    expect(pairs(r)).toEqual([
      ["A", "B"],
      ["B", "C"],
      ["C", "S1"],
    ]);
    expect(r.data.subgraphs).toEqual([{ id: "S1", title: "受注", nodes: ["A", "B"] }]);
    expect(r.dropped).toEqual([]);
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
    expect(r.data.subgraphs).toEqual([{ id: "受注", title: "受注", nodes: ["受付", "確認"] }]);
    // 確認 --> 受注 は枠とその中を結ぶ線 (描画されない, spec 16 裁定 2)
    expect(r.dropped).toEqual([
      d("class", 1),
      d("classDef", 1),
      d("click", 1),
      d("edge_into_own_subgraph", 1),
      d("style", 1),
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

// spec 15 D1: 枠 (サブグラフ) の取り込み。形は P0 の実測 (mermaid.js と merman で同じ)
describe("flowFromMermaid — 枠", () => {
  const subgraphs = async (source: string) => (await flow(source)).data.subgraphs;

  test("入れ子は親から並べ、子の枠は parent で表す (mermaid.js は内側を先に並べる)", async () => {
    expect(
      await subgraphs(
        'flowchart TD\n  subgraph X["x"]\n    subgraph Y["y"]\n      subgraph Z["z"]\n        A\n      end\n    end\n    B\n  end\n  C\n'
      )
    ).toEqual([
      { id: "X", title: "x", nodes: ["B"] },
      { id: "Y", title: "y", nodes: [], parent: "X" },
      { id: "Z", title: "z", nodes: ["A"], parent: "Y" },
    ]);
  });

  test("1 つのノードは 1 つの枠にだけ入る (先に閉じた枠)", async () => {
    expect(await subgraphs("flowchart TD\n  subgraph X\n    A\n  end\n  subgraph Y\n    A\n  end\n")).toEqual([
      { id: "X", title: "X", nodes: ["A"] },
      { id: "Y", title: "Y", nodes: [] },
    ]);
    expect(await subgraphs("flowchart TD\n  subgraph X\n    A\n    subgraph Y\n      A\n    end\n  end\n")).toEqual([
      { id: "X", title: "X", nodes: [] },
      { id: "Y", title: "Y", nodes: ["A"], parent: "X" },
    ]);
  });

  test("自分を入れた枠は、その 1 件を無視する (枠と同じ ID のノードも作らない)", async () => {
    const r = await flow('flowchart TD\n  subgraph X["x"]\n    X\n    A\n  end\n');
    expect(ids(r)).toEqual(["A"]);
    expect(r.data.subgraphs).toEqual([{ id: "X", title: "x", nodes: ["A"] }]);
  });

  test("空の枠・空白だけの題・題だけの枠 (ID は mermaid.js が振る)", async () => {
    expect(await subgraphs('flowchart TD\n  subgraph X[" "]\n  end\n  subgraph 受付 審査\n    A\n  end\n')).toEqual([
      { id: "X", title: "", nodes: [] },
      { id: "subGraph1", title: "受付 審査", nodes: ["A"] },
    ]);
  });

  test("枠の中の direction を写す (spec 16)", async () => {
    const r = await flow("flowchart TD\n  subgraph X\n    direction LR\n    A --> B\n  end\n");
    // mermaid.js は枠の中を線の書き順の逆 (B, A) で返すが、図のノードの順にそろえる
    expect(r.data.subgraphs).toEqual([{ id: "X", title: "X", nodes: ["A", "B"], direction: "LR" }]);
    expect(r.dropped).toEqual([]);
  });

  test("枠の中の direction TD は TB にそろえる (spec 16 裁定 3)。2 回書けば最後が勝つ", async () => {
    for (const [dir, want] of [
      ["TB", "TB"],
      ["TD", "TB"],
      ["BT", "BT"],
      ["RL", "RL"],
      ["LR", "LR"],
    ]) {
      const r = await flow(`flowchart TD\n  subgraph X\n    direction ${dir}\n    A\n  end\n`);
      expect(r.data.subgraphs?.[0].direction, dir).toBe(want);
    }
    const twice = await flow("flowchart TD\n  subgraph X\n    direction LR\n    A\n    direction RL\n  end\n");
    expect(twice.data.subgraphs?.[0].direction).toBe("RL");
  });

  test("枠の無い図は subgraphs を持たない", async () => {
    expect("subgraphs" in (await flow("flowchart TD\n  A --> B\n")).data).toBe(false);
  });
});

// spec 16 D2: 枠を指す線。形は P0 の実測 (mermaid.js と merman で同じ)
describe("flowFromMermaid — 枠を指す線", () => {
  const S = '  subgraph S["S"]\n    s1 --> s2\n  end\n';
  const P = '  subgraph P["P"]\n    p1\n    subgraph S["S"]\n      s1 --> s2\n    end\n  end\n';

  test("外 → 枠・枠 → 外・枠 → 枠・枠の自己ループは枠につなぐ", async () => {
    const r = await flow(
      `flowchart TD\n  A\n  B\n${S}  subgraph T["T"]\n    t1\n  end\n  A --> S\n  S --> B\n  S -->|次へ| T\n  S --> S\n`
    );
    expect(ids(r)).toEqual(["A", "B", "s1", "s2", "t1"]);
    expect(pairs(r)).toEqual([
      ["s1", "s2"],
      ["A", "S"],
      ["S", "B"],
      ["S", "T"],
      ["S", "S"],
    ]);
    expect(r.data.edges.find((e) => e.id === "S-T")?.label).toBe("次へ");
    expect(r.dropped).toEqual([]);
  });

  test("線が枠の定義より前にあっても枠につなぐ。題だけの枠 (subGraphN) も", async () => {
    const r = await flow(`flowchart TD\n  A --> S\n${S}  subgraph 受付 審査\n    u1\n  end\n  A --> subGraph1\n`);
    expect(pairs(r)).toEqual([
      ["A", "S"],
      ["s1", "s2"],
      ["A", "subGraph1"],
    ]);
    expect(r.dropped).toEqual([]);
  });

  test("枠と自分の中 (子孫) を結ぶ線は落として数える (描画されない, 裁定 2)", async () => {
    for (const edge of ["S --> s1", "s2 --> S", "P --> S", "S --> P", "P --> s1", "s1 --> P"]) {
      const r = await flow(`flowchart TD\n${P}  ${edge}\n`);
      expect(pairs(r), edge).toEqual([["s1", "s2"]]);
      expect(r.dropped, edge).toEqual([d("edge_into_own_subgraph", 1)]);
    }
  });

  test("兄弟・別の枝の枠の中へは落とさない", async () => {
    const r = await flow(`flowchart TD\n${P}  subgraph Q["Q"]\n    q1\n  end\n  Q --> s1\n  p1 --> Q\n`);
    expect(pairs(r)).toEqual([
      ["s1", "s2"],
      ["Q", "s1"],
      ["p1", "Q"],
    ]);
    expect(r.dropped).toEqual([]);
  });
});
