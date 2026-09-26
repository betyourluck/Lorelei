import { Handle, useUpdateNodeInternals } from "@xyflow/react";
import { useEffect } from "react";
import { useDirection } from "@/features/flowchart/components/direction-context";
import { handlePositions } from "@/features/flowchart/hooks/direction";
import type { ERColumn } from "./er-table-content";
import { ERTableContent } from "./er-table-content";

// ReactFlowノードラッパーとしてpropsをそのままContentに渡すだけ
export type ERTableNodeProps = {
  name: string;
  columns: ERColumn[];
  onNameChange: (name: string) => void;
  onColumnsChange: (columns: ERColumn[]) => void;
  /** テーブルを消す (エディタが deleteElements を渡す。確認は onBeforeDelete) */
  onDelete?: () => void;
};

// React Flowノード用: props.dataにERTableNodePropsが入る
export function ERTableNode(props: { id: string; data: ERTableNodeProps }) {
  // 接続点は図の向きに合わせる (LR なら入口 左・出口 右)。変わったら xyflow に位置を測り直させる
  const direction = useDirection();
  const { target, source } = handlePositions(direction);
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => updateNodeInternals(props.id), [direction, props.id, updateNodeInternals]);
  return (
    <>
      <ERTableContent {...props.data} />
      <Handle type="target" position={target} />
      <Handle type="source" position={source} />
    </>
  );
}
