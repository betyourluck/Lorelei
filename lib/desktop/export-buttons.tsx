"use client";

import { Button, ButtonGroup, useNotice } from "@yamada-ui/react";
import type { FC } from "react";
import { useEffect, useState } from "react";
import { runSaveDialog, useSaveDialogBusy } from "./save-dialog";
import type { ExportFormat } from "./tauri";
import { exportDiagram, isTauri } from "./tauri";

interface ExportButtonsProps {
  /** 書き出す Mermaid */
  code: string;
  /** 保存ダイアログの既定のファイル名 (拡張子なし) */
  fileStem: string;
}

// .mmd は同じダイアログの「ダウンロード」(useMmdDownload) が保存する (spec 25)
const FORMATS: ExportFormat[] = ["svg", "png", "pdf"];

/** SVG / PNG / PDF で保存するボタン。デスクトップ版 (Tauri) の時だけ出る (spec 01 D9) */
export const ExportButtons: FC<ExportButtonsProps> = ({ code, fileStem }) => {
  const notice = useNotice();
  // 静的書き出しの HTML と食い違わないよう、マウント後に判定する
  const [desktop, setDesktop] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  // 保存ダイアログは窓に 1 つだけ。「ダウンロード」から出したものでも押せなくする (spec 25 D5)
  const dialogBusy = useSaveDialogBusy();
  useEffect(() => setDesktop(isTauri()), []);
  if (!desktop) return null;

  const save = async (format: ExportFormat) => {
    setBusy(format);
    try {
      const result = await runSaveDialog(() => exportDiagram(code, format, fileStem));
      if (result.ran && result.value)
        notice({
          status: "success",
          title: "保存しました",
          description: result.value,
          isClosable: true,
        });
    } catch (e) {
      notice({
        status: "error",
        title: "保存できませんでした",
        description: String(e),
        isClosable: true,
        duration: null,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <ButtonGroup size="sm" variant="outline" attached>
      {FORMATS.map((format) => (
        <Button
          key={format}
          loading={busy === format}
          disabled={busy !== null || dialogBusy}
          onClick={() => void save(format)}
        >
          {format.toUpperCase()}
        </Button>
      ))}
    </ButtonGroup>
  );
};
