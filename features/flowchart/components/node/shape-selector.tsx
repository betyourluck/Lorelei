"use client";

import { ShapesIcon } from "@yamada-ui/lucide";
import { Menu, MenuButton, MenuItem, MenuList } from "@yamada-ui/react";
import { useTranslation } from "@/components/i18n";
import { ShapeMenuItems } from "./shape-menu-items";

interface ShapeSelectorProps {
  currentShape?: string;
  onShapeChange?: (shapeType: string) => void;
}

export const ShapeSelector = ({ currentShape, onShapeChange }: ShapeSelectorProps) => {
  const { t } = useTranslation();
  return (
    <Menu>
      <MenuButton as={MenuItem} icon={<ShapesIcon fontSize="xl" />}>
        {t("shape.menu")}
      </MenuButton>
      <MenuList>
        <ShapeMenuItems currentShape={currentShape} onShapeChange={onShapeChange} />
      </MenuList>
    </Menu>
  );
};
