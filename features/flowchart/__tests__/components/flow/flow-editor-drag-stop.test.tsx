/**
 * spec 22 D3 (failures #38): 手を離した時、xyflow (XYDrag の end) は dragging: false の変更を onNodesChange に積み、続けて同じ処理の中で onNodeDragStop を呼ぶ。
 * エディタの onNodeDragStop (枠への付け替え, spec 15 D5) がその変更を上書きすると、ノードに dragging: true が残り、
 * 経路のフックは手を離した時の全部の探し直しをしない。jsdom では d3-drag が動かないので、同じ手順をストアから同じ順で起こす
 */
import { act } from "@testing-library/react";
import { ReactFlowProvider, useStoreApi, type Node } from "@xyflow/react";
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "../../../../../__tests__/test-utils";
import { FlowEditor } from "../../../flow-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

let store: ReturnType<typeof useStoreApi>;
const Probe = () => {
  store = useStoreApi();
  return null;
};

const nodeOf = (id: string) => store.getState().nodes.find((n) => n.id === id);

/** XYDrag と同じ: 動いたノードの位置を dragging 付きで知らせる */
const move = (id: string, position: Node["position"], dragging: boolean) =>
  store.getState().updateNodePositions(new Map([[id, { id, position } as never]]), dragging);

/** XYDrag の流れ: 掴む (onNodeDragStart) → 動かす → 手を離す (dragging: false の変更と onNodeDragStop を同じ処理の中で) */
const dragTo = async (id: string, to: Node["position"]) => {
  act(() => {
    const n = nodeOf(id)!;
    store.getState().onNodeDragStart?.(new MouseEvent("mousedown") as never, n, [n]);
    move(id, to, true);
  });
  await waitFor(() => expect(nodeOf(id)?.dragging).toBe(true));
  act(() => {
    move(id, to, false);
    const current = { ...nodeOf(id)!, dragging: false };
    void store.getState().onNodeDragStop?.(new MouseEvent("mouseup") as never, current, [current]);
  });
};

const editor = () =>
  render(
    <ReactFlowProvider>
      <FlowEditor />
      <Probe />
    </ReactFlowProvider>
  );

type User = ReturnType<typeof editor>["user"];

const importCode = async (user: User, code: string) => {
  await screen.findByText("Start");
  await user.click(screen.getByRole("button", { name: "インポート" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("textbox"));
  await user.paste(code);
  await user.click(within(dialog).getByRole("button", { name: "インポート" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
};

/** 枠 F の中ほど (A の中心が F の中に入る位置。A は図の直下なので絶対位置) */
const insideFrame = () => {
  const f = nodeOf("F")!;
  return { x: f.position.x + (f.width ?? 0) / 2 - 120, y: f.position.y + (f.height ?? 0) / 2 - 24 };
};

describe("手を離した時 (spec 22 D3)", { timeout: 30000 }, () => {
  test("枠の中へ落としたノードは枠へ付け替わり、dragging が残らない (spec 15 D5)", async () => {
    const { user } = editor();
    await importCode(user, "flowchart TD\n  subgraph F[枠]\n    B\n  end\n  A");
    await waitFor(() => expect(nodeOf("A")).toBeDefined());
    const to = insideFrame();
    await dragTo("A", to);
    await waitFor(() => expect(nodeOf("A")?.parentId).toBe("F"));
    expect(store.getState().nodes.filter((n) => n.dragging)).toEqual([]);
    // 絶対位置を保つ (相対位置 = 落とした位置 - 枠の位置)
    const f = nodeOf("F")!;
    expect(nodeOf("A")!.position).toEqual({ x: to.x - f.position.x, y: to.y - f.position.y });
  });

  test("付け替えで描画されなくなる線がある時、「やめる」はドラッグの前の位置へ戻し、「移動して線を消す」は付け替えて線を消す (spec 16 裁定 2)", async () => {
    const { user } = editor();
    await importCode(user, "flowchart TD\n  subgraph F[枠]\n    B\n  end\n  F --> A");
    await waitFor(() => expect(nodeOf("A")).toBeDefined());
    const start = { ...nodeOf("A")!.position };

    await dragTo("A", insideFrame());
    const ask = await screen.findByRole("dialog");
    await user.click(within(ask).getByRole("button", { name: "やめる" }));
    await waitFor(() => expect(nodeOf("A")?.position).toEqual(start));
    expect(nodeOf("A")?.parentId).toBeUndefined();
    expect(store.getState().nodes.filter((n) => n.dragging)).toEqual([]);
    expect(store.getState().edges.map((e) => [e.source, e.target])).toEqual([["F", "A"]]);

    await dragTo("A", insideFrame());
    const ask2 = await screen.findByRole("dialog");
    await user.click(within(ask2).getByRole("button", { name: "移動して線を消す" }));
    await waitFor(() => expect(nodeOf("A")?.parentId).toBe("F"));
    expect(store.getState().nodes.filter((n) => n.dragging)).toEqual([]);
    expect(store.getState().edges).toEqual([]);
  });

  test("ドラッグしたノードに dragging が残らず、動かした位置のまま", async () => {
    editor();
    await screen.findByText("Start");
    const id = store.getState().nodes[0].id;
    const to = { x: nodeOf(id)!.position.x + 40, y: nodeOf(id)!.position.y + 20 };

    act(() => move(id, to, true));
    await waitFor(() => expect(nodeOf(id)?.dragging).toBe(true));

    // XYDrag の end: dragging: false の変更を知らせ、続けて同じ処理の中で onNodeDragStop を呼ぶ
    act(() => {
      move(id, to, false);
      const current = { ...nodeOf(id)!, dragging: false };
      void store
        .getState()
        .onNodeDragStop?.(new MouseEvent("mouseup") as never, current, [current]);
    });
    await waitFor(() => expect(nodeOf(id)?.dragging).toBeFalsy());
    expect(store.getState().nodes.filter((n) => n.dragging)).toEqual([]);
    expect(nodeOf(id)?.position).toEqual(to);
  });
});
