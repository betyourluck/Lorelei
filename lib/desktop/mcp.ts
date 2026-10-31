"use client";

// GUI の中の MCP の待ち受け (spec 03 D2・D4・D6、data_contract `McpStatus` / `GuiCommands.mcp_*`)。
// 設定ファイル (mcp_server.json) の読み書きは Rust。JS はコマンドを呼ぶだけ。

import { useCallback, useEffect, useState } from "react";
import type { DesktopError } from "./errors";
import { desktopT } from "./i18n";
import { invoke, listen } from "./tauri";

export interface McpStatus {
  enabled: boolean;
  port: number;
  /** 設定画面のコピーと登録コマンドに使う。画面には伏せて出す */
  token: string | null;
  state: "listening" | "stopped" | "failed" | "blocked";
  /** failed / blocked の理由。spec 34 D3 で DesktopError に (前の版の文字列も読む) */
  detail: string | DesktopError | null;
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

/**
 * 設定ファイルに貼る JSON (spec 26 D1)。Claude Code の .mcp.json と Fuseforks の設定画面と同じ形。
 * .mcp.json は Git に入れて共有する前提のファイルなので、画面に注意書きを出す (D2)
 */
export const clientConfigJson = (s: McpStatus): string =>
  JSON.stringify(
    {
      mcpServers: {
        lorelei: {
          type: "http",
          url: `http://127.0.0.1:${s.port}/mcp`,
          headers: { Authorization: `Bearer ${s.token ?? ""}` },
        },
      },
    },
    null,
    2
  );

/** タイトルバーの印と設定画面に出す、状態の短い言葉 */
export const stateLabel = (s: McpStatus): string => {
  switch (s.state) {
    case "listening":
      return desktopT("mcp.state.listening", { port: s.port });
    case "stopped":
      return desktopT("mcp.state.stopped");
    case "failed":
      return desktopT("mcp.state.failed");
    case "blocked":
      return desktopT("mcp.state.blocked");
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
