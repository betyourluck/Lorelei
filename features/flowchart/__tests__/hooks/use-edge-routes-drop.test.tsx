/**
 * spec 17 D4・spec 22 D3: 経路のフックは、ドラッグ中は動いたものと関わる線だけを探し直し、手を離した時 (ノードの dragging が true から false) は
 * 形が変わっていなくても全部を探し直す。jsdom ではノードが測られないので、大きさと接続点を持つノードをストアに直接置く
 */
import { act, render, waitFor } from "@testing-library/react";
import { ReactFlowProvider, useStoreApi } from "@xyflow/react";
import { describe, expect, test, vi } from "vitest";
import { useEdgeRouting } from "@/features/flowchart/hooks/use-edge-routes";
import * as edgeRoute from "@/features/flowchart/utils/edge-route";

vi.mock("@/features/flowchart/utils/edge-route", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/features/flowchart/utils/edge-route")>();
  return { ...mod, routeEdges: vi.fn(mod.routeEdges) };
});

let store: ReturnType<typeof useStoreApi>;
const Probe = () => {
  store = useStoreApi();
  useEdgeRouting();
  return null;
};

/** 測られたノード (240×48、出口は下の辺の中央・入口は上の辺の中央) */
const node = (id: string, x: number, y: number, dragging = false) => ({
  id,
  type: "editableNode",
  position: { x, y },
  data: {},
  dragging,
  measured: { width: 240, height: 48 },
  internals: {
    positionAbsolute: { x, y },
    z: 0,
    handleBounds: {
      source: [
        { id: null, type: "source", position: "bottom", x: 116, y: 44, width: 8, height: 8 },
      ],
      target: [{ id: null, type: "target", position: "top", x: 116, y: -4, width: 8, height: 8 }],
    },
  },
});

const place = (nodes: ReturnType<typeof node>[]) =>
  act(() => {
    store.setState({
      nodes: nodes as never,
      nodeLookup: new Map(nodes.map((n) => [n.id, n])) as never,
      edges: [
        { id: "a-b", source: "A", target: "B" },
        { id: "b-c", source: "B", target: "C" },
      ] as never,
    });
  });

const calls = () => vi.mocked(edgeRoute.routeEdges).mock.calls;

describe("手を離した時は全部を探し直す (spec 17 D4・spec 22 D3)", () => {
  test("dragging が true から false になると、形が同じでも全部を探し直す。ドラッグ中で形が同じなら探さない", async () => {
    render(
      <ReactFlowProvider>
        <Probe />
      </ReactFlowProvider>
    );
    place([node("A", 0, 0), node("B", 0, 200), node("C", 0, 400)]);
    await waitFor(() => expect(calls().length).toBeGreaterThan(0));

    // ドラッグ中: A を動かすと、使い回しの判定を通して探す
    place([node("A", 30, 0, true), node("B", 0, 200), node("C", 0, 400)]);
    await waitFor(() =>
      expect(
        calls()
          .at(-1)![0]
          .find((b) => b.id === "A")?.x
      ).toBe(30)
    );
    const during = calls().length;

    // ドラッグ中のまま形が同じ知らせ (選ぶ・測り直しなど) では探さない
    place([node("A", 30, 0, true), node("B", 0, 200), node("C", 0, 400)]);
    await new Promise((r) => setTimeout(r, 100));
    expect(calls().length).toBe(during);

    // 手を離した: 形は同じで dragging だけが外れる → 全部を探し直す (使い回す線は無い)
    place([node("A", 30, 0), node("B", 0, 200), node("C", 0, 400)]);
    await waitFor(() => expect(calls().length).toBe(during + 1));
    expect(calls().at(-1)![2]?.reuse?.size ?? 0).toBe(0);
  });
});
