// デスクトップ版 (Tauri) だけの機能。フォーク元のコードからはここだけを import する (spec 01 D9)
export { useDesktopActions } from "./desktop-actions";
export { DesktopShell } from "./desktop-shell";
export { ExportButtons } from "./export-buttons";
export type { EditorKind } from "./open-requests";
export { useDesktopOpen } from "./use-desktop-open";
