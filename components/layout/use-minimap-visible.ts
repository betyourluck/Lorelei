import { useCallback, useEffect, useState } from "react";

// 右下のミニマップを出すか (spec 26 D4〜D6、data_contract `EditorMinimap`)。
// 表示の都合なので localStorage に置き、2 つのエディタで共通に覚える。既定は出す。

export const MINIMAP_KEY = "mermaid-editor.minimap.v1";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

/** localStorage そのものに触れると投げる環境 (閉じた設定など) でも止めない */
const browserStorage = (): Storage => {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {} };
  }
};

/** 覚えた値を読む。読めない・知らない値 → 出す */
export const loadMinimapShown = (storage: Storage): boolean => {
  try {
    return storage.getItem(MINIMAP_KEY) !== "hidden";
  } catch {
    return true;
  }
};

const saveMinimapShown = (storage: Storage, shown: boolean): void => {
  try {
    storage.setItem(MINIMAP_KEY, shown ? "shown" : "hidden");
  } catch {
    // 書けなくても切り替えは効く
  }
};

/**
 * [出しているか, 切り替える]。覚えた値はマウントの後に読む
 * (静的書き出しでサーバー側でも描かれるので、最初の描画は既定値にして HTML と食い違わないようにする)
 */
export function useMinimapVisible(): [boolean, () => void] {
  const [shown, setShown] = useState(true);
  useEffect(() => setShown(loadMinimapShown(browserStorage())), []);
  const toggle = useCallback(() => {
    setShown((prev) => {
      const next = !prev;
      saveMinimapShown(browserStorage(), next);
      return next;
    });
  }, []);
  return [shown, toggle];
}
