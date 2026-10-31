/**
 * ツールバーが入り切らない時はアイコンだけにする (spec 34 受け入れ条件 8)。jsdom は幅を測れないので、ツールバーの幅を模擬する
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/__tests__/test-utils";
import { Toolbar } from "@/lib/desktop/toolbar";

vi.mock("@/lib/desktop/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/desktop/tauri")>()),
  invoke: async () => null,
  listen: async () => () => {},
}));

const widths = { scroll: 0, client: 0 };
const scrollDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth");
const clientDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const fake = () => {
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.testid === "desktop-toolbar" ? widths.scroll : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.testid === "desktop-toolbar" ? widths.client : 0;
    },
  });
};

const toolbar = () => (
  <Toolbar
    actions={null}
    current="flowchart"
    onSwitchKind={() => {}}
    onSave={() => {}}
    history={{ canUndo: false, canRedo: false }}
    canConfirm
    revert={{ enabled: false, title: "最後の確定から変わっていません" }}
    onRevert={() => {}}
  />
);

describe("ツールバーの幅 (spec 34)", () => {
  afterEach(() => {
    if (scrollDesc) Object.defineProperty(HTMLElement.prototype, "scrollWidth", scrollDesc);
    if (clientDesc) Object.defineProperty(HTMLElement.prototype, "clientWidth", clientDesc);
  });

  it("入り切る時は文字のボタン", () => {
    widths.scroll = 800;
    widths.client = 900;
    fake();
    render(toolbar());
    expect(screen.getByRole("button", { name: "コード生成" })).toHaveTextContent("コード生成");
  });

  it("入り切らない時はアイコンだけにし、文字は名前と title に回す", () => {
    widths.scroll = 1100;
    widths.client = 900;
    fake();
    render(toolbar());
    const code = screen.getByRole("button", { name: "コード生成" });
    expect(code).not.toHaveTextContent("コード生成");
    expect(code).toHaveAttribute("title", "コード生成");
    // title を持つボタンは title のまま (押せる・押せない理由)
    expect(screen.getByRole("button", { name: "確定へ戻す" })).toHaveAttribute(
      "title",
      "最後の確定から変わっていません"
    );
    // 種類の切り替えは文字のまま
    expect(screen.getByRole("button", { name: "フローチャート" })).toHaveTextContent(
      "フローチャート"
    );
  });
});
