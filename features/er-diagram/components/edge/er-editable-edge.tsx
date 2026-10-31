import { XIcon } from "@yamada-ui/lucide";
import { Box, Input, HStack, IconButton } from "@yamada-ui/react";
import { useState, useRef, useEffect } from "react";
import { useTranslation } from "@/components/i18n";
import type { ErCardinality } from "../../types";
import { ErCardinalitySelector } from "./er-cardinality-selector";

interface ErEditableEdgeProps {
  id: string;
  label: string;
  cardinality: ErCardinality;
  onLabelChange: (id: string, label: string) => void;
  onCardinalityChange: (id: string, cardinality: ErCardinality) => void;
  onDelete: (id: string) => void;
}

export function ErEditableEdge({
  id,
  label,
  cardinality,
  onLabelChange,
  onCardinalityChange,
  onDelete,
}: ErEditableEdgeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [edgeLabel, setEdgeLabel] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // 編集していない時は、データのラベルに合わせる (同じ ID の線を持つ別の図を開くと、この部品は使い回される)
  useEffect(() => {
    if (!isEditing) setEdgeLabel(label);
  }, [label, isEditing]);

  const handleLabelSubmit = () => {
    setIsEditing(false);
    onLabelChange(id, edgeLabel);
  };

  return (
    <Box>
      {isEditing ? (
        <Input
          ref={inputRef}
          value={edgeLabel}
          onChange={(e) => setEdgeLabel(e.target.value)}
          onBlur={handleLabelSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleLabelSubmit();
            if (e.key === "Escape") {
              setIsEditing(false);
              setEdgeLabel(label);
            }
          }}
          size="sm"
          w="120px"
          bg="surface"
          border="1px solid"
          borderColor="lineStrong"
          fontSize="12px"
          textAlign="center"
        />
      ) : (
        <HStack>
          <Box
            onClick={() => setIsEditing(true)}
            bg="surface"
            p="1"
            px="2"
            borderRadius="md"
            fontSize="xs"
            border="1px solid"
            borderColor="lineStrong"
            cursor="pointer"
            minW="20px"
            textAlign="center"
          >
            {/* eslint-disable-next-line i18next/no-literal-string -- 生成器が Mermaid に書く既定のラベル (訳さない, UiMessages.not_translated) */}
            {edgeLabel || "relation"}
          </Box>
          <ErCardinalitySelector
            current={cardinality}
            onChange={(type) => onCardinalityChange(id, type)}
          />
          <IconButton
            aria-label={t("edge.delete")}
            icon={<XIcon />}
            size="xs"
            variant="outline"
            colorScheme="red"
            onClick={() => onDelete(id)}
          />
        </HStack>
      )}
    </Box>
  );
}
