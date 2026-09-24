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
 * 保存した図を開く (spec 02 P3 の設計の補足 3)。預けてからエディタを作り直すと、作り直した直後の取り込みで拾われる。
 * イベントは出さない — 出すと作り直す前の古いエディタが先に拾う。
 */
export const queueOpen = (request: OpenRequest): void => {
  stash.push(request);
};

/**
 * 図の一覧 (外枠) との橋渡し。取り込みの前後とページを移る前に呼ぶ。
 * **どれも同期**。取り込みの前で await すると、開発モード (StrictMode) で effect が 2 回走る間に取り込みを取りこぼす
 * (1 回目が預かりを持ち出して待つ間に後始末され、2 回目には預かりが空。2026-09-24 実機で観測)。
 * 今の図の保存は開始だけして待たない — 自動保存は変化した時点の中身を写し取っているので、後から走っても混ざらない。
 */
export interface DocsBridge {
  /** 取り込む直前。今の図の保存を始め、届いた図 (request.document) があればそれへ切り替える */
  beforeImport(request: OpenRequest): void;
  /** 取り込んだ直後。位置を当てる合図 (P0-4) */
  afterImport(request: OpenRequest): void;
  /** 別のページのエディタへ移る直前。今の図の保存を始める (移った後のストアを古い図に書かないため) */
  beforeLeave(): void;
}

let resolveFirstDrain: () => void = () => {};
/**
 * エディタ側の最初の取り込みが済んだ合図。起動時に「届いた図 (AI) があればそれを開く、無ければ前回の図」を決めるのに使う
 * (起動引数の図は Rust の setup で溜まり、最初の取り込みで拾われる)
 */
export const firstDrain: Promise<void> = new Promise((r) => {
  resolveFirstDrain = r;
});

let bridge: DocsBridge | null = null;
export const setDocsBridge = (b: DocsBridge | null): void => {
  bridge = b;
};

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
        bridge?.beforeImport(latest);
        onImportRef.current(latest.payload.data as T);
        bridge?.afterImport(latest);
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
        bridge?.beforeLeave();
        stash = [...stash, ...others];
        router.push(routeOf(target));
      }
    };

    void drain().finally(() => resolveFirstDrain());
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
