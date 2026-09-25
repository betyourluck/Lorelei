// 図の一覧の「いつ保存するか」「いつ位置を当てるか」の判定 (spec 02 D6・D7・P3 の設計の補足)。
// 外枠の状態と切り離した純粋な部分で、vitest で固定する。

import type { Edge, Node } from "@xyflow/react";
import { generateERDiagramMermaidCode } from "@/features/er-diagram/utils/generate-mermaid-code";
import { generateMermaidCode, getSafeVariableName } from "@/features/flowchart/hooks/mermaid";
import type { EditorKind } from "./open-requests";

export type Pos = { x: number; y: number };
export type Layout = Record<string, Pos>;

type Data = Record<string, unknown>;

/**
 * ノードを Mermaid 上の ID で呼ぶ。flowchart は生成器が書き出す変数名 (エディタ内の id は保存して開き直すと変わる, 現況 3)、
 * ER 図はエンティティ名。
 */
export const keyOf = (editor: EditorKind, node: Node): string => {
  const data = node.data as Data;
  return editor === "flowchart"
    ? getSafeVariableName((data.variableName as string) || `node${node.id}`)
    : (data.name as string);
};

export const collectLayout = (editor: EditorKind, nodes: Node[]): Layout =>
  Object.fromEntries(nodes.map((n) => [keyOf(editor, n), { x: n.position.x, y: n.position.y }]));

export const withLayout = (editor: EditorKind, nodes: Node[], layout: Layout): Node[] =>
  nodes.map((n) => {
    const pos = layout[keyOf(editor, n)];
    return pos ? { ...n, position: pos } : n;
  });

/** 開く図の変換結果 (EditorPayload.data) が持つノードのキー */
export const expectedKeys = (editor: EditorKind, data: unknown): string[] => {
  const nodes = ((data as { nodes?: Data[] })?.nodes ?? []) as Data[];
  return editor === "flowchart"
    ? nodes.map((n) => getSafeVariableName(n.variableName as string))
    : nodes.map((n) => n.name as string);
};

/**
 * 位置を当ててよいか。取り込みが済み、かつ開く図のキーがストアに全部そろった時だけ。
 * 取り込み前は、作り直したエディタの初期図 (startNode 等) とキーが一致しても当てない (P0-4 で観測した早すぎる合図)。
 */
export const layoutReady = ({
  imported,
  expected,
  editor,
  nodes,
}: {
  imported: boolean;
  expected: string[];
  editor: EditorKind;
  nodes: Node[];
}): boolean => {
  if (!imported) return false;
  const present = new Set(nodes.map((n) => keyOf(editor, n)));
  return expected.every((k) => present.has(k));
};

/**
 * ストアのノードが変わった時にすること。準備前は位置を当てる合図 (layoutReady) を待ち、準備済みになったら保存する。
 * 位置を当てる時は、当てた後のノードの変化で保存されるので、ここでは保存しない。
 * 位置を持たない図 (AI から届いた図) は変化が起きないので、準備済みになった時点で保存する (2026-09-24 実機で観測した取りこぼし)。
 * ストアのノードは、今載っているページのエディタのもの。今の図と種類が違えば、それは今の図のノードではない
 * (遅れて効いたページ移動で、ER 図のノードがフローの図として保存された。spec 04 P0)。
 */
export const onNodesChanged = ({
  ready,
  imported,
  expected,
  page,
  editor,
  nodes,
  layout,
}: {
  ready: boolean;
  imported: boolean;
  expected: string[] | null;
  /** 今載っているページのエディタの種類 */
  page: EditorKind;
  /** 今の図の種類 */
  editor: EditorKind;
  nodes: Node[];
  layout: Layout;
}): { ready: boolean; applyLayout: boolean; save: boolean } => {
  if (page !== editor) return { ready: false, applyLayout: false, save: false };
  if (ready) return { ready: true, applyLayout: false, save: true };
  if (!expected || !layoutReady({ imported, expected, editor, nodes }))
    return { ready: false, applyLayout: false, save: false };
  const applyLayout = Object.keys(layout).length > 0;
  return { ready: true, applyLayout, save: !applyLayout };
};

/** Rust の save_document が初期図での上書きを拒んだ (src-tauri documents::INITIAL_FIGURE_REJECTED, spec 04 D4-2) */
export const isInitialFigureRejected = (e: unknown): boolean => String(e).startsWith("INITIAL_FIGURE_REJECTED");

/** Rust の save_document の相手の図が一覧に無い (ごみ箱へ移した。src-tauri documents::DOCUMENT_GONE) */
export const isDocumentGone = (e: unknown): boolean => String(e).startsWith("DOCUMENT_GONE");

/** 今の図の Mermaid (フォーク元の生成器の出力)。これが Document.source になる */
export const toSource = (editor: EditorKind, nodes: Node[], edges: Edge[]): string =>
  editor === "flowchart"
    ? generateMermaidCode({ nodes, edges })
    : generateERDiagramMermaidCode(nodes as never, edges);

/**
 * 変化から `delay` ms 待って保存する。図を切り替える前・閉じる前は flush。
 * 保存する中身は保存する瞬間に作る (produce)。失敗した変更は捨てず、flush は失敗を投げる (閉じる時に止めるため)。
 */
export class Autosaver<T> {
  private pending: { id: string; produce: () => T } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly save: (id: string, payload: T) => Promise<unknown>,
    private readonly delay: number,
    /** 捨ててよい失敗 (書き直しても通らない)。変更を残さず、flush も失敗させない。知らせるのは save の側 */
    private readonly discardable: (e: unknown) => boolean = () => false
  ) {}

  touch(id: string, produce: () => T): void {
    this.pending = { id, produce };
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush().catch(() => {
        // 失敗は flush の呼び手が見る。待ち時間での失敗は onError で知らせる
      });
    }, this.delay);
  }

  /** 変化が無ければ何もしない。失敗したら変更を残したまま投げる */
  async flush(): Promise<void> {
    this.clearTimer();
    const job = this.pending;
    if (!job) return;
    this.pending = null;
    try {
      await this.save(job.id, job.produce());
    } catch (e) {
      if (this.discardable(e)) return;
      if (!this.pending) this.pending = job;
      throw e;
    }
  }

  /** 別の図へ移った後、古い図の変更を保存しない */
  cancel(): void {
    this.clearTimer();
    this.pending = null;
  }

  get dirty(): boolean {
    return this.pending !== null;
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
