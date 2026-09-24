"use client";

import { useReactFlow, useStore } from "@xyflow/react";
import { useNotice } from "@yamada-ui/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Layout } from "./doc-session";
import { Autosaver, collectLayout, expectedKeys, onNodesChanged, toSource, withLayout } from "./doc-session";
import type { DocumentSummary } from "./documents";
import {
  convertSource,
  createDocument,
  lastOpened,
  listDocuments,
  loadDocument,
  markDocumentSaved,
  renameDocument,
  saveDocument,
  setLastOpened,
  trashDocument,
} from "./documents";
import type { EditorKind, OpenRequest } from "./open-requests";
import { routeOf } from "./open-requests";
import { firstDrain, queueOpen, setDocsBridge } from "./use-desktop-open";

const AUTOSAVE_DELAY_MS = 1000;
const FIRST_DRAIN_TIMEOUT_MS = 1500;

type Snapshot = { source: string; layout: Layout };

export interface DocSession {
  list: DocumentSummary[];
  current: DocumentSummary | null;
  /** 変換できず開けなかった図。初期図が見えているだけなので保存しない */
  unopenable: boolean;
  /** 最後の保存の失敗 */
  saveError: string | null;
  /** エディタを作り直すための key (D9) */
  generation: number;
  open(id: string): Promise<void>;
  create(editor: EditorKind): Promise<void>;
  /** ツールバーの [フローチャート|ER図] (D11) */
  switchKind(editor: EditorKind): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  trash(id: string): Promise<void>;
  save(): Promise<void>;
  /** パネルが操作を登録した = エディタが作り直された */
  editorMounted(): void;
  /** 閉じる前の保存。失敗したら false (閉じない) */
  flushForClose(): Promise<boolean>;
}

const kindOf = (pathname: string | null): EditorKind =>
  pathname?.includes("er-diagram") ? "erDiagram" : "flowchart";

const summaryOf = (d: Omit<DocumentSummary, "unsaved"> & { unsaved?: boolean }): DocumentSummary => ({
  id: d.id,
  title: d.title,
  editor: d.editor,
  origin: d.origin,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
  savedAt: d.savedAt,
  unsaved: d.unsaved ?? false,
});

/**
 * 図の一覧と、開いている図の読み込み・自動保存 (spec 02 D6・D7・D9・D11 と P3 の設計の補足)。
 *
 * 保存してよいのは「準備済み」の図だけ。作り直したエディタは初期図を持っているので、読み込みが済むまで
 * (取り込んだノードのキーがストアに全部そろい、位置を当て終えるまで) は保存しない。
 */
export function useDocSession(): DocSession {
  const rf = useReactFlow();
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const router = useRouter();
  const pathname = usePathname();
  const notice = useNotice();

  const [list, setList] = useState<DocumentSummary[]>([]);
  const [current, setCurrent] = useState<DocumentSummary | null>(null);
  const [unopenable, setUnopenable] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  const currentRef = useRef<DocumentSummary | null>(null);
  const readyRef = useRef(false);
  const importedRef = useRef(false);
  const expectedRef = useRef<string[] | null>(null);
  const layoutRef = useRef<Layout>({});
  const awaitMountRef = useRef(false);
  const pathKindRef = useRef(kindOf(pathname));
  pathKindRef.current = kindOf(pathname);
  const listRef = useRef(list);
  listRef.current = list;

  const autosaver = useMemo(
    () =>
      new Autosaver<Snapshot>(async (id, s) => {
        try {
          const saved = await saveDocument(id, s.source, s.layout);
          setSaveError(null);
          // 自動保存では並びを動かさない (D12)。● だけ更新する
          setList((l) => l.map((d) => (d.id === id ? saved : d)));
        } catch (e) {
          setSaveError(String(e));
          throw e;
        }
      }, AUTOSAVE_DELAY_MS),
    []
  );

  const refreshList = useCallback(async () => {
    const docs = await listDocuments();
    setList(docs);
    return docs;
  }, []);

  const becomeCurrent = useCallback((doc: Omit<DocumentSummary, "unsaved"> | null) => {
    currentRef.current = doc ? summaryOf(doc) : null;
    setCurrent(doc ? summaryOf(doc) : null);
    readyRef.current = false;
    importedRef.current = false;
    if (doc) void setLastOpened(doc.id);
  }, []);

  /** 今の図を保存してから離れる。保存できなければ離れない */
  const leave = useCallback(async (): Promise<boolean> => {
    try {
      await autosaver.flush();
    } catch (e) {
      notice({
        status: "error",
        title: "保存できなかったので、図を切り替えませんでした",
        description: String(e),
        isClosable: true,
        duration: null,
      });
      return false;
    }
    autosaver.cancel();
    readyRef.current = false;
    return true;
  }, [autosaver, notice]);

  const open = useCallback(
    async (id: string) => {
      if (!(await leave())) return;
      const doc = await loadDocument(id);
      let request: OpenRequest | null = null;
      if (doc.source) {
        request = await convertSource(doc.source);
        if (!request.payload) {
          notice({
            status: "error",
            title: `「${doc.title}」を開けません (保存しません)`,
            description: request.error ?? "",
            isClosable: true,
            duration: null,
          });
        }
      }
      becomeCurrent(doc);
      setUnopenable(Boolean(doc.source) && !request?.payload);
      expectedRef.current = request?.payload ? expectedKeys(doc.editor, request.payload.data) : null;
      layoutRef.current = doc.layout ?? {};
      // source が空 = 新規作成の直後。エディタの初期図で始まり、作り直した時点で準備済み
      awaitMountRef.current = !doc.source;
      if (request?.payload) queueOpen(request);
      if (doc.editor !== pathKindRef.current) router.push(routeOf(doc.editor));
      setGeneration((g) => g + 1);
    },
    [becomeCurrent, leave, notice, router]
  );

  const create = useCallback(
    async (editor: EditorKind) => {
      const doc = await createDocument(editor);
      await refreshList();
      await open(doc.id);
    },
    [open, refreshList]
  );

  const switchKind = useCallback(
    async (editor: EditorKind) => {
      if (currentRef.current?.editor === editor) return;
      const latest = listRef.current.find((d) => d.editor === editor);
      if (latest) await open(latest.id);
      else await create(editor);
    },
    [create, open]
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      await renameDocument(id, title);
      await refreshList();
      if (currentRef.current?.id === id) {
        currentRef.current = { ...currentRef.current, title };
        setCurrent(currentRef.current);
      }
    },
    [refreshList]
  );

  const trash = useCallback(
    async (id: string) => {
      const wasCurrent = currentRef.current?.id === id;
      if (wasCurrent) {
        autosaver.cancel();
        readyRef.current = false;
      }
      await trashDocument(id);
      const docs = await refreshList();
      if (!wasCurrent) return;
      currentRef.current = null;
      if (docs[0]) await open(docs[0].id);
      else await create("flowchart");
    },
    [autosaver, create, open, refreshList]
  );

  /** 利用者の「保存」(D12)。今の変更を書いてから、一覧の先頭へ動かす */
  const save = useCallback(async () => {
    const doc = currentRef.current;
    if (!doc) return;
    try {
      await autosaver.flush();
      await markDocumentSaved(doc.id);
      await refreshList();
    } catch (e) {
      notice({
        status: "error",
        title: "保存できませんでした",
        description: String(e),
        isClosable: true,
        duration: null,
      });
    }
  }, [autosaver, notice, refreshList]);

  const editorMounted = useCallback(() => {
    if (!awaitMountRef.current) return;
    awaitMountRef.current = false;
    readyRef.current = true;
  }, []);

  const flushForClose = useCallback(async () => {
    try {
      await autosaver.flush();
      return true;
    } catch {
      return false;
    }
  }, [autosaver]);

  // 準備が済むまでは位置を当てる合図を待つ。済んだら変化のたびに自動保存 (D7)
  useEffect(() => {
    const doc = currentRef.current;
    if (!doc) return;
    const layout = layoutRef.current;
    const next = onNodesChanged({
      ready: readyRef.current,
      imported: importedRef.current,
      expected: expectedRef.current,
      editor: doc.editor,
      nodes,
      layout,
    });
    readyRef.current = next.ready;
    if (next.applyLayout) rf.setNodes((ns) => withLayout(doc.editor, ns, layout));
    if (!next.save) return;
    const n = nodes;
    const e = edges;
    autosaver.touch(doc.id, () => ({
      source: toSource(doc.editor, n, e),
      layout: collectLayout(doc.editor, n),
    }));
  }, [nodes, edges, rf, autosaver]);

  // useDesktopOpen (エディタ側) との橋渡し。AI / インポートで届いた図は新しい 1 件として開く (D8・D10)
  const started = useRef(false);
  useEffect(() => {
    // 同期で呼ばれる (待つと StrictMode で取り込みを取りこぼす)。今の図の保存は始めるだけ
    const leaveNow = () => {
      autosaver.flush().catch((e) =>
        notice({
          status: "error",
          title: "前の図を保存できませんでした",
          description: String(e),
          isClosable: true,
          duration: null,
        })
      );
      autosaver.cancel();
      readyRef.current = false;
    };
    setDocsBridge({
      beforeImport: (request) => {
        const doc = request.document;
        if (!doc || !request.payload) return;
        leaveNow();
        becomeCurrent(doc);
        setUnopenable(false);
        expectedRef.current = expectedKeys(doc.editor, request.payload.data);
        layoutRef.current = {};
        awaitMountRef.current = false;
        void refreshList();
      },
      afterImport: () => {
        importedRef.current = true;
      },
      beforeLeave: leaveNow,
    });
    return () => setDocsBridge(null);
  }, [autosaver, becomeCurrent, notice, refreshList]);

  // 起動時: 届いている図 (AI) を先に取り込ませ、無ければ前回の図 → 一番新しい図 → 新規作成 (D9)
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      // エディタ側の最初の取り込み (takePendingOpen) を待つ。届いた図があればそれが開いている。
      // エディタが居ない時に止まらないよう上限を付ける
      await Promise.race([firstDrain, new Promise((r) => setTimeout(r, FIRST_DRAIN_TIMEOUT_MS))]);
      const docs = await refreshList();
      if (currentRef.current) return;
      const last = await lastOpened();
      const target = docs.find((d) => d.id === last) ?? docs[0];
      if (currentRef.current) return;
      if (target) await open(target.id);
      else await create("flowchart");
    })().catch((e) =>
      notice({ status: "error", title: "図の一覧を読めません", description: String(e), isClosable: true, duration: null })
    );
  }, [create, notice, open, refreshList]);

  return {
    list,
    current,
    unopenable,
    saveError,
    generation,
    open,
    create,
    switchKind,
    rename,
    trash,
    save,
    editorMounted,
    flushForClose,
  };
}
