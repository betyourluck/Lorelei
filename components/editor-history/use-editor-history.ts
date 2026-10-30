"use client";

import type { Edge, Node } from "@xyflow/react";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useContext, useEffect, useReducer, useRef } from "react";
import { HistoryGateContext } from "./gate";
import { EditorHistory, nextNodeId, restoreNodes, type EditorSnapshot } from "./history";

interface EditorState<N extends Node, E extends Edge, D extends string, T extends string> {
  nodes: N[];
  edges: E[];
  direction: D;
  theme: T;
  nodeId: number;
}

interface EditorSetters<N extends Node, E extends Edge, D extends string, T extends string> {
  setNodes: Dispatch<SetStateAction<N[]>>;
  setEdges: Dispatch<SetStateAction<E[]>>;
  setDirection: (direction: D) => void;
  setTheme: (theme: T) => void;
  setNodeId: Dispatch<SetStateAction<number>>;
}

export interface EditorHistoryActions {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/** ドラッグ・大きさの変更の途中 (手を離した時の state で 1 手にする) */
const inProgress = (nodes: Node[]) => nodes.some((n) => n.dragging || n.resizing);

/** ダイアログ (削除の確認・コード生成・インポート・設定) が開いている。確認を待つ間の state は確認の後でまとめて 1 手にする */
const dialogOpen = () =>
  typeof document !== "undefined" &&
  document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;

/** 文字の入力の中 (その欄の取り消しに任せる)。チェックボックス・ボタンは入れない (spec 30 D2) */
const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "tel", "email", "password", "number"]);
const inTextInput = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest("[contenteditable='true'], .cm-editor"))
    return true;
  if (target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type);
};

/**
 * エディタの操作の Undo / Redo (spec 30、data_contract EditorHistory)。2 つのエディタで共有する。
 * state が変わった描画の後、次のフレームで中身の鍵を比べて 1 手にする (同じフレームの中の変更はまとまる)。
 * ドラッグの途中とダイアログが開いている間は保留し、次の変更か Undo の時にまとめる。
 * 起点と止め方は HistoryGateContext から受ける (Web 版はいつも ready、デスクトップは図の準備ができるまで止める)
 */
export function useEditorHistory<
  N extends Node,
  E extends Edge,
  D extends string,
  T extends string,
>(state: EditorState<N, E, D, T>, setters: EditorSetters<N, E, D, T>): EditorHistoryActions {
  const gate = useContext(HistoryGateContext);
  const historyRef = useRef(new EditorHistory());
  const latest = useRef(state);
  latest.current = state;
  const settersRef = useRef(setters);
  settersRef.current = setters;
  const readyRef = useRef(gate.ready);
  readyRef.current = gate.ready;
  // 記録を保留している変更がある (Undo を押せる)
  const [pending, setPending] = useReducer((_: boolean, v: boolean) => v, false);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const snapshot = () => latest.current as unknown as EditorSnapshot;

  // 起点: 準備ができた時・epoch が変わった時に、その時の state から始める
  useEffect(() => {
    if (!gate.ready) return;
    const history = historyRef.current;
    const had = history.canUndo || history.canRedo;
    history.reset(snapshot());
    setPending(false);
    // ボタンの押せる・押せないが変わる時だけ描き直す。マウントの直後に余分に描き直すと、デスクトップで ER 図を開いた時に
    // 自動保存が始まらないことがあった (spec 30「P1 結果」、真因は未解明)
    if (had) rerender();
  }, [gate.ready, gate.epoch]);

  // 記録
  const { nodes, edges, direction, theme } = state;
  useEffect(() => {
    if (!gate.ready) return;
    if (inProgress(nodes) || dialogOpen()) {
      setPending(true);
      return;
    }
    const id = requestAnimationFrame(() => {
      if (!readyRef.current) return;
      if (dialogOpen() || inProgress(latest.current.nodes)) {
        setPending(true);
        return;
      }
      if (historyRef.current.record(snapshot())) rerender();
      setPending(false);
    });
    return () => cancelAnimationFrame(id);
  }, [nodes, edges, direction, theme, gate.ready]);

  const step = useCallback((which: "undo" | "redo") => {
    // 図の準備の途中・ダイアログ・ドラッグの途中は効かない (spec 30 D5)
    if (!readyRef.current || dialogOpen() || inProgress(latest.current.nodes)) return;
    const s = historyRef.current[which](snapshot());
    setPending(false);
    rerender();
    if (!s) return;
    const set = settersRef.current;
    set.setNodes((current) => restoreNodes(s.nodes, current) as N[]);
    set.setEdges(s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)) as E[]);
    set.setDirection(s.direction as D);
    set.setTheme(s.theme as T);
    set.setNodeId((current) => nextNodeId(current, s.nodes));
  }, []);
  const undo = useCallback(() => step("undo"), [step]);
  const redo = useCallback(() => step("redo"), [step]);

  // キー: Ctrl+Z で戻す、Ctrl+Y・Ctrl+Shift+Z でやり直す (Mac は ⌘Z・⌘⇧Z。⌘Y は Safari が履歴を開くので使わない)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.altKey || inTextInput(e.target)) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const isUndo = mod && key === "z" && !e.shiftKey;
      const isRedo = (mod && key === "z" && e.shiftKey) || (e.ctrlKey && !e.metaKey && key === "y");
      if (!isUndo && !isRedo) return;
      e.preventDefault();
      step(isUndo ? "undo" : "redo");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [step]);

  const history = historyRef.current;
  return {
    undo,
    redo,
    canUndo: gate.ready && (history.canUndo || pending),
    canRedo: gate.ready && history.canRedo && !pending,
  };
}
