"use client";

import { useNotice } from "@yamada-ui/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { EditorKind, OpenRequest } from "./open-requests";
import { describeDropped, partitionOpens, routeOf } from "./open-requests";
import { isTauri, listen, OPEN_EVENT, takePendingOpen } from "./tauri";

// 別のページのエディタ宛てに届いた図を、ページ移動の間だけ預かる (クライアント遷移なのでモジュールの状態は残る)
let stash: OpenRequest[] = [];

/**
 * MCP の open_in_editor で届いた図を、このページのエディタへ載せる。
 * `onImport` にはエディタ既存の取り込み処理 (handleImportMermaid) を渡す。Web 版では何もしない。
 */
export function useDesktopOpen<T>(editor: EditorKind, onImport: (data: T) => void): void {
  const router = useRouter();
  const notice = useNotice();
  const onImportRef = useRef(onImport);
  onImportRef.current = onImport;

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;

    const drain = async () => {
      const incoming = await takePendingOpen();
      const all = [...stash, ...incoming];
      stash = [];
      const { mine, others, failed } = partitionOpens(all, editor);

      for (const r of failed) {
        notice({
          status: "error",
          title: "図を開けませんでした",
          description: r.error ?? "",
          isClosable: true,
          duration: null,
        });
      }
      const latest = mine.at(-1);
      if (latest?.payload) {
        onImportRef.current(latest.payload.data as T);
        if (latest.dropped.length > 0) {
          notice({
            status: "warning",
            title: "エディタで表現できない要素を省きました",
            description: describeDropped(latest.dropped),
            isClosable: true,
            duration: null,
          });
        }
      }
      const target = others.at(-1)?.payload?.editor;
      if (target) {
        stash = others;
        router.push(routeOf(target));
      }
    };

    void drain();
    void listen(OPEN_EVENT, () => void drain()).then((u) => {
      if (disposed) u();
      else unlisten = u;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [editor, notice, router]);
}
