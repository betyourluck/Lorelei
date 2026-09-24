"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef } from "react";

/** フォーク元のパネルがツールバーへ渡す操作 (spec 02 D3)。インポートは外枠が持つので含めない (D10) */
export interface DesktopActions {
  /** ラベルはエディタごとに違う (ノード追加 / テーブル追加) */
  add: { label: string; run: () => void };
  /** コード生成のモーダルを開く */
  code: () => void;
}

/** 外枠が受け取る形。パネルの関数は毎回作り直されるので、呼ぶ時に最新のものを読む */
export interface RegisteredActions {
  addLabel: string;
  add: () => void;
  code: () => void;
}

type Register = (actions: RegisteredActions | null) => void;

const RegisterContext = createContext<Register | null>(null);

export const DesktopActionsProvider = ({
  register,
  children,
}: {
  register: Register;
  children: ReactNode;
}) => <RegisterContext.Provider value={register}>{children}</RegisterContext.Provider>;

/**
 * フォーク元のパネルが 1 行で呼ぶ。外枠の中 (デスクトップ版) にいる時だけツールバーへ操作を登録する。
 * Web 版には外枠が無いので何もしない。
 */
export function useDesktopActions(actions: DesktopActions): void {
  const register = useContext(RegisterContext);
  const latest = useRef(actions);
  latest.current = actions;
  const label = actions.add.label;

  useEffect(() => {
    if (!register) return;
    register({
      addLabel: label,
      add: () => latest.current.add.run(),
      code: () => latest.current.code(),
    });
    return () => register(null);
  }, [register, label]);
}
