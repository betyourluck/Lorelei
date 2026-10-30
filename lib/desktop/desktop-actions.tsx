"use client";


import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef } from "react";
import type { MermaidTheme } from "@/components/ui/mermaid-theme";
import type { GraphType } from "@/features/flowchart/types/types";

/** フォーク元のパネルがツールバーへ渡す操作 (spec 02 D3)。インポートは外枠が持つので含めない (D10) */
export interface DesktopActions {
  /** ラベルはエディタごとに違う (ノード追加 / テーブル追加) */
  add: { label: string; run: () => void };
  /** コード生成のモーダルを開く */
  code: () => void;
  /** 今の図の向き (spec 07 D3)。外枠はツールバーの切り替えに出し、保存に使う */
  direction?: GraphType;
  /** ツールバーから向きを変える */
  setDirection?: (direction: GraphType) => void;
  /** 今の図のテーマ (spec 24 D1)。外枠は保存に使う (選ぶのはコード生成のダイアログ。ツールバーには出さない) */
  theme?: MermaidTheme;
  /** 空の枠 (サブグラフ) を置く (spec 15 D5)。フローチャートだけ */
  addFrame?: () => void;
  /** 操作の Undo / Redo (spec 30)。ツールバーの ↶ ↷ */
  history?: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean };
}

/** 外枠が受け取る形。パネルの関数は毎回作り直されるので、呼ぶ時に最新のものを読む */
export interface RegisteredActions {
  addLabel: string;
  add: () => void;
  code: () => void;
  /** 今の図の向き。エディタが向きを持たなければ TD */
  direction: GraphType;
  /** 向きを変える。エディタが向きを持たなければ null (ツールバーに切り替えを出さない) */
  setDirection: ((direction: GraphType) => void) | null;
  /** 今の図のテーマ。エディタがテーマを持たなければ default */
  theme: MermaidTheme;
  /** 枠を追加する。登録されなければ null (ツールバーに出さない) */
  addFrame: (() => void) | null;
  /** 戻す・やり直す。登録されなければ null。押せるかは HistoryStatus で別に渡す (手を打つたびに登録し直さない) */
  undo: (() => void) | null;
  redo: (() => void) | null;
}

/** 戻す・やり直すを押せるか (spec 30)。登録とは別に渡す (登録し直すと editorMounted が走るので) */
export interface HistoryStatus {
  canUndo: boolean;
  canRedo: boolean;
}

type Register = (actions: RegisteredActions | null) => void;

const RegisterContext = createContext<Register | null>(null);
const HistoryStatusContext = createContext<((status: HistoryStatus) => void) | null>(null);

export const DesktopActionsProvider = ({
  register,
  onHistoryStatus,
  children,
}: {
  register: Register;
  onHistoryStatus?: (status: HistoryStatus) => void;
  children: ReactNode;
}) => (
  <RegisterContext.Provider value={register}>
    <HistoryStatusContext.Provider value={onHistoryStatus ?? null}>{children}</HistoryStatusContext.Provider>
  </RegisterContext.Provider>
);

/**
 * フォーク元のパネルが 1 行で呼ぶ。外枠の中 (デスクトップ版) にいる時だけツールバーへ操作を登録する。
 * Web 版には外枠が無いので何もしない。
 */
export function useDesktopActions(actions: DesktopActions): void {
  const register = useContext(RegisterContext);
  const latest = useRef(actions);
  latest.current = actions;
  const label = actions.add.label;
  const direction = actions.direction ?? "TD";
  const theme = actions.theme ?? "default";
  const hasDirection = Boolean(actions.setDirection);
  const hasAddFrame = Boolean(actions.addFrame);
  const hasHistory = Boolean(actions.history);
  const reportHistory = useContext(HistoryStatusContext);
  const canUndo = actions.history?.canUndo ?? false;
  const canRedo = actions.history?.canRedo ?? false;

  // 向き・テーマが変わったら登録し直す (外枠はそれで保存し直す)
  useEffect(() => {
    if (!register) return;
    register({
      addLabel: label,
      add: () => latest.current.add.run(),
      code: () => latest.current.code(),
      direction,
      setDirection: hasDirection ? (d) => latest.current.setDirection?.(d) : null,
      theme,
      addFrame: hasAddFrame ? () => latest.current.addFrame?.() : null,
      undo: hasHistory ? () => latest.current.history?.undo() : null,
      redo: hasHistory ? () => latest.current.history?.redo() : null,
    });
    return () => register(null);
  }, [register, label, direction, theme, hasDirection, hasAddFrame, hasHistory]);

  // 押せるかは別に知らせる (spec 30)
  useEffect(() => {
    reportHistory?.({ canUndo, canRedo });
  }, [reportHistory, canUndo, canRedo]);
}
