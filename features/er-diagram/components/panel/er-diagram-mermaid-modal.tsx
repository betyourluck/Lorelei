import { DownloadIcon } from "@yamada-ui/lucide";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  HStack,
  Text,
  Button,
} from "@yamada-ui/react";
import type { FC } from "react";
import { MermaidCodeWithPreview } from "@/components/ui";
import { ExportButtons } from "@/lib/desktop";

export interface ERDiagramMermaidModalProps {
  open: boolean;
  onClose: () => void;
  code: string;
  onDownload: () => void;
}

export const ERDiagramMermaidModal: FC<ERDiagramMermaidModalProps> = ({
  open,
  onClose,
  code,
  onDownload,
}) => {
  return (
    <Modal open={open} onClose={onClose} maxW="90vw" h="85vh">
      <ModalHeader>
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
      </ModalHeader>
      <ModalCloseButton />
      <ModalBody pb={6} flex={1} minH={0} overflow={{ base: "hidden", md: "auto" }}>
        <MermaidCodeWithPreview code={code} />
      </ModalBody>
    </Modal>
  );
};
