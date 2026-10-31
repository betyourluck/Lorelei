"use client";

import { MenuItem, Box, Text } from "@yamada-ui/react";
import type { MermaidShapeType } from "../../types/types";
import { SHAPE_OPTIONS, shapeLabel } from "../../types/types";
import { ShapeIcon } from "./shape-icon";

interface ShapeMenuItemsProps {
  currentShape?: string;
  onShapeChange?: (shapeType: MermaidShapeType) => void;
}

/** 形のメニューの 6 つの項目。⋮⋮ の「ノード形状」と左上の形の札 (spec 29 D2) の両方の MenuList に入れる */
export const ShapeMenuItems = ({ currentShape, onShapeChange }: ShapeMenuItemsProps) => (
  <>
    {SHAPE_OPTIONS.map((shape) => (
      <MenuItem
        key={shape.type}
        icon={<ShapeIcon shape={shape.type} />}
        onClick={() => onShapeChange?.(shape.type)}
        bg={currentShape === shape.type ? "selected" : undefined}
      >
        <Box display="flex" alignItems="center" justifyContent="space-between" w="full">
          <Text>{shapeLabel(shape.type)}</Text>
          <Text fontSize="sm" color="muted" fontFamily="mono">
            {shape.symbol}
          </Text>
        </Box>
      </MenuItem>
    ))}
  </>
);
