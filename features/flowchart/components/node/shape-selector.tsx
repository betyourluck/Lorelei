"use client";

import { ShapesIcon } from "@yamada-ui/lucide";
import { Menu, MenuButton, MenuItem, MenuList } from "@yamada-ui/react";
import { ShapeMenuItems } from "./shape-menu-items";

interface ShapeSelectorProps {
  currentShape?: string;
  onShapeChange?: (shapeType: string) => void;
}

export const ShapeSelector = ({ currentShape, onShapeChange }: ShapeSelectorProps) => {
  return (
    <Menu>
      <MenuButton as={MenuItem} icon={<ShapesIcon fontSize="xl" />}>
        ノード形状
      </MenuButton>
      <MenuList>
        <ShapeMenuItems currentShape={currentShape} onShapeChange={onShapeChange} />
      </MenuList>
    </Menu>
  );
};
