import type { Node } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialERNodes } from "@/features/er-diagram/er-diagram-editor";
import { initialFlowNodes } from "@/features/flowchart/flow-editor";
import {
  Autosaver,
  collectLayout,
  expectedKeys,
  isDocumentGone,
  isInitialFigureRejected,
  layoutReady,
  onNodesChanged,
  toSource,
  withLayout,
} from "@/lib/desktop/doc-session";

const flowNode = (id: string, variableName: string, x = 0, y = 0): Node => ({
  id,
  position: { x, y },
  data: { variableName, label: variableName },
});
const erNode = (id: string, name: string, x = 0, y = 0): Node => ({
  id,
  position: { x, y },
  data: { name, columns: [] },
});

describe("layout のキー (spec 02 D6: Mermaid 上のノード ID)", () => {
  it("flowchart はエディタ内の id ではなく、生成器が書き出す変数名で覚える", () => {
    // GUI で足したノードは id が連番。保存して開き直すと id は変数名になる (現況 3)
    const layout = collectLayout("flowchart", [flowNode("3", "node3", 10, 20)]);
    expect(layout).toEqual({ node3: { x: 10, y: 20 } });
    const reopened = withLayout("flowchart", [flowNode("node3", "node3")], layout);
    expect(reopened[0].position).toEqual({ x: 10, y: 20 });
  });

  it("ER 図はエンティティ名で覚える。layout に無いノードは自動配置のまま", () => {
    const layout = collectLayout("erDiagram", [erNode("1", "会員", 5, 6)]);
    expect(layout).toEqual({ 会員: { x: 5, y: 6 } });
    const nodes = withLayout("erDiagram", [erNode("会員", "会員"), erNode("注文", "注文", 7, 8)], layout);
    expect(nodes.map((n) => n.position)).toEqual([
      { x: 5, y: 6 },
      { x: 7, y: 8 },
    ]);
  });

  it("開く図のキーは変換結果 (payload) から取る", () => {
    expect(expectedKeys("flowchart", { nodes: [{ variableName: "A" }, { variableName: "B" }] })).toEqual([
      "A",
      "B",
    ]);
    expect(expectedKeys("erDiagram", { nodes: [{ name: "会員" }] })).toEqual(["会員"]);
  });
});

describe("layoutReady — 位置を当ててよい時 (P0-4 / P3 の設計の補足 2)", () => {
  it("取り込みが済み、開く図のキーがストアに全部そろった時だけ", () => {
    const nodes = [flowNode("startNode", "startNode"), flowNode("B", "B")];
    expect(layoutReady({ imported: true, expected: ["startNode", "B"], editor: "flowchart", nodes })).toBe(true);
    expect(layoutReady({ imported: true, expected: ["startNode", "C"], editor: "flowchart", nodes })).toBe(false);
  });

  it("取り込み前は、初期図のノードとキーが一致しても当てない (P0-4 で観測した早すぎる合図)", () => {
    const initial = [flowNode("startNode", "startNode")];
    expect(layoutReady({ imported: false, expected: ["startNode"], editor: "flowchart", nodes: initial })).toBe(false);
  });
});

describe("onNodesChanged — ストアのノードが変わった時にすること", () => {
  const nodes = [erNode("会員", "会員")];

  it("準備前で合図がそろっていなければ何もしない", () => {
    expect(
      onNodesChanged({ ready: false, imported: false, expected: ["会員"], page: "erDiagram", editor: "erDiagram", nodes, layout: {} })
    ).toEqual({ ready: false, applyLayout: false, save: false });
  });

  it("位置を持たない図 (AI から届いた図) も、準備済みになった時点で保存する", () => {
    // 実機で観測 (2026-09-24): AI の図は layout が空なので setNodes が起きず、次の変化まで保存されなかった。
    // source が空のまま残り、開き直すと「新規作成の直後」と判定されて初期図になる
    expect(
      onNodesChanged({ ready: false, imported: true, expected: ["会員"], page: "erDiagram", editor: "erDiagram", nodes, layout: {} })
    ).toEqual({ ready: true, applyLayout: false, save: true });
  });

  it("位置を持つ図は、位置を当ててから保存する (当てた後の変化で保存される)", () => {
    expect(
      onNodesChanged({
        ready: false,
        imported: true,
        expected: ["会員"],
        page: "erDiagram",
        editor: "erDiagram",
        nodes,
        layout: { 会員: { x: 1, y: 2 } },
      })
    ).toEqual({ ready: true, applyLayout: true, save: false });
  });

  it("ページのエディタが今の図の種類と違えば、準備済みでも保存せず、準備前に戻す (spec 04 P0)", () => {
    // 実機で観測 (2026-09-25): フローの図を開いたまま、遅れて効いたページ移動で ER 図のエディタが載り、
    // ER 図のノードがフローの図として保存された (flowchart TD / node部署[] ...)
    expect(
      onNodesChanged({ ready: true, imported: true, expected: null, page: "flowchart", editor: "erDiagram", nodes, layout: {} })
    ).toEqual({ ready: false, applyLayout: false, save: false });
    expect(
      onNodesChanged({ ready: false, imported: true, expected: ["会員"], page: "flowchart", editor: "erDiagram", nodes, layout: {} })
    ).toEqual({ ready: false, applyLayout: false, save: false });
  });

  it("準備済みなら変化のたびに保存する", () => {
    expect(
      onNodesChanged({ ready: true, imported: true, expected: null, page: "erDiagram", editor: "erDiagram", nodes, layout: {} })
    ).toEqual({ ready: true, applyLayout: false, save: true });
  });
});

describe("エディタの初期図 (data_contract Document.initial_sources, spec 04 D4-2)", () => {
  // Rust の save はこの文字列と一字一句同じ source を AI / インポートの図に書かせない。
  // フォーク元の初期図を変えたらここで落ちる — src-tauri/src/documents.rs の initial_source と data_contract も直す
  it("フローチャートの初期図を生成器にかけると、凍結した文字列になる", () => {
    expect(toSource("flowchart", initialFlowNodes, [])).toBe("flowchart TD\n    startNode[Start]\n");
  });
  it("ER 図の初期図を生成器にかけると、凍結した文字列になる", () => {
    expect(toSource("erDiagram", initialERNodes, [])).toBe(
      "erDiagram\n  ユーザー {\n    int id PK\n    varchar(255) name UK\n  }"
    );
  });
});

describe("Autosaver — 1 秒待って保存、切り替え・終了の前は flush (D7)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("変化が続く間は待ち、止んでから 1 回だけ保存する", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const a = new Autosaver(save, 1000);
    a.touch("doc-1", () => "v1");
    await vi.advanceTimersByTimeAsync(500);
    a.touch("doc-1", () => "v2");
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("doc-1", "v2");
  });

  it("flush は待たずに保存し、変化が無ければ何もしない", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const a = new Autosaver(save, 1000);
    await a.flush();
    expect(save).not.toHaveBeenCalled();
    a.touch("doc-1", () => "v1");
    await a.flush();
    expect(save).toHaveBeenCalledWith("doc-1", "v1");
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("保存に失敗したら flush は失敗を返し、変更は捨てない (閉じる時に止めるため)", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("disk")).mockResolvedValue(undefined);
    const a = new Autosaver(save, 1000);
    a.touch("doc-1", () => "v1");
    await expect(a.flush()).rejects.toThrow("disk");
    await a.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("doc-1", "v1");
  });

  it("捨ててよい失敗 (初期図での上書きを Rust が拒んだ) は、変更を捨てて flush を通す (spec 04 D4-2)", async () => {
    // 残すと「保存できなければ離れない」に掛かり、図を切り替えられなくなる
    const save = vi.fn().mockRejectedValue("INITIAL_FIGURE_REJECTED: 止めました");
    const a = new Autosaver(save, 1000, (e) => String(e).startsWith("INITIAL_FIGURE_REJECTED"));
    a.touch("doc-1", () => "v1");
    await expect(a.flush()).resolves.toBeUndefined();
    expect(a.dirty).toBe(false);
    await a.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("ごみ箱へ移した図への書き込み (DOCUMENT_GONE) は捨ててよい失敗、他の失敗は捨てない", () => {
    expect(isDocumentGone("DOCUMENT_GONE: 図が一覧にありません")).toBe(true);
    expect(isDocumentGone("図を読めません: disk")).toBe(false);
    expect(isInitialFigureRejected("DOCUMENT_GONE: 図が一覧にありません")).toBe(false);
  });

  it("別の図に切り替えた後に古い図の変更は保存しない (cancel)", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const a = new Autosaver(save, 1000);
    a.touch("doc-1", () => "v1");
    a.cancel();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
  });
});
