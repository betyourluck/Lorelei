"use client";

import { CodeIcon, FileInputIcon, PlusIcon } from "@yamada-ui/lucide";
import { Box, Button, ButtonGroup, HStack } from "@yamada-ui/react";
import { usePathname, useRouter } from "next/navigation";
import type { FC } from "react";
import { useState } from "react";
import type { RegisteredActions } from "./desktop-actions";
import { ImportDialog } from "./import-dialog";
import type { EditorKind } from "./open-requests";
import { routeOf } from "./open-requests";

export const TOOLBAR_HEIGHT = "40px";

const KINDS: { kind: EditorKind; label: string }[] = [
  { kind: "flowchart", label: "フローチャート" },
  { kind: "erDiagram", label: "ER図" },
];

const kindOf = (pathname: string | null): EditorKind =>
  pathname?.includes("er-diagram") ? "erDiagram" : "flowchart";

/**
 * タイトルバーの下のツールバー (spec 02 D3)。
 * 種類の切り替えは P2 の暫定でページを移るだけ。「その種類で最後に更新した図を開く」(D11) は図の一覧 (P3) で入れる。
 */
export const Toolbar: FC<{ actions: RegisteredActions | null }> = ({ actions }) => {
  const router = useRouter();
  const current = kindOf(usePathname());
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
            onClick={() => kind !== current && router.push(routeOf(kind))}
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
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
    </HStack>
  );
};
