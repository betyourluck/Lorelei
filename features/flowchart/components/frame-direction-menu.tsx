"use client";

import { ChevronDownIcon } from "@yamada-ui/lucide";
import type { FC } from "@yamada-ui/react";
import { Box, Button, Menu, MenuButton, MenuItem, MenuList, Portal } from "@yamada-ui/react";
import { useTranslation } from "@/components/i18n";
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
 * 枠の見出し (28px) に入る大きさにする。変えると、その枠の中だけを新しい向きで並べ直す (呼び出し側の relayoutFrame)
 */
export const FrameDirectionMenu: FC<FrameDirectionMenuProps> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const Current = value ? DIRECTION_ARROW[toGraphType(value)] : null;
  // ボタンは枠のノードの中に描かれるので nodrag (押しても枠をドラッグしない)・nopan で包む。項目のリストは文書の直下へ出す
  // (枠の中に描くと、枠より上に描かれる中のノード・線のボタンに隠れる。線の矢印のメニューと同じ)
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
          color="textHint"
          flexShrink={0}
          startIcon={Current ? <Current /> : undefined}
          rightIcon={<ChevronDownIcon />}
          aria-label={t("frameDirection.label", { value: value ?? t("frameDirection.none") })}
          title={t("frameDirection.title")}
        >
          {value ?? t("frameDirection.short")}
        </MenuButton>
        <Portal>
          <MenuList>
            {CHOICES.map((choice) => {
              const Arrow = choice ? DIRECTION_ARROW[toGraphType(choice)] : null;
              return (
                <MenuItem
                  key={choice ?? "none"}
                  icon={Arrow ? <Arrow /> : undefined}
                  bgColor={choice === value ? "selected" : "transparent"}
                  onClick={() => onChange(choice)}
                >
                  {choice ?? t("frameDirection.none")}
                </MenuItem>
              );
            })}
          </MenuList>
        </Portal>
      </Menu>
    </Box>
  );
};
