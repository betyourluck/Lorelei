"use client";

import {
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  Textarea,
  useNotice,
} from "@yamada-ui/react";
import type { FC } from "react";
import { useState } from "react";
import { importSource } from "./tauri";

/**
 * ツールバーのインポート (spec 02 D10)。フォーク元の ImportModal は使わない —
 * 原文を外へ渡さず、AI が普通に書く構文 (subgraph・LR 等) で図を壊すため (spec 01 現況 6)。
 * 変換は Rust (lorelei_core)。エディタで表現できない要素は、取り込んだ後に警告で知らせる。
 */
export const ImportDialog: FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const notice = useNotice();
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    setSource("");
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    try {
      await importSource(source);
      close();
    } catch (e) {
      notice({
        status: "error",
        title: "取り込めませんでした",
        description: String(e),
        isClosable: true,
        duration: null,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} size="2xl">
      <ModalOverlay />
      <ModalHeader>Mermaid をインポート</ModalHeader>
      <ModalBody>
        <Text fontSize="sm" color="gray.600">
          flowchart / erDiagram を貼り付けてください。図の種類に合うエディタで開きます
        </Text>
        <Textarea
          aria-label="Mermaid"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          fontFamily="mono"
          fontSize="sm"
          minH="300px"
          placeholder={"flowchart TD\n  A[開始] --> B{判定}"}
        />
      </ModalBody>
      <ModalFooter>
        <Button onClick={close}>キャンセル</Button>
        <Button colorScheme="blue" onClick={() => void submit()} loading={busy} disabled={!source.trim()}>
          取り込む
        </Button>
      </ModalFooter>
    </Modal>
  );
};
