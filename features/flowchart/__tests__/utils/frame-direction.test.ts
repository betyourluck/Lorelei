/**
 * spec 16 D4・D6: 枠の中の向き。エディタの向き (裁定 1 の案 B: 書いた向き、無ければ置かれている側の向き) と、
 * Mermaid の描画で効く向き (P0 の 4 で、mermaid.js と merman の描画を測って確定した規則)
 */
import type { Edge, Node } from "@xyflow/react";
import { describe, expect, test } from "vitest";
import type { GraphType } from "@/features/flowchart/types/types";
import {
  effectiveDirections,
  frameDirectionNotice,
  frameInnerDirections,
  handleDirections,
} from "@/features/flowchart/utils/frame-direction";

const node = (id: string, parentId?: string): Node => ({
  id,
  type: "editableNode",
  position: { x: 0, y: 0 },
  ...(parentId ? { parentId } : {}),
  data: { label: id, variableName: id },
});
const frame = (id: string, parentId?: string, direction?: string): Node => ({
  id,
  type: "subgraphNode",
  position: { x: 0, y: 0 },
  ...(parentId ? { parentId } : {}),
  data: { variableName: id, title: id, ...(direction ? { direction } : {}) },
});
const edge = (source: string, target: string): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
});

// P0 の 4 の格子 (x_*): 図の向き × 枠 S の指定 × つながり方 → 描画で S の中が並んだ向き (mermaid.js と merman で同じ)
const FLAT: Record<GraphType, Record<string, string>> = {
  //        iso, inner, toframe, fromframe
  TD: { none: "LR TB LR LR", other: "LR TB LR LR", TB: "TB TB TB TB" },
  LR: { none: "TB LR TB TB", other: "TB LR TB TB", TB: "TB LR TB TB" },
  BT: { none: "TB BT TB TB", other: "LR BT LR LR", TB: "TB BT TB TB" },
  RL: { none: "TB RL TB TB", other: "TB RL TB TB", TB: "TB RL TB TB" },
};
const OTHER: Record<GraphType, string> = { TD: "LR", BT: "LR", LR: "TB", RL: "TB" };
const FLAT_CONN: [string, Edge[]][] = [
  ["iso", []],
  ["inner", [edge("s2", "X")]],
  ["toframe", [edge("X", "S")]],
  ["fromframe", [edge("S", "X")]],
];

// P0 の 4 の入れ子の格子 (n_*): 外の枠 P の中に S。結果は P の中/S の中。P の TD は TB にそろえた後なので測っていない (裁定 3。P0 の PTB と同じ)
const NESTED: Record<"TD" | "LR", Record<string, string>> = {
  //               iso    pInner sInner toS    sToP
  TD: {
    "none none": "LR/TB TB/LR TB/TB TB/LR LR/LR",
    "none RL": "LR/RL TB/RL TB/TB TB/RL LR/LR",
    "TB none": "TB/LR TB/LR TB/TB TB/LR TB/TB",
    "TB RL": "TB/RL TB/RL TB/TB TB/RL TB/TB",
    "LR none": "LR/TB TB/LR TB/TB TB/LR LR/LR",
    "LR RL": "LR/RL TB/RL TB/TB TB/RL LR/LR",
  },
  LR: {
    "none none": "TB/LR LR/TB LR/LR LR/TB TB/TB",
    "none RL": "TB/RL LR/RL LR/LR LR/RL TB/TB",
    "TB none": "TB/LR LR/TB LR/LR LR/TB TB/TB",
    "TB RL": "TB/RL LR/RL LR/LR LR/RL TB/TB",
    "LR none": "LR/TB LR/TB LR/LR LR/TB LR/LR",
    "LR RL": "LR/RL LR/RL LR/LR LR/RL LR/LR",
  },
};
const NESTED_CONN: [string, Edge[]][] = [
  ["iso", []],
  ["pInner", [edge("p2", "X")]],
  ["sInner", [edge("s2", "X")]],
  ["toS", [edge("X", "S")]],
  ["sToP", [edge("s2", "p1")]],
];

describe("effectiveDirections — P0 の格子 (描画で効く向き)", () => {
  for (const g of ["TD", "LR", "BT", "RL"] as GraphType[]) {
    for (const spec of ["none", "other", "TB"]) {
      const want = FLAT[g][spec].split(" ");
      FLAT_CONN.forEach(([conn, edges], k) => {
        test(`${g} ${spec} ${conn}`, () => {
          const dir = spec === "none" ? undefined : spec === "other" ? OTHER[g] : "TB";
          const nodes = [node("X"), frame("S", undefined, dir), node("s1", "S"), node("s2", "S")];
          const eff = effectiveDirections(nodes, [edge("s1", "s2"), ...edges], g);
          expect(eff.get("S")).toBe(want[k]);
        });
      });
    }
  }

  for (const g of ["TD", "LR"] as const) {
    for (const [key, row] of Object.entries(NESTED[g])) {
      const [pSpec, sSpec] = key.split(" ");
      const wants = row.split(" ");
      NESTED_CONN.forEach(([conn, edges], k) => {
        test(`${g} P=${pSpec} S=${sSpec} ${conn}`, () => {
          const nodes = [
            node("X"),
            frame("P", undefined, pSpec === "none" ? undefined : pSpec),
            node("p1", "P"),
            node("p2", "P"),
            frame("S", "P", sSpec === "none" ? undefined : sSpec),
            node("s1", "S"),
            node("s2", "S"),
          ];
          const eff = effectiveDirections(nodes, [edge("p1", "p2"), edge("s1", "s2"), ...edges], g);
          expect(`${eff.get("P")}/${eff.get("S")}`).toBe(wants[k]);
        });
      });
    }
  }

  test("空の枠は向きを持たない (描画では四角いノード)", () => {
    expect(effectiveDirections([frame("E")], [], "TD").get("E")).toBeNull();
  });

  test("枠の自己ループは枠を外とつながらせない。枠と自分の中を結ぶ線は数えない (書き出されない, 裁定 2)", () => {
    const nodes = [frame("S"), node("s1", "S"), node("s2", "S")];
    expect(effectiveDirections(nodes, [edge("s1", "s2"), edge("S", "S")], "TD").get("S")).toBe(
      "LR"
    );
    expect(effectiveDirections(nodes, [edge("s1", "s2"), edge("S", "s1")], "TD").get("S")).toBe(
      "LR"
    );
  });
});

describe("frameInnerDirections / handleDirections — エディタの向き (裁定 1 の案 B)", () => {
  const nodes = [
    frame("P", undefined, "LR"),
    node("p1", "P"),
    frame("S", "P"),
    node("s1", "S"),
    frame("T", "S", "TB"),
    node("t1", "T"),
    frame("U"),
    node("u1", "U"),
    node("A"),
  ];

  test("書いた向き、無ければ置かれている側の向き (TB は図の向きの TD と同じ)", () => {
    expect(Object.fromEntries(frameInnerDirections(nodes, "BT"))).toEqual({
      P: "LR",
      S: "LR",
      T: "TD",
      U: "BT",
    });
  });

  test("接続点は置かれている入れ物の向き (枠の外は図の向き)", () => {
    expect(Object.fromEntries(handleDirections(nodes, "BT"))).toEqual({
      P: "BT",
      p1: "LR",
      S: "LR",
      s1: "LR",
      T: "LR",
      t1: "TD",
      U: "BT",
      u1: "BT",
      A: "BT",
    });
  });
});

describe("frameDirectionNotice — 見出しの知らせ (D4)", () => {
  test("外とつながる、向きを書いた枠: 書いた向きが効かない理由を書く", () => {
    const nodes = [node("X"), frame("S", undefined, "LR"), node("s1", "S"), node("s2", "S")];
    expect(frameDirectionNotice(nodes, [edge("s1", "s2"), edge("s2", "X")], "TD").get("S")).toBe(
      "中のノードが枠の外とつながっているので、描画ではこの向き（LR）は効きません（TB で並びます）"
    );
  });

  test("外とつながらない、向きの無い枠: 描画では逆向きになることを書く", () => {
    const nodes = [frame("S"), node("s1", "S"), node("s2", "S")];
    expect(frameDirectionNotice(nodes, [edge("s1", "s2")], "TD").get("S")).toBe(
      "描画では、この枠の中は LR（左から右）に並びます。向きを指定すると揃えられます"
    );
  });

  test("エディタと描画が同じなら出さない。枠を指す線だけなら書いた向きが効く", () => {
    const nodes = [node("X"), frame("S", undefined, "LR"), node("s1", "S"), node("s2", "S")];
    expect(frameDirectionNotice(nodes, [edge("s1", "s2"), edge("X", "S")], "TD").has("S")).toBe(
      false
    );
    const inner = [node("X"), frame("S"), node("s1", "S"), node("s2", "S")];
    expect(frameDirectionNotice(inner, [edge("s1", "s2"), edge("s2", "X")], "TD").has("S")).toBe(
      false
    );
  });
});
