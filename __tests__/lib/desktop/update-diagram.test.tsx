import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/__tests__/test-utils";
import { FlowEditor } from "@/features/flowchart/flow-editor";
import { readFlowchartForImport } from "@/features/flowchart/utils/import-flowchart";
import { DesktopShell } from "@/lib/desktop/desktop-shell";
import { DOCUMENTS_EVENT, OPEN_EVENT } from "@/lib/desktop/tauri";
import { clearPendingOpens } from "@/lib/desktop/use-desktop-open";
import { fakeBackend } from "./fake-backend";

let backend = fakeBackend();
/**
 * Rust が出すイベントを、テストから起こす。lib/desktop/tauri の listen / listenPayload を静的に模擬してハンドラを捕まえる。
 * @tauri-apps/api/event の動的 import を vi.mock する形だと、同じテストの途中で模擬が本物に差し替わることがある
 * (direction-save.test.tsx の未処理エラー 14 件と同じ現象。2026-09-28 に観測)。同じイベントに複数の聞き手が居る
 */
const { handlers, fire, subscribe } = vi.hoisted(() => {
  type Handler = (payload: unknown) => void;
  const handlers = new Map<string, Set<Handler>>();
  const subscribe = async (event: string, handler: Handler): Promise<() => void> => {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(handler);
    return () => {
      handlers.get(event)?.delete(handler);
    };
  };
  const fire = (event: string, payload: unknown) => {
    handlers.get(event)?.forEach((h) => h(payload));
  };
  return { handlers, fire, subscribe };
});
vi.mock("@/lib/desktop/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/desktop/tauri")>()),
  listen: subscribe,
  listenPayload: subscribe,
  // 窓の操作も同じ理由で静的に模擬する (動的 import の @tauri-apps/api/window が途中で本物になり、未処理エラーを出す)
  onCloseRequested: async () => () => {},
  windowAction: async () => {},
  invoke: (cmd: string, args?: Record<string, unknown>) => backend.invoke(cmd, args ?? {}),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: [string, Record<string, unknown>]) => backend.invoke(...a),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onCloseRequested: async () => () => {}, show: async () => {} }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

const SOURCE = "flowchart LR\n    A[A]\n    B[B]\n    A --> B\n";
const LAYOUT = { A: { x: 0, y: 0 }, B: { x: 450, y: 0 } };

/** Rust の convert_source の模擬。変換は Rust の to_editor と同じ対応表の TS の取り込み (spec 11 D1) */
const convert = async (source: string) => {
  const read = await readFlowchartForImport(source);
  if (!read.ok) throw new Error(read.error);
  return {
    source,
    payload: { editor: "flowchart" as const, data: read.data, dropped: [] },
    dropped: [],
    error: null,
  };
};

const shell = () =>
  render(
    <ReactFlowProvider>
      <DesktopShell>
        <FlowEditor />
      </DesktopShell>
    </ReactFlowProvider>
  );

/** 図を開き終え、開いた直後の自動保存 (位置を当てた後の 1 回) が届くまで待つ。届く前に書き換えると、その保存が STALE_BASE になる (それも設計どおりだが、ここで試すことではない) */
const opened = async () => {
  const menus = await screen.findAllByRole("button", { name: /図の向き: / }, { timeout: 8000 });
  await waitFor(() => expect(backend.calls("save_document")).toHaveLength(1), { timeout: 4000 });
  return menus[0];
};

/** mermaid の初回の読み込みは全件を並列に回すと 8 秒を超え、図を開き終える待ちに食い込む。先に 1 度読んでおき、テストの中の変換は解析だけにする (spec 12) */
beforeAll(async () => {
  await readFlowchartForImport("flowchart TD\n  A --> B\n");
}, 60000);

// spec 08 D2・D3: AI が update_diagram で書き換えた図を GUI が受ける
describe("update_diagram の載せ替えと楽観ロック (spec 08)", { timeout: 20000 }, () => {
  beforeEach(() => {
    backend = fakeBackend();
    const real = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd: string, args: Record<string, unknown> = {}) =>
      cmd === "convert_source"
        ? ({ ...(await convert(String(args.source))), document: null } as unknown as Awaited<
            ReturnType<typeof real>
          >)
        : real(cmd, args)
    );
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    localStorage.clear();
    clearPendingOpens();
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    handlers.clear();
  });

  it("開いている図の載せ替えは、同じ ID の位置を保ち、揃え書きは今の版で 1 回だけ保存する (updated_at は進まない)", async () => {
    const doc = backend.add("flowchart", "注文", { origin: "ai", source: SOURCE, layout: LAYOUT });
    backend.setLast(doc.id);
    shell();
    await opened();
    const before = backend.calls("save_document").length;

    // Rust の deliver_update: Store::update → reload の要求 (layout 付き) → OPEN_EVENT
    const next = "flowchart LR\n  A --> B --> C\n";
    const summary = backend.update(doc.id, next);
    backend.pending.push({
      ...(await convert(next)),
      document: summary,
      reload: true,
      layout: backend.docs.get(doc.id)!.layout,
    });
    fire(OPEN_EVENT, null);

    await screen.findByText("AI が図を書き換えました", {}, { timeout: 8000 });
    await waitFor(() => expect(backend.calls("save_document").length).toBeGreaterThan(before), {
      timeout: 8000,
    });
    const saves = backend.calls("save_document").slice(before) as Record<string, unknown>[];
    // 古い書きかけは書かれない。揃え書きは載せ替え後の版を添え、同じ ID (A・B) の位置を保ち、足した C を含む
    expect(saves.every((a) => String(a.source).includes("C"))).toBe(true);
    expect(saves[0].baseUpdatedAt).toBe(summary.updatedAt);
    expect((saves[0].layout as typeof LAYOUT).A).toEqual(LAYOUT.A);
    expect((saves[0].layout as typeof LAYOUT).B).toEqual(LAYOUT.B);
    const after = backend.docs.get(doc.id)!;
    expect(after.updatedAt).toBe(summary.updatedAt);
    expect(after.normalizePending).toBe(false);
  });

  it("載せ替えが来ない書き換え (last_opened が古かった) は、● を付け、古い版の自動保存を STALE_BASE で捨てて開き直す", async () => {
    const doc = backend.add("flowchart", "注文", { origin: "ai", source: SOURCE, layout: LAYOUT });
    backend.setLast(doc.id);
    const { user } = shell();
    const menu = await opened();
    expect(menu).toHaveAccessibleName("図の向き: LR");

    // Rust は FileOnly: ファイルだけ書き、documents-changed を出す → 一覧の 1 件だけ差し替わる (●)
    const summary = backend.update(doc.id, "flowchart TD\n  A --> B\n  B --> C\n");
    fire(DOCUMENTS_EVENT, summary);
    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("● 注文"));

    // 人が (載せ替えを知らずに) 向きを変える → 古い版の自動保存 → STALE_BASE → 開き直す
    await user.click(menu);
    await user.click(await screen.findByRole("menuitem", { name: "RL" }));
    await screen.findByText("AI が図を書き換えたので開き直します", {}, { timeout: 8000 });
    await screen.findAllByRole("button", { name: "図の向き: TD" }, { timeout: 8000 });
    // 古い中身 (RL) はファイルに届かず、開き直した後の揃え書きで AI の中身が残る
    await waitFor(() => expect(backend.docs.get(doc.id)!.source).toContain("C"), { timeout: 8000 });
    expect(backend.docs.get(doc.id)!.source.startsWith("flowchart TD")).toBe(true);
    expect(
      backend.calls("save_document").some((a) => String(a?.source).startsWith("flowchart RL"))
    ).toBe(true);
  });

  it("起動直後 (今の図が無い) に前回の図への載せ替えが届いていれば、その図を新しい中身で開く", async () => {
    // 実機で観測 (2026-09-28): 題名と ● は届いた図なのに、キャンバスは初期図のまま。外枠が付く前の最初の描画のエディタが
    // take_pending_open で要求を取り込み、外枠付きのエディタに作り直された時に中身が捨てられていた
    const next = "flowchart TD\n  受注 --> 起動直後\n";
    const doc = backend.add("flowchart", "受注の流れ", {
      origin: "ai",
      source: next,
      originalSource: next,
      normalizePending: true,
      layout: { 受注: { x: 0, y: 0 } },
    });
    backend.setLast(doc.id);
    backend.pending.push({
      ...(await convert(next)),
      document: backend.summary(doc),
      reload: true,
      layout: doc.layout,
    });
    shell();
    await screen.findByText("起動直後", {}, { timeout: 8000 });
    // 揃え書きが出て印が消え、updated_at は進まない
    await waitFor(() => expect(backend.docs.get(doc.id)!.normalizePending).toBe(false), {
      timeout: 8000,
    });
    const after = backend.docs.get(doc.id)!;
    // 位置を当てた後の変化でもう 1 回保存が出ることがある (中身が同じなら Rust は書かない)。進んでいないことを見る
    expect(backend.calls("save_document").length).toBeGreaterThan(0);
    expect(after.updatedAt).toBe(doc.updatedAt);
    expect(after.source).toContain("起動直後");
  });
});
