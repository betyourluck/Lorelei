"use client";

import { GripIcon, TrashIcon } from "@yamada-ui/lucide";
import { IconButton, Menu, MenuButton, MenuItem, MenuList } from "@yamada-ui/react";

interface TableMenuProps {
  /** テーブル名 (読み上げの名前に使う) */
  name: string;
  /** テーブルを消す。確認はエディタの onBeforeDelete が出す */
  onDelete: () => void;
}

/**
 * テーブルの操作メニュー。フローチャートのノードの「⋮⋮」メニュー (node-menu.tsx) と同じ形にそろえる。
 * 今は「削除」だけ (項目は後から足せる)。
 */
export const TableMenu = ({ name, onDelete }: TableMenuProps) => {
  const label = name.trim() ? `テーブル『${name.trim()}』の操作メニューを開く` : "このテーブルの操作メニューを開く";
  return (
    <Menu>
      <MenuButton
        as={IconButton}
        size="xs"
        icon={<GripIcon fontSize="2xl" />}
        variant="ghost"
        aria-label={label}
        // ノードの選択・ドラッグと干渉させない
        onPointerDown={(e) => e.stopPropagation()}
      />
      <MenuList>
        <MenuItem color="danger" icon={<TrashIcon fontSize="xl" color="danger" />} onClick={onDelete}>
          削除
        </MenuItem>
      </MenuList>
    </Menu>
  );
};
