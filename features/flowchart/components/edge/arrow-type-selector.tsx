"use client";

import { ChevronDownIcon } from "@yamada-ui/lucide";
import type { FC } from "@yamada-ui/react";
import { Menu, MenuButton, MenuList, MenuItem, IconButton, Portal } from "@yamada-ui/react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "@/components/i18n";
import { useDeferredMenu } from "@/components/ui/use-deferred-menu";
import { getArrowTypeDisplayName } from "../../hooks/mermaid";
import type { MermaidArrowType } from "../../types/types";
import { ARROW_TYPES } from "../../types/types";
import styles from "./edge-label.module.css";

interface ArrowTypeSelectorProps {
  currentArrowType: MermaidArrowType;
  onArrowTypeChange: (arrowType: MermaidArrowType) => void;
}

/**
 * 線のラベルの矢印の種類の切り替え。閉じている時は素のボタンだけを描き、押した時だけ yamada-ui の Menu を差し込む (spec 23)。
 * 線は図に何百本もあり、ドラッグで経路が変わるたびにラベルを描き直すので、閉じたメニュー (MenuList と項目) を全部の線で描くと重い。
 * 差し込み方は useDeferredMenu (spec 29 で切り出した)
 */
export const ArrowTypeSelector: FC<ArrowTypeSelectorProps> = ({
  currentArrowType,
  onArrowTypeChange,
}) => {
  const { t } = useTranslation();
  const { open, buttonRef, menuButtonRef, buttonProps, onClose } = useDeferredMenu();

  if (!open) {
    return (
      <button
        ref={buttonRef}
        type="button"
        className={`arrow-type-selector-button ${styles.iconButton}`}
        aria-label={t("edge.arrowType")}
        aria-haspopup="menu"
        aria-expanded={false}
        {...buttonProps}
      >
        <ChevronDown size="1em" className={styles.icon} aria-hidden role="img" />
      </button>
    );
  }

  return (
    <Menu onClose={onClose}>
      <MenuButton
        ref={menuButtonRef}
        className="arrow-type-selector-button"
        as={IconButton}
        aria-label={t("edge.arrowType")}
        icon={<ChevronDownIcon />}
        size="xs"
        variant="outline"
        bg="surface"
        border="1px solid"
        borderColor="lineStrong"
        _hover={{ bg: "surfaceSubtle" }}
      />
      <Portal>
        <MenuList bg="surface" boxShadow="lg" border="1px solid" borderColor="line">
          {ARROW_TYPES.map((arrowType) => (
            <MenuItem
              key={arrowType}
              onClick={() => onArrowTypeChange(arrowType)}
              bg={currentArrowType === arrowType ? "selected" : "surface"}
              color={currentArrowType === arrowType ? "accentText" : "textSubtle"}
              fontSize="sm"
            >
              {getArrowTypeDisplayName(arrowType)}
            </MenuItem>
          ))}
        </MenuList>
      </Portal>
    </Menu>
  );
};
