/**
 * spec 15 D1: 枠の親子
 */
import { describe, expect, test } from "vitest";
import {
  ancestorsOf,
  emptyFrameNames,
  orderParentsFirst,
} from "@/features/flowchart/utils/subgraph-tree";

describe("emptyFrameNames (spec 15 D7)", () => {
  test("中にノードも枠も無い枠の題 (題が空なら ID)", () => {
    const frame = (id: string, title: string, parentId?: string) => ({
      id,
      type: "subgraphNode",
      ...(parentId ? { parentId } : {}),
      data: { variableName: id, title },
    });
    expect(
      emptyFrameNames([
        frame("f1", "受付"),
        frame("f2", ""),
        frame("f3", "外"),
        frame("f4", "内", "f3"),
        { id: "n1", type: "editableNode", parentId: "f5", data: {} },
        frame("f5", "中身あり"),
      ])
    ).toEqual(["受付", "f2", "内"]);
  });
});

describe("orderParentsFirst", () => {
  test("内側が先に来ても親から並べ直す", () => {
    expect(
      orderParentsFirst([
        { id: "Z", parent: "Y" },
        { id: "Y", parent: "X" },
        { id: "X" },
        { id: "W" },
      ])
    ).toEqual([{ id: "X" }, { id: "Y", parent: "X" }, { id: "Z", parent: "Y" }, { id: "W" }]);
  });

  test("親が一覧に無い枠と、輪になった枠は親を外す", () => {
    expect(orderParentsFirst([{ id: "A", parent: "missing" }])).toEqual([{ id: "A" }]);
    expect(
      orderParentsFirst([
        { id: "A", parent: "B" },
        { id: "B", parent: "A" },
      ])
    ).toEqual([{ id: "B" }, { id: "A", parent: "B" }]);
    expect(orderParentsFirst([{ id: "A", parent: "A" }])).toEqual([{ id: "A" }]);
  });
});

describe("ancestorsOf", () => {
  test("近い順に根まで。輪でも止まる", () => {
    const parents: Record<string, string> = { a: "b", b: "c", x: "y", y: "x" };
    expect(ancestorsOf("a", (id) => parents[id])).toEqual(["b", "c"]);
    expect(ancestorsOf("x", (id) => parents[id])).toEqual(["y"]);
  });
});
