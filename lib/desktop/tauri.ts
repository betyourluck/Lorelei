// Tauri への依存はここに閉じ込める (spec 01 D9)。Web 版 (GitHub Pages) では isTauri() が false で、
// @tauri-apps/api も動的 import なので読み込まれない。
import type { OpenRequest } from "./open-requests";

/** src-tauri の OPEN_EVENT と同じ名前 */
export const OPEN_EVENT = "lorelei://open-pending";

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const invoke = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
};

export const takePendingOpen = (): Promise<OpenRequest[]> => invoke("take_pending_open");

export type ExportFormat = "svg" | "png" | "pdf";

/** 保存ダイアログを出して書き出す。取り消されたら null、保存したら絶対パス */
export const exportDiagram = (
  source: string,
  format: ExportFormat,
  fileStem: string
): Promise<string | null> => invoke("export_diagram", { source, format, fileStem });

/** About (rfd のダイアログ) を出す。入口はタイトルバーの「?」(spec 02 D5) */
export const showAbout = (): Promise<void> => invoke("show_about");

/**
 * ツールバーのインポート (spec 02 D10)。Rust が lorelei_core で変換し、AI から届いた図と同じ経路
 * (OPEN_EVENT → useDesktopOpen) でエディタへ載る。失敗の通知もそちら。
 */
export const importSource = (source: string): Promise<void> => invoke("import_source", { source });

export type WindowAction = "minimize" | "toggleMaximize" | "close";

/** 自作タイトルバーのウィンドウ操作。@tauri-apps/api/window はクリック時に読む (静的書き出しで壊れない) */
export const windowAction = async (action: WindowAction): Promise<void> => {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow()[action]();
};

export const listen = async (event: string, handler: () => void): Promise<() => void> => {
  const { listen } = await import("@tauri-apps/api/event");
  return listen(event, handler);
};
