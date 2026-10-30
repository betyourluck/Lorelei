"use client";

import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

/** yamada-ui の MenuButton がメニューを開くキー */
const OPEN_KEYS = ["Enter", " ", "ArrowDown", "ArrowUp"];

/**
 * 押した時だけ yamada-ui の Menu を差し込む (spec 23 の線のラベル、spec 29 のノードの形の札)。
 * 閉じたメニュー (MenuList と項目) を図の全部の線・ノードで描くと、描き直しが重い。閉じている間は素のボタンを描き、
 * 押されたら閉じた状態の Menu を差し込み、次の描画で押した事件 (クリックかキー) を本物の MenuButton へ渡す。
 * 開いた状態で差し込む・同じ描画のうちに開くと、項目の role とフォーカスの移り方が前と違った (failures #42)
 *
 * 使い方: `open` が false の間は `buttonRef` と `buttonProps` を付けた素のボタンを描き、true の間は
 * `<Menu onClose={onClose}>` の `MenuButton` に `menuButtonRef` を付けて描く
 */
export const useDeferredMenu = () => {
  // 押されたか (キーで押したなら key と code。Space は yamada-ui が code を読む)。null の間は素のボタン
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

  return {
    open: trigger !== null,
    buttonRef,
    menuButtonRef,
    buttonProps: {
      onClick: () => setTrigger("click"),
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
        if (!OPEN_KEYS.includes(e.key)) return;
        e.preventDefault();
        setTrigger({ key: e.key, code: e.code });
      },
    },
    onClose: () => setTrigger(null),
  };
};
