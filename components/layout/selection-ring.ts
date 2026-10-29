// 選んだノード・テーブル・枠の印 (spec 28 D3、data_contract CanvasSelection)。見た目の外枠の要素に広げて渡す。
// xyflow は自前の型のノードに選んだ見た目を付けないので、印が無いと何を選んでいるか分からない。
// 選んでいない時は何も足さない (見た目は前と同じ)。輪は外側に離して描くので、縁・影 (マウスを乗せた時の boxShadow) と重ならない

/** 選んでいる時だけ、外側に 2px 空けて 3px の輪 (色の名 selectionRing) */
export const selectionRing = (selected: boolean | undefined) =>
  selected
    ? ({
        outlineWidth: "3px",
        outlineStyle: "solid",
        outlineColor: "selectionRing",
        outlineOffset: "2px",
      } as const)
    : {};
