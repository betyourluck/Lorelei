import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/__tests__/test-utils";
import { ERDiagramEditor } from "@/features/er-diagram/er-diagram-editor";
import { readErForImport } from "@/features/er-diagram/utils/import-er";
import { FlowEditor } from "@/features/flowchart/flow-editor";
import { readFlowchartForImport } from "@/features/flowchart/utils/import-flowchart";
import { DesktopShell } from "@/lib/desktop/desktop-shell";
import { clearPendingOpens } from "@/lib/desktop/use-desktop-open";
import { fakeBackend } from "./fake-backend";

let backend = fakeBackend();
let pathname = "/";
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: [string, Record<string, unknown>]) => backend.invoke(...a),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onCloseRequested: async () => () => {}, show: async () => {} }),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
// 境界の窓・イベントは静的に模擬する (failures #14)
vi.mock("@/lib/desktop/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/desktop/tauri")>()),
  listen: async () => () => {},
  listenPayload: async () => () => {},
  onCloseRequested: async () => () => {},
  windowAction: async () => {},
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => pathname,
}));

const DARK = "---\nconfig:\n  theme: dark\n---\n";
const FLOW = `${DARK}flowchart LR\n    A[A]\n    B[B]\n    A --> B\n`;
const ER = `${DARK}erDiagram\n  顧客 {\n    int id PK\n  }\n  注文 {\n    int id PK\n  }\n  顧客 ||--o{ 注文 : "行う"\n`;

/** mermaid の初回の読み込みを先に済ませる (direction-save.test.tsx と同じ) */
beforeAll(async () => {
  await readFlowchartForImport("flowchart TD\n  A --> B\n");
}, 60000);

const sources = () => backend.calls("save_document").map((a) => String(a?.source));

// spec 24 P2: 図の先頭のテーマは、デスクトップの自動保存 (toSource) でも消えない。P0 では最初の自動保存で生成器の出力になり、テーマが消えた
// 開く・ダイアログ・メニューを通すので重い。全件を並列に回すと 20 秒を超えた (単独では 2〜3 秒, failures #3 の形)
describe("テーマの保存 (spec 24 D1)", { timeout: 40000 }, () => {
  beforeEach(() => {
    backend = fakeBackend();
    // 変換は Rust の to_editor と同じ対応表の TS の取り込み (spec 11 D1・spec 24 の fixture で突き合わせ済み) で、Rust と同じ形を返す
    const real = backend.invoke.getMockImplementation()!;
    backend.invoke.mockImplementation(async (cmd: string, args: Record<string, unknown> = {}) => {
      if (cmd !== "convert_source") return real(cmd, args);
      const source = String(args.source);
      const er = source.includes("erDiagram");
      const read = er ? await readErForImport(source) : await readFlowchartForImport(source);
      if (!read.ok) throw new Error(read.error);
      return {
        source,
        payload: { editor: er ? "erDiagram" : "flowchart", data: read.data, dropped: read.dropped },
        dropped: read.dropped,
        error: null,
        document: null,
      } as unknown as Awaited<ReturnType<typeof real>>;
    });
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    localStorage.clear();
    clearPendingOpens();
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    pathname = "/";
  });

  it("テーマを書いたフローチャートを開くと、自動保存してもテーマが残り、コード生成で変えたテーマで保存する", async () => {
    pathname = "/";
    const doc = backend.add("flowchart", "暗い図", {
      origin: "ai",
      source: FLOW,
      layout: { A: { x: 0, y: 0 }, B: { x: 450, y: 0 } },
    });
    backend.setLast(doc.id);
    const { user } = render(
      <ReactFlowProvider>
        <DesktopShell>
          <FlowEditor />
        </DesktopShell>
      </ReactFlowProvider>
    );
    // 開いた後の揃え書きでもテーマが残る
    await waitFor(() => expect(sources().length).toBeGreaterThan(0), { timeout: 15000 });
    expect(
      sources().every((s) => s.startsWith(`${DARK}flowchart LR\n`)),
      JSON.stringify(sources())
    ).toBe(true);

    // ツールバーのコード生成 → テーマのメニューで forest
    await user.click(screen.getByRole("button", { name: "コード生成" }));
    await user.click(await screen.findByRole("button", { name: "テーマ: dark" }));
    await user.click(await screen.findByRole("menuitem", { name: "forest" }));
    // default の時に何も書かないのは doc-session.test.ts の toSource のテーマで押さえる
    await waitFor(
      () =>
        expect(
          backend.docs.get(doc.id)!.source.startsWith("---\nconfig:\n  theme: forest\n---\n")
        ).toBe(true),
      {
        timeout: 8000,
      }
    );
  });

  it("テーマを書いた ER 図を開くと、自動保存してもテーマが残る", async () => {
    pathname = "/er-diagram";
    const doc = backend.add("erDiagram", "暗い ER 図", {
      origin: "ai",
      source: ER,
      layout: { 顧客: { x: 0, y: 0 }, 注文: { x: 450, y: 0 } },
    });
    backend.setLast(doc.id);
    const { user } = render(
      <ReactFlowProvider>
        <DesktopShell>
          <ERDiagramEditor />
        </DesktopShell>
      </ReactFlowProvider>
    );
    await waitFor(() => expect(sources().length).toBeGreaterThan(0), { timeout: 15000 });
    expect(
      sources().every((s) => s.startsWith(`${DARK}erDiagram\n`)),
      JSON.stringify(sources())
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "コード生成" }));
    await user.click(await screen.findByRole("button", { name: "テーマ: dark" }));
    await user.click(await screen.findByRole("menuitem", { name: "neutral" }));
    await waitFor(
      () =>
        expect(
          backend.docs
            .get(doc.id)!
            .source.startsWith("---\nconfig:\n  theme: neutral\n---\nerDiagram\n")
        ).toBe(true),
      { timeout: 8000 }
    );
  });
});
