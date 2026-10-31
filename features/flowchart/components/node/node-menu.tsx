"use client";

import { GripIcon, SquarePenIcon, TrashIcon, TagIcon } from "@yamada-ui/lucide";
import { IconButton, Menu, MenuButton, MenuItem, MenuList, MenuSeparator } from "@yamada-ui/react";
import { useTranslation } from "@/components/i18n";
import { ShapeSelector } from "./shape-selector";

interface NodeMenuProps {
  // Define any props if needed
  onEdit?: () => void;
  onEditVariableName?: () => void;
  onDelete?: () => void;
  onShapeChange?: (shapeType: string) => void;
  currentShape?: string;
}

export const NodeMenu = ({
  onEdit,
  onEditVariableName,
  onDelete,
  onShapeChange,
  currentShape,
}: NodeMenuProps) => {
  const { t } = useTranslation();
  return (
    <Menu>
      <MenuButton
        size="xs"
        position="absolute"
        top={0}
        right={0}
        as={IconButton}
        icon={<GripIcon fontSize="2xl" />}
        variant="ghost"
        aria-label={t("node.openMenu")}
        // メニューを押してもノードのドラッグを始めない (nodrag は xyflow がドラッグを始めない印)
        className="nodrag"
      />

      <MenuList className="nodrag">
        <MenuItem icon={<SquarePenIcon fontSize="xl" />} onClick={onEdit}>
          {t("node.editLabel")}
        </MenuItem>
        <MenuItem icon={<TagIcon fontSize="xl" />} onClick={onEditVariableName}>
          {t("node.editVariableName")}
        </MenuItem>

        <MenuSeparator />

        {/* 形状選択のサブメニュー */}
        <ShapeSelector currentShape={currentShape} onShapeChange={onShapeChange} />

        <MenuSeparator />

        <MenuItem
          color="danger"
          icon={<TrashIcon fontSize="xl" color="danger" />}
          onClick={onDelete}
        >
          {t("node.delete")}
        </MenuItem>
      </MenuList>
    </Menu>
  );
};
