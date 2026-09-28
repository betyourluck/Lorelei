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
 * 前に預けたものは捨てる。開き直した後に古い図の要求が取り込まれると、ページが古い図の種類へ移り、
 * 古い図の中身が今の図として保存される (spec 04 P0、2026-09-25 実機で観測)。
 * 別のページへ回した AI の図もここで捨てるが、図は一覧に足されていて、開けば原文から開く
 */
export const queueOpen = (request: OpenRequest): void => {
  stash = [request];
};

/** 別のページのエディタへ回した図が、まだ取り込まれずに残っている (起動処理が前回の図を開くのを控えるため) */
export const hasPendingOpens = (): boolean => stash.length > 0;

/** テスト用: 預かりを空にする。エディタの居ないテストでは誰も取り込まないので、次のテストへ残る */
export const clearPendingOpens = (): void => {
  stash = [];
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
  /** 今の図の id。まだ何も開いていなければ null (起動直後)。載せ替え (reload) の要求をこの図に当てるかの判定に使う (spec 08 D3) */
  currentId(): string | null;
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

    const take = (r: OpenRequest) => {
      bridge?.beforeImport(r);
      onImportRef.current(r.payload!.data as T);
      bridge?.afterImport(r);
      if (r.dropped.length > 0) {
        notice({
          status: "warning",
          title: "エディタで表現できない要素を省きました",
          description: describeDropped(r.dropped),
          isClosable: true,
          duration: null,
        });
      }
    };

    const drain = async () => {
      const incoming = await takePendingOpen();
      const all = [...stash, ...incoming];
      stash = [];
      // 載せ替え (update_diagram の reload, spec 08 D3) は partitionOpens に入れず先に扱う。最後の 1 件だけを取り込む規則に
      // 巻き込むと、同じ回に並んだ別の図の「開く」に負けて捨てられ、その beforeImport の flush が古い書きかけを AI の更新の上に書く。
      // 今の図と一致すれば載せ替える (flush せず捨てるのは beforeImport の側)、今の図が無ければ (起動直後) 開くとして扱い、それ以外は捨てる
      // (ファイルは書けている。古いキャンバスの保存は STALE_BASE が受け持つ)
      const rest: OpenRequest[] = [];
      for (const r of all) {
        if (!r.reload || !r.payload) {
          rest.push(r);
          continue;
        }
        const current = bridge?.currentId() ?? null;
        if (current === null) {
          rest.push({ ...r, reload: false });
          continue;
        }
        if (r.payload.editor === editor && r.document?.id === current) take(r);
      }
      const { mine, others, failed } = partitionOpens(rest, editor);

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
      if (latest?.payload) take(latest);
      const target = others.at(-1)?.payload?.editor;
      if (target) {
        bridge?.beforeLeave();
        stash = [...stash, ...others];
        router.push(routeOf(target));
        // まだ取り込んでいない。回した先のページの取り込みで合図を出す (出すと起動処理が前回の図を開いてしまう)
        return false;
      }
      return true;
    };

    const settle = (done: boolean) => {
      if (done) resolveFirstDrain();
    };
    void drain().then(settle, () => settle(true));
    void listen(OPEN_EVENT, () => void drain().then(settle, () => settle(true))).then((u) => {
      if (disposed) u();
      else unlisten = u;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [editor, notice, router]);
}
