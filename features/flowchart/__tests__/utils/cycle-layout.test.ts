/**
 * spec 18: 取り込んだ時の段組み — 輪をほどき (Mermaid と同じ順で dfsFAS, 裁定 1)、戻る線を除く全部の線が下へ向く段に振る (上からの最長路, 裁定 2)
 */
import { describe, expect, test } from "vitest";
import { readMermaidDiagram } from "@/components/ui/mermaid-render";
import type { ParsedMermaidData } from "@/features/flowchart/hooks/mermaid";
import type { GraphType } from "@/features/flowchart/types/types";
import { flowFromMermaid } from "@/features/flowchart/utils/from-mermaid";
import {
  layoutNested,
  levelsOf,
  mermaidStartOrder,
  type NestedLayoutMetrics,
} from "@/features/flowchart/utils/nested-layout";

const METRICS: NestedLayoutMetrics = {
  node: { width: 240, height: 48 },
  pitchAlong: 150,
  pitchAcross: 250,
  start: 50,
  center: 300,
  padding: 24,
  titleHeight: 28,
};

/** 今の (spec 17 までの) 数え方。輪の無い図で段の条件を満たすなら、新しい数え方はこれと一字一句同じ (受け入れ条件 4) */
function oldLevelsOf(items: string[], edges: [string, string][]): Map<string, number> {
  const hasIncoming = new Set(edges.map(([, target]) => target));
  const levels = new Map<string, number>();
  const visited = new Set<string>();
  const visit = (id: string, level: number): void => {
    if (visited.has(id)) return;
    visited.add(id);
    levels.set(id, Math.max(levels.get(id) ?? 0, level));
    edges.filter(([source]) => source === id).forEach(([, target]) => visit(target, level + 1));
  };
  items.filter((id) => !hasIncoming.has(id)).forEach((id) => visit(id, 0));
  items.forEach((id) => {
    if (!levels.has(id)) levels.set(id, 0);
  });
  return levels;
}

const lv = (m: Map<string, number>) => Object.fromEntries(m);

describe("levelsOf (spec 18)", () => {
  test("閉じた輪は、順の最初のものを一番上にして段に分かれる (今は全部 0 段だった)", () => {
    expect(
      lv(
        levelsOf(
          ["A", "B", "C"],
          [
            ["A", "B"],
            ["B", "C"],
            ["C", "A"],
          ]
        )
      )
    ).toEqual({ A: 0, B: 1, C: 2 });
  });

  test("たどり始める順 (Mermaid の順) の最初のものが上。線を書いた順ではない (P0 の c07)", () => {
    // B が最初に出てきて、線は B → C、A → B、C → A の順に書いてある。Mermaid は A → B を戻る線にする
    const levels = levelsOf(
      ["B", "C", "A"],
      [
        ["B", "C"],
        ["A", "B"],
        ["C", "A"],
      ],
      ["B", "C", "A"]
    );
    expect(lv(levels)).toEqual({ B: 0, C: 1, A: 2 });
  });

  test("根があっても、たどり始めるのは順の最初から (P0 の c19。根から始めると戻る線が変わる)", () => {
    const items = ["C", "A", "B", "Z"];
    const levels = levelsOf(
      items,
      [
        ["C", "A"],
        ["A", "B"],
        ["B", "C"],
        ["Z", "B"],
      ],
      items
    );
    // Mermaid: B → C が戻る線 (C が上)
    expect(levels.get("C")! < levels.get("A")!).toBe(true);
    expect(levels.get("A")! < levels.get("B")!).toBe(true);
    expect(levels.get("Z")! < levels.get("B")!).toBe(true);
  });

  test("自己ループは段に効かない (止まり、段も 1 つ下げない)", () => {
    expect(
      lv(
        levelsOf(
          ["A", "B", "C"],
          [
            ["A", "B"],
            ["B", "B"],
            ["B", "C"],
          ]
        )
      )
    ).toEqual({ A: 0, B: 1, C: 2 });
  });

  test("輪の無い図でも、最初に着いた深さではなく最長路 (横に走る線を作らない, P0 の c14)", () => {
    expect(
      lv(
        levelsOf(
          ["A", "B", "C"],
          [
            ["A", "B"],
            ["A", "C"],
            ["C", "B"],
          ]
        )
      )
    ).toEqual({ A: 0, C: 1, B: 2 });
  });

  test("根から届かない輪も段に分かれる (P0 の c04)", () => {
    const levels = levelsOf(
      ["Z", "Y", "A", "B", "C"],
      [
        ["Z", "Y"],
        ["A", "B"],
        ["B", "C"],
        ["C", "A"],
      ]
    );
    expect(lv(levels)).toEqual({ Z: 0, Y: 1, A: 0, B: 1, C: 2 });
  });

  test("輪の無い図で、今の段が段の条件を満たすなら、段も並び (Map の順) も今と同じ (ランダムな 500 通り)", () => {
    let seed = 18;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let checked = 0;
    for (let k = 0; k < 500; k++) {
      const n = 3 + Math.floor(rnd() * 8);
      const ids = Array.from({ length: n }, (_, i) => `n${i}`);
      // 輪の無い図: 番号の小さい方から大きい方へだけ線を引き、ノードの順は混ぜる
      const edges: [string, string][] = [];
      for (let e = 0; e < n + Math.floor(rnd() * n); e++) {
        const a = Math.floor(rnd() * n);
        const b = Math.floor(rnd() * n);
        if (a < b) edges.push([ids[a], ids[b]]);
      }
      const items = [...ids].sort(() => rnd() - 0.5);
      const old = oldLevelsOf(items, edges);
      const ok = edges.every(([a, b]) => old.get(a)! < old.get(b)!);
      if (!ok) continue;
      checked++;
      expect(Array.from(levelsOf(items, edges))).toEqual(Array.from(old));
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe("mermaidStartOrder (Mermaid がたどり始める順, 裁定 1)", () => {
  test("整数に見える ID は数の順で先頭 (graphlib のキーの順, P0 の c17)", () => {
    expect(mermaidStartOrder(["3", "1", "2", "x", "10", "01"])).toEqual([
      "1",
      "2",
      "3",
      "10",
      "x",
      "01",
    ]);
  });

  test("外とつながらない枠を枠の一覧の逆順で先に、続いてノードと外とつながる枠を出てきた順に (P0 の c10・c18)", () => {
    const at = new Map([
      ["S0", 0],
      ["U", 1],
      ["E", 4],
    ]);
    const frames = [
      { id: "R", external: false, anchor: 2 },
      { id: "S", external: false, anchor: 3 },
      { id: "N", external: true, anchor: 4 },
    ];
    expect(mermaidStartOrder(["S0", "U"], frames, at)).toEqual(["S", "R", "S0", "U", "N"]);
  });
});

/** P0 の格子: 線ごとの上下を mermaid.js で測った正解 (v 下へ・^ 上へ)。枠の中の並び (spec 16 の向き) は比べない */
const GRID: { name: string; src: string; dirs: Record<string, "v" | "^"> }[] = [
  {
    name: "c01 閉じた輪 3",
    src: "flowchart TD\n A[A] --> B[B]\n B --> C[C]\n C --> A",
    dirs: { "A>B": "v", "B>C": "v", "C>A": "^" },
  },
  {
    name: "c02 閉じた輪 5",
    src: "flowchart TD\n A[A] --> B[B]\n B --> C[C]\n C --> D[D]\n D --> E[E]\n E --> A",
    dirs: { "A>B": "v", "B>C": "v", "C>D": "v", "D>E": "v", "E>A": "^" },
  },
  {
    name: "c03 根の後に輪",
    src: "flowchart TD\n Z[Z] --> A[A]\n A --> B[B]\n B --> C[C]\n C --> A",
    dirs: { "Z>A": "v", "A>B": "v", "B>C": "v", "C>A": "^" },
  },
  {
    name: "c04 届かない輪",
    src: "flowchart TD\n Z[Z] --> Y[Y]\n A[A] --> B[B]\n B --> C[C]\n C --> A",
    dirs: { "Z>Y": "v", "A>B": "v", "B>C": "v", "C>A": "^" },
  },
  {
    name: "c05 輪が 2 つ",
    src: "flowchart TD\n A[A] --> B[B]\n B --> C[C]\n C --> A\n C --> D[D]\n D --> E[E]\n E --> C",
    dirs: { "A>B": "v", "B>C": "v", "C>A": "^", "C>D": "v", "D>E": "v", "E>C": "^" },
  },
  {
    name: "c06 自己ループ",
    src: "flowchart TD\n A[A] --> B[B]\n B --> C[C]\n B --> B",
    dirs: { "A>B": "v", "B>C": "v" },
  },
  {
    name: "c07 最初が輪の途中",
    src: "flowchart TD\n B[B] --> C[C]\n A[A] --> B\n C --> A",
    dirs: { "B>C": "v", "A>B": "^", "C>A": "v" },
  },
  {
    name: "c08 線の順だけ違う輪",
    src: "flowchart TD\n A[A]\n B[B]\n C[C]\n C --> A\n A --> B\n B --> C",
    dirs: { "C>A": "^", "A>B": "v", "B>C": "v" },
  },
  {
    name: "c09 枠の中の輪",
    src: "flowchart TD\n Z[Z] --> F\n subgraph F[枠]\n A[A] --> B[B]\n B --> C[C]\n C --> A\n end",
    dirs: { "Z>F": "v" },
  },
  {
    name: "c10 枠をまたぐ輪",
    src: "flowchart TD\n U[利用者]\n subgraph R[受付]\n A[申込] --> B[確認]\n end\n subgraph S[審査]\n C[一次] --> D[二次]\n end\n subgraph N[通知]\n E[メール]\n end\n U --> R\n R --> S\n S --> N\n N --> U",
    dirs: { "U>R": "v", "R>S": "v", "S>N": "^", "N>U": "v" },
  },
  {
    name: "c11 枠がノードより先",
    src: "flowchart TD\n subgraph F[枠]\n P[P]\n end\n Q[Q]\n R2[R]\n Q --> R2\n R2 --> F\n F --> Q",
    dirs: { "Q>R2": "v", "R2>F": "^", "F>Q": "v" },
  },
  {
    name: "c12 閉じた輪 3 (LR)",
    src: "flowchart LR\n A[A] --> B[B]\n B --> C[C]\n C --> A",
    dirs: { "A>B": "v", "B>C": "v", "C>A": "^" },
  },
  {
    name: "c13 枠をまたぐ輪 (LR)",
    src: "flowchart LR\n U[利用者]\n subgraph R[受付]\n A[申込] --> B[確認]\n end\n subgraph S[審査]\n C[一次] --> D[二次]\n end\n U --> R\n R --> S\n S --> U",
    dirs: { "U>R": "v", "R>S": "^", "S>U": "v" },
  },
  {
    name: "c14 横に走る線",
    src: "flowchart TD\n A[A] --> B[B]\n A --> C[C]\n C --> B",
    dirs: { "A>B": "v", "A>C": "v", "C>B": "v" },
  },
  {
    name: "c15 深い所へ入る根",
    src: "flowchart TD\n A[A] --> B[B]\n B --> C[C]\n C --> D[D]\n X[X] --> D",
    dirs: { "A>B": "v", "B>C": "v", "C>D": "v", "X>D": "v" },
  },
  {
    name: "c16 早く終わる葉",
    src: "flowchart TD\n A[A] --> B[B]\n B --> C[C]\n C --> D[D]\n A --> L[L]",
    dirs: { "A>B": "v", "B>C": "v", "C>D": "v", "A>L": "v" },
  },
  {
    name: "c17 数字の ID",
    src: "flowchart TD\n 3[三] --> 1[一]\n 1 --> 2[二]\n 2 --> 3",
    dirs: { "3>1": "^", "1>2": "v", "2>3": "v" },
  },
  {
    name: "c18 枠の中のノードから戻る",
    src: "flowchart TD\n S0[開始] --> U[利用者]\n U --> R\n subgraph R[受付]\n A[申込] --> B[確認]\n end\n R --> N\n subgraph N[通知]\n E[メール]\n end\n E --> U",
    dirs: { "S0>U": "v", "U>R": "^", "R>N": "v", "E>U": "v" },
  },
  {
    name: "c19 根があり最初が輪の途中",
    src: "flowchart TD\n C[C] --> A[A]\n A --> B[B]\n B --> C\n Z[Z] --> B",
    dirs: { "C>A": "v", "A>B": "v", "B>C": "^", "Z>B": "v" },
  },
  {
    name: "c20 枠が先で利用者が最初",
    src: "flowchart TD\n U[利用者] --> R\n subgraph R[受付]\n A[申込]\n end\n subgraph S[審査]\n C[一次]\n end\n R --> S\n S --> U",
    dirs: { "U>R": "v", "R>S": "^", "S>U": "v" },
  },
];

async function readData(src: string): Promise<ParsedMermaidData> {
  const snapshot = await readMermaidDiagram(src);
  if (snapshot.kind !== "flowchart") throw new Error(src);
  return flowFromMermaid(snapshot).data;
}

describe("P0 の格子 20 通り: 取り込み時の配置で、線ごとの上下が mermaid.js と揃う (受け入れ条件 3)", () => {
  for (const c of GRID) {
    test(c.name, async () => {
      const data = await readData(c.src);
      const direction = (/flowchart\s+(\w+)/.exec(c.src)![1] as GraphType) ?? "TD";
      const { positions, frameSizes } = layoutNested(data, direction, METRICS);
      const horizontal = direction === "LR" || direction === "RL";
      // 図の直下に並ぶもの (ノード・枠) の中心。枠の中のものは、図の直下の祖先の枠で比べる (P0 と同じ)
      const parentOf = new Map<string, string>();
      (data.subgraphs ?? []).forEach((f) => {
        if (f.parent) parentOf.set(f.id, f.parent);
        f.nodes.forEach((n) => parentOf.set(n, f.id));
      });
      const rootOf = (id: string) => {
        let cur = id;
        while (parentOf.has(cur)) cur = parentOf.get(cur)!;
        return cur;
      };
      const center = (id: string) => {
        const p = positions.get(id)!;
        const s = frameSizes.get(id) ?? METRICS.node;
        return horizontal ? p.x + s.width / 2 : p.y + s.height / 2;
      };
      const got: Record<string, string> = {};
      for (const key of Object.keys(c.dirs)) {
        const [a, b] = key.split(">");
        const d = center(rootOf(b)) - center(rootOf(a));
        got[key] = Math.abs(d) < 1 ? "=" : d > 0 ? "v" : "^";
      }
      expect(got).toEqual(c.dirs);
    });
  }
});
