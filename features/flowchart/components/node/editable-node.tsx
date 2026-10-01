"use client";

import { Handle } from "@xyflow/react";
import type { FC } from "@yamada-ui/react";
import { Box } from "@yamada-ui/react";
import type { MouseEvent, ChangeEvent, KeyboardEvent } from "react";
import { useState, useRef, useEffect } from "react";
import { handlePositions } from "../../hooks/direction";
import { useUpdateNodeInternals } from "../../hooks/use-update-node-internals";
import type { MermaidShapeType } from "../../types/types";
import { UI_CONSTANTS } from "../../types/types";
import { useHandleDirection } from "../direction-context";
import { VariableNameEditor, LabelEditor } from "../editor";
import { NodeMenu } from "./node-menu";

interface EditableNodeProps {
  data: {
    label: string;
    variableName?: string;
    shapeType?: MermaidShapeType;
    onLabelChange?: (nodeId: string, newLabel: string) => void;
    onVariableNameChange?: (nodeId: string, newVariableName: string) => void;
    onShapeTypeChange?: (nodeId: string, newShapeType: string) => void;
    onDelete?: (nodeId: string) => void;
  };
  id: string;
}

export const EditableNode: FC<EditableNodeProps> = (props) => {
  // 接続点は置かれている入れ物 (枠、無ければ図) の向きに合わせる (LR なら入口 左・出口 右, spec 16 D6)。変わったら xyflow に位置を測り直させる
  const direction = useHandleDirection(props.id);
  const { target, source } = handlePositions(direction);
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => updateNodeInternals(props.id), [direction, props.id, updateNodeInternals]);
  return (
    <>
      <NodeContent {...props} />
      <Handle type="target" position={target} />
      <Handle type="source" position={source} />
    </>
  );
};

export const NodeContent: FC<EditableNodeProps> = ({ data, id }) => {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [isEditingVariableName, setIsEditingVariableName] = useState(false);
  const [label, setLabel] = useState(data.label);
  const [variableName, setVariableName] = useState(data.variableName || `node${id}`);
  const [isComposing, setIsComposing] = useState(false); // IME入力状態を管理
  const lastVariableClickTime = useRef<number>(0); // 変数名クリック時刻を記録

  // 編集していない時は、データのラベルと変数名に合わせる。同じ ID のノードを持つ別の図を開くと、この部品は作り直されずに
  // 使い回されるので、最初に受け取った値のままだと前の図のラベルが残り、編集するとそれを書き込んでしまう
  useEffect(() => {
    if (!isEditingLabel) setLabel(data.label);
  }, [data.label, isEditingLabel]);
  useEffect(() => {
    if (!isEditingVariableName) setVariableName(data.variableName || `node${id}`);
  }, [data.variableName, id, isEditingVariableName]);

  const handleLabelDoubleClick = () => {
    // 変数名クリック直後（DOUBLE_CLICK_THRESHOLD ms以内）はダブルクリックを無視
    const now = Date.now();
    if (now - lastVariableClickTime.current < UI_CONSTANTS.DOUBLE_CLICK_THRESHOLD) {
      return;
    }

    // 変数名編集中の場合は強制終了
    if (isEditingVariableName) {
      handleVariableNameSave();
    }
    setIsEditingLabel(true);
  };

  const handleVariableNameClick = (e: MouseEvent) => {
    e.stopPropagation(); // クリックイベントが親要素に伝播しないようにする
    e.preventDefault(); // デフォルトの動作を防ぐ

    // クリック時刻を記録
    lastVariableClickTime.current = Date.now();

    // ラベル編集中の場合は強制終了
    if (isEditingLabel) {
      handleLabelSave();
    }

    setIsEditingVariableName(true);
  };

  const handleLabelChange = (e: ChangeEvent<HTMLInputElement>) => {
    setLabel(e.target.value);
  };

  const handleVariableNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setVariableName(e.target.value);
  };

  const handleLabelSave = () => {
    setIsEditingLabel(false);
    if (data.onLabelChange) {
      data.onLabelChange(id, label);
    }
  };

  const handleVariableNameSave = () => {
    setIsEditingVariableName(false);
    if (data.onVariableNameChange) {
      data.onVariableNameChange(id, variableName);
    }
  };

  const handleLabelCancel = () => {
    setIsEditingLabel(false);
    setLabel(data.label);
  };

  const handleVariableNameCancel = () => {
    setIsEditingVariableName(false);
    setVariableName(data.variableName || `node${id}`);
  };

  const handleLabelKeyPress = (e: KeyboardEvent) => {
    // IME入力中はEnterキーを無視
    if (e.key === "Enter" && !isComposing) {
      handleLabelSave();
    } else if (e.key === "Escape") {
      handleLabelCancel();
    }
  };

  const handleVariableNameKeyPress = (e: KeyboardEvent) => {
    // IME入力中はEnterキーを無視
    if (e.key === "Enter" && !isComposing) {
      handleVariableNameSave();
    } else if (e.key === "Escape") {
      handleVariableNameCancel();
    }
  };

  // IME関連のイベントハンドラー
  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  const handleDelete = () => {
    if (data.onDelete) {
      data.onDelete(id);
    }
  };

  const handleEdit = () => {
    // 変数名編集中の場合は強制終了
    if (isEditingVariableName) {
      handleVariableNameSave();
    }
    setIsEditingLabel(true);
  };

  const handleEditVariableName = () => {
    // ラベル編集中の場合は強制終了
    if (isEditingLabel) {
      handleLabelSave();
    }
    setIsEditingVariableName(true);
  };

  const handleShapeChange = (shapeType: string) => {
    data.onShapeTypeChange?.(id, shapeType);
  };

  return (
    <Box
      bg="white"
      border="2px solid #1a365d"
      borderRadius="md"
      p={2}
      w="xs"
      minH="6xs"
      display="flex"
      alignItems="center"
      justifyContent="center"
      textAlign="center"
      cursor="pointer"
      onDoubleClick={handleLabelDoubleClick}
      _hover={{ boxShadow: "md" }}
      position="relative"
    >
      {/* 変数名を左上に表示 */}
      <VariableNameEditor
        value={variableName}
        isEditing={isEditingVariableName}
        shapeType={data.shapeType}
        onClick={handleVariableNameClick}
        onChange={handleVariableNameChange}
        onKeyDown={handleVariableNameKeyPress}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onBlur={handleVariableNameSave}
      />

      <NodeMenu
        onDelete={handleDelete}
        onEdit={handleEdit}
        onEditVariableName={handleEditVariableName}
        onShapeChange={handleShapeChange}
        currentShape={data.shapeType || "rectangle"}
      />

      {/* メインのラベル表示・編集エリア */}
      <LabelEditor
        value={label}
        isEditing={isEditingLabel}
        onDoubleClick={handleLabelDoubleClick}
        onChange={handleLabelChange}
        onKeyDown={handleLabelKeyPress}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onBlur={handleLabelSave}
      />
    </Box>
  );
};
