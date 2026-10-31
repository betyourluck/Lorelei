"use client";

import { Box, Center, Flex, Text } from "@yamada-ui/react";
import type { FC, ReactNode } from "react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HistoryGateContext } from "@/components/editor-history/gate";
import { useConfirmDelete } from "@/components/ui/confirm-delete";
import { setUiLocale } from "./default-titles";
import type { HistoryStatus, RegisteredActions } from "./desktop-actions";
import { DesktopActionsProvider } from "./desktop-actions";
import { DocumentList } from "./document-list";
import { describeError } from "./errors";
import { useDesktopTranslation } from "./i18n";
import { useMcpStatus } from "./mcp";
import { LIST_WIDTH, usePaneLayout } from "./pane-layout";
import { PaneSplitter } from "./pane-splitter";
import { SettingsDialog } from "./settings-dialog";
import { isTauri, onCloseRequested, windowAction } from "./tauri";
import { TitleBar } from "./title-bar";
import { Toolbar } from "./toolbar";
import { useDocSession } from "./use-doc-session";

/**
 * フォーク元のキャンバスの左上 (タイトル・切り替え・ボタン) と右上 (上流への GitHub メニュー) のパネルを隠す (spec 02 D2)。
 * 消さずに見えなくするだけなので、パネルの中のモーダルと開閉状態はフォーク元のまま使える
 * (モーダルは Portal で body 側に出る。spec 02 P0-1)。上流への謝辞は About が持つ。
 */
const HIDE_FORK_PANELS = `[data-lorelei-desktop] .react-flow__panel.top.left,
[data-lorelei-desktop] .react-flow__panel.top.right { display: none; }`;

/**
 * デスクトップ版の外枠 (spec 02 D1)。app/layout.tsx から 1 か所で包む。
 * Web 版 (GitHub Pages) では children をそのまま返し、DOM も見た目も変えない。
 */
export const DesktopShell: FC<{ children: ReactNode }> = ({ children }) => {
  // 静的書き出しの HTML と食い違わないよう、マウント後に判定する (ExportButtons と同じ)
  const [desktop, setDesktop] = useState(false);
  // 画面の言語はフォーク元の LocaleSync が先に当てる (外枠より前の兄弟の effect。changeLanguage は同期)。
  // なので外枠の最初の描画と窓を出す時には、もうその言語になっている (spec 34 D2)
  useEffect(() => setDesktop(isTauri()), []);
  if (!desktop) return <>{children}</>;
  return <Shell>{children}</Shell>;
};

const Shell: FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useDesktopTranslation();
  const [actions, setActions] = useState<RegisteredActions | null>(null);
  // エディタの向きで保存する (spec 07 D3)
  const session = useDocSession(actions?.direction ?? "TD", actions?.theme ?? "default");
  // 図の一覧の幅と開閉。起動をまたいで覚える (spec 05 D1〜D3)
  const pane = usePaneLayout();

  // 窓は隠したまま起動する。外枠が描けたら出す (spec 05 D5: 最初の描画は Web 版なので、それを見せない)。
  // 描けなかった時は Rust が 3 秒後に出す
  useEffect(() => {
    void windowAction("show");
  }, []);
  // AI の図の題のひな形を Rust に知らせる (spec 34 D5)。最初の描画の言語 (LocaleSync が当てた後) と、切り替えるたびに。
  // 失敗しても画面は困らない (Rust は前に覚えたひな形か日本語で付ける)
  const { i18n } = useDesktopTranslation();
  useEffect(() => {
    setUiLocale().catch(() => {});
  }, [i18n.language]);
  // 閉じる前の保存に失敗したか。文は描く時に訳す (切り替えに付いてくる, spec 34 D3)
  const [closeFailed, setCloseFailed] = useState(false);
  // 「確定」を押せる時 (spec 32 D1): 図の準備ができている (開いている途中・開けない図ではない)
  const canConfirm = session.historyReady && !session.unopenable;
  const canConfirmRef = useRef(canConfirm);
  canConfirmRef.current = canConfirm;
  // 「確定へ戻す」の確認 (spec 32 D3)。削除の確認と同じダイアログを使う
  const revertConfirm = useConfirmDelete("node", () => "");
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const [mcp, setMcp] = useMcpStatus();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 操作の履歴 (spec 30): 図の準備ができた時を起点にし、隠して開き直す・別の図に替わる・載せ替えるたびに捨てる
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>({
    canUndo: false,
    canRedo: false,
  });
  const historyGate = useMemo(
    () => ({ ready: session.historyReady, epoch: session.historyEpoch }),
    [session.historyReady, session.historyEpoch]
  );

  const { editorMounted, flushForClose } = session;
  const register = useCallback(
    (a: RegisteredActions | null) => {
      setActions(a);
      if (a) editorMounted();
    },
    [editorMounted]
  );

  // 閉じる前に保存する。失敗したら閉じずにタイトルバーへ出す (D7)
  const flushRef = useRef(flushForClose);
  flushRef.current = flushForClose;
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onCloseRequested(async () => {
      const ok = await flushRef.current();
      setCloseFailed(!ok);
      return ok;
    }).then((u) => {
      if (disposed) u();
      else unlisten = u;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Ctrl+S (mac は Cmd+S) で「確定」(D12)。WebView の既定 (ページを保存) は止める
  const saveRef = useRef(session.save);
  saveRef.current = session.save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        // 準備の前・開けない図・ダイアログが開いている間は確定しない (spec 32 D1)
        if (!canConfirmRef.current || dialogOpen()) return;
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const item = session.list.find((d) => d.id === session.current?.id);
  const unsaved = item?.unsaved ?? false;
  // 「確定へ戻す」(spec 32 D3): 確定した中身があり、それと今の中身が違う時だけ
  const revert = !item?.hasConfirmed
    ? {
        enabled: false,
        title: t("revert.never"),
      }
    : !unsaved
      ? { enabled: false, title: t("revert.unchanged") }
      : {
          enabled: canConfirm && Boolean(actions?.importMermaid),
          title: t("revert.hint"),
        };
  const onRevert = async () => {
    const ok = await revertConfirm.ask(
      t("revert.askTitle"),
      t("revert.askBody"),
      t("revert.askConfirm")
    );
    if (!ok) return;
    // 確認のダイアログが閉じ切ってから当てる (閉じかけのダイアログがあると、Undo の記録が次の編集とまとまる, spec 30 D1)
    for (let i = 0; i < 40 && dialogOpen(); i++) await new Promise((r) => setTimeout(r, 25));
    await session.revert((data, adjust) => actionsRef.current?.importMermaid?.(data, adjust));
  };
  const warning = session.unopenable
    ? t("shell.unopenable")
    : session.saveError
      ? t("shell.saveFailedDetail", { detail: describeError(session.saveError) })
      : null;

  return (
    <Flex data-lorelei-desktop="" direction="column" h="100vh" overflow="hidden">
      <style>{HIDE_FORK_PANELS}</style>
      <TitleBar
        // eslint-disable-next-line i18next/no-literal-string -- 未確定の印 (記号)
        title={session.current ? `${unsaved ? "● " : ""}${session.current.title}` : undefined}
        warning={warning}
        closeError={closeFailed ? t("shell.saveFailed") : null}
        onToggleList={pane.toggleList}
        onForceClose={() => void windowAction("destroy")}
        mcp={mcp}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        status={mcp}
        onStatus={setMcp}
      />
      <Toolbar
        // 図を開いている間 (隠している間) は見えない図に足さないよう押せなくする (spec 05 D4)
        actions={session.settled ? actions : null}
        current={session.current?.editor ?? null}
        onSwitchKind={(kind) => void session.switchKind(kind)}
        onSave={() => void session.save()}
        history={historyStatus}
        canConfirm={canConfirm}
        revert={revert}
        onRevert={() => void onRevert()}
      />
      <Flex flex="1" minH="0">
        {pane.listOpen && (
          <DocumentList
            width={pane.listWidth}
            list={session.list}
            currentId={session.current?.id ?? null}
            onOpen={(id) => void session.open(id)}
            onCreate={(kind) => void session.create(kind)}
            onRename={(id, title) => void session.rename(id, title)}
            onTrash={(id) => void session.trash(id)}
          />
        )}
        {pane.listOpen && (
          <PaneSplitter
            label={t("pane.listWidth")}
            value={pane.listWidth}
            min={LIST_WIDTH.min}
            max={LIST_WIDTH.max}
            onDelta={pane.resizeList}
            onReset={pane.resetList}
          />
        )}
        <Box flex="1" minW="0" position="relative">
          {/* エディタの Box は h="var(--lorelei-editor-h, 100vh)"。高さの引き算はどこにも書かない (spec 02 D4)。
              図を開いている間は隠す (spec 05 D4)。display: none にしない — ReactFlow がノードの大きさを測れず、取り込みが進まない。
              visibility: hidden にもしない — xyflow は大きさを測ったノードに visibility: visible を付けるので、ノードだけ見える
              (2026-09-26 実機で観測)。子から上書きできない opacity で隠し、押せないようにもする */}
          <Box
            h="full"
            aria-busy={!session.settled}
            style={{
              ["--lorelei-editor-h" as string]: "100%",
              opacity: session.settled ? 1 : 0,
              pointerEvents: session.settled ? undefined : "none",
            }}
          >
            <DesktopActionsProvider register={register} onHistoryStatus={setHistoryStatus}>
              <HistoryGateContext.Provider value={historyGate}>
                {/* 同じ種類の図へ切り替える時は key でエディタを作り直す (D9) */}
                <Fragment key={session.generation}>{children}</Fragment>
              </HistoryGateContext.Provider>
            </DesktopActionsProvider>
          </Box>
          {!session.settled && <LoadingLabel />}
        </Box>
      </Flex>
      {revertConfirm.dialog}
    </Flex>
  );
};

/** ダイアログ (削除の確認・コード生成・インポート・設定) が開いている */
const dialogOpen = () => document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;

/** 「読み込み中…」。普段の速い切り替えで点滅させないよう、少し待ってから出す (spec 05 D4、利用者裁定 2026-09-26) */
const LOADING_LABEL_DELAY_MS = 200;

const LoadingLabel: FC = () => {
  const { t } = useDesktopTranslation();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), LOADING_LABEL_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!shown) return null;
  return (
    <Center position="absolute" inset="0" pointerEvents="none">
      <Text fontSize="sm" color="textCaption">
        {t("shell.loading")}
      </Text>
    </Center>
  );
};
