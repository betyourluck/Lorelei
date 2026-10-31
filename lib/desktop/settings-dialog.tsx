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
import { useDesktopTranslation } from "./i18n";
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
  const { t } = useDesktopTranslation();
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
      notice({ status: "error", title: t("settings.changeFailed"), description: String(e), isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    notice({ status: "success", title: t("settings.copied", { what }), isClosable: true });
  };

  return (
    <Modal open={open} onClose={onClose} size="2xl">
      <ModalOverlay />
      <ModalCloseButton />
      <ModalHeader>{t("settings.title")}</ModalHeader>
      <ModalBody>
        {!status ? (
          <Text>{t("settings.loading")}</Text>
        ) : (
          <VStack gap="md" align="stretch">
            <Heading size="sm">{t("settings.mcp.heading")}</Heading>
            <Text fontSize="sm" color="textHint">
              {t("settings.mcp.description")}
            </Text>

            <Checkbox
              checked={status.enabled}
              disabled={busy || status.state === "blocked"}
              onChange={(e) => void run(() => setMcpEnabled(e.target.checked))}
            >
              {t("settings.mcp.enable")}
            </Checkbox>

            <Box>
              <Text fontSize="sm" fontWeight="semibold">
                {t("settings.mcp.state")}
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
                  {t("settings.mcp.port")}
                </Text>
                <Input
                  id="lorelei-mcp-port"
                  type="number"
                  aria-label={t("settings.mcp.port")}
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
                  aria-label={t("settings.mcp.applyPort")}
                  disabled={busy || Number(port) === status.port}
                  onClick={() => void run(() => setMcpPort(Number(port)))}
                >
                  {t("settings.mcp.apply")}
                </Button>
              </HStack>
              <Text fontSize="xs" color="textCaption">
                {t("settings.mcp.localOnly")}
              </Text>
            </Box>

            <Box>
              <Text fontSize="sm" fontWeight="semibold">
                {t("settings.mcp.token")}
              </Text>
              <HStack gap="sm">
                <Code>{status.token ? "••••••••••••••••" : t("settings.mcp.noToken")}</Code>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!status.token}
                  onClick={() => status.token && void copy(status.token, t("settings.what.token"))}
                >
                  {t("settings.mcp.copy")}
                </Button>
                <Button size="xs" variant="outline" disabled={busy} onClick={() => setConfirming(true)}>
                  {t("settings.mcp.regenerate")}
                </Button>
              </HStack>
              {confirming && (
                <HStack gap="sm" mt="xs">
                  <Text fontSize="sm" color="warningText">
                    {t("settings.mcp.regenerateWarning")}
                  </Text>
                  <Button
                    size="xs"
                    colorScheme="red"
                    onClick={() => {
                      setConfirming(false);
                      void run(regenerateMcpToken);
                    }}
                  >
                    {t("settings.mcp.regenerateConfirm")}
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
                    {t("settings.mcp.cancel")}
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
  const { t } = useDesktopTranslation();
  const masked = { ...status, token: status.token ? t("settings.client.tokenPlaceholder") : null };
  return (
    <Box>
      <Text fontSize="sm" fontWeight="semibold">
        {t("settings.client.heading")}
      </Text>
      <Tabs size="sm">
        <Tab>{t("settings.client.commandTab")}</Tab>
        <Tab>{t("settings.client.jsonTab")}</Tab>
        <TabPanel px="0">
          <CopyableSetup
            text={registerCommand(masked)}
            copyLabel={t("settings.client.copyCommand")}
            disabled={!status.token}
            onCopy={() => onCopy(registerCommand(status), t("settings.what.command"))}
            note={t("settings.client.commandNote")}
          />
        </TabPanel>
        <TabPanel px="0">
          <CopyableSetup
            text={clientConfigJson(masked)}
            copyLabel={t("settings.client.copyJson")}
            disabled={!status.token}
            onCopy={() => onCopy(clientConfigJson(status), t("settings.what.json"))}
            note={t("settings.client.jsonNote")}
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
