"use client";

import type { Node } from "@xyflow/react";
import { useReactFlow, useStore } from "@xyflow/react";
import { useNotice } from "@yamada-ui/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MermaidTheme } from "@/components/ui/mermaid-theme";
import type { GraphType } from "@/features/flowchart/types/types";
import type { Layout } from "./doc-session";
import {
  Autosaver,
  collectLayout,
  expectedKeys,
  isDocumentGone,
  isInitialFigureRejected,
  isStaleBase,
  onNodesChanged,
  staleBaseCurrent,
  toSource,
  withLayout,
} from "./doc-session";
import type { DocumentSummary } from "./documents";
import {
  convertSource,
  createDocument,
  lastOpened,
  listDocuments,
  loadDocument,
  confirmDocument,
  renameDocument,
  saveDocument,
  setLastOpened,
  trashDocument,
} from "./documents";
import { desktopT } from "./i18n";
import type { EditorKind, OpenRequest } from "./open-requests";
import { routeOf } from "./open-requests";
import { DOCUMENTS_EVENT, listenPayload } from "./tauri";
import { firstDrain, hasPendingOpens, queueOpen, setDocsBridge } from "./use-desktop-open";

const AUTOSAVE_DELAY_MS = 1000;
const FIRST_DRAIN_TIMEOUT_MS = 1500;
/** 図を開く間エディタを隠す上限。門が何かの理由で開かなくても、空のまま止めない (spec 05 D4) */
const SETTLE_TIMEOUT_MS = 1500;

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
  /** エディタを見せてよい。図を開いている間 (初期図・位置を当てる前) は false (spec 05 D4) */
  settled: boolean;
  /**
   * 操作の履歴を始めてよい (spec 30 D3・D5、data_contract HistoryGate.ready)。位置を当て終えて自動保存を始めた時に true。
   * 時間切れで見せただけ (settled だが準備ができていない) の間は false
   */
  historyReady: boolean;
  /** 履歴を捨てる合図 (HistoryGate.epoch)。図を隠して開き直す・別の図に替わる・載せ替えるたびに進む */
  historyEpoch: number;
  open(id: string): Promise<void>;
  create(editor: EditorKind): Promise<void>;
  /** ツールバーの [フローチャート|ER図] (D11) */
  switchKind(editor: EditorKind): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  trash(id: string): Promise<void>;
  save(): Promise<void>;
  /**
   * 最後に確定した中身へ戻す (spec 32 D3・D4)。apply はエディタの取り込み (取り込んだノードに adjust をかけてから当てる)。
   * 当てたら true。確定した中身が無い・変換できない・その間に図が替わった時は false
   */
  revert(apply: (data: unknown, adjust: (nodes: Node[]) => Node[]) => void): Promise<boolean>;
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
export function useDocSession(
  /** エディタの今の向き (spec 07 D3)。保存に使い、変わったら保存し直す */
  direction: GraphType = "TD",
  /** エディタの今のテーマ (spec 24 D1)。向きと同じく保存に使い、変わったら保存し直す */
  theme: MermaidTheme = "default"
): DocSession {
  const rf = useReactFlow();
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const router = useRouter();
  const pathname = usePathname();
  const notice = useNotice();
  const noticeRef = useRef(notice);
  noticeRef.current = notice;

  const [list, setList] = useState<DocumentSummary[]>([]);
  const [current, setCurrent] = useState<DocumentSummary | null>(null);
  const [unopenable, setUnopenable] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  // 起動直後もエディタは初期図を持っているので、最初の図が開くまで隠す
  const [settled, setSettled] = useState(false);
  /** 隠し始めるたびに進む番号。時間切れの数え直しに使う */
  const [hideSeq, setHideSeq] = useState(0);
  // readyRef の写し (画面へ知らせる。位置を当てる前の回は入れない, spec 30)
  const [historyReady, setHistoryReady] = useState(false);
  const hide = useCallback(() => {
    setSettled(false);
    setHideSeq((n) => n + 1);
  }, []);

  const currentRef = useRef<DocumentSummary | null>(null);
  const readyRef = useRef(false);
  /** 次の保存が、準備ができてから最初の保存 (揃え書き) か (spec 33)。準備ができていない回を通るたびに立てる */
  const firstSaveRef = useRef(true);
  /** 位置を当てる指示を出し、当たったのをまだ見ていない (spec 33 P1。onNodesChanged の awaitingLayout) */
  const awaitingLayoutRef = useRef(false);
  /** 今のエディタの中身を作る (確定で送る, spec 32 D1)。ノードが変わるたびに差し替える */
  const snapshotRef = useRef<(() => Snapshot) | null>(null);
  const importedRef = useRef(false);
  const expectedRef = useRef<string[] | null>(null);
  const layoutRef = useRef<Layout>({});
  const awaitMountRef = useRef(false);
  /** 図を開くたびに進む番号。開く途中で別の図 (届いた図) に切り替わったことを見分ける */
  const navSeq = useRef(0);
  /** 開いている途中の図の id (開き終えたら null) */
  const openingRef = useRef<string | null>(null);
  const pathKindRef = useRef(kindOf(pathname));
  pathKindRef.current = kindOf(pathname);
  const listRef = useRef(list);
  listRef.current = list;
  /** 今の図の、フロントが読んだ版 (updated_at)。自動保存に添える (spec 08 D2)。開いた時・載せ替え・各保存の戻りで更新する */
  const baseRef = useRef("");
  /** open は描画のたびに作り直されるので、自動保存の失敗からは ref 経由で呼ぶ */
  const openRef = useRef<(id: string) => Promise<void>>(async () => {});

  const autosaver = useMemo(
    () =>
      new Autosaver<Snapshot>(async (id, s, normalize) => {
        try {
          const saved = await saveDocument(id, s.source, s.layout, baseRef.current, normalize);
          setSaveError(null);
          if (currentRef.current?.id === id) baseRef.current = saved.updatedAt;
          // 自動保存では並びを動かさない (D12)。● だけ更新する
          setList((l) => l.map((d) => (d.id === id ? saved : d)));
        } catch (e) {
          if (isDocumentGone(e)) {
            // ごみ箱へ移した図への書き込み。書き直しても通らないので捨てる (Autosaver が捨てる。図は切り替えられる)
          } else if (isStaleBase(e)) {
            // 古い版を添えた書き込み (走り出した古い保存・別の図を開く途中に来た update の後の保存) を Rust が止めた。捨てる。
            // 今の updated_at が自分の base と同じなら、載せ替え (reload) が先に届いていて画面は既に新しい — 黙って捨てる。
            // 違えば載せ替えは来ない (last_opened が古くて Rust が「開いていない」と見た) ので、開き直して AI の中身を出す (spec 08 D2)
            if (currentRef.current?.id === id && staleBaseCurrent(e) !== baseRef.current) {
              noticeRef.current({
                status: "info",
                title: desktopT("session.reopening"),
                isClosable: true,
                duration: 5000,
              });
              void openRef.current(id);
            }
          } else if (isInitialFigureRejected(e)) {
            // 門の漏れを Rust が止めた。この書き込みは捨てる (Autosaver が捨てる。図は切り替えられる)
            noticeRef.current({
              status: "warning",
              title: desktopT("session.initialFigureRejected"),
              description: desktopT("session.initialFigureRejectedHint"),
              isClosable: true,
              duration: null,
            });
          } else {
            setSaveError(String(e));
          }
          throw e;
        }
      }, AUTOSAVE_DELAY_MS, (e) => isInitialFigureRejected(e) || isDocumentGone(e) || isStaleBase(e)),
    []
  );

  // 外枠が消える時は、待っている保存を捨てる (実物では閉じる時で、閉じる前の保存は onCloseRequested の flush が済ませている)。
  // 捨てないと、消えた外枠の 1 秒の待ちが後から届く (テストでは次のテストの図に書き込んだ, spec 33 P1)
  useEffect(() => () => autosaver.cancel(), [autosaver]);

  const refreshList = useCallback(async () => {
    const docs = await listDocuments();
    setList(docs);
    return docs;
  }, []);

  const becomeCurrent = useCallback((doc: Omit<DocumentSummary, "unsaved"> | null) => {
    currentRef.current = doc ? summaryOf(doc) : null;
    setCurrent(doc ? summaryOf(doc) : null);
    readyRef.current = false;
    setHistoryReady(false);
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
        title: desktopT("session.switchBlocked"),
        description: String(e),
        isClosable: true,
        duration: null,
      });
      return false;
    }
    autosaver.cancel();
    readyRef.current = false;
    setHistoryReady(false);
    return true;
  }, [autosaver, notice]);

  const open = useCallback(
    async (id: string) => {
      // 開く途中 (await の間) に届いた図へ切り替わったら、この開き方はやめる。続けると題名は届いた図、
      // キャンバスはこの図、という食い違いになる (2026-09-25 配布ビルドで観測)
      const seq = ++navSeq.current;
      const superseded = () => navSeq.current !== seq;
      openingRef.current = id;
      if (!(await leave()) || superseded()) return;
      const doc = await loadDocument(id);
      if (superseded()) return;
      baseRef.current = doc.updatedAt;
      // AI・インポートで届いた図は、エディタに載って最初の自動保存が済むまで source が空。原文から開く
      // (空を「新規作成の直後」と見なすと初期図で準備済みになり、初期図で潰れる。spec 04 現況 4)
      const text = doc.source || doc.originalSource || "";
      let request: OpenRequest | null = null;
      if (text) {
        request = await convertSource(text);
        if (superseded()) return;
        if (!request.payload) {
          notice({
            status: "error",
            title: desktopT("session.cannotOpen", { title: doc.title }),
            description: request.error ?? "",
            isClosable: true,
            duration: null,
          });
        }
      }
      becomeCurrent(doc);
      setUnopenable(Boolean(text) && !request?.payload);
      // 開けない図は初期図のまま「開けないので保存しません」を出すので隠さない。それ以外は開き終えるまで隠す
      if (text && !request?.payload) setSettled(true);
      else hide();
      expectedRef.current = request?.payload ? expectedKeys(doc.editor, request.payload.data) : null;
      layoutRef.current = doc.layout ?? {};
      // 開く中身が無い = 新規作成の直後。エディタの初期図で始まり、作り直した時点で準備済み
      awaitMountRef.current = !text;
      if (request?.payload) queueOpen(request);
      if (doc.editor !== pathKindRef.current) router.push(routeOf(doc.editor));
      setGeneration((g) => g + 1);
      if (openingRef.current === id) openingRef.current = null;
    },
    [becomeCurrent, hide, leave, notice, router]
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
      // 開いている途中の図も「今の図」として扱い、その開き方をやめる。続けると、ごみ箱の図が今の図に残り、
      // 自動保存が失敗し続けて図を切り替えられなくなる (2026-09-25 実機で観測)
      const opening = openingRef.current === id;
      if (opening) {
        navSeq.current += 1;
        openingRef.current = null;
      }
      const wasCurrent = currentRef.current?.id === id || opening;
      if (wasCurrent) {
        autosaver.cancel();
        readyRef.current = false;
        setHistoryReady(false);
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

  /** 利用者の「確定」(D12。旧「保存」)。今の変更を書いてから、一覧の先頭へ動かす */
  // 利用者の「確定」(spec 32 D1)。図の準備ができている時だけ (開いている途中・開けない図は readyRef が false)。
  // 自動保存の列に並べ、走っている保存と待っている変更を書き終えてから、その時の中身と版で確定する
  const save = useCallback(async () => {
    const doc = currentRef.current;
    if (!doc || !readyRef.current) return;
    const id = doc.id;
    try {
      await autosaver.enqueue(async () => {
        const produce = snapshotRef.current;
        if (currentRef.current?.id !== id || !readyRef.current || !produce) return;
        const s = produce();
        const saved = await confirmDocument(id, s.source, s.layout, baseRef.current);
        if (currentRef.current?.id === id) baseRef.current = saved.updatedAt;
      });
      await refreshList();
    } catch (e) {
      notice(
        isStaleBase(e)
          ? { status: "warning", title: desktopT("session.confirmStale"), isClosable: true, duration: 5000 }
          : { status: "error", title: desktopT("session.confirmFailed"), description: String(e), isClosable: true, duration: null }
      );
    }
  }, [autosaver, notice, refreshList]);

  // 最後に確定した中身へ戻す (spec 32 D3・D4)。開く経路は使わず (Undo の履歴を捨てるので)、その場で取り込みと位置を 1 回で当てる
  // (apply はエディタの取り込みに位置を当てる関数を添えて呼ぶ)。変換の await の間に図が替わったら当てない
  const hideSeqRef = useRef(hideSeq);
  hideSeqRef.current = hideSeq;
  const revert = useCallback(
    async (apply: (data: unknown, adjust: (nodes: Node[]) => Node[]) => void): Promise<boolean> => {
      const doc = currentRef.current;
      if (!doc || !readyRef.current) return false;
      const id = doc.id;
      const epoch = hideSeqRef.current;
      const unchanged = () => currentRef.current?.id === id && hideSeqRef.current === epoch && readyRef.current;
      try {
        const full = await loadDocument(id);
        const confirmed = full.confirmed;
        if (!confirmed || !unchanged()) return false;
        const request = await convertSource(confirmed.source);
        if (!request.payload || !unchanged()) return false;
        apply(request.payload.data, (nodes) => withLayout(doc.editor, nodes, confirmed.layout));
        return true;
      } catch (e) {
        notice({ status: "error", title: desktopT("session.revertFailed"), description: String(e), isClosable: true, duration: null });
        return false;
      }
    },
    [notice]
  );

  const editorMounted = useCallback(() => {
    if (!awaitMountRef.current) return;
    // 別の種類のページで作り直されたエディタ (ページが移る前) は、この図のエディタではない。移った先で作り直されるのを待つ
    // (2026-09-26 実機で観測: ER 図のページでフローチャートを新規作成すると、ER 図の初期図が一瞬見えた)
    if (currentRef.current && currentRef.current.editor !== pathKindRef.current) return;
    awaitMountRef.current = false;
    readyRef.current = true;
    setHistoryReady(true);
    // 新規作成の直後は初期図がこの図の中身
    setSettled(true);
  }, []);

  // 時間切れ: 図を開き始めてから一定時間で見せる。起動直後 (まだ何も開き始めていない) は数えない —
  // 起動処理が図を開く前に見せると、その間の初期図が見える
  useEffect(() => {
    if (settled || hideSeq === 0) return;
    const t = setTimeout(() => setSettled(true), SETTLE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [settled, hideSeq]);

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
    {
      const [n0, e0, d0, t0] = [nodes, edges, direction, theme];
      snapshotRef.current = () => ({
        source: toSource(doc.editor, n0, e0, d0, t0),
        layout: collectLayout(doc.editor, n0),
      });
    }
    const layout = layoutRef.current;
    const next = onNodesChanged({
      ready: readyRef.current,
      imported: importedRef.current,
      expected: expectedRef.current,
      page: pathKindRef.current,
      editor: doc.editor,
      nodes,
      layout,
      awaitingLayout: awaitingLayoutRef.current,
    });
    if (next.applyLayout) awaitingLayoutRef.current = true;
    if (next.save || !next.ready) awaitingLayoutRef.current = false;
    readyRef.current = next.ready;
    // 位置を当てる回 (settled でない) はまだ履歴を始めない。当てた後の回が起点 (当てたこと自体を 1 手にしない)
    setHistoryReady(next.ready && next.settled);
    if (next.settled) setSettled(true);
    if (next.applyLayout) rf.setNodes((ns) => withLayout(doc.editor, ns, layout));
    if (!next.save) {
      firstSaveRef.current = true;
      return;
    }
    const n = nodes;
    const e = edges;
    const d = direction;
    const t = theme;
    const produce = () => ({
      source: toSource(doc.editor, n, e, d, t),
      layout: collectLayout(doc.editor, n),
    });
    // 準備ができてから最初の保存は揃え書き: その時の中身 (届いた図に位置を当てたもの) だけを、待たずに印付きで書く。
    // 1 秒待つと、その間の人の編集が揃え書きに混ざり、updated_at を進めずに書かれる (spec 33)
    if (firstSaveRef.current) {
      firstSaveRef.current = false;
      autosaver.saveNow(doc.id, produce);
    } else {
      autosaver.touch(doc.id, produce);
    }
  }, [nodes, edges, direction, theme, rf, autosaver]);

  // 今の図と違う種類のページに居て、これから取り込む図も無い = 遅れて効いたページ移動で迷い込んだ。
  // 今の図を開き直してそのページへ戻る (spec 04 P0。保存は onNodesChanged の page で止まっている)
  // ページが変わった時だけ見る (open は描画のたびに作り直されるので、依存に入れると開き直し続ける)
  openRef.current = open;
  useEffect(() => {
    const doc = currentRef.current;
    if (!doc || kindOf(pathname) === doc.editor || hasPendingOpens()) return;
    void openRef.current(doc.id);
  }, [pathname]);

  // useDesktopOpen (エディタ側) との橋渡し。AI / インポートで届いた図は新しい 1 件として開く (D8・D10)
  const started = useRef(false);
  useEffect(() => {
    // 同期で呼ばれる (待つと StrictMode で取り込みを取りこぼす)。今の図の保存は始めるだけ
    const leaveNow = () => {
      autosaver.flush().catch((e) =>
        notice({
          status: "error",
          title: desktopT("session.previousSaveFailed"),
          description: String(e),
          isClosable: true,
          duration: null,
        })
      );
      autosaver.cancel();
      readyRef.current = false;
      setHistoryReady(false);
    };
    setDocsBridge({
      beforeImport: (request) => {
        const doc = request.document;
        if (!doc || !request.payload) return;
        navSeq.current += 1; // 開いている途中の open() があれば止める
        // 今の図の載せ替え (update_diagram, spec 08 D3): 書きかけは flush せず捨てる (届いた中身の方が新しい。
        // flush すると書き換えた後に古い書きかけが書かれる)。開いている途中の id も消す (後でその図をごみ箱へ移した時に誤らない)
        const reloading = Boolean(request.reload) && currentRef.current?.id === doc.id;
        if (reloading) {
          autosaver.cancel();
          readyRef.current = false;
          setHistoryReady(false);
          openingRef.current = null;
        } else {
          leaveNow();
        }
        becomeCurrent(doc);
        setUnopenable(false);
        expectedRef.current = expectedKeys(doc.editor, request.payload.data);
        // update_diagram の要求はその図の位置を持つ (同じ ID のノードは位置を保つ)。AI から届いた新しい図は持たない
        layoutRef.current = request.layout ?? {};
        baseRef.current = doc.updatedAt;
        awaitMountRef.current = false;
        hide();
        if (reloading) {
          notice({ status: "info", title: desktopT("session.reloaded"), isClosable: true, duration: 5000 });
        }
        void refreshList();
      },
      afterImport: () => {
        importedRef.current = true;
      },
      beforeLeave: leaveNow,
      currentId: () => currentRef.current?.id ?? null,
    });
    return () => setDocsBridge(null);
  }, [autosaver, becomeCurrent, hide, notice, refreshList]);

  // update_diagram がファイルを書けた合図 (spec 08 D3): その 1 件だけを一覧で差し替える (● と、開いていない図の書き換え)。
  // 一覧を丸ごと読み直さない — 読み直しは自動保存の 1 件差し替えと競合して ● が戻ることがある
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listenPayload<DocumentSummary>(DOCUMENTS_EVENT, (changed) => {
      setList((l) => (l.some((d) => d.id === changed.id) ? l.map((d) => (d.id === changed.id ? changed : d)) : l));
    }).then((u) => {
      if (disposed) u();
      else unlisten = u;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // 起動時: 届いている図 (AI) を先に取り込ませ、無ければ前回の図 → 一番新しい図 → 新規作成 (D9)
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      // エディタ側の最初の取り込み (takePendingOpen) を待つ。届いた図があればそれが開いている。
      // エディタが居ない時に止まらないよう上限を付ける
      await Promise.race([firstDrain, new Promise((r) => setTimeout(r, FIRST_DRAIN_TIMEOUT_MS))]);
      const docs = await refreshList();
      // 届いた図がもう開いている、または別のページへ回っていてこれから開く (上限で待ち切った時)
      if (currentRef.current || hasPendingOpens()) return;
      const last = await lastOpened();
      const target = docs.find((d) => d.id === last) ?? docs[0];
      if (currentRef.current || hasPendingOpens()) return;
      if (target) await open(target.id);
      else await create("flowchart");
    })().catch((e) => {
      // 開けなかったので隠したまま止めない
      setSettled(true);
      notice({ status: "error", title: desktopT("session.listFailed"), description: String(e), isClosable: true, duration: null });
    });
  }, [create, notice, open, refreshList]);

  return {
    list,
    current,
    unopenable,
    saveError,
    generation,
    settled,
    historyReady,
    historyEpoch: hideSeq,
    open,
    create,
    switchKind,
    rename,
    trash,
    save,
    revert,
    editorMounted,
    flushForClose,
  };
}
