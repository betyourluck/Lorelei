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
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <VStack
      as="nav"
      aria-label="図の一覧"
      style={{ width: `${width}px` }}
      flexShrink={0}
      h="full"
      gap="0"
      bg="gray.50"
    >
      <Box p="sm" borderBottomWidth="1px" borderColor="gray.200">
        <Menu>
          <MenuButton as={Button} size="sm" w="full" startIcon={<PlusIcon />} variant="outline">
            新規作成
          </MenuButton>
          <MenuList>
            <MenuItem onClick={() => onCreate("flowchart")}>フローチャート</MenuItem>
            <MenuItem onClick={() => onCreate("erDiagram")}>ER図</MenuItem>
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
              bg={active ? "blue.100" : undefined}
              _hover={{ bg: active ? "blue.100" : "gray.100" }}
              onClick={() => !active && editing !== d.id && onOpen(d.id)}
              onDoubleClick={() => setEditing(d.id)}
            >
              <Box color="gray.500" flexShrink={0} aria-hidden>
                {d.editor === "flowchart" ? <WorkflowIcon /> : <DatabaseIcon />}
              </Box>
              {editing === d.id ? (
                <Input
                  size="xs"
                  aria-label="図の名前"
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
                <Text as="span" color="blue.500" fontSize="xs" title="最後の「確定」より後の変更があります">
                  ●
                </Text>
              )}
              <IconButton
                aria-label={`「${d.title}」をごみ箱へ`}
                title="ごみ箱へ"
                icon={<Trash2Icon />}
                size="xs"
                variant="ghost"
                color="gray.500"
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
