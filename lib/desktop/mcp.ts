"use client";

// GUI の中の MCP の待ち受け (spec 03 D2・D4・D6、data_contract `McpStatus` / `GuiCommands.mcp_*`)。
// 設定ファイル (mcp_server.json) の読み書きは Rust。JS はコマンドを呼ぶだけ。

import { useCallback, useEffect, useState } from "react";
import { invoke, listen } from "./tauri";

export interface McpStatus {
  enabled: boolean;
  port: number;
  /** 設定画面のコピーと登録コマンドに使う。画面には伏せて出す */
  token: string | null;
  state: "listening" | "stopped" | "failed" | "blocked";
  detail: string | null;
}

/** src-tauri の MCP_STATUS_EVENT と同じ名前 */
export const MCP_STATUS_EVENT = "lorelei://mcp-status";

export const mcpStatus = (): Promise<McpStatus> => invoke("mcp_status");
export const setMcpEnabled = (enabled: boolean): Promise<McpStatus> =>
  invoke("set_mcp_enabled", { enabled });
export const setMcpPort = (port: number): Promise<McpStatus> => invoke("set_mcp_port", { port });
export const regenerateMcpToken = (): Promise<McpStatus> => invoke("regenerate_mcp_token");

/** Claude Code への登録コマンド。local スコープ (~/.claude.json のそのフォルダの欄。リポジトリに入らない) */
export const registerCommand = (s: McpStatus): string =>
  `claude mcp add --transport http lorelei http://127.0.0.1:${s.port}/mcp --header "Authorization: Bearer ${s.token ?? ""}"`;

/** タイトルバーの印と設定画面に出す、状態の短い言葉 */
export const stateLabel = (s: McpStatus): string => {
  switch (s.state) {
    case "listening":
      return `待ち受け中: 127.0.0.1:${s.port}`;
    case "stopped":
      return "止めています";
    case "failed":
      return "待ち受けられません";
    case "blocked":
      return "設定を読めません";
  }
};

/** 状態を読み、変わった合図のたびに読み直す */
export function useMcpStatus(): [McpStatus | null, (s: McpStatus) => void] {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const refresh = useCallback(() => {
    mcpStatus().then(setStatus, () => setStatus(null));
  }, []);
  useEffect(() => {
    refresh();
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listen(MCP_STATUS_EVENT, refresh).then((u) => {
      if (disposed) u();
      else unlisten = u;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [refresh]);
  return [status, setStatus];
}
