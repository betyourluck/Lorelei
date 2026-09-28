"use client";

import { Button, Modal, ModalBody, ModalFooter, ModalHeader, ModalOverlay, Text, useNotice } from "@yamada-ui/react";
import type { FC } from "react";
import { useState } from "react";
import { MermaidEditorWithPreview } from "@/components/ui";
import type { DroppedItem } from "@/components/ui/mermaid-dropped";
import { readMermaidDiagram } from "@/components/ui/mermaid-render";
import { erDropWarnings } from "@/features/er-diagram/utils/drop-warnings";
import { erFromMermaid } from "@/features/er-diagram/utils/from-mermaid";
import { flowchartDropWarnings } from "@/features/flowchart/utils/drop-warnings";
import { flowFromMermaid } from "@/features/flowchart/utils/from-mermaid";
import { importSource } from "./tauri";

/** 1 行目 (注釈・空行を除く) が erDiagram か */
const isEr = (code: string): boolean =>
  /^erDiagram\b/.test(code.split("\n").find((l) => l.trim() !== "" && !l.trim().startsWith("%%"))?.trim() ?? "");

/** 取り込むと消える行の印。フローチャートと ER 図の両方を受けるので、1 行目の図の種類で規則を選ぶ (spec 11 D7) */
const warningsFor = (text: string) => (isEr(text) ? erDropWarnings(text) : flowchartDropWarnings(text));

/**
 * 取り込むと消えるもの。取り込みそのものは Rust (lorelei_core::editor) がするが、対応は同じ表
 * (フォーク元の側 from-mermaid.ts は Rust の to_editor と同じ入力で同じ出力になることをテストで固めている)
 */
const readDropped = async (code: string): Promise<DroppedItem[]> => {
  try {
    const snapshot = await readMermaidDiagram(code);
    if (snapshot.kind === "flowchart") return flowFromMermaid(snapshot).dropped;
    if (snapshot.kind === "er") return erFromMermaid(snapshot).dropped;
  } catch {
    // 文法の誤りはエディタの赤線とプレビューが知らせる
  }
  return [];
};

/**
 * ツールバーのインポート (spec 02 D10)。フォーク元の ImportModal は使わない —
 * 原文を外へ渡さず、図の種類に合うエディタで開くため。変換は Rust (lorelei_core)。
 * エディタで表現できない要素は、取り込んだ後に通知でも知らせる。
 * 本文はフォーク元のインポートと同じ (大きなダイアログ・CodeMirror・右のプレビュー・消えるものの要約と印, spec 10 D6・spec 11 D7)
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
    // 本文がある時は Esc で閉じない (閉じると本文が消える, spec 10 D6)
    <Modal open={open} onClose={close} maxW="90vw" h="85vh" closeOnEsc={!source.trim()}>
      <ModalOverlay />
      <ModalHeader>Mermaid をインポート</ModalHeader>
      <ModalBody pb={2} flex={1} minH={0} overflow={{ base: "hidden", md: "auto" }}>
        <MermaidEditorWithPreview
          value={source}
          onChange={setSource}
          placeholder={"flowchart TD\n  A[開始] --> B{判定}"}
          description={
            <Text fontSize="sm" color="gray.600">
              flowchart / erDiagram を貼り付けてください。図の種類に合うエディタで開きます
            </Text>
          }
          warnings={warningsFor}
          readDropped={readDropped}
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
