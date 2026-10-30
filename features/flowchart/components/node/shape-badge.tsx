"use client";

import { Menu, MenuButton, MenuList, Portal } from "@yamada-ui/react";
import type { MouseEvent } from "react";
import { useDeferredMenu } from "@/components/ui/use-deferred-menu";
import type { MermaidShapeType } from "../../types/types";
import { SHAPE_OPTIONS } from "../../types/types";
import styles from "./shape-badge.module.css";
import { ShapeIcon } from "./shape-icon";
import { ShapeMenuItems } from "./shape-menu-items";

interface ShapeBadgeProps {
  shape: MermaidShapeType;
  onShapeChange: (shape: MermaidShapeType) => void;
}

// ダブルクリックを外枠へ伝えない (外枠のダブルクリックはラベルの編集を始める)
const stopDoubleClick = (e: MouseEvent) => e.stopPropagation();

/**
 * ノードの右上の形の札 (spec 29、data_contract NodeShapeBadge)。押すと形のメニューを開く (⋮⋮ →「ノード形状」の近道)。
 * ノードは図に何十もあり、ドラッグで描き直すので、メニューは押した時だけ差し込む (useDeferredMenu)。リストは文書の直下に出す
 * (ノードの中に描くと、後ろのノードや線のボタンに隠れる, failures #28)。nodrag は押してもノードのドラッグを始めない xyflow の印
 */
export const ShapeBadge = ({ shape, onShapeChange }: ShapeBadgeProps) => {
  const { open, buttonRef, menuButtonRef, buttonProps, onClose } = useDeferredMenu();
  const name = `形: ${SHAPE_OPTIONS.find((s) => s.type === shape)?.label ?? shape}`;
  const common = {
    type: "button" as const,
    className: `nodrag ${styles.badge}`,
    "aria-label": name,
    title: name,
    onDoubleClick: stopDoubleClick,
  };

  if (!open) {
    return (
      <button
        ref={buttonRef}
        {...common}
        aria-haspopup="menu"
        aria-expanded={false}
        {...buttonProps}
      >
        <ShapeIcon shape={shape} />
      </button>
    );
  }

  return (
    <Menu onClose={onClose}>
      <MenuButton ref={menuButtonRef} as="button" {...common}>
        <ShapeIcon shape={shape} />
      </MenuButton>
      <Portal>
        <MenuList className="nodrag">
          <ShapeMenuItems currentShape={shape} onShapeChange={onShapeChange} />
        </MenuList>
      </Portal>
    </Menu>
  );
};
