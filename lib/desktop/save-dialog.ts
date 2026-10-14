"use client";

import { useSyncExternalStore } from "react";

// 保存ダイアログは窓に 1 つだけ (spec 25 D5、data_contract `DesktopSaveDialog`)。
// 書き出しのボタン (ExportButtons) と「ダウンロード」(useMmdDownload) の両方がここを通して exportDiagram を呼ぶ。
// 保存ダイアログは窓を親にしたモーダルなので、出た後は OS が窓を止める。ここで止めるのは、押してから出るまでの間と、別のボタンからの同時押し

let open = false;
const listeners = new Set<() => void>();

const setOpen = (value: boolean) => {
  open = value;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 保存ダイアログを出している間は task を呼ばずに { ran: false }。task が投げたら状態を戻してから投げ直す */
export async function runSaveDialog<T>(
  task: () => Promise<T>
): Promise<{ ran: true; value: T } | { ran: false }> {
  if (open) return { ran: false };
  setOpen(true);
  try {
    return { ran: true, value: await task() };
  } finally {
    setOpen(false);
  }
}

/** 保存ダイアログを出している間 true (どのボタンから出したものでも) */
export const useSaveDialogBusy = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => open,
    () => false
  );
