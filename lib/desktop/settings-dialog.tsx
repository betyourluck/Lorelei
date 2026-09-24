"use client";

import {
  Box,
  Button,
  Checkbox,
  Code,
  HStack,
  Heading,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
  useNotice,
} from "@yamada-ui/react";
import type { FC } from "react";
import { useEffect, useState } from "react";
import type { McpStatus } from "./mcp";
import { regenerateMcpToken, registerCommand, setMcpEnabled, setMcpPort, stateLabel } from "./mcp";

interface Props {
  open: boolean;
  onClose: () => void;
  status: McpStatus | null;
  onStatus: (s: McpStatus) => void;
}

/**
 * 設定画面 (spec 03 D4)。今は「MCP サーバー」の節だけ。項目は Fuseforks の「外部連携 > MCP サーバー」に揃える。
 * Tauri 専用 (Web 版には出ない)。今後の設定もここへ足す。
 */
export const SettingsDialog: FC<Props> = ({ open, onClose, status, onStatus }) => {
  const notice = useNotice();
  const [port, setPort] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status) setPort(String(status.port));
  }, [status?.port]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (op: () => Promise<McpStatus>) => {
    setBusy(true);
    try {
      onStatus(await op());
    } catch (e) {
      notice({ status: "error", title: "設定を変えられませんでした", description: String(e), isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    notice({ status: "success", title: `${what}をコピーしました`, isClosable: true });
  };

  return (
    <Modal open={open} onClose={onClose} size="2xl">
      <ModalOverlay />
      <ModalCloseButton />
      <ModalHeader>設定</ModalHeader>
      <ModalBody>
        {!status ? (
          <Text>読み込んでいます…</Text>
        ) : (
          <VStack gap="md" align="stretch">
            <Heading size="sm">MCP サーバー（AI から図を受け取る）</Heading>
            <Text fontSize="sm" color="gray.600">
              Claude Code などの MCP クライアントから、validate / render / open_in_editor を呼べるようにします。
              Lorelei を開いている間だけ使えます。
            </Text>

            <Checkbox
              checked={status.enabled}
              disabled={busy || status.state === "blocked"}
              onChange={(e) => void run(() => setMcpEnabled(e.target.checked))}
            >
              MCP サーバーを有効にする
            </Checkbox>

            <Box>
              <Text fontSize="sm" fontWeight="semibold">
                待ち受けの状態
              </Text>
              <Text fontSize="sm">{stateLabel(status)}</Text>
              {status.detail && (
                <Text fontSize="sm" color="red.600">
                  {status.detail}
                </Text>
              )}
            </Box>

            <Box>
              <HStack gap="sm">
                <Text as="label" htmlFor="lorelei-mcp-port" fontSize="sm" fontWeight="semibold">
                  ポート
                </Text>
                <Input
                  id="lorelei-mcp-port"
                  type="number"
                  aria-label="ポート"
                  size="sm"
                  w="120px"
                  min={1024}
                  max={65535}
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="ポートを適用"
                  disabled={busy || Number(port) === status.port}
                  onClick={() => void run(() => setMcpPort(Number(port)))}
                >
                  適用
                </Button>
              </HStack>
              <Text fontSize="xs" color="gray.500">
                待ち受けは 127.0.0.1 のみです（他の端末からは接続できません）。
              </Text>
            </Box>

            <Box>
              <Text fontSize="sm" fontWeight="semibold">
                トークン
              </Text>
              <HStack gap="sm">
                <Code>{status.token ? "••••••••••••••••" : "まだ作られていません"}</Code>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!status.token}
                  onClick={() => status.token && void copy(status.token, "トークン")}
                >
                  コピー
                </Button>
                <Button size="xs" variant="outline" disabled={busy} onClick={() => setConfirming(true)}>
                  トークンを作り直す
                </Button>
              </HStack>
              {confirming && (
                <HStack gap="sm" mt="xs">
                  <Text fontSize="sm" color="orange.600">
                    今のトークンを設定したクライアントはつながらなくなります。
                  </Text>
                  <Button
                    size="xs"
                    colorScheme="red"
                    onClick={() => {
                      setConfirming(false);
                      void run(regenerateMcpToken);
                    }}
                  >
                    作り直す
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
                    やめる
                  </Button>
                </HStack>
              )}
            </Box>

            <Box>
              <Text fontSize="sm" fontWeight="semibold">
                クライアント側の設定（Claude Code）
              </Text>
              <HStack gap="sm" align="start">
                <Code fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-all" flex="1">
                  {registerCommand({ ...status, token: status.token ? "<トークン>" : null })}
                </Code>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!status.token}
                  onClick={() => void copy(registerCommand(status), "登録コマンド")}
                >
                  登録コマンドをコピー
                </Button>
              </HStack>
              <Text fontSize="xs" color="gray.500">
                Lorelei を使うプロジェクトのフォルダで実行してください（登録はフォルダごとです。どこからでも使うなら
                --scope user を足します）。トークンを作り直したら、登録し直してください。
              </Text>
            </Box>
          </VStack>
        )}
      </ModalBody>
    </Modal>
  );
};
