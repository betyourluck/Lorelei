"use client";

import { Redo2Icon, Undo2Icon } from "@yamada-ui/lucide";
import { HStack, IconButton } from "@yamada-ui/react";
import type { EditorHistoryActions } from "@/components/editor-history/use-editor-history";

/** 操作を戻す・やり直すボタン (spec 30)。エディタのパネルに置く。戻せる手が無い時は押せない */
export const HistoryButtons = ({ undo, redo, canUndo, canRedo }: EditorHistoryActions) => (
  <HStack gap={1}>
    <IconButton
      size="sm"
      variant="outline"
      icon={<Undo2Icon />}
      aria-label="元に戻す"
      title="元に戻す (Ctrl+Z)"
      onClick={undo}
      disabled={!canUndo}
    />
    <IconButton
      size="sm"
      variant="outline"
      icon={<Redo2Icon />}
      aria-label="やり直す"
      title="やり直す (Ctrl+Y)"
      onClick={redo}
      disabled={!canRedo}
    />
  </HStack>
);
