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
  /** 利用者が「確定」(旧「保存」) を押した時刻 (D12)。一覧はこれ (無ければ createdAt) の新しい順 */
  savedAt: string | null;
  /** 最後に「確定」した中身と今の中身が違う (●。spec 32 D2) */
  unsaved: boolean;
  /** 確定した中身がある (「確定へ戻す」を出せる。spec 32 D3) */
  hasConfirmed?: boolean;
}

export interface DocumentFull extends Omit<DocumentSummary, "unsaved" | "hasConfirmed"> {
  /** 最後に「確定」した中身 (spec 32 D1)。無い図は持たない */
  confirmed?: { source: string; layout: Layout } | null;
  source: string;
  layout: Layout;
  originalSource: string | null;
  /** update_diagram が立て、次の保存 (揃え書き) が消す印 (spec 08 D1)。Rust だけが見る */
  normalizePending?: boolean;
}

export const listDocuments = (): Promise<DocumentSummary[]> => invoke("list_documents");
export const createDocument = (editor: EditorKind, title?: string): Promise<DocumentFull> =>
  invoke("create_document", { editor, title: title ?? null });
export const loadDocument = (id: string): Promise<DocumentFull> => invoke("load_document", { id });
/**
 * 自動保存 (D7)。並びは動かさない。baseUpdatedAt は読んだ版 — ファイルが進んでいれば STALE_BASE で拒まれる (spec 08 D2)。
 * normalize は図の準備ができてから最初の保存 (揃え書き) の印 (spec 33)。印の無い保存は人の編集として updated_at を進める
 */
export const saveDocument = (
  id: string,
  source: string,
  layout: Layout,
  baseUpdatedAt: string,
  normalize = false
): Promise<DocumentSummary> =>
  invoke("save_document", { id, source, layout, baseUpdatedAt, normalize });
/**
 * 利用者の「確定」(D12、spec 32 D1)。今の中身を自動保存と同じ規則で書き、確定した中身として残す。一覧の先頭へ動き、● が消える。
 * baseUpdatedAt は自動保存と同じ (古い版なら STALE_BASE で拒まれ、何も書かれない)
 */
export const confirmDocument = (
  id: string,
  source: string,
  layout: Layout,
  baseUpdatedAt: string
): Promise<DocumentSummary> => invoke("confirm_document", { id, source, layout, baseUpdatedAt });
export const renameDocument = (id: string, title: string): Promise<void> =>
  invoke("rename_document", { id, title });
export const trashDocument = (id: string): Promise<void> => invoke("trash_document", { id });
export const lastOpened = (): Promise<string | null> => invoke("last_opened");
export const setLastOpened = (id: string): Promise<void> => invoke("set_last_opened", { id });
/** 保存した図を開く時の変換。溜めない・イベントを出さない (P3 の設計の補足 3) */
export const convertSource = (source: string): Promise<OpenRequest> =>
  invoke("convert_source", { source });
