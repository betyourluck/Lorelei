"use client";

import { ChevronDownIcon } from "@yamada-ui/lucide";
import type { FC } from "@yamada-ui/react";
import { Menu, MenuButton, MenuList, MenuItem, IconButton, Portal } from "@yamada-ui/react";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getArrowTypeDisplayName } from "../../hooks/mermaid";
import type { MermaidArrowType } from "../../types/types";
import { ARROW_TYPES } from "../../types/types";
import styles from "./edge-label.module.css";

interface ArrowTypeSelectorProps {
  currentArrowType: MermaidArrowType;
  onArrowTypeChange: (arrowType: MermaidArrowType) => void;
}

/** yamada-ui の MenuButton がメニューを開くキー */
const OPEN_KEYS = ["Enter", " ", "ArrowDown", "ArrowUp"];

/**
 * 線のラベルの矢印の種類の切り替え。閉じている時は素のボタンだけを描き、押した時だけ yamada-ui の Menu を差し込む (spec 23)。
 * 線は図に何百本もあり、ドラッグで経路が変わるたびにラベルを描き直すので、閉じたメニュー (MenuList と項目) を全部の線で描くと重い。
 * 差し込んだ Menu は閉じた状態で始め、次の描画で押した事件 (クリックかキー) を本物の MenuButton へ渡す。
 * 開いた状態で差し込む・同じ描画のうちに開くと、項目の role とフォーカスの移り方が前と違った (failures #42)
 */
export const ArrowTypeSelector: FC<ArrowTypeSelectorProps> = ({
  currentArrowType,
  onArrowTypeChange,
}) => {
  // 押されたか (キーで押したなら key と code)。null の間は素のボタン
  const [trigger, setTrigger] = useState<{ key: string; code: string } | "click" | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (trigger) {
      wasOpen.current = true;
      const id = requestAnimationFrame(() => {
        const button = menuButtonRef.current;
        if (!button) return;
        button.focus();
        if (trigger === "click") button.click();
        else
          button.dispatchEvent(
            new KeyboardEvent("keydown", { ...trigger, bubbles: true, cancelable: true })
          );
      });
      return () => cancelAnimationFrame(id);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      // Menu を外すとフォーカスが行き場を失う時 (Esc・項目を選んだ時) だけ、素のボタンへ戻す。外を押した時は押した先に残す
      if (!document.activeElement || document.activeElement === document.body) {
        buttonRef.current?.focus();
      }
    }
  }, [trigger]);

  if (!trigger) {
    return (
      <button
        ref={buttonRef}
        type="button"
        className={`arrow-type-selector-button ${styles.iconButton}`}
        aria-label="Select arrow type"
        aria-haspopup="menu"
        aria-expanded={false}
        onClick={() => setTrigger("click")}
        onKeyDown={(e) => {
          if (!OPEN_KEYS.includes(e.key)) return;
          e.preventDefault();
          setTrigger({ key: e.key, code: e.code });
        }}
      >
        <ChevronDown size="1em" className={styles.icon} aria-hidden role="img" />
      </button>
    );
  }

  return (
    <Menu onClose={() => setTrigger(null)}>
      <MenuButton
        ref={menuButtonRef}
        className="arrow-type-selector-button"
        as={IconButton}
        aria-label="Select arrow type"
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
