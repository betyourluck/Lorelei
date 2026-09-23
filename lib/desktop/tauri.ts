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

export const listen = async (event: string, handler: () => void): Promise<() => void> => {
  const { listen } = await import("@tauri-apps/api/event");
  return listen(event, handler);
};
