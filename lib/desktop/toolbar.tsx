"use client";

import { CodeIcon, FileInputIcon, PlusIcon, SaveIcon } from "@yamada-ui/lucide";
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
  /** 「保存」(D12)。一覧の並びはこれを押した時刻で決まる */
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
        startIcon={<SaveIcon />}
        title="保存 (Ctrl+S)"
        disabled={!current}
        onClick={onSave}
      >
        保存
      </Button>
    </HStack>
  );
};
