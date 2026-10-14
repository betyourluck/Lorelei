/**
 * spec 25: コード生成のダイアログの「ダウンロード」(.mmd) は、デスクトップでは保存ダイアログ (export_diagram の mmd) を出して知らせ、
 * Web 版では今の Blob のダウンロードのまま。保存ダイアログは窓に 1 つだけ (書き出しのボタンと共有, D5)
 */
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "@/__tests__/test-utils";
import { ERDiagramMermaidModal } from "@/features/er-diagram/components/panel/er-diagram-mermaid-modal";
import { DownloadModal } from "@/features/flowchart/components/mermaid/download-modal";
import { generateMermaidCode } from "@/features/flowchart/hooks/mermaid";

const tauri = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  exportDiagram:
    vi.fn<(source: string, format: string, fileStem: string) => Promise<string | null>>(),
}));
// 境界を静的に模擬する (@tauri-apps/api/* だけの模擬は未処理のエラーを出す, failures #14)
vi.mock("@/lib/desktop/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/desktop/tauri")>()),
  isTauri: tauri.isTauri,
  exportDiagram: tauri.exportDiagram,
}));

const flowData = {
  nodes: [
    {
      id: "A",
      type: "editableNode",
      position: { x: 0, y: 0 },
      data: { label: "注文を受ける", variableName: "A", shapeType: "rectangle" },
    },
  ],
  edges: [],
};
const ER = "---\nconfig:\n  theme: dark\n---\nerDiagram\n  顧客 ||--o{ 注文 : places";

/** 呼んだ側が解くまで待つ保存ダイアログ */
const pending = () => {
  let resolve!: (path: string | null) => void;
  const promise = new Promise<string | null>((r) => (resolve = r));
  return { promise, resolve };
};

let createObjectURL: ReturnType<typeof vi.fn>;
/** Web の落とし方が <a download> を踏んだか (jsdom は blob: への移動を実装しておらず、踏むと誤りを出す) */
let anchorClick: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  tauri.isTauri.mockReturnValue(true);
  tauri.exportDiagram.mockReset();
  createObjectURL = vi.fn(() => "blob:x");
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  vi.clearAllMocks();
  anchorClick.mockRestore();
});

describe("デスクトップの「ダウンロード」(spec 25 D4)", () => {
  test("フローチャート: 保存ダイアログを mmd・flowchart・コードそのもので 1 回出し、Blob では落とさず、保存したら知らせる", async () => {
    tauri.exportDiagram.mockResolvedValue("C:\\out\\flowchart.mmd");
    const { user } = render(
      <DownloadModal open onClose={vi.fn()} flowData={flowData} theme="forest" />
    );

    await user.click(screen.getByRole("button", { name: "ダウンロード" }));

    expect(tauri.exportDiagram).toHaveBeenCalledTimes(1);
    expect(tauri.exportDiagram).toHaveBeenCalledWith(
      generateMermaidCode(flowData, "TD", "forest"),
      "mmd",
      "flowchart"
    );
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(anchorClick).not.toHaveBeenCalled();
    expect(await screen.findByText("保存しました")).toBeInTheDocument();
    expect(screen.getByText("C:\\out\\flowchart.mmd")).toBeInTheDocument();
  });

  test("ER 図: onDownload (Web の落とし方) を呼ばず、保存ダイアログを mmd・er-diagram で出す", async () => {
    tauri.exportDiagram.mockResolvedValue("C:\\out\\er-diagram.mmd");
    const onDownload = vi.fn();
    const { user } = render(
      <ERDiagramMermaidModal open onClose={vi.fn()} code={ER} onDownload={onDownload} />
    );

    await user.click(screen.getByRole("button", { name: "ダウンロード" }));

    expect(tauri.exportDiagram).toHaveBeenCalledWith(ER, "mmd", "er-diagram");
    expect(onDownload).not.toHaveBeenCalled();
    expect(await screen.findByText("保存しました")).toBeInTheDocument();
  });

  test("取り消したら何も知らせない", async () => {
    tauri.exportDiagram.mockResolvedValue(null);
    const { user } = render(
      <ERDiagramMermaidModal open onClose={vi.fn()} code={ER} onDownload={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "ダウンロード" }));

    await waitFor(() => expect(tauri.exportDiagram).toHaveBeenCalledTimes(1));
    // 保存ダイアログが閉じた (ボタンがまた押せる) 後も知らせが無い
    await waitFor(() => expect(screen.getByRole("button", { name: "SVG" })).toBeEnabled());
    expect(screen.queryByText("保存しました")).toBeNull();
    expect(screen.queryByText("保存できませんでした")).toBeNull();
  });

  test("保存に失敗したらエラーを知らせる", async () => {
    tauri.exportDiagram.mockRejectedValue(
      "拡張子が形式と一致しません (形式 mmd、パス C:\\out\\x.svg)"
    );
    const { user } = render(
      <ERDiagramMermaidModal open onClose={vi.fn()} code={ER} onDownload={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "ダウンロード" }));

    expect(await screen.findByText("保存できませんでした")).toBeInTheDocument();
    expect(screen.getByText(/拡張子が形式と一致しません/)).toBeInTheDocument();
  });
});

describe("保存ダイアログは窓に 1 つだけ (spec 25 D5)", () => {
  test("出している間は「ダウンロード」も SVG も 2 つ目を出さず、書き出しのボタンは押せない。閉じたら押せる", async () => {
    const dialog = pending();
    tauri.exportDiagram.mockReturnValue(dialog.promise);
    const { user } = render(<DownloadModal open onClose={vi.fn()} flowData={flowData} />);

    await user.click(screen.getByRole("button", { name: "ダウンロード" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "SVG" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "PNG" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "PDF" })).toBeDisabled();
    // ダウンロードのボタンは見た目を変えない (押しても何もしない)
    expect(screen.getByRole("button", { name: "ダウンロード" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "ダウンロード" }));
    expect(tauri.exportDiagram).toHaveBeenCalledTimes(1);

    dialog.resolve(null);
    await waitFor(() => expect(screen.getByRole("button", { name: "SVG" })).toBeEnabled());
  });

  test("SVG の保存ダイアログを出している間は、「ダウンロード」を押しても 2 つ目を出さない", async () => {
    const dialog = pending();
    tauri.exportDiagram.mockReturnValue(dialog.promise);
    const { user } = render(<DownloadModal open onClose={vi.fn()} flowData={flowData} />);

    await user.click(await screen.findByRole("button", { name: "SVG" }));
    await user.click(screen.getByRole("button", { name: "ダウンロード" }));

    expect(tauri.exportDiagram).toHaveBeenCalledTimes(1);
    expect(tauri.exportDiagram.mock.calls[0][1]).toBe("svg");
    expect(createObjectURL).not.toHaveBeenCalled();
    dialog.resolve(null);
    await waitFor(() => expect(screen.getByRole("button", { name: "SVG" })).toBeEnabled());
  });
});

describe("Web 版の「ダウンロード」は今のまま (spec 25 受け入れ条件 7)", () => {
  test("フローチャートは Blob で落とし、保存ダイアログは出さない", async () => {
    tauri.isTauri.mockReturnValue(false);
    const { user } = render(<DownloadModal open onClose={vi.fn()} flowData={flowData} />);

    await user.click(screen.getByRole("button", { name: "ダウンロード" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(tauri.exportDiagram).not.toHaveBeenCalled();
    // 書き出しのボタンは Web 版には出ない
    expect(screen.queryByRole("button", { name: "SVG" })).toBeNull();
  });

  test("ER 図は onDownload を 1 回呼び、保存ダイアログは出さない", async () => {
    tauri.isTauri.mockReturnValue(false);
    const onDownload = vi.fn();
    const { user } = render(
      <ERDiagramMermaidModal open onClose={vi.fn()} code={ER} onDownload={onDownload} />
    );

    await user.click(screen.getByRole("button", { name: "ダウンロード" }));

    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(tauri.exportDiagram).not.toHaveBeenCalled();
  });
});
