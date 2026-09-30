// 図の一覧の「いつ保存するか」「いつ位置を当てるか」の判定 (spec 02 D6・D7・P3 の設計の補足)。
// 外枠の状態と切り離した純粋な部分で、vitest で固定する。

import type { Edge, Node } from "@xyflow/react";
import { generateERDiagramMermaidCode } from "@/features/er-diagram/utils/generate-mermaid-code";
import { generateMermaidCode, getSafeVariableName } from "@/features/flowchart/hooks/mermaid";
import type { GraphType } from "@/features/flowchart/types/types";
import { absolutePositions, type Point } from "@/features/flowchart/utils/frame-edit";
import { SUBGRAPH_NODE_TYPE } from "@/features/flowchart/utils/subgraph-tree";
import type { EditorKind } from "./open-requests";

/** 絶対座標 (spec 15 D4)。枠 (サブグラフ) だけ大きさも持つ */
export type Pos = { x: number; y: number; width?: number; height?: number };
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

// 絶対位置 (spec 15 D4) の計算は、枠の編集 (spec 15 D5) と同じもの。枠の中のノードの position は親からの相対なので、親の position を根まで足す

/** 枠の大きさ (取り込み時の配置が決めたもの、または人が変えたもの) */
const frameSize = (n: Node): { width: number; height: number } | undefined => {
  if (n.type !== SUBGRAPH_NODE_TYPE) return undefined;
  const width = n.width ?? n.measured?.width;
  const height = n.height ?? n.measured?.height;
  return width !== undefined && height !== undefined ? { width, height } : undefined;
};

export const collectLayout = (editor: EditorKind, nodes: Node[]): Layout => {
  const abs = absolutePositions(nodes);
  return Object.fromEntries(
    nodes.map((n) => {
      const p = abs.get(n.id) ?? { x: n.position.x, y: n.position.y };
      const size = frameSize(n);
      return [keyOf(editor, n), size ? { ...p, ...size } : p];
    })
  );
};

/**
 * 保存した位置 (絶対座標) を当てる。枠の中のノードは、親の新しい絶対位置からの相対に直す (spec 15 D4)。
 * 位置の無いノードは今の絶対位置のまま。枠は大きさも当てる
 */
export const withLayout = (editor: EditorKind, nodes: Node[], layout: Layout): Node[] => {
  const current = absolutePositions(nodes);
  const target = new Map<string, Point>(
    nodes.map((n) => {
      const pos = layout[keyOf(editor, n)];
      return [n.id, pos ? { x: pos.x, y: pos.y } : (current.get(n.id) ?? n.position)];
    })
  );
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return nodes.map((n) => {
    const pos = layout[keyOf(editor, n)];
    const parent = n.parentId !== undefined ? byId.get(n.parentId) : undefined;
    const size = n.type === SUBGRAPH_NODE_TYPE && pos?.width !== undefined && pos.height !== undefined;
    if (!pos && !parent) return n;
    const me = target.get(n.id) ?? n.position;
    const base = parent ? (target.get(parent.id) ?? { x: 0, y: 0 }) : { x: 0, y: 0 };
    return {
      ...n,
      position: { x: me.x - base.x, y: me.y - base.y },
      ...(size ? { width: pos.width, height: pos.height } : {}),
    };
  });
};

/** 開く図の変換結果 (EditorPayload.data) が持つノードのキー。フローチャートは枠 (subgraphs) のキーも入る (spec 15 D4) */
export const expectedKeys = (editor: EditorKind, data: unknown): string[] => {
  const nodes = ((data as { nodes?: Data[] })?.nodes ?? []) as Data[];
  const subgraphs = ((data as { subgraphs?: Data[] })?.subgraphs ?? []) as Data[];
  return editor === "flowchart"
    ? [
        ...nodes.map((n) => getSafeVariableName(n.variableName as string)),
        ...subgraphs.map((s) => getSafeVariableName(s.id as string)),
      ]
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
 * settled は「エディタを見せてよい」: 準備済みで、位置を当て終えた (spec 05 D4。初期図と当てる前の配置を見せない)。
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
}): { ready: boolean; applyLayout: boolean; save: boolean; settled: boolean } => {
  if (page !== editor) return { ready: false, applyLayout: false, save: false, settled: false };
  if (ready) return { ready: true, applyLayout: false, save: true, settled: true };
  if (!expected || !layoutReady({ imported, expected, editor, nodes }))
    return { ready: false, applyLayout: false, save: false, settled: false };
  // 当てる位置が 1 つも無ければ (全ノードを改名した載せ替え) 当てる回を飛ばす — 当てても変化が起きず、保存と表示が止まる (spec 08 D3)
  const applyLayout = expected.some((k) => k in layout);
  // 位置を当てる回はまだ見せない。当てた後の変化 (ready: true の回) で見せる (spec 05 D4)
  return { ready: true, applyLayout, save: !applyLayout, settled: !applyLayout };
};

/** Rust の save_document が初期図での上書きを拒んだ (src-tauri documents::INITIAL_FIGURE_REJECTED, spec 04 D4-2) */
export const isInitialFigureRejected = (e: unknown): boolean => String(e).startsWith("INITIAL_FIGURE_REJECTED");

/** Rust の save_document の相手の図が一覧に無い (ごみ箱へ移した。src-tauri documents::DOCUMENT_GONE) */
export const isDocumentGone = (e: unknown): boolean => String(e).startsWith("DOCUMENT_GONE");

/** 古い版を添えた書き込みを Rust が拒んだ (src-tauri documents::STALE_BASE, spec 08 D2)。後ろに今の updated_at が載る */
export const isStaleBase = (e: unknown): boolean => String(e).startsWith("STALE_BASE");

/** STALE_BASE のエラーから今の updated_at を取り出す */
export const staleBaseCurrent = (e: unknown): string | null => {
  const m = /^STALE_BASE:\s*(\S+)/.exec(String(e));
  return m ? m[1] : null;
};

/** 今の図の Mermaid (フォーク元の生成器の出力)。これが Document.source になる */
export const toSource = (
  editor: EditorKind,
  nodes: Node[],
  edges: Edge[],
  /** エディタの向き (spec 07 D3)。ER 図は TD なら向きの行を書かない */
  direction: GraphType = "TD"
): string =>
  editor === "flowchart"
    ? generateMermaidCode({ nodes, edges }, direction)
    : generateERDiagramMermaidCode(nodes as never, edges, direction);

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
