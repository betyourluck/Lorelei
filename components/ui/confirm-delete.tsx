"use client";

import type { Edge, Node, OnBeforeDelete } from "@xyflow/react";
import { Dialog, Text } from "@yamada-ui/react";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";

/** 消すものの種類 (見出しの言葉) */
export type DeleteKind = "table" | "node";

const KIND_LABEL: Record<DeleteKind, string> = { table: "テーブル", node: "ノード" };

/**
 * 確認の見出し。数えるのは消すノード (テーブル) だけで、巻き添えで消える線は数えない。
 * 1 つなら名前 (無ければ種類)、2 つ以上なら件数。
 */
export const deleteTitle = (kind: DeleteKind, names: string[]): string => {
  if (names.length >= 2) return `選択した ${names.length} 個の${KIND_LABEL[kind]}を削除しますか？`;
  const name = names[0]?.trim();
  return name ? `『${name}』を削除しますか？` : `この${KIND_LABEL[kind]}を削除しますか？`;
};

/** 確認が要るか。ノード (テーブル) を含む時だけ。線だけの削除は今までどおり確認なし */
export const needsDeleteConfirm = ({ nodes }: { nodes: Node[]; edges: Edge[] }): boolean => nodes.length > 0;

interface Pending {
  title: string;
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
): { onBeforeDelete: OnBeforeDelete<N, Edge>; dialog: ReactNode } {
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

  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  const dialog = (
    <Dialog
      open={pending !== null}
      onClose={() => settle(false)}
      header={pending?.title}
      cancel="やめる"
      success={{ colorScheme: "danger", children: "削除" }}
      onCancel={() => settle(false)}
      onSuccess={() => settle(true)}
    >
      <Text>つながっている線も一緒に消えます。元に戻せません。</Text>
    </Dialog>
  );

  return { onBeforeDelete, dialog };
}
