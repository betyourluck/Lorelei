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
  Tab,
  TabPanel,
  Tabs,
  Text,
  VStack,
  useNotice,
} from "@yamada-ui/react";
import type { FC } from "react";
import { useEffect, useState } from "react";
import type { McpStatus } from "./mcp";
import {
  clientConfigJson,
  regenerateMcpToken,
  registerCommand,
  setMcpEnabled,
  setMcpPort,
  stateLabel,
} from "./mcp";

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
            <Text fontSize="sm" color="textHint">
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
                <Text fontSize="sm" color="dangerText">
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
              <Text fontSize="xs" color="textCaption">
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
                  <Text fontSize="sm" color="warningText">
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

            <ClientSetup status={status} onCopy={(text, what) => void copy(text, what)} />
          </VStack>
        )}
      </ModalBody>
    </Modal>
  );
};

/**
 * クライアント側の設定 (spec 03 D4・spec 26 D1〜D3)。コマンドと JSON の 2 つのタブ。最初はコマンド、どちらを開いたかは覚えない。
 * 画面にはトークンを伏せた文を出し、コピーは本物のトークンを入れる
 */
const ClientSetup: FC<{ status: McpStatus; onCopy: (text: string, what: string) => void }> = ({
  status,
  onCopy,
}) => {
  const masked = { ...status, token: status.token ? "<トークン>" : null };
  return (
    <Box>
      <Text fontSize="sm" fontWeight="semibold">
        クライアント側の設定
      </Text>
      <Tabs size="sm">
        <Tab>コマンド（Claude Code）</Tab>
        <Tab>JSON</Tab>
        <TabPanel px="0">
          <CopyableSetup
            text={registerCommand(masked)}
            copyLabel="登録コマンドをコピー"
            disabled={!status.token}
            onCopy={() => onCopy(registerCommand(status), "登録コマンド")}
            note="Lorelei を使うプロジェクトのフォルダで実行してください（登録はフォルダごとです。どこからでも使うなら --scope user を足します）。トークンを作り直したら、登録し直してください。"
          />
        </TabPanel>
        <TabPanel px="0">
          <CopyableSetup
            text={clientConfigJson(masked)}
            copyLabel="JSON をコピー"
            disabled={!status.token}
            onCopy={() => onCopy(clientConfigJson(status), "JSON ")}
            note="Claude Code の .mcp.json など、mcpServers を読むクライアントの設定ファイルに貼ってください。.mcp.json は Git に入れて共有する前提のファイルなので、貼るとトークンもリポジトリに入ります。入れたくない時はコマンドで登録してください。トークンを作り直したら、貼り直してください。"
          />
        </TabPanel>
      </Tabs>
    </Box>
  );
};

const CopyableSetup: FC<{
  text: string;
  copyLabel: string;
  disabled: boolean;
  onCopy: () => void;
  note: string;
}> = ({ text, copyLabel, disabled, onCopy, note }) => (
  <>
    <HStack gap="sm" align="start">
      <Code fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-all" flex="1">
        {text}
      </Code>
      <Button size="xs" variant="outline" disabled={disabled} onClick={onCopy}>
        {copyLabel}
      </Button>
    </HStack>
    <Text fontSize="xs" color="textCaption">
      {note}
    </Text>
  </>
);
