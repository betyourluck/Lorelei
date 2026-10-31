"use client";

import type { Edge, Node, OnBeforeDelete } from "@xyflow/react";
import { Dialog, Text } from "@yamada-ui/react";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { i18n, useTranslation } from "@/components/i18n";

/** 消すものの種類 (見出しの言葉) */
export type DeleteKind = "table" | "node";

/**
 * 確認の見出し。数えるのは消すノード (テーブル) だけで、巻き添えで消える線は数えない。
 * 1 つなら名前 (無ければ種類)、2 つ以上なら件数。
 */
export const deleteTitle = (kind: DeleteKind, names: string[]): string => {
  // 文は種類ごとに持つ (名詞を差し込んで組み立てない, spec 31 D6)
  if (names.length >= 2) return i18n.t(`confirmDelete.selected.${kind}`, { count: names.length });
  const name = names[0]?.trim();
  return name ? i18n.t("confirmDelete.named", { name }) : i18n.t(`confirmDelete.this.${kind}`);
};

/** 確認が要るか。ノード (テーブル) を含む時だけ。線だけの削除は今までどおり確認なし */
export const needsDeleteConfirm = ({ nodes }: { nodes: Node[]; edges: Edge[] }): boolean => nodes.length > 0;

interface Pending {
  title: string;
  /** 本文。無ければ線の文 (confirmDelete.body) */
  body?: string;
  /** 進めるボタンの言葉。無ければ「削除」 */
  confirmLabel?: string;
  resolve: (ok: boolean) => void;
}

/**
 * 削除の前の確認。xyflow の onBeforeDelete に渡すと、Backspace でも deleteElements でも同じ確認を通る
 * (ボタンは deleteElements を呼ぶだけにして、確認をここ 1 か所にする)。
 * dialog はエディタの直下に 1 つだけ置く (ノードの中に置くと、消した瞬間にダイアログごと消える)。
 */
export function useConfirmDelete<N extends Node = Node>(
  kind: DeleteKind,
  nameOf: (node: N) => string
): {
  onBeforeDelete: OnBeforeDelete<N, Edge>;
  /**
   * 題と本文を指定して尋ねる (フローチャートの枠の削除, spec 15 D5。枠へ入れると消える線, spec 16 D7)。同じダイアログを使う。
   * confirmLabel は進めるボタンの言葉 (無ければ「削除」)
   */
  ask: (title: string, body: string, confirmLabel?: string) => Promise<boolean>;
  dialog: ReactNode;
} {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Pending | null>(null);
  const nameOfRef = useRef(nameOf);
  nameOfRef.current = nameOf;

  const onBeforeDelete = useCallback<OnBeforeDelete<N, Edge>>(
    async ({ nodes, edges }) => {
      if (!needsDeleteConfirm({ nodes, edges })) return true;
      const title = deleteTitle(kind, nodes.map((n) => nameOfRef.current(n)));
      return new Promise<boolean>((resolve) => setPending({ title, resolve }));
    },
    [kind]
  );

  const ask = useCallback(
    (title: string, body: string, confirmLabel?: string) =>
      new Promise<boolean>((resolve) => setPending({ title, body, confirmLabel, resolve })),
    []
  );

  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  const dialog = (
    <Dialog
      open={pending !== null}
      onClose={() => settle(false)}
      header={pending?.title}
      cancel={t("confirmDelete.cancel")}
      success={{ colorScheme: "danger", children: pending?.confirmLabel ?? t("confirmDelete.delete") }}
      onCancel={() => settle(false)}
      onSuccess={() => settle(true)}
    >
      <Text>{pending?.body ?? t("confirmDelete.body")}</Text>
    </Dialog>
  );

  return { onBeforeDelete, ask, dialog };
}
