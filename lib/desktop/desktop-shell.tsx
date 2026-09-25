"use client";

import { Box, Flex } from "@yamada-ui/react";
import type { FC, ReactNode } from "react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { RegisteredActions } from "./desktop-actions";
import { DesktopActionsProvider } from "./desktop-actions";
import { DocumentList } from "./document-list";
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
  useEffect(() => setDesktop(isTauri()), []);
  if (!desktop) return <>{children}</>;
  return <Shell>{children}</Shell>;
};

const Shell: FC<{ children: ReactNode }> = ({ children }) => {
  const session = useDocSession();
  const [actions, setActions] = useState<RegisteredActions | null>(null);
  // 図の一覧の幅と開閉。起動をまたいで覚える (spec 05 D1〜D3)
  const pane = usePaneLayout();
  const [closeError, setCloseError] = useState<string | null>(null);
  const [mcp, setMcp] = useMcpStatus();
  const [settingsOpen, setSettingsOpen] = useState(false);

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
      setCloseError(ok ? null : "保存に失敗しました");
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

  // Ctrl+S (mac は Cmd+S) で「保存」(D12)。WebView の既定 (ページを保存) は止める
  const saveRef = useRef(session.save);
  saveRef.current = session.save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const unsaved = session.list.find((d) => d.id === session.current?.id)?.unsaved ?? false;
  const warning = session.unopenable
    ? "この図は開けないので保存しません"
    : session.saveError
      ? `保存に失敗しました: ${session.saveError}`
      : null;

  return (
    <Flex data-lorelei-desktop="" direction="column" h="100vh" overflow="hidden">
      <style>{HIDE_FORK_PANELS}</style>
      <TitleBar
        title={session.current ? `${unsaved ? "● " : ""}${session.current.title}` : undefined}
        warning={warning}
        closeError={closeError}
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
        actions={actions}
        current={session.current?.editor ?? null}
        onSwitchKind={(kind) => void session.switchKind(kind)}
        onSave={() => void session.save()}
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
            label="図の一覧の幅"
            value={pane.listWidth}
            min={LIST_WIDTH.min}
            max={LIST_WIDTH.max}
            onDelta={pane.resizeList}
            onReset={pane.resetList}
          />
        )}
        {/* エディタの Box は h="var(--lorelei-editor-h, 100vh)"。高さの引き算はどこにも書かない (D4) */}
        <Box flex="1" minW="0" style={{ ["--lorelei-editor-h" as string]: "100%" }}>
          <DesktopActionsProvider register={register}>
            {/* 同じ種類の図へ切り替える時は key でエディタを作り直す (D9) */}
            <Fragment key={session.generation}>{children}</Fragment>
          </DesktopActionsProvider>
        </Box>
      </Flex>
    </Flex>
  );
};
