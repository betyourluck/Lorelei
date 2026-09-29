import { DownloadIcon } from "@yamada-ui/lucide";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  HStack,
  VStack,
  Text,
  Button,
} from "@yamada-ui/react";
import type { FC } from "react";
import { MermaidCodeWithPreview } from "@/components/ui";
import { ExportButtons } from "@/lib/desktop";
import type { SkippedColumn } from "../../utils/er-names";

export interface ERDiagramMermaidModalProps {
  open: boolean;
  onClose: () => void;
  code: string;
  onDownload: () => void;
  /** Mermaid に書けないので書き出さなかった列 (spec 13 D2)。無ければ何も出さない */
  skippedColumns?: SkippedColumn[];
}

export const ERDiagramMermaidModal: FC<ERDiagramMermaidModalProps> = ({
  open,
  onClose,
  code,
  onDownload,
  skippedColumns = [],
}) => {
  return (
    <Modal open={open} onClose={onClose} maxW="90vw" h="85vh">
      <ModalHeader>
        <VStack gap="xs" align="start">
          <HStack
            justify={{ base: "space-between", md: "flex-start" }}
            display={{ base: "flex", md: "inline-flex" }}
            flexWrap="wrap"
            alignItems="center"
          >
            <Text>生成されたMermaidコード</Text>
            <Button
              startIcon={<DownloadIcon />}
              colorScheme="blue"
              size="sm"
              onClick={onDownload}
              ml={{ base: 0, md: "auto" }}
            >
              ダウンロード
            </Button>
            <ExportButtons code={code} fileStem="er-diagram" />
          </HStack>
          {skippedColumns.length > 0 && (
            <Text fontSize="sm" fontWeight="normal" color="orange.700">
              {`書き出していない列: ${skippedColumns
                .map((s) => `${s.table}.${s.column}（${s.reason}）`)
                .join("、")}`}
            </Text>
          )}
        </VStack>
      </ModalHeader>
      <ModalCloseButton />
      <ModalBody pb={6} flex={1} minH={0} overflow={{ base: "hidden", md: "auto" }}>
        <MermaidCodeWithPreview code={code} />
      </ModalBody>
    </Modal>
  );
};
