"use client";

import { CheckIcon, CodeIcon, FileInputIcon, PlusIcon, RotateCcwIcon, SquareDashedIcon } from "@yamada-ui/lucide";
import { Box, Button, ButtonGroup, HStack } from "@yamada-ui/react";
import type { FC } from "react";
import { useState } from "react";
import { HistoryButtons } from "@/components/ui/history-buttons";
import { DirectionMenu } from "@/features/flowchart/components/direction-menu";
import type { HistoryStatus, RegisteredActions } from "./desktop-actions";
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
  /** 戻す・やり直すを押せるか (spec 30) */
  history: HistoryStatus;
  /** 「確定」を押せるか (spec 32 D1: 図の準備ができている時だけ。開いている途中・開けない図では押せない) */
  canConfirm: boolean;
  /** 「確定へ戻す」(spec 32 D3)。押せる時は enabled、title は押せる・押せない理由 */
  revert: { enabled: boolean; title: string };
  onRevert: () => void;
}

/** タイトルバーの下のツールバー (spec 02 D3) */
export const Toolbar: FC<Props> = ({
  actions,
  current,
  onSwitchKind,
  onSave,
  history,
  canConfirm,
  revert,
  onRevert,
}) => {
  const [importing, setImporting] = useState(false);

  return (
    <HStack
      h={TOOLBAR_HEIGHT}
      flexShrink={0}
      gap="sm"
      px="sm"
      bg="surface"
      borderBottomWidth="1px"
      borderColor="line"
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
      <Box w="1px" h="5" bg="line" />
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
      {/* 戻す・やり直す (spec 30)。図を開いている間 (actions が null) は押せない */}
      {actions?.undo && actions.redo && (
        <HistoryButtons
          undo={actions.undo}
          redo={actions.redo}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
        />
      )}
      <Button
        size="sm"
        variant="outline"
        startIcon={<CheckIcon />}
        // ファイルへ書き出すと思われないよう「保存」とは呼ばない (中身は裏で自動保存されている。2026-10-04 利用者 FB)
        title="確定 (Ctrl+S): 編集は自動で保存されています。確定すると今の中身を戻れる区切りとして残し、一覧の先頭に上がり、● が消えます"
        disabled={!current || !canConfirm}
        onClick={onSave}
      >
        確定
      </Button>
      <Button
        size="sm"
        variant="outline"
        startIcon={<RotateCcwIcon />}
        title={revert.title}
        disabled={!revert.enabled}
        onClick={onRevert}
      >
        確定へ戻す
      </Button>
    </HStack>
  );
};
