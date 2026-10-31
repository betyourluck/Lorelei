// 新しい図の既定の題 (spec 34 D5、data_contract `Document.default_titles`)。人が作る図 (新規・インポート) は画面の言語で付けて Rust に渡す。
// AI が題を付けずに届けた図だけは Rust が付けるので、そのひな形 (素の {time}) を set_ui_locale で知らせる。既にある図の題は変えない
import { desktopT } from "./i18n";
import type { EditorKind } from "./open-requests";
import { invoke } from "./tauri";

/** Rust の `%H:%M:%S` と同じ形 (その時の地方時) */
export const clockTime = (d: Date = new Date()): string =>
  [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");

export const newDocumentTitle = (editor: EditorKind): string =>
  desktopT(`defaultTitle.new.${editor}`);

export const importTitle = (now: Date = new Date()): string =>
  desktopT("defaultTitle.import", { time: clockTime(now) });

/** AI の図の題のひな形。i18next の補間は {{…}} なので、素の {time} は残り Rust が時刻を入れる */
export const aiTitleTemplate = (): string => desktopT("defaultTitle.ai");

/** 画面の言語を当てた時と切り替えた時に呼ぶ。Rust は state.json に覚える (起動してから知らせるまでの間に届く AI の図のため) */
export const setUiLocale = (): Promise<void> =>
  invoke("set_ui_locale", { aiTitle: aiTitleTemplate() });
