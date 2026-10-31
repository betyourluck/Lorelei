import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Node } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCALES } from "@/components/i18n/i18n";
import { initialERNodes } from "@/features/er-diagram/er-diagram-editor";
import { initialFlowNodes } from "@/features/flowchart/flow-editor";
import {
  Autosaver,
  collectLayout,
  expectedKeys,
  isDocumentGone,
  isInitialFigureRejected,
  isStaleBase,
  layoutReady,
  onNodesChanged,
  staleBaseCurrent,
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

// spec 15 D4: 枠 (xyflow の親) の中のノードの position は親からの相対。layout は絶対座標で持ち、枠は大きさも持つ
describe("layout の枠 (spec 15 D4)", () => {
  const frame = (id: string, x: number, y: number, parentId?: string, size = { width: 300, height: 200 }): Node => ({
    id,
    type: "subgraphNode",
    position: { x, y },
    ...(parentId ? { parentId } : {}),
    ...size,
    data: { variableName: id, title: id },
  });
  const child = (id: string, x: number, y: number, parentId: string): Node => ({
    ...flowNode(id, id, x, y),
    parentId,
  });
  // 外枠 O (100, 50) の中に内枠 I (+20, +30)、その中に A (+5, +7)。B は O の直下 (+40, +150)、C は図の直下
  const nested = (): Node[] => [
    frame("O", 100, 50),
    frame("I", 20, 30, "O", { width: 250, height: 120 }),
    child("A", 5, 7, "I"),
    child("B", 40, 150, "O"),
    flowNode("C", "C", 400, 500),
  ];

  it("位置は根まで足した絶対座標で、枠は大きさも持つ", () => {
    expect(collectLayout("flowchart", nested())).toEqual({
      O: { x: 100, y: 50, width: 300, height: 200 },
      I: { x: 120, y: 80, width: 250, height: 120 },
      A: { x: 125, y: 87 },
      B: { x: 140, y: 200 },
      C: { x: 400, y: 500 },
    });
  });

  it("当てる時は親から順に相対へ直す (保存した絶対座標に戻る)。枠の大きさも戻る", () => {
    const saved = {
      O: { x: 10, y: 20, width: 500, height: 400 },
      I: { x: 30, y: 60, width: 260, height: 140 },
      A: { x: 40, y: 80 },
      B: { x: 50, y: 300 },
      C: { x: 1, y: 2 },
    };
    // 子を親より前に並べても計算の順に依らない
    const nodes = withLayout("flowchart", [...nested()].reverse(), saved);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get("O")).toMatchObject({ position: { x: 10, y: 20 }, width: 500, height: 400 });
    expect(byId.get("I")).toMatchObject({ position: { x: 20, y: 40 }, width: 260, height: 140 });
    expect(byId.get("A")?.position).toEqual({ x: 10, y: 20 });
    expect(byId.get("B")?.position).toEqual({ x: 40, y: 280 });
    expect(byId.get("C")?.position).toEqual({ x: 1, y: 2 });
    expect(collectLayout("flowchart", nodes)).toEqual(saved);
  });

  it("位置の無いノードは今の絶対位置のまま (親だけ動いても子は動かない)", () => {
    const nodes = withLayout("flowchart", nested(), { O: { x: 0, y: 0 } });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    // I は元の絶対位置 (120, 80) のまま = 新しい O (0, 0) から (120, 80)
    expect(byId.get("I")?.position).toEqual({ x: 120, y: 80 });
    expect(byId.get("O")).toMatchObject({ width: 300, height: 200 });
  });

  it("親子が輪になっていても止まる", () => {
    const nodes = [frame("X", 1, 2, "Y"), frame("Y", 3, 4, "X")];
    expect(Object.keys(collectLayout("flowchart", nodes)).sort()).toEqual(["X", "Y"]);
    expect(withLayout("flowchart", nodes, {})).toHaveLength(2);
  });

  it("開く図のキーには枠の ID も入る", () => {
    expect(
      expectedKeys("flowchart", {
        nodes: [{ variableName: "A" }],
        subgraphs: [{ id: "O" }, { id: "I", parent: "O" }],
      })
    ).toEqual(["A", "O", "I"]);
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
    ).toEqual({ ready: false, applyLayout: false, save: false, settled: false });
  });

  it("位置を持たない図 (AI から届いた図) も、準備済みになった時点で保存する", () => {
    // 実機で観測 (2026-09-24): AI の図は layout が空なので setNodes が起きず、次の変化まで保存されなかった。
    // source が空のまま残り、開き直すと「新規作成の直後」と判定されて初期図になる
    expect(
      onNodesChanged({ ready: false, imported: true, expected: ["会員"], page: "erDiagram", editor: "erDiagram", nodes, layout: {} })
    ).toEqual({ ready: true, applyLayout: false, save: true, settled: true });
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
    ).toEqual({ ready: true, applyLayout: true, save: false, settled: false });
  });

  // spec 33 P1 で見つけた: 位置を当てる指示の直後に、位置がまだ当たっていないノードの変化 (xyflow の測り直し) が 1 回届き、
  // それで準備済み・保存・Undo の起点になっていた (1 秒の待ちに隠れていた)。当たったのを見てから準備済みにする
  it("位置を当てる指示の後は、ノードが実際にその位置になるまで保存も見せもしない", () => {
    const layout = { 会員: { x: 1, y: 2 } };
    const base = { imported: true, expected: ["会員"], page: "erDiagram" as const, editor: "erDiagram" as const, layout };
    expect(
      onNodesChanged({ ...base, ready: true, awaitingLayout: true, nodes: [erNode("会員", "会員", 0, 0)] })
    ).toEqual({ ready: true, applyLayout: false, save: false, settled: false });
    expect(
      onNodesChanged({ ...base, ready: true, awaitingLayout: true, nodes: [erNode("会員", "会員", 1, 2)] })
    ).toEqual({ ready: true, applyLayout: false, save: true, settled: true });
    // 位置の無いノード (layout に無いキー) は見ない
    expect(
      onNodesChanged({
        ...base,
        ready: true,
        awaitingLayout: true,
        nodes: [erNode("会員", "会員", 1, 2), erNode("注文", "注文", 9, 9)],
      }).save
    ).toBe(true);
  });

  it("ページのエディタが今の図の種類と違えば、準備済みでも保存せず、準備前に戻す (spec 04 P0)", () => {
    // 実機で観測 (2026-09-25): フローの図を開いたまま、遅れて効いたページ移動で ER 図のエディタが載り、
    // ER 図のノードがフローの図として保存された (flowchart TD / node部署[] ...)
    expect(
      onNodesChanged({ ready: true, imported: true, expected: null, page: "flowchart", editor: "erDiagram", nodes, layout: {} })
    ).toEqual({ ready: false, applyLayout: false, save: false, settled: false });
    expect(
      onNodesChanged({ ready: false, imported: true, expected: ["会員"], page: "flowchart", editor: "erDiagram", nodes, layout: {} })
    ).toEqual({ ready: false, applyLayout: false, save: false, settled: false });
  });

  it("見せてよい (settled) のは、準備済みで位置を当て終えた時だけ (spec 05 D4)", () => {
    // 位置を当てる回は、当てた後の変化 (次の回) で見せる。当てる前の配置を見せない
    const base = {
      imported: true,
      expected: ["会員"],
      page: "erDiagram" as const,
      editor: "erDiagram" as const,
      nodes,
    };
    expect(onNodesChanged({ ...base, ready: false, layout: { 会員: { x: 1, y: 2 } } }).settled).toBe(false);
    expect(onNodesChanged({ ...base, ready: true, layout: { 会員: { x: 1, y: 2 } } }).settled).toBe(true);
    expect(onNodesChanged({ ...base, ready: false, imported: false, layout: {} }).settled).toBe(false);
  });

  it("当てる位置が 1 つも無い載せ替え (全ノード改名) は、当てる回を飛ばして保存する (spec 08 D3)", () => {
    // layout に古いキーしか無いと、当てる回で保存も表示も止まり時間切れに頼る (spec 08 査読 2-(7))
    const base = { ready: false, imported: true, expected: ["会員"], page: "erDiagram" as const, editor: "erDiagram" as const, nodes };
    expect(onNodesChanged({ ...base, layout: { 旧会員: { x: 1, y: 2 } } })).toEqual({
      ready: true,
      applyLayout: false,
      save: true,
      settled: true,
    });
    expect(onNodesChanged({ ...base, layout: { 会員: { x: 1, y: 2 }, 旧: { x: 0, y: 0 } } }).applyLayout).toBe(true);
  });

  it("準備済みなら変化のたびに保存する", () => {
    expect(
      onNodesChanged({ ready: true, imported: true, expected: null, page: "erDiagram", editor: "erDiagram", nodes, layout: {} })
    ).toEqual({ ready: true, applyLayout: false, save: true, settled: true });
  });
});

describe("エディタの初期図 (data_contract Document.initial_sources, spec 04 D4-2・spec 34 D6)", () => {
  // Rust の save はこれらと一字一句同じ source を AI / インポートの図の最初の書き込みに書かせない。初期図は作った時の言語なので、
  // 画面の全部の言語の初期図を fixture に書き、Rust のテスト (documents.rs の initial_sources_match_the_fixture_written_by_vitest) が比べる。
  // フォーク元の初期図や訳を変えて落ちたら、LORELEI_UPDATE_FIXTURES=1 で回して書き直し、src-tauri の initial_sources と data_contract も直す
  const FIXTURE = path.resolve(__dirname, "../../../src-tauri/tests/fixtures/initial_sources.json");
  const unique = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) === i);
  it("全部の言語の初期図を生成器にかけた出力が fixture と同じ", () => {
    const expected = {
      erDiagram: unique(LOCALES.map(({ code }) => toSource("erDiagram", initialERNodes(code), []))),
      flowchart: unique(LOCALES.map(() => toSource("flowchart", initialFlowNodes, []))),
    };
    if (process.env.LORELEI_UPDATE_FIXTURES) writeFileSync(FIXTURE, `${JSON.stringify(expected, null, 2)}\n`);
    expect(JSON.parse(readFileSync(FIXTURE, "utf8"))).toEqual(expected);
  });
  it("日本語の画面の初期図は前と同じ。英語は User", () => {
    expect(toSource("flowchart", initialFlowNodes, [])).toBe("flowchart TD\n    startNode[Start]\n");
    expect(toSource("erDiagram", initialERNodes("ja"), [])).toBe(
      "erDiagram\n  ユーザー {\n    int id PK\n    varchar(255) name UK\n  }"
    );
    expect(toSource("erDiagram", initialERNodes("en"), [])).toBe(
      "erDiagram\n  User {\n    int id PK\n    varchar(255) name UK\n  }"
    );
    // 省くと今の言語 (テストは日本語)
    expect(initialERNodes()[0].data.name).toBe("ユーザー");
  });
});

describe("toSource の向き (spec 07 D3)", () => {
  it("エディタの向きで書く。ER 図は TD なら向きの行を書かない", () => {
    expect(toSource("flowchart", initialFlowNodes, [], "LR")).toBe("flowchart LR\n    startNode[Start]\n");
    expect(toSource("erDiagram", initialERNodes(), [], "LR").split("\n").slice(0, 2)).toEqual([
      "erDiagram",
      "  direction LR",
    ]);
    expect(toSource("erDiagram", initialERNodes(), [], "TD")).not.toContain("direction");
  });
});

describe("toSource のテーマ (spec 24 D1)", () => {
  it("default 以外のテーマは図の先頭に frontmatter で書き、default は今までと同じ", () => {
    const dark = "---\nconfig:\n  theme: dark\n---\n";
    expect(toSource("flowchart", initialFlowNodes, [], "LR", "dark")).toBe(`${dark}flowchart LR\n    startNode[Start]\n`);
    expect(toSource("erDiagram", initialERNodes(), [], "TD", "dark")).toBe(`${dark}${toSource("erDiagram", initialERNodes(), [])}`);
    expect(toSource("flowchart", initialFlowNodes, [], "TD", "default")).toBe(toSource("flowchart", initialFlowNodes, []));
    expect(toSource("erDiagram", initialERNodes(), [], "TD", "default")).toBe(toSource("erDiagram", initialERNodes(), []));
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
    expect(save).toHaveBeenCalledWith("doc-1", "v2", false);
  });

  it("flush は待たずに保存し、変化が無ければ何もしない", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const a = new Autosaver(save, 1000);
    await a.flush();
    expect(save).not.toHaveBeenCalled();
    a.touch("doc-1", () => "v1");
    await a.flush();
    expect(save).toHaveBeenCalledWith("doc-1", "v1", false);
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
    expect(save).toHaveBeenLastCalledWith("doc-1", "v1", false);
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

  it("古い版を添えた書き込み (STALE_BASE) は捨ててよい失敗で、今の updated_at を取り出せる (spec 08 D2)", () => {
    expect(isStaleBase("STALE_BASE: 2026-09-28T10:00:00.000001+09:00")).toBe(true);
    expect(staleBaseCurrent("STALE_BASE: 2026-09-28T10:00:00.000001+09:00")).toBe("2026-09-28T10:00:00.000001+09:00");
    expect(isStaleBase("DOCUMENT_GONE: 図が一覧にありません")).toBe(false);
    expect(staleBaseCurrent("disk")).toBeNull();
  });

  it("ごみ箱へ移した図への書き込み (DOCUMENT_GONE) は捨ててよい失敗、他の失敗は捨てない", () => {
    expect(isDocumentGone("DOCUMENT_GONE: 図が一覧にありません")).toBe(true);
    expect(isDocumentGone("図を読めません: disk")).toBe(false);
    expect(isInitialFigureRejected("DOCUMENT_GONE: 図が一覧にありません")).toBe(false);
  });

  // spec 33 D2: 走っている保存の戻り (新しい updated_at) を待たずに次を送ると、次が STALE_BASE になる・図を離れる時に保存が残る
  it("flush は走っている保存の終わりを待ってから次を送り、全部を書き終えてから戻る", async () => {
    let release!: () => void;
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
      .mockResolvedValue(undefined);
    const a = new Autosaver(save, 1000);
    a.touch("doc-1", () => "v1");
    const first = a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    a.touch("doc-1", () => "v2");
    let done = false;
    const second = a.flush().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);

    release();
    await first;
    await second;
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("doc-1", "v2", false);
  });

  // spec 33 D1: 揃え書き (印付き) は待たずにすぐ書き、その間の人の編集 (touch) に中身も印も上書きされない
  it("saveNow は印付きですぐ保存し、後から来た touch は別の (印の無い) 保存になる", async () => {
    let release!: () => void;
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
      .mockResolvedValue(undefined);
    const a = new Autosaver(save, 1000);
    // 走っている保存がある間に、揃え書きと人の編集が来る
    a.touch("doc-1", () => "old");
    void a.flush();
    a.saveNow("doc-1", () => "ai");
    a.touch("doc-1", () => "human");
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenNthCalledWith(2, "doc-1", "ai", true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenNthCalledWith(3, "doc-1", "human", false);
    expect(save).toHaveBeenCalledTimes(3);
  });

  it("cancel は揃え書きの待ちも捨てる", async () => {
    let release!: () => void;
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
      .mockResolvedValue(undefined);
    const a = new Autosaver(save, 1000);
    a.touch("doc-1", () => "old");
    void a.flush();
    a.saveNow("doc-1", () => "ai");
    a.cancel();
    release();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
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
