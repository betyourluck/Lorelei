// エディタの操作の Undo / Redo の純粋な部分 (spec 30、data_contract EditorHistory)。
// 手は「中身の鍵」が変わった時に 1 つ。入口ごとに記録するのではないので、選ぶ・クリックだけ・同じ値の確定は手にならず、
// 入口の数え漏れ (枠の大きさ・矢印キーの移動・Backspace・ER 図のセル) も拾う

import type { Edge, Node } from "@xyflow/react";

/** 1 手の写し。配列は state の参照をそのまま持つ (変更は不変更新なので、変わっていないノードは同じものを指す) */
export interface EditorSnapshot {
  nodes: Node[];
  edges: Edge[];
  direction: string;
  theme: string;
  /** 次のノードの番号。戻す時に当てるが、鍵には入れない */
  nodeId: number;
}

const LIMIT = 100;

/**
 * 中身の鍵。ノードと線は決めた欄だけを写す (selected・dragging・resizing・measured は入れない)。
 * data の関数 (ハンドラ) は JSON に入らないので自然に外れる
 */
export const contentKey = (s: EditorSnapshot): string =>
  JSON.stringify([
    s.direction,
    s.theme,
    s.nodes.map((n) => [n.id, n.type, n.parentId, n.position, n.width, n.height, n.data]),
    s.edges.map((e) => [e.id, e.source, e.target, e.sourceHandle, e.targetHandle, e.type, e.data]),
  ]);

/**
 * 戻す写しのノードを、今のノードに合わせて当てられる形にする。選択とドラッグ・大きさの変更の印は落とす
 * (dragging が残ると手を離した時の線の探し直しが走らない, failures #38)。測った大きさは今の同じ id の値を当てる
 * (全部外すと xyflow が測り直すまでノードと線が消える)
 */
export const restoreNodes = (prev: Node[], current: Node[]): Node[] => {
  const measured = new Map(current.map((n) => [n.id, n.measured]));
  return prev.map((n) => ({
    ...n,
    selected: false,
    dragging: false,
    resizing: false,
    measured: measured.get(n.id) ?? n.measured,
  }));
};

/** 次のノードの番号。インポートで番号が下がるので、戻したノードの数字の ID と重ならないようにする */
export const nextNodeId = (current: number, nodes: Node[]): number => {
  const ids = nodes.map((n) => Number(n.id)).filter((v) => Number.isInteger(v));
  return Math.max(current, ...ids.map((v) => v + 1));
};

interface Entry {
  snapshot: EditorSnapshot;
  key: string;
}

const entry = (snapshot: EditorSnapshot): Entry => ({ snapshot, key: contentKey(snapshot) });

export class EditorHistory {
  private past: Entry[] = [];
  private future: Entry[] = [];
  private present: Entry | null = null;

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** 履歴を捨て、この写しを起点にする */
  reset(snapshot: EditorSnapshot): void {
    this.past = [];
    this.future = [];
    this.present = entry(snapshot);
  }

  /** 今の写しが前の手と中身で違えば 1 手にする。手にしたら true。起点の無い間は何もしない */
  record(snapshot: EditorSnapshot): boolean {
    if (!this.present) return false;
    const next = entry(snapshot);
    if (next.key === this.present.key) return false;
    this.past.push(this.present);
    if (this.past.length > LIMIT) this.past.shift();
    this.future = [];
    this.present = next;
    return true;
  }

  /** 1 手戻す。今の state (まだ記録していない変更を含む) を先に 1 手にしてから、1 つ前の写しを返す */
  undo(current: EditorSnapshot): EditorSnapshot | null {
    this.record(current);
    const prev = this.past.pop();
    if (!prev || !this.present) return null;
    this.future.push(this.present);
    this.present = prev;
    return prev.snapshot;
  }

  /** 1 手やり直す。戻した後に別の変更があれば、それが新しい手になってやり直せる手は消える */
  redo(current: EditorSnapshot): EditorSnapshot | null {
    this.record(current);
    const next = this.future.pop();
    if (!next || !this.present) return null;
    this.past.push(this.present);
    this.present = next;
    return next.snapshot;
  }
}
