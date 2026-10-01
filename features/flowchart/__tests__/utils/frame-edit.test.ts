/**
 * spec 15 D5: 枠の GUI の編集の計算 (出し入れ・広げる・消す時の付け替え・新しい枠の名前)
 */
import type { Edge, Node } from "@xyflow/react";
import { describe, expect, test } from "vitest";
import {
  absolutePositions,
  applyDrop,
  dropTarget,
  fitFrames,
  FRAME_PADDING,
  FRAME_TITLE_HEIGHT,
  edgesBrokenByDrop,
  frameNameRejected,
  frameSelfLoopPath,
  intoOwnFrame,
  nextFrameName,
  relayoutFrame,
  planFrameDelete,
  sortParentsFirst,
} from "@/features/flowchart/utils/frame-edit";

const frame = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  parentId?: string
): Node => ({
  id,
  type: "subgraphNode",
  position: { x, y },
  width,
  height,
  ...(parentId ? { parentId } : {}),
  data: { variableName: id, title: id },
});
const node = (id: string, x: number, y: number, parentId?: string, selected = false): Node => ({
  id,
  type: "editableNode",
  position: { x, y },
  measured: { width: 100, height: 40 },
  ...(parentId ? { parentId } : {}),
  ...(selected ? { selected } : {}),
  data: { variableName: id, label: id },
});
const edge = (source: string, target: string, selected = false): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  ...(selected ? { selected } : {}),
});

const absOf = (nodes: Node[], id: string) => absolutePositions(nodes).get(id);
const byId = (nodes: Node[], id: string) => nodes.find((n) => n.id === id)!;

// 外枠 O (0,0 600x400) の中に内枠 I (+50,+60 300x200)。A は I の中、B は図の直下
const base = (): Node[] => [
  frame("O", 0, 0, 600, 400),
  frame("I", 50, 60, 300, 200, "O"),
  node("A", 30, 60, "I"),
  node("B", 800, 100),
];

describe("dropTarget", () => {
  test("中心を含む一番内側の枠", () => {
    const nodes = base().map((n) => (n.id === "B" ? { ...n, position: { x: 100, y: 120 } } : n));
    expect(dropTarget(nodes, "B")).toBe("I");
    const inOuter = base().map((n) => (n.id === "B" ? { ...n, position: { x: 450, y: 300 } } : n));
    expect(dropTarget(inOuter, "B")).toBe("O");
    expect(dropTarget(base(), "B")).toBeUndefined();
  });

  test("自分と自分の子孫の枠は候補にしない (外枠を内枠に落としても輪にならない)", () => {
    // O の中心 (300,200) は I (50..350, 60..260) の中にあるが、I は O の子
    expect(dropTarget(base(), "O")).toBeUndefined();
  });
});

describe("applyDrop", () => {
  test("枠の中へ落とすと親になり、絶対位置を保って相対位置に直す", () => {
    const moved = base().map((n) => (n.id === "B" ? { ...n, position: { x: 100, y: 120 } } : n));
    const out = applyDrop(moved, ["B"]);
    expect(byId(out, "B").parentId).toBe("I");
    expect(absOf(out, "B")).toEqual({ x: 100, y: 120 });
    // 親は子より前
    expect(out.findIndex((n) => n.id === "I")).toBeLessThan(out.findIndex((n) => n.id === "B"));
  });

  test("枠の外へ出すと図の直下へ。絶対位置は保つ", () => {
    const nodes = base().map((n) => (n.id === "A" ? { ...n, position: { x: 900, y: 700 } } : n));
    const before = absOf(nodes, "A");
    const out = applyDrop(nodes, ["A"]);
    expect(byId(out, "A").parentId).toBeUndefined();
    expect(absOf(out, "A")).toEqual(before);
  });

  test("枠ごと別の枠へ入れる (中身は一緒に動き、親は変わらない)", () => {
    const nodes = [...base(), frame("P", 1000, 0, 700, 500)];
    const moved = nodes.map((n) => (n.id === "I" ? { ...n, position: { x: 1100, y: 100 } } : n));
    const absA = absOf(moved, "A");
    const out = applyDrop(moved, ["I", "A"]);
    expect(byId(out, "I").parentId).toBe("P");
    expect(byId(out, "A").parentId).toBe("I");
    expect(absOf(out, "A")).toEqual(absA);
  });

  test("枠と一緒にドラッグした中身は、中心がほかの小さな枠に入っても付け替えない", () => {
    // I (300x200) を動かし、I の中心は小さな枠 P の外、I の中の A の中心だけが P の中
    const nodes = [...base(), frame("P", 1000, 950, 100, 60)];
    const moved = nodes.map((n) =>
      n.id === "I" ? { ...n, parentId: undefined, position: { x: 980, y: 900 } } : n
    );
    // A の絶対位置 = (1010, 960)、中心 (1060, 980) は P (1000..1100, 950..1010) の中。I の中心 (1130, 1000) は P の外
    const out = applyDrop(moved, ["A", "I"]);
    expect(byId(out, "A").parentId).toBe("I");
    expect(byId(out, "I").parentId).toBeUndefined();
  });

  test("外枠を内枠の中に落としても輪にならない", () => {
    const out = applyDrop(base(), ["O"]);
    expect(byId(out, "O").parentId).toBeUndefined();
    expect(byId(out, "I").parentId).toBe("O");
  });

  test("親が変わらず枠からはみ出しただけなら、枠を広げる (左・上は枠を動かし中身の絶対位置を保つ)", () => {
    // A を I の左上の外 (相対 -40, -30) へ。中心は I の中なので親は I のまま
    const nodes = base().map((n) => (n.id === "A" ? { ...n, position: { x: -40, y: -10 } } : n));
    const before = absOf(nodes, "A");
    const out = applyDrop(nodes, ["A"]);
    expect(byId(out, "A").parentId).toBe("I");
    expect(absOf(out, "A")).toEqual(before);
    expect(byId(out, "A").position).toEqual({
      x: FRAME_PADDING,
      y: FRAME_PADDING + FRAME_TITLE_HEIGHT,
    });
    const i = byId(out, "I");
    expect(i.width).toBe(300 + FRAME_PADDING + 40);
    expect(i.height).toBe(200 + FRAME_PADDING + FRAME_TITLE_HEIGHT + 10);
  });
});

describe("fitFrames", () => {
  test("中の枠が広がって外の枠からはみ出したら、外の枠も広げる", () => {
    const nodes = base().map((n) => (n.id === "A" ? { ...n, position: { x: 30, y: 600 } } : n));
    const out = fitFrames(nodes, "I");
    const i = byId(out, "I");
    const o = byId(out, "O");
    expect(i.height).toBe(600 + 40 + FRAME_PADDING);
    expect(o.height).toBe(60 + i.height! + FRAME_PADDING);
  });

  test("はみ出していなければ変えない", () => {
    const nodes = base();
    expect(fitFrames(nodes, "I")).toBe(nodes);
  });
});

describe("planFrameDelete (裁定 3: 枠だけ消して中身は残す)", () => {
  // xyflow は O を消す時、中身 (I・A) も消す一覧に足して渡してくる
  const all = (): Node[] => [...base(), node("C", 400, 300, "O")];

  test("枠だけ消し、直下の子は 1 段上 (図の直下) へ。子の枠は中身ごと。絶対位置は保つ", () => {
    const nodes = all();
    const plan = planFrameDelete(
      nodes,
      nodes.filter((n) => n.id !== "B"),
      [edge("A", "B"), edge("C", "B")]
    );
    expect(plan.remove.map((n) => n.id)).toEqual(["O"]);
    expect(plan.frames.map((n) => n.id)).toEqual(["O"]);
    expect(plan.kept).toBe(3); // I・A・C
    expect(plan.removeEdges).toEqual([]);
    const after = plan.reparent(nodes);
    expect(byId(after, "I").parentId).toBeUndefined();
    expect(byId(after, "C").parentId).toBeUndefined();
    expect(byId(after, "A").parentId).toBe("I");
    for (const id of ["I", "A", "C"]) expect(absOf(after, id)).toEqual(absOf(nodes, id));
  });

  test("内枠だけ消すと、中身は外枠へ移る", () => {
    const nodes = all();
    const plan = planFrameDelete(nodes, [byId(nodes, "I"), byId(nodes, "A")], [edge("A", "B")]);
    expect(plan.remove.map((n) => n.id)).toEqual(["I"]);
    const after = plan.reparent(nodes);
    expect(byId(after, "A").parentId).toBe("O");
    expect(absOf(after, "A")).toEqual(absOf(nodes, "A"));
  });

  test("一緒に選んだ中身は消える。消えるノードにつながる線も消える", () => {
    const nodes = all().map((n) => (n.id === "A" ? { ...n, selected: true } : n));
    const plan = planFrameDelete(
      nodes,
      nodes.filter((n) => n.id !== "B"),
      [edge("A", "B"), edge("C", "B"), edge("B", "C", true)]
    );
    expect(plan.remove.map((n) => n.id).sort()).toEqual(["A", "O"]);
    expect(plan.removeEdges.map((e) => e.id)).toEqual(["A-B", "B-C"]);
    expect(plan.kept).toBe(2); // I・C
  });

  test("名指しの削除 (枠の ×) では、子が選ばれていても枠だけ消す", () => {
    const nodes = all().map((n) => (n.id === "A" ? { ...n, selected: true } : n));
    const plan = planFrameDelete(
      nodes,
      nodes.filter((n) => n.id !== "B"),
      [edge("A", "B")],
      { bySelection: false }
    );
    expect(plan.remove.map((n) => n.id)).toEqual(["O"]);
    expect(plan.kept).toBe(3);
    expect(plan.removeEdges).toEqual([]);
  });

  test("枠の無い削除はそのまま", () => {
    const nodes = all();
    const plan = planFrameDelete(nodes, [byId(nodes, "B")], [edge("A", "B")]);
    expect(plan.remove.map((n) => n.id)).toEqual(["B"]);
    expect(plan.frames).toEqual([]);
    expect(plan.reparent(nodes)).toBe(nodes);
  });
});

describe("sortParentsFirst", () => {
  test("親を子より前へ。ほかの順は保つ", () => {
    const nodes = [node("A", 0, 0, "F"), node("B", 0, 0), frame("F", 0, 0, 10, 10)];
    expect(sortParentsFirst(nodes).map((n) => n.id)).toEqual(["F", "A", "B"]);
  });
});

describe("枠の名前", () => {
  test("新しい枠は使っていない最小の番号", () => {
    const nodes = [frame("group1", 0, 0, 1, 1), node("group3", 0, 0)];
    expect(nextFrameName(nodes)).toEqual({ variableName: "group2", title: "グループ2" });
  });

  test("ほかのノード・枠の ID とぶつかる名前と空は確定させない", () => {
    const nodes = base();
    expect(frameNameRejected(nodes, "I", "A")).toBe(true);
    expect(frameNameRejected(nodes, "I", "O")).toBe(true);
    expect(frameNameRejected(nodes, "I", "")).toBe(true);
    expect(frameNameRejected(nodes, "I", "I")).toBe(false);
    expect(frameNameRejected(nodes, "I", "審査")).toBe(false);
  });
});

// spec 16 D7・裁定 2: 枠と自分の中 (子孫) を結ぶ線は作らせない。ドラッグで付け替えてそうなる線は確かめて消す
describe("枠と自分の中を結ぶ線", () => {
  const nodes = [
    frame("P", 0, 0, 400, 300),
    frame("S", 20, 50, 200, 150, "P"),
    node("a", 10, 60, "S"),
    node("x", 600, 0),
  ];

  test("intoOwnFrame: 枠とその子孫 (中の枠の中まで) を結ぶ線だけ。自己ループ・外とは当たらない", () => {
    expect(intoOwnFrame(nodes, "P", "a")).toBe(true);
    expect(intoOwnFrame(nodes, "a", "P")).toBe(true);
    expect(intoOwnFrame(nodes, "P", "S")).toBe(true);
    expect(intoOwnFrame(nodes, "S", "a")).toBe(true);
    expect(intoOwnFrame(nodes, "S", "S")).toBe(false);
    expect(intoOwnFrame(nodes, "x", "S")).toBe(false);
    expect(intoOwnFrame(nodes, "S", "x")).toBe(false);
    expect(intoOwnFrame(nodes, "a", "x")).toBe(false);
  });

  test("edgesBrokenByDrop: 付け替えで新たに枠とその中を結ぶようになった線だけを返す", () => {
    const before = [frame("F", 0, 0, 300, 200), node("a", 400, 0), node("b", 10, 60, "F")];
    // a を枠 F の中へ入れると、F --> a は枠とその中を結ぶ線になる。b --> F はもともとそう (取り込みで落ちるので普通は無い) なので数えない
    const after = [frame("F", 0, 0, 300, 200), node("a", 20, 60, "F"), node("b", 10, 60, "F")];
    const edges = [edge("F", "a"), edge("a", "b"), edge("b", "F"), edge("a", "a")];
    expect(edgesBrokenByDrop(before, after, edges).map((e) => e.id)).toEqual(["F-a"]);
  });
});

// spec 16 P3: 枠の自己ループは枠の外を回る (P1 では枠の真ん中を縦に貫いて描かれた)
describe("frameSelfLoopPath", () => {
  const box = { x: 100, y: 50, width: 200, height: 120 };

  test("出口が下・入口が上 (TD): 右の外を回り、ラベルは右の外", () => {
    const { path, labelX, labelY } = frameSelfLoopPath(
      box,
      { x: 200, y: 170 },
      { x: 200, y: 50 },
      "bottom"
    );
    expect(path.startsWith("M 200 170")).toBe(true);
    expect(path.endsWith("200 50")).toBe(true);
    expect(labelX).toBeGreaterThan(box.x + box.width);
    expect(labelY).toBe(box.y + box.height / 2);
  });

  test("出口が右・入口が左 (LR): 下の外を回り、ラベルは下の外", () => {
    const { labelX, labelY } = frameSelfLoopPath(
      box,
      { x: 300, y: 110 },
      { x: 100, y: 110 },
      "right"
    );
    expect(labelY).toBeGreaterThan(box.y + box.height);
    expect(labelX).toBe(box.x + box.width / 2);
  });
});

// spec 16 P5 (裁定 4): 枠の向きを変えたら、その枠の中だけ取り込み時と同じ段組みで並べ直す
describe("relayoutFrame", () => {
  const METRICS = {
    node: { width: 240, height: 48 },
    pitchAlong: 150,
    pitchAcross: 250,
    start: 50,
    center: 300,
    padding: FRAME_PADDING,
    titleHeight: FRAME_TITLE_HEIGHT,
  };
  const withDir = (n: Node, direction?: string): Node => ({
    ...n,
    data: { ...n.data, ...(direction ? { direction } : {}) },
  });
  // 枠 F の中に a1 → a2 (縦に並んでいる)、中の枠 G に g1 → g2、外にノード x
  const base = (gDirection?: string): Node[] => [
    frame("F", 100, 50, 300, 400),
    node("a1", 24, 52, "F"),
    node("a2", 24, 200, "F"),
    withDir(frame("G", 24, 260, 250, 120, "F"), gDirection),
    node("g1", 24, 52, "G"),
    node("g2", 24, 120, "G"),
    node("x", 600, 0),
  ];
  const edges = [edge("a1", "a2"), edge("g1", "g2"), edge("a2", "x")];

  test("新しい向きで中を並べ直し、枠の左上は動かさず、大きさは中身に合わせる", () => {
    const out = relayoutFrame(base(), edges, "F", "LR", METRICS);
    const byId = new Map(out.map((n) => [n.id, n]));
    const abs = absolutePositions(out);
    expect(byId.get("F")!.position).toEqual({ x: 100, y: 50 });
    // a1 の次の段の a2 は右
    expect(abs.get("a2")!.x).toBeGreaterThan(abs.get("a1")!.x + 100);
    // 向きを書いていない中の枠 G も LR を継ぐ
    expect(abs.get("g2")!.x).toBeGreaterThan(abs.get("g1")!.x + 100);
    // 中のものは枠に収まる (余白と見出しの分を空ける)
    const f = byId.get("F")!;
    for (const id of ["a1", "a2", "G"]) {
      const n = byId.get(id)!;
      expect(n.position.x).toBeGreaterThanOrEqual(FRAME_PADDING);
      expect(n.position.y).toBeGreaterThanOrEqual(FRAME_PADDING + FRAME_TITLE_HEIGHT);
      expect(n.position.x + (n.width ?? 240)).toBeLessThanOrEqual(f.width!);
    }
    // 外のノードは動かない
    expect(byId.get("x")!.position).toEqual({ x: 600, y: 0 });
  });

  test("向きを書いた中の枠は自分の向きのまま", () => {
    const out = relayoutFrame(base("TB"), edges, "F", "LR", METRICS);
    const abs = absolutePositions(out);
    expect(abs.get("g2")!.y).toBeGreaterThan(abs.get("g1")!.y + 40);
  });

  test("広がった枠からはみ出したら、外側の枠も広げる", () => {
    const outer = [
      frame("O", 0, 0, 360, 500),
      { ...frame("F", 24, 52, 300, 400), parentId: "O" },
      node("a1", 24, 52, "F"),
      node("a2", 24, 200, "F"),
      node("a3", 24, 300, "F"),
    ];
    const out = relayoutFrame(outer, [edge("a1", "a2"), edge("a2", "a3")], "F", "LR", METRICS);
    const byId = new Map(out.map((n) => [n.id, n]));
    expect(byId.get("O")!.width!).toBeGreaterThanOrEqual(
      24 + byId.get("F")!.width! + FRAME_PADDING
    );
  });
});
