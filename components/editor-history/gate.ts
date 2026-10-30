"use client";

import { createContext } from "react";

/**
 * 履歴の起点と止め方をエディタへ渡す口 (spec 30 D6、data_contract HistoryGate)。
 * - ready: false の間は記録も戻しもしない。true になった時、その時の state を起点にして履歴を捨てる
 * - epoch: 変わった時、その時の state を起点にして履歴を捨てる
 * Web 版は何も渡さず既定のまま (いつも ready)。デスクトップは図を開く・載せ替える間を止め、図が替わったら捨てるために渡す
 */
export interface HistoryGate {
  ready: boolean;
  epoch: unknown;
}

export const HistoryGateContext = createContext<HistoryGate>({ ready: true, epoch: 0 });
