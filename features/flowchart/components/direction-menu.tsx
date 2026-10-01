"use client";

import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, ChevronDownIcon } from "@yamada-ui/lucide";
import type { Component, FC, IconProps } from "@yamada-ui/react";
import { Button, Menu, MenuButton, MenuItem, MenuList } from "@yamada-ui/react";
import type { GraphType } from "../types/types";

/** 向きの矢印 (図の向きのメニューと枠の向きのメニューで共通, spec 16 D7) */
export const DIRECTION_ARROW: Record<GraphType, Component<"svg", IconProps>> = {
  TD: ArrowDownIcon,
  LR: ArrowRightIcon,
  RL: ArrowLeftIcon,
  BT: ArrowUpIcon,
};

const ARROWS: { type: GraphType; arrow: Component<"svg", IconProps> }[] = (
  ["TD", "LR", "RL", "BT"] as GraphType[]
).map((type) => ({ type, arrow: DIRECTION_ARROW[type] }));

interface DirectionMenuProps {
  value: GraphType;
  onChange: (direction: GraphType) => void;
}

/** 図の向きの切り替え (パネルとコード生成のモーダルで共通。フローチャートと ER 図で共通) */
export const DirectionMenu: FC<DirectionMenuProps> = ({ value, onChange }) => {
  const current = ARROWS.find((a) => a.type === value) ?? ARROWS[0];
  return (
    <Menu>
      <MenuButton
        size="sm"
        as={Button}
        startIcon={<current.arrow />}
        rightIcon={<ChevronDownIcon fontSize="xl" />}
        aria-label={`図の向き: ${value}`}
        title="図の向き"
      >
        {value}
      </MenuButton>
      <MenuList>
        {ARROWS.map((a) => (
          <MenuItem
            key={a.type}
            icon={<a.arrow />}
            bgColor={a.type === value ? "primary.50" : "transparent"}
            onClick={() => onChange(a.type)}
          >
            {a.type}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};
