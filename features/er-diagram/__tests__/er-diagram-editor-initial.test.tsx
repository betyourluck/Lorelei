import { act } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, test, vi } from "vitest";
import { i18n } from "@/components/i18n/i18n";
import { render, screen } from "../../../__tests__/test-utils";
import { ERDiagramEditor } from "../er-diagram-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/er-diagram/",
}));

const editor = () =>
  render(
    <ReactFlowProvider>
      <ERDiagramEditor />
    </ReactFlowProvider>
  );

// spec 34 D6: 初期図のテーブルの名は作った時の言語 (新しい要素の名と同じ)。後で言語を切り替えても、もうある名は変えない
// エディタ全体を描くので重い (failures #3 と同じ型で上限を上げる)
describe("ER 図の初期図の名", { timeout: 15000 }, () => {
  test("英語の画面で作ると User、切り替えても名は変わらない", async () => {
    await i18n.changeLanguage("en");
    editor();
    expect(await screen.findByDisplayValue("User")).toBeInTheDocument();
    await act(() => i18n.changeLanguage("ja"));
    expect(screen.getByDisplayValue("User")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("ユーザー")).toBeNull();
  });

  test("日本語の画面では前と同じユーザー", async () => {
    editor();
    expect(await screen.findByDisplayValue("ユーザー")).toBeInTheDocument();
  });
});
