// spec 30 の履歴の純粋な部分 (data_contract EditorHistory)
import type { Edge, Node } from "@xyflow/react";
import { describe, expect, test, vi } from "vitest";
import {
  contentKey,
  EditorHistory,
  nextNodeId,
  restoreNodes,
  type EditorSnapshot,
} from "@/components/editor-history/history";

const node = (id: string, extra: Partial<Node> = {}): Node => ({
  id,
  type: "editableNode",
  position: { x: 0, y: 0 },
  data: { label: id },
  ...extra,
});
const snap = (
  nodes: Node[],
  edges: Edge[] = [],
  extra: Partial<EditorSnapshot> = {}
): EditorSnapshot => ({
  nodes,
  edges,
  direction: "TD",
  theme: "default",
  nodeId: 10,
  ...extra,
});

describe("中身の鍵 (spec 30 D1)", () => {
  test("選ぶ・ドラッグの印・測った大きさ・data の関数は鍵を変えない", () => {
    const a = snap([node("1")]);
    const b = snap([
      node("1", {
        selected: true,
        dragging: true,
        resizing: true,
        measured: { width: 240, height: 48 },
        data: { label: "1", onDelete: vi.fn() },
      }),
    ]);
    expect(contentKey(b)).toBe(contentKey(a));
  });

  test("位置・ラベル・親・枠の大きさ・線・向き・テーマは鍵を変える", () => {
    const base = contentKey(snap([node("1")]));
    expect(contentKey(snap([node("1", { position: { x: 1, y: 0 } })]))).not.toBe(base);
    expect(contentKey(snap([node("1", { data: { label: "x" } })]))).not.toBe(base);
    expect(contentKey(snap([node("1", { parentId: "f" })]))).not.toBe(base);
    expect(contentKey(snap([node("1", { width: 300 })]))).not.toBe(base);
    expect(contentKey(snap([node("1")], [{ id: "e", source: "1", target: "1" }]))).not.toBe(base);
    expect(contentKey(snap([node("1")], [], { direction: "LR" }))).not.toBe(base);
    expect(contentKey(snap([node("1")], [], { theme: "dark" }))).not.toBe(base);
  });

  test("線の選択と関数は鍵を変えない", () => {
    const e: Edge = { id: "e", source: "1", target: "2", data: { label: "a" } };
    const a = contentKey(snap([], [e]));
    const b = contentKey(
      snap([], [{ ...e, selected: true, data: { label: "a", onDelete: vi.fn() } }])
    );
    expect(b).toBe(a);
  });

  test("次のノードの番号は鍵に入れない", () => {
    expect(contentKey(snap([node("1")], [], { nodeId: 99 }))).toBe(contentKey(snap([node("1")])));
  });
});

describe("EditorHistory (spec 30)", () => {
  test("違う中身を記録すると戻せ、戻した手はやり直せる", () => {
    const h = new EditorHistory();
    const s0 = snap([node("1")]);
    const s1 = snap([node("1"), node("2")]);
    h.reset(s0);
    expect(h.canUndo).toBe(false);
    expect(h.record(s1)).toBe(true);
    expect(h.canUndo).toBe(true);

    expect(h.undo(s1)).toBe(s0);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);
    expect(h.redo(s0)).toBe(s1);
    expect(h.canRedo).toBe(false);
  });

  test("同じ中身は手にならない", () => {
    const h = new EditorHistory();
    h.reset(snap([node("1")]));
    expect(h.record(snap([node("1", { selected: true })]))).toBe(false);
    expect(h.canUndo).toBe(false);
  });

  test("戻す時は、まだ記録していない変更を先に 1 手にしてから戻す", () => {
    const h = new EditorHistory();
    const s0 = snap([node("1")]);
    const s1 = snap([node("1"), node("2")]);
    h.reset(s0);
    // 記録しないまま (保留のまま) 戻す
    expect(h.undo(s1)).toBe(s0);
    expect(h.redo(s0)).toBe(s1);
  });

  test("新しい手を打つと、やり直せる手は消える", () => {
    const h = new EditorHistory();
    const s0 = snap([node("1")]);
    h.reset(s0);
    h.record(snap([node("1"), node("2")]));
    h.undo(snap([node("1"), node("2")]));
    h.record(snap([node("1"), node("3")]));
    expect(h.canRedo).toBe(false);
    expect(h.redo(snap([node("1"), node("3")]))).toBeNull();
  });

  test("戻した直後に、戻した写しと同じ中身 (測った大きさ・選択だけ違う) はやり直しを消さない", () => {
    const h = new EditorHistory();
    const s0 = snap([node("1")]);
    const s1 = snap([node("1"), node("2")]);
    h.reset(s0);
    h.record(s1);
    const back = h.undo(s1)!;
    expect(
      h.record(snap(restoreNodes(back.nodes, [node("1", { measured: { width: 1, height: 1 } })])))
    ).toBe(false);
    expect(h.canRedo).toBe(true);
  });

  test("上限 (100 手) を超えると古い手から捨てる", () => {
    const h = new EditorHistory();
    h.reset(snap([node("0")]));
    for (let i = 1; i <= 105; i++) h.record(snap([node(String(i))]));
    let count = 0;
    let cur = snap([node("105")]);
    for (let s = h.undo(cur); s; s = h.undo(cur)) {
      cur = s;
      count++;
    }
    expect(count).toBe(100);
    expect(cur.nodes[0].id).toBe("5");
  });

  test("reset で履歴を捨てて起点を置き直す", () => {
    const h = new EditorHistory();
    h.reset(snap([node("1")]));
    h.record(snap([node("2")]));
    h.reset(snap([node("3")]));
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.undo(snap([node("3")]))).toBeNull();
  });

  test("起点の無い間は記録しない", () => {
    const h = new EditorHistory();
    expect(h.record(snap([node("1")]))).toBe(false);
    expect(h.undo(snap([node("1")]))).toBeNull();
  });
});

describe("戻す時の当て方 (spec 30 D7)", () => {
  test("選択・ドラッグの印を落とし、測った大きさは今の同じ id の値を当てる", () => {
    const prev = [
      node("1", {
        selected: true,
        dragging: true,
        resizing: true,
        measured: { width: 1, height: 1 },
      }),
      node("2", { measured: { width: 5, height: 5 } }),
    ];
    const current = [node("1", { measured: { width: 240, height: 48 } })];
    const [a, b] = restoreNodes(prev, current);
    expect(a.selected).toBe(false);
    expect(a.dragging).toBe(false);
    expect(a.resizing).toBe(false);
    expect(a.measured).toEqual({ width: 240, height: 48 });
    // 今に無いノードは写しの値のまま (xyflow が測り直す)
    expect(b.measured).toEqual({ width: 5, height: 5 });
  });

  test("次のノードの番号は、今の値と戻したノードの数字の ID の最大 + 1 の大きい方", () => {
    expect(nextNodeId(3, [node("1"), node("9"), node("startNode")])).toBe(10);
    expect(nextNodeId(20, [node("1"), node("9")])).toBe(20);
    expect(nextNodeId(2, [node("a"), node("b")])).toBe(2);
  });
});
