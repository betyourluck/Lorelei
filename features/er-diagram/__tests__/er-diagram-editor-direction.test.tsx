import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "../../../__tests__/test-utils";
import { ERDiagramEditor } from "../er-diagram-editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/er-diagram/" }));

// spec 07 D1: ER 図の向き。パネルで変えると、テーブルの接続点が向きに合う
// エディタ全体を描くので重い (failures #3 と同じ型で上限を上げる)
describe("ER 図の向き", { timeout: 15000 }, () => {
  test("パネルで LR にすると、テーブルの接続点が左右になる", async () => {
    const { user } = render(
      <ReactFlowProvider>
        <ERDiagramEditor />
      </ReactFlowProvider>
    );
    await screen.findByDisplayValue("ユーザー");
    expect(document.querySelector(".react-flow__handle-top")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "図の向き: TD" }));
    await user.click(await screen.findByRole("menuitem", { name: "LR" }));
    await waitFor(() => expect(document.querySelector(".react-flow__handle-left")).not.toBeNull());
    expect(document.querySelector(".react-flow__handle-right")).not.toBeNull();
    expect(document.querySelector(".react-flow__handle-top")).toBeNull();
  });
});
