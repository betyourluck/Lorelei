// 図の一覧の custom command (data_contract `Document` / `GuiCommands`)。読み書きは Rust が行う (plugin-fs を入れない)。

import type { Layout } from "./doc-session";
import type { EditorKind, OpenRequest } from "./open-requests";
import { invoke } from "./tauri";

export type Origin = "new" | "ai" | "import";

export interface DocumentSummary {
  id: string;
  title: string;
  editor: EditorKind;
  origin: Origin;
  createdAt: string;
  updatedAt: string;
  /** 利用者が「保存」を押した時刻 (D12)。一覧はこれ (無ければ createdAt) の新しい順 */
  savedAt: string | null;
  /** 最後の「保存」より後の変更がある (●) */
  unsaved: boolean;
}

export interface DocumentFull extends Omit<DocumentSummary, "unsaved"> {
  source: string;
  layout: Layout;
  originalSource: string | null;
}

export const listDocuments = (): Promise<DocumentSummary[]> => invoke("list_documents");
export const createDocument = (editor: EditorKind, title?: string): Promise<DocumentFull> =>
  invoke("create_document", { editor, title: title ?? null });
export const loadDocument = (id: string): Promise<DocumentFull> => invoke("load_document", { id });
/** 自動保存 (D7)。並びは動かさない */
export const saveDocument = (id: string, source: string, layout: Layout): Promise<DocumentSummary> =>
  invoke("save_document", { id, source, layout });
/** 利用者の「保存」(D12)。一覧の先頭へ動き、● が消える */
export const markDocumentSaved = (id: string): Promise<DocumentSummary> =>
  invoke("mark_document_saved", { id });
export const renameDocument = (id: string, title: string): Promise<void> =>
  invoke("rename_document", { id, title });
export const trashDocument = (id: string): Promise<void> => invoke("trash_document", { id });
export const lastOpened = (): Promise<string | null> => invoke("last_opened");
export const setLastOpened = (id: string): Promise<void> => invoke("set_last_opened", { id });
/** 保存した図を開く時の変換。溜めない・イベントを出さない (P3 の設計の補足 3) */
export const convertSource = (source: string): Promise<OpenRequest> =>
  invoke("convert_source", { source });
