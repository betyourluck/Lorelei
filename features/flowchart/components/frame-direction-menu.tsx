"use client";

import { ChevronDownIcon } from "@yamada-ui/lucide";
import type { FC } from "@yamada-ui/react";
import { Box, Button, Menu, MenuButton, MenuItem, MenuList } from "@yamada-ui/react";
import type { SubgraphDirection } from "../types/types";
import { toGraphType } from "../utils/frame-direction";
import { DIRECTION_ARROW } from "./direction-menu";

const CHOICES: (SubgraphDirection | undefined)[] = [undefined, "TB", "LR", "RL", "BT"];

interface FrameDirectionMenuProps {
  /** 枠に書いた向き (書いていなければ undefined) */
  value: SubgraphDirection | undefined;
  onChange: (direction: SubgraphDirection | undefined) => void;
}

/**
 * 枠の中の向きのメニュー (spec 16 D7)。図の向きのメニュー (DirectionMenu) と違い「指定なし」があり、
 * 枠の見出し (28px) に入る大きさにする。変えても並べ直さない (接続点だけが動く)
 */
export const FrameDirectionMenu: FC<FrameDirectionMenuProps> = ({ value, onChange }) => {
  const Current = value ? DIRECTION_ARROW[toGraphType(value)] : null;
  // ボタンも項目のリストも枠のノードの中に描かれるので、全体を nodrag (押しても枠をドラッグしない)・nopan で包む
  return (
    <Box className="nodrag nopan" flexShrink={0}>
      <Menu>
        <MenuButton
          as={Button}
          size="xs"
          h="20px"
          px={1}
          variant="ghost"
          colorScheme="gray"
          fontSize="xs"
          fontWeight="normal"
          color="gray.600"
          flexShrink={0}
          startIcon={Current ? <Current /> : undefined}
          rightIcon={<ChevronDownIcon />}
          aria-label={`枠の中の向き: ${value ?? "指定なし"}`}
          title="枠の中の向き（指定なしは外側の向きで並ぶ）"
        >
          {value ?? "向き"}
        </MenuButton>
        <MenuList>
          {CHOICES.map((choice) => {
            const Arrow = choice ? DIRECTION_ARROW[toGraphType(choice)] : null;
            return (
              <MenuItem
                key={choice ?? "none"}
                icon={Arrow ? <Arrow /> : undefined}
                bgColor={choice === value ? "primary.50" : "transparent"}
                onClick={() => onChange(choice)}
              >
                {choice ?? "指定なし"}
              </MenuItem>
            );
          })}
        </MenuList>
      </Menu>
    </Box>
  );
};
