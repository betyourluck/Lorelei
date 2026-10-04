import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "../../../../../__tests__/test-utils";
import { FlowEditor } from "../../../flow-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

const editor = () =>
  render(
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  );

type User = ReturnType<typeof editor>["user"];

const importCode = async (user: User, code: string) => {
  await user.click(screen.getByRole("button", { name: "インポート" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("textbox"));
  await user.paste(code);
  await user.click(within(dialog).getByRole("button", { name: "インポート" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
};

/** ノードの位置 (xyflow がノードの要素に付ける translate) */
const positionOf = (id: string) => {
  const el = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement | null;
  const m = el && /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform);
  if (!m) throw new Error(`no node ${id}`);
  return { x: Number(m[1]), y: Number(m[2]) };
};

// spec 18: 枠の無い図の取り込み (フォーク元の layoutNodes) も、輪をほどいて段に分ける
describe("枠の無い図の取り込みの段組み (spec 18)", { timeout: 30000 }, () => {
  test("閉じた輪は 1 段に並ばず、最初に出てきたノードが一番上", async () => {
    const { user } = editor();
    await screen.findByText("Start");
    await importCode(user, "flowchart TD\n  A[一] --> B[二]\n  B --> C[三]\n  C --> A");
    await waitFor(() =>
      expect(document.querySelector('.react-flow__node[data-id="C"]')).not.toBeNull()
    );
    const [a, b, c] = ["A", "B", "C"].map(positionOf);
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBeLessThan(c.y);
  });

  test("LR の閉じた輪は左から右へ段に分かれる", async () => {
    const { user } = editor();
    await screen.findByText("Start");
    await importCode(user, "flowchart LR\n  A[一] --> B[二]\n  B --> C[三]\n  C --> A");
    await waitFor(() =>
      expect(document.querySelector('.react-flow__node[data-id="C"]')).not.toBeNull()
    );
    const [a, b, c] = ["A", "B", "C"].map(positionOf);
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(c.x);
  });

  test("輪の無い図でも、横に走る線を作らない (A → B・A → C・C → B で B は C より下)", async () => {
    const { user } = editor();
    await screen.findByText("Start");
    await importCode(user, "flowchart TD\n  A[一] --> B[二]\n  A --> C[三]\n  C --> B");
    await waitFor(() =>
      expect(document.querySelector('.react-flow__node[data-id="C"]')).not.toBeNull()
    );
    expect(positionOf("C").y).toBeLessThan(positionOf("B").y);
  });
});
