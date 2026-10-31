"use client";

import { Redo2Icon, Undo2Icon } from "@yamada-ui/lucide";
import { HStack, IconButton } from "@yamada-ui/react";
import type { EditorHistoryActions } from "@/components/editor-history/use-editor-history";
import { useTranslation } from "@/components/i18n";

/** 操作を戻す・やり直すボタン (spec 30)。エディタのパネルに置く。戻せる手が無い時は押せない */
export const HistoryButtons = ({ undo, redo, canUndo, canRedo }: EditorHistoryActions) => {
  const { t } = useTranslation();
  return (
    <HStack gap={1}>
      <IconButton
        size="sm"
        variant="outline"
        icon={<Undo2Icon />}
        aria-label={t("history.undo")}
        title={t("history.undoTitle")}
        onClick={undo}
        disabled={!canUndo}
      />
      <IconButton
        size="sm"
        variant="outline"
        icon={<Redo2Icon />}
        aria-label={t("history.redo")}
        title={t("history.redoTitle")}
        onClick={redo}
        disabled={!canRedo}
      />
    </HStack>
  );
};
