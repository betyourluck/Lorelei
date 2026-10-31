"use client";

import { CheckIcon, CodeIcon, FileInputIcon, PlusIcon, RotateCcwIcon, SquareDashedIcon } from "@yamada-ui/lucide";
import type { ButtonProps } from "@yamada-ui/react";
import { Box, Button, ButtonGroup, HStack, IconButton } from "@yamada-ui/react";
import type { FC, ReactElement, RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { HistoryButtons } from "@/components/ui/history-buttons";
import { DirectionMenu } from "@/features/flowchart/components/direction-menu";
import type { HistoryStatus, RegisteredActions } from "./desktop-actions";
import { useDesktopTranslation } from "./i18n";
import { ImportDialog } from "./import-dialog";
import type { EditorKind } from "./open-requests";

export const TOOLBAR_HEIGHT = "40px";

const KINDS: EditorKind[] = ["flowchart", "erDiagram"];

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

/**
 * ボタンが入り切らない時は、文字を隠してアイコンだけにする (spec 34 受け入れ条件 8: 英語は長く、窓の最小幅 900 で切れていた。日本語も 1000 で切れていた)。
 * ボタンは縮めない (flexShrink 0) ので、入り切らないと中身の幅 (scrollWidth) が見えている幅より広くなる。縮めた時に要った幅を覚え、窓がそこまで広がったら戻す
 */
const useCompact = (ref: RefObject<HTMLElement | null>, deps: unknown[]): boolean => {
  const [compact, setCompact] = useState(false);
  const need = useRef(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (!compact && el.scrollWidth > el.clientWidth + 1) {
        need.current = el.scrollWidth;
        setCompact(true);
      } else if (compact && el.clientWidth >= need.current) {
        setCompact(false);
      }
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
    // 言葉 (言語) やボタンの数が変わったら測り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, ref, ...deps]);
  return compact;
};

/** 文字とアイコンのボタン。compact の時はアイコンだけにし、文字は aria-label と title に回す */
const ToolButton: FC<ButtonProps & { icon: ReactElement; label: string; compact: boolean }> = ({
  icon,
  label,
  compact,
  title,
  ...rest
}) =>
  compact ? (
    <IconButton icon={icon} aria-label={label} title={title ?? label} flexShrink={0} {...rest} />
  ) : (
    <Button startIcon={icon} title={title} flexShrink={0} {...rest}>
      {label}
    </Button>
  );

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
  const { t, i18n } = useDesktopTranslation();
  const [importing, setImporting] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const compact = useCompact(barRef, [i18n.language, actions?.addLabel, Boolean(actions?.addFrame), current]);

  return (
    <HStack
      ref={barRef}
      data-testid="desktop-toolbar"
      h={TOOLBAR_HEIGHT}
      flexShrink={0}
      gap="sm"
      px="sm"
      bg="surface"
      borderBottomWidth="1px"
      borderColor="line"
    >
      <ButtonGroup size="sm" variant="outline" attached flexShrink={0}>
        {KINDS.map((kind) => (
          <Button
            key={kind}
            aria-pressed={kind === current}
            colorScheme={kind === current ? "blue" : "gray"}
            variant={kind === current ? "solid" : "outline"}
            onClick={() => kind !== current && onSwitchKind(kind)}
          >
            {t(`kind.${kind}`)}
          </Button>
        ))}
      </ButtonGroup>
      <Box w="1px" h="5" bg="line" />
      <ToolButton
        compact={compact}
        size="sm"
        colorScheme="blue"
        icon={<PlusIcon />}
        label={actions?.addLabel ?? t("toolbar.add")}
        disabled={!actions}
        onClick={() => actions?.add()}
      />
      {/* 枠 (サブグラフ) を追加 (spec 15 D5)。フローチャートのパネルが登録した時だけ */}
      {actions?.addFrame && (
        <ToolButton
          compact={compact}
          size="sm"
          variant="outline"
          icon={<SquareDashedIcon />}
          label={t("toolbar.addFrame")}
          onClick={() => actions.addFrame?.()}
        />
      )}
      <ToolButton
        compact={compact}
        size="sm"
        variant="outline"
        icon={<CodeIcon />}
        label={t("toolbar.code")}
        disabled={!actions}
        onClick={() => actions?.code()}
      />
      <ToolButton
        compact={compact}
        size="sm"
        variant="outline"
        icon={<FileInputIcon />}
        label={t("toolbar.import")}
        onClick={() => setImporting(true)}
      />
      {/* 図の向き (spec 07 D3)。エディタが向きを持つ時だけ */}
      {actions?.setDirection && (
        <Box flexShrink={0}>
          <DirectionMenu value={actions.direction} onChange={actions.setDirection} />
        </Box>
      )}
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      <Box flex="1" />
      {/* 戻す・やり直す (spec 30)。図を開いている間 (actions が null) は押せない */}
      {actions?.undo && actions.redo && (
        <Box flexShrink={0}>
          <HistoryButtons
          undo={actions.undo}
          redo={actions.redo}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          />
        </Box>
      )}
      <ToolButton
        compact={compact}
        size="sm"
        variant="outline"
        icon={<CheckIcon />}
        label={t("toolbar.confirm")}
        // ファイルへ書き出すと思われないよう「保存」とは呼ばない (中身は裏で自動保存されている。2026-10-04 利用者 FB)
        title={t("toolbar.confirmHint")}
        disabled={!current || !canConfirm}
        onClick={onSave}
      />
      <ToolButton
        compact={compact}
        size="sm"
        variant="outline"
        icon={<RotateCcwIcon />}
        label={t("toolbar.revert")}
        title={revert.title}
        disabled={!revert.enabled}
        onClick={onRevert}
      />
    </HStack>
  );
};
