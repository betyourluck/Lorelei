import { useStoreApi } from "@xyflow/react";
import { useCallback } from "react";

/** CSS の二重引用符の文字列の中で " と \ を逃がす (CSS.escape は jsdom に無い。ID は 1 行の入力なので改行は来ない) */
const cssString = (value: string): string => value.replace(/["\\]/g, "\\$&");

/**
 * xyflow の useUpdateNodeInternals と同じく、ノードの接続点の位置を測り直させる。
 * xyflow のものはノードの ID をそのまま `.react-flow__node[data-id="…"]` に埋めるので、ID に " があると例外で落ち、
 * \ があると要素が見つからず黙って測り直さない。ER 図のテーブルの ID は名前そのもの (取り込み) なので、ここで逃がす
 */
export function useUpdateNodeInternals(): (id: string) => void {
  const store = useStoreApi();
  return useCallback(
    (id: string) => {
      const { domNode, updateNodeInternals } = store.getState();
      const nodeElement = domNode?.querySelector<HTMLDivElement>(`.react-flow__node[data-id="${cssString(id)}"]`);
      if (!nodeElement) return;
      requestAnimationFrame(() =>
        updateNodeInternals(new Map([[id, { id, nodeElement, force: true }]]), { triggerFitView: false })
      );
    },
    [store]
  );
}
