"use client";

import { useNotice } from "@yamada-ui/react";
import { useCallback, useRef } from "react";
import { describeError } from "./errors";
import { desktopT } from "./i18n";
import { runSaveDialog, useSaveDialogBusy } from "./save-dialog";
import { exportDiagram, isTauri } from "./tauri";

/**
 * コード生成のダイアログの「ダウンロード」(.mmd) の口 (spec 25 D4、data_contract `DesktopMmdDownload`)。
 * デスクトップでは保存ダイアログを出して知らせ、Web の落とし方 (Blob + <a download>) は呼ばない — 呼ぶと WebView2 が
 * 「ダウンロード」フォルダへ黙って保存する (spec 24 P3)。Web 版では webDownload をそのまま呼ぶ
 */
export function useMmdDownload(
  /** 保存ダイアログの既定の名前 (拡張子なし)。flowchart / er-diagram */
  fileStem: string,
  /** Web の落とし方 (フォーク元の今の処理。デスクトップでは呼ばない) */
  webDownload: () => void
): {
  /** 「ダウンロード」を押した時に呼ぶ。code はダイアログのコード (テーマの frontmatter を含む) */
  download: (code: string) => void;
  /** 保存ダイアログを出している間 true (どのボタンから出したものでも) */
  busy: boolean;
} {
  const notice = useNotice();
  const busy = useSaveDialogBusy();
  const latest = useRef(webDownload);
  latest.current = webDownload;

  // 描く物は変えないので、デスクトップかは押した時に見る (ExportButtons のようにマウントの後に判定しなくてよい)
  const download = useCallback(
    (code: string) => {
      if (!isTauri()) {
        latest.current();
        return;
      }
      runSaveDialog(() => exportDiagram(code, "mmd", fileStem))
        .then((result) => {
          if (result.ran && result.value)
            notice({
              status: "success",
              title: desktopT("save.saved"),
              description: result.value,
              isClosable: true,
            });
        })
        .catch((e) =>
          notice({
            status: "error",
            title: desktopT("save.failed"),
            description: describeError(e),
            isClosable: true,
            duration: null,
          })
        );
    },
    [fileStem, notice]
  );

  return { download, busy };
}
