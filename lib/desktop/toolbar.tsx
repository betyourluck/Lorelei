"use client";

import { CheckIcon, CodeIcon, FileInputIcon, PlusIcon, SquareDashedIcon } from "@yamada-ui/lucide";
import { Box, Button, ButtonGroup, HStack } from "@yamada-ui/react";
import type { FC } from "react";
import { useState } from "react";
import { DirectionMenu } from "@/features/flowchart/components/direction-menu";
import type { RegisteredActions } from "./desktop-actions";
import { ImportDialog } from "./import-dialog";
import type { EditorKind } from "./open-requests";

export const TOOLBAR_HEIGHT = "40px";

const KINDS: { kind: EditorKind; label: string }[] = [
  { kind: "flowchart", label: "フローチャート" },
  { kind: "erDiagram", label: "ER図" },
];

interface Props {
  actions: RegisteredActions | null;
  /** 開いている図の種類 */
  current: EditorKind | null;
  /** 別の種類を押した時。その種類で最後に更新した図を開く (無ければ作る, D11) */
  onSwitchKind: (kind: EditorKind) => void;
  /** 「確定」(D12。2026-10-04 に「保存」から改名)。一覧の並びはこれを押した時刻で決まる */
  onSave: () => void;
}

/** タイトルバーの下のツールバー (spec 02 D3) */
export const Toolbar: FC<Props> = ({ actions, current, onSwitchKind, onSave }) => {
  const [importing, setImporting] = useState(false);

  return (
    <HStack
      h={TOOLBAR_HEIGHT}
      flexShrink={0}
      gap="sm"
      px="sm"
      bg="white"
      borderBottomWidth="1px"
      borderColor="gray.200"
    >
      <ButtonGroup size="sm" variant="outline" attached>
        {KINDS.map(({ kind, label }) => (
          <Button
            key={kind}
            aria-pressed={kind === current}
            colorScheme={kind === current ? "blue" : "gray"}
            variant={kind === current ? "solid" : "outline"}
            onClick={() => kind !== current && onSwitchKind(kind)}
          >
            {label}
          </Button>
        ))}
      </ButtonGroup>
      <Box w="1px" h="5" bg="gray.200" />
      <Button
        size="sm"
        colorScheme="blue"
        startIcon={<PlusIcon />}
        disabled={!actions}
        onClick={() => actions?.add()}
      >
        {actions?.addLabel ?? "追加"}
      </Button>
      {/* 枠 (サブグラフ) を追加 (spec 15 D5)。フローチャートのパネルが登録した時だけ */}
      {actions?.addFrame && (
        <Button size="sm" variant="outline" startIcon={<SquareDashedIcon />} onClick={() => actions.addFrame?.()}>
          枠を追加
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        startIcon={<CodeIcon />}
        disabled={!actions}
        onClick={() => actions?.code()}
      >
        コード生成
      </Button>
      <Button size="sm" variant="outline" startIcon={<FileInputIcon />} onClick={() => setImporting(true)}>
        インポート
      </Button>
      {/* 図の向き (spec 07 D3)。エディタが向きを持つ時だけ */}
      {actions?.setDirection && <DirectionMenu value={actions.direction} onChange={actions.setDirection} />}
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      <Box flex="1" />
      <Button
        size="sm"
        variant="outline"
        startIcon={<CheckIcon />}
        // ファイルへ書き出すと思われないよう「保存」とは呼ばない (中身は裏で自動保存されている。2026-10-04 利用者 FB)
        title="確定 (Ctrl+S): 編集は自動で保存されています。確定すると一覧の先頭に上がり、● が消えます"
        disabled={!current}
        onClick={onSave}
      >
        確定
      </Button>
    </HStack>
  );
};
