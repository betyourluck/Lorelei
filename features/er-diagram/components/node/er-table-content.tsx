import type { ColumnDef } from "@tanstack/react-table";
import { useReactTable, getCoreRowModel, flexRender } from "@tanstack/react-table";
import { XIcon } from "@yamada-ui/lucide";
import type { FC } from "@yamada-ui/react";
import {
  ui,
  Input,
  IconButton,
  HStack,
  Button,
  VStack,
  TableContainer,
  NativeTable,
  TableCaption,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Center,
  Label,
  Text,
} from "@yamada-ui/react";
import { useState, useEffect } from "react";
import { describeFieldProblem, fieldProblem } from "../../utils/er-names";
import { TableMenu } from "./table-menu";

export type ERColumn = {
  name: string;
  type: string;
  pk: boolean;
  uk: boolean;
  /** 外部キー。PK・UK のどちらとも同時に付けられる。無ければ false */
  fk?: boolean;
};

export type ERTableContentProps = {
  name: string;
  columns: ERColumn[];
  onNameChange: (name: string) => void;
  onColumnsChange: (columns: ERColumn[]) => void;
  /** テーブルを消す (見出しの「⋮⋮」メニュー)。確認は呼び手 (エディタの onBeforeDelete) が出す。無ければメニューを出さない */
  onDelete?: () => void;
};

export const ERTableContent: FC<ERTableContentProps> = ({
  name,
  columns,
  onNameChange,
  onColumnsChange,
  onDelete,
}) => {
  const handleChange = (rowIdx: number, key: keyof ERColumn, value: string | boolean) => {
    onColumnsChange(columns.map((col, i) => (i === rowIdx ? { ...col, [key]: value } : col)));
  };
  const handleDelete = (rowIdx: number) => {
    onColumnsChange(columns.filter((_, i) => i !== rowIdx));
  };
  const handleAdd = () => {
    onColumnsChange([...columns, { name: "", type: "", pk: false, uk: false }]);
  };
  /**
   * Mermaid に書けない値のセルの理由 (spec 13 D2)。確定した値で判定する。
   * 名前も型も空の列 (「カラム追加」の直後) には出さない (足した直後に赤が 2 つ点くのを避ける。コード生成のダイアログには出る)
   */
  const invalidReason = (column: ERColumn, field: "name" | "type"): string | undefined => {
    if (column.name.trim() === "" && column.type.trim() === "") return undefined;
    const problem = fieldProblem(column[field], field);
    return problem
      ? `${describeFieldProblem(field, problem)}（Mermaid に書けないので、この列はコードに書き出しません）`
      : undefined;
  };

  const columnDefs: ColumnDef<ERColumn>[] = [
    {
      header: () => "カラム名",
      cell: ({ row, getValue }) => (
        <CellEditor
          value={getValue() as string}
          label="カラム名"
          invalidReason={invalidReason(row.original, "name")}
          onCommit={(v) => handleChange(row.index, "name", v)}
        />
      ),
      accessorKey: "name",
    },
    {
      header: () => "型",
      cell: ({ row, getValue }) => (
        <CellEditor
          value={getValue() as string}
          label="型"
          invalidReason={invalidReason(row.original, "type")}
          onCommit={(v) => handleChange(row.index, "type", v)}
        />
      ),
      accessorKey: "type",
    },
    {
      header: () => "PK",
      cell: ({ row }) => (
        <ui.input
          type="checkbox"
          checked={columns[row.index].pk}
          aria-label="PK"
          disabled={columns[row.index].uk}
          onChange={(e) => {
            const checked = e.target.checked;
            onColumnsChange(
              columns.map((col, i) => (i === row.index ? { ...col, pk: checked } : col))
            );
          }}
        />
      ),
      accessorKey: "pk",
    },
    {
      header: () => "UK",
      cell: ({ row }) => (
        <ui.input
          type="checkbox"
          checked={columns[row.index].uk}
          aria-label="UK"
          disabled={columns[row.index].pk}
          onChange={(e) => {
            const checked = e.target.checked;
            onColumnsChange(
              columns.map((col, i) => (i === row.index ? { ...col, uk: checked } : col))
            );
          }}
        />
      ),
      accessorKey: "uk",
    },
    {
      header: () => "FK",
      cell: ({ row }) => (
        <ui.input
          type="checkbox"
          checked={Boolean(columns[row.index].fk)}
          aria-label="FK"
          // PK と UK の排他に巻き込まない (FK はどちらとも同時に付けられる)
          onChange={(e) => {
            const checked = e.target.checked;
            onColumnsChange(
              columns.map((col, i) => (i === row.index ? { ...col, fk: checked } : col))
            );
          }}
        />
      ),
      accessorKey: "fk",
    },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <IconButton
          aria-label="削除"
          icon={<XIcon />}
          size="xs"
          colorScheme="danger"
          onClick={() => handleDelete(row.index)}
          variant="outline"
        />
      ),
    },
  ];

  const table = useReactTable({
    data: columns,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <VStack
      bg="white"
      border="2px solid #1a365d"
      borderRadius="md"
      p={2}
      w="full"
      minW="xl"
      maxW="5xl"
      display="flex"
      alignItems="center"
      justifyContent="center"
      textAlign="center"
      cursor="pointer"
      _hover={{ boxShadow: "md" }}
      position="relative"
    >
      <TableContainer w="full">
        <NativeTable variant="simple" size="sm">
          <TableCaption placement="top">
            <HStack justifyContent="space-between" w="full">
              <HStack as={Label}>
                <Text fontWeight="bold" fontSize="md">
                  テーブル名
                </Text>
                {/* 確定 (Enter・フォーカスが外れる) で反映し、空・空白だけの確定は前の名前に戻す。打鍵の途中の空の名前を自動保存に乗せない (spec 13 D3) */}
                <CellEditor
                  value={name}
                  label="テーブル名"
                  onCommit={onNameChange}
                  rejectBlank
                  size="md"
                  fontWeight="bold"
                  fontSize="md"
                />
              </HStack>
              <HStack gap="sm">
                <Button size="md" colorScheme="blue" onClick={handleAdd}>
                  カラム追加
                </Button>
                {onDelete && <TableMenu name={name} onDelete={onDelete} />}
              </HStack>
            </HStack>
          </TableCaption>
          <Thead>
            <Tr>
              {table.getHeaderGroups()[0].headers.map((header) => (
                <Th key={header.id} fontWeight="bold" textAlign="left">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {table.getRowModel().rows.map((row) => (
              <Tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <Td key={cell.id}>
                    <Center w="full" h="full">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </Center>
                  </Td>
                ))}
              </Tr>
            ))}
          </Tbody>
        </NativeTable>
      </TableContainer>
    </VStack>
  );
};

// セル編集用ローカルstate付きエディタ（再利用可能）
export const CellEditor = ({
  value,
  onCommit,
  label,
  invalidReason,
  rejectBlank = false,
  size = "sm",
  fontWeight,
  fontSize,
}: {
  value: string;
  onCommit: (v: string) => void;
  label: string;
  /** あれば赤枠にし、理由を title に出す (spec 13 D2) */
  invalidReason?: string;
  /** 空・空白だけで確定したら反映せず、確定前の値に戻す (spec 13 D3。テーブル名) */
  rejectBlank?: boolean;
  size?: "sm" | "md";
  fontWeight?: string;
  fontSize?: string;
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [isComposing, setIsComposing] = useState(false);
  useEffect(() => {
    setInputValue(value);
  }, [value]);
  const commit = () => {
    if (rejectBlank && inputValue.trim() === "") {
      setInputValue(value);
      return;
    }
    onCommit(inputValue);
  };
  return (
    <Input
      aria-label={label}
      size={size}
      fontWeight={fontWeight}
      fontSize={fontSize}
      invalid={invalidReason !== undefined}
      aria-invalid={invalidReason !== undefined}
      title={invalidReason}
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onCompositionStart={() => setIsComposing(true)}
      onCompositionEnd={(e) => {
        setIsComposing(false);
        setInputValue(e.currentTarget.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !isComposing) {
          commit();
          (e.currentTarget as HTMLElement).blur();
        }
      }}
    />
  );
};
