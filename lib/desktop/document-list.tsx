"use client";

import { DatabaseIcon, PlusIcon, Trash2Icon, WorkflowIcon } from "@yamada-ui/lucide";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
  VStack,
} from "@yamada-ui/react";
import type { FC } from "react";
import { useState } from "react";
import type { DocumentSummary } from "./documents";
import { useDesktopTranslation } from "./i18n";
import type { EditorKind } from "./open-requests";


interface Props {
  list: DocumentSummary[];
  currentId: string | null;
  onOpen: (id: string) => void;
  onCreate: (editor: EditorKind) => void;
  onRename: (id: string, title: string) => void;
  onTrash: (id: string) => void;
  /** 幅 (px)。つまみで変わる (spec 05 D1) */
  width: number;
}

/** 左ペインの図の一覧 (spec 02 D6)。ダブルクリックで名前を変える。削除はごみ箱へ移すだけ */
export const DocumentList: FC<Props> = ({ list, currentId, onOpen, onCreate, onRename, onTrash, width }) => {
  const { t } = useDesktopTranslation();
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <VStack
      as="nav"
      aria-label={t("list.label")}
      style={{ width: `${width}px` }}
      flexShrink={0}
      h="full"
      gap="0"
      bg="surfaceSubtle"
    >
      <Box p="sm" borderBottomWidth="1px" borderColor="line">
        <Menu>
          <MenuButton as={Button} size="sm" w="full" startIcon={<PlusIcon />} variant="outline">
            {t("list.create")}
          </MenuButton>
          <MenuList>
            <MenuItem onClick={() => onCreate("flowchart")}>{t("kind.flowchart")}</MenuItem>
            <MenuItem onClick={() => onCreate("erDiagram")}>{t("kind.erDiagram")}</MenuItem>
          </MenuList>
        </Menu>
      </Box>
      <Box as="ul" role="list" flex="1" minH="0" overflowY="auto" listStyleType="none" m="0" p="xs">
        {list.map((d) => {
          const active = d.id === currentId;
          return (
            <HStack
              as="li"
              key={d.id}
              role="listitem"
              aria-current={active ? "true" : undefined}
              gap="xs"
              px="sm"
              py="xs"
              rounded="md"
              cursor="pointer"
              bg={active ? "selectedStrong" : undefined}
              _hover={{ bg: active ? "selectedStrong" : "surfaceSubtleHover" }}
              onClick={() => !active && editing !== d.id && onOpen(d.id)}
              onDoubleClick={() => setEditing(d.id)}
            >
              <Box color="textCaption" flexShrink={0} aria-hidden>
                {d.editor === "flowchart" ? <WorkflowIcon /> : <DatabaseIcon />}
              </Box>
              {editing === d.id ? (
                <Input
                  size="xs"
                  aria-label={t("list.name")}
                  defaultValue={d.title}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    setEditing(null);
                    const title = e.currentTarget.value.trim();
                    if (title && title !== d.title) onRename(d.id, title);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      e.currentTarget.value = d.title;
                      e.currentTarget.blur();
                    }
                  }}
                />
              ) : (
                <Text flex="1" fontSize="sm" lineClamp={1} title={d.title}>
                  {d.title}
                </Text>
              )}
              {d.unsaved && (
                // eslint-disable-next-line i18next/no-literal-string -- 未確定の印 (記号)
                <Text as="span" color="accent" fontSize="xs" title={t("list.unsaved")}>
                  ●
                </Text>
              )}
              <IconButton
                aria-label={t("list.trashNamed", { title: d.title })}
                title={t("list.trash")}
                icon={<Trash2Icon />}
                size="xs"
                variant="ghost"
                color="textCaption"
                onClick={(e) => {
                  e.stopPropagation();
                  onTrash(d.id);
                }}
              />
            </HStack>
          );
        })}
      </Box>
    </VStack>
  );
};
