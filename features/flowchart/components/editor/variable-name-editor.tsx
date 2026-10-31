"use client";

import type { FC } from "@yamada-ui/react";
import { Box, Input } from "@yamada-ui/react";
import type { MouseEvent, ChangeEvent, KeyboardEvent } from "react";
import { formatMermaidShape } from "../../hooks/mermaid";
import type { MermaidShapeType } from "../../types/types";

interface VariableNameEditorProps {
  value: string;
  isEditing: boolean;
  shapeType?: MermaidShapeType;
  onClick: (e: MouseEvent) => void;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
  onBlur: () => void;
}

export const VariableNameEditor: FC<VariableNameEditorProps> = ({
  value,
  isEditing,
  shapeType,
  onClick,
  onChange,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  onBlur,
}) => {
  // formatMermaidShapeを使って形状記号付きの表示を取得
  const displayValue = formatMermaidShape(shapeType || "rectangle", value);

  return (
    <Box
      position="absolute"
      top="-12px"
      // 左に形の札 (spec 29。幅 21px、node/shape-badge.module.css) を置くので、その幅と隙間 2px だけ右へ
      left="23px"
      bg="blue.500"
      color="white"
      px={1}
      py="1px"
      borderRadius="sm"
      fontSize="10px"
      fontWeight="medium"
      cursor="pointer"
      onClick={onClick}
      _hover={{ bg: "blue.600" }}
      zIndex={10}
      // 長い名で右上の ⋮⋮ (内側の右上 24px 四方) にぶつからないよう、その手前で省略する。全文は title
      maxW="calc(100% - 55px)"
      overflow="hidden"
      textOverflow="ellipsis"
      whiteSpace="nowrap"
      title={isEditing ? undefined : displayValue}
    >
      {isEditing ? (
        <Input
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          onBlur={onBlur}
          size="xs"
          autoFocus
          w="60px"
          h="16px"
          p={0}
          fontSize="10px"
          bg="surface"
          color="text"
          border="none"
          _focus={{ boxShadow: "none", outline: "none" }}
        />
      ) : (
        displayValue
      )}
    </Box>
  );
};
