import { useCallback, useEffect, useState } from "react";

// デスクトップの外枠の寸法と開閉 (spec 05 D1〜D3、data_contract `DesktopLayout`)。
// 表示の都合なので図の一覧やアプリの状態とは分け、WebView の localStorage に置く (Fuseforks の usePaneLayout と同じ理由)。

export const LAYOUT_KEY = "lorelei.layout.v1";

/** 図の一覧の幅 (px)。下限は「新規作成」と題名が数文字見える幅、上限はエディタが狭くなりすぎない幅 */
export const LIST_WIDTH = { initial: 240, min: 180, max: 480 } as const;

export interface DesktopLayout {
  listWidth: number;
  listOpen: boolean;
}

const DEFAULTS: DesktopLayout = { listWidth: LIST_WIDTH.initial, listOpen: true };

/** 範囲へ収める。窓の幅の半分も超えない (窓が狭くても下限は守る) */
export const clampListWidth = (width: number, windowWidth: number): number => {
  const max = Math.max(LIST_WIDTH.min, Math.min(LIST_WIDTH.max, Math.floor(windowWidth / 2)));
  return Math.min(Math.max(Math.round(width), LIST_WIDTH.min), max);
};

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

/** 保存した値を読む。読めない・壊れている → 既定値、範囲外 → 範囲の端 (画面が開けなくなるより良い) */
export const loadLayout = (storage: Storage): DesktopLayout => {
  try {
    const raw = storage.getItem(LAYOUT_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Record<keyof DesktopLayout, unknown>>;
    return {
      listWidth:
        typeof parsed.listWidth === "number" && Number.isFinite(parsed.listWidth)
          ? Math.min(Math.max(Math.round(parsed.listWidth), LIST_WIDTH.min), LIST_WIDTH.max)
          : DEFAULTS.listWidth,
      listOpen: typeof parsed.listOpen === "boolean" ? parsed.listOpen : DEFAULTS.listOpen,
    };
  } catch {
    return { ...DEFAULTS };
  }
};

export const saveLayout = (storage: Storage, layout: DesktopLayout): void => {
  try {
    storage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // 書けなくても操作は続けられる
  }
};

/** localStorage そのものに触れると投げる環境 (閉じた設定など) でも止めない */
const browserStorage = (): Storage => {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {} };
  }
};

/** 外枠の寸法と開閉。幅は窓の幅に合わせて収めた値を返す */
export function usePaneLayout() {
  const [layout, setLayout] = useState<DesktopLayout>(() => loadLayout(browserStorage()));
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => saveLayout(browserStorage(), layout), [layout]);

  const listWidth = clampListWidth(layout.listWidth, windowWidth);

  return {
    listWidth,
    listOpen: layout.listOpen,
    /** つまみの移動量を足す。見えている幅から足す (窓の半分に張り付いた後の空走りを出さない) */
    resizeList: useCallback(
      (delta: number) =>
        setLayout((l) => ({
          ...l,
          listWidth: clampListWidth(clampListWidth(l.listWidth, windowWidth) + delta, windowWidth),
        })),
      [windowWidth]
    ),
    resetList: useCallback(() => setLayout((l) => ({ ...l, listWidth: LIST_WIDTH.initial })), []),
    toggleList: useCallback(() => setLayout((l) => ({ ...l, listOpen: !l.listOpen })), []),
  };
}
