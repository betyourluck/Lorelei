"use client";

import { Box } from "@yamada-ui/react";
import type { FC, KeyboardEvent, PointerEvent } from "react";
import { useRef, useState } from "react";

interface Props {
  /** 読み上げの名前 (例: 「図の一覧の幅」) */
  label: string;
  value: number;
  min: number;
  max: number;
  /** 右へ動かした px (左は負)。収めるのは呼び手 */
  onDelta: (px: number) => void;
  /** 既定の幅へ戻す (ドラッグで見失った時の避難路) */
  onReset: () => void;
}

const KEY_STEP = 16;

/**
 * 左右のペインの間のつまみ (spec 05 D1。Fuseforks の PaneSplitter.vue を移した)。
 *
 * 移動量は**差分**で渡し、原点をその都度更新する。開始位置からの差で計算すると、上限に張り付いた後に
 * 戻す時に空走りが出る。setPointerCapture で、素早く動かしてつまみの外へ出ても追従する。
 */
export const PaneSplitter: FC<Props> = ({ label, value, min, max, onDelta, onReset }) => {
  const [dragging, setDragging] = useState(false);
  const origin = useRef<number | null>(null);

  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (origin.current === null) return;
    origin.current = null;
    setDragging(false);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  return (
    <Box
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      title={`${label}（ドラッグで変更、ダブルクリックで元に戻す）`}
      position="relative"
      flexShrink={0}
      w="1px"
      cursor="col-resize"
      bg={dragging ? "blue.400" : "gray.200"}
      _hover={{ bg: "blue.400" }}
      _focusVisible={{ bg: "blue.400", outline: "none" }}
      transition="background-color 0.1s"
      onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
        origin.current = e.clientX;
        setDragging(true);
        // ドラッグ中は文字を選ばせず、つまみの外でもカーソルを保つ
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e: PointerEvent<HTMLDivElement>) => {
        if (origin.current === null) return;
        const delta = e.clientX - origin.current;
        origin.current = e.clientX;
        if (delta !== 0) onDelta(delta);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "ArrowRight") onDelta(KEY_STEP);
        else if (e.key === "ArrowLeft") onDelta(-KEY_STEP);
        else return;
        e.preventDefault();
      }}
    >
      {/* 当たり判定を見た目の線より広げる。1px の線は掴めず、隣のペインを押してしまう */}
      <Box position="absolute" top="0" bottom="0" left="-5px" right="-5px" zIndex="1" />
    </Box>
  );
};
