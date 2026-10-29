import { extendTheme } from "@yamada-ui/react";

/**
 * 画面の色の名 (spec 27 D4、data_contract UiColorTokens)。[ライト, dark]。
 * 部品に直に書いていた色を置き換える。ライトの値は置き換える前の値そのもの (ライトの見た目を変えない) なので、
 * 役目が同じでもライトの値ごとに 1 つの名を持つ。yamada-ui が --ui-colors-<名> の CSS 変数も出す (CSS Modules はそれで読む)
 */
export const COLOR_TOKENS: Record<string, [string, string]> = {
  /** 面 (パネル・ノード・入力欄・メニュー・ツールバー) */
  surface: ["white", "gray.900"],
  /** 一段沈んだ面 (タイトルバー・図の一覧)、面の上でマウスを乗せた時 */
  surfaceSubtle: ["gray.50", "gray.800"],
  surfaceSubtleHover: ["gray.100", "gray.700"],
  surfaceSubtleActive: ["gray.200", "gray.600"],
  /** 線・仕切り */
  line: ["gray.200", "gray.700"],
  /** 入力欄・ボタンの枠線 */
  lineStrong: ["gray.300", "gray.600"],
  text: ["black", "white"],
  textAlpha: ["blackAlpha.800", "whiteAlpha.800"],
  textSubtle: ["gray.700", "gray.200"],
  /** 説明・案内 */
  textHint: ["gray.600", "gray.300"],
  /** 小さい補足・アイコン */
  textCaption: ["gray.500", "gray.400"],
  /** 選んでいる項目の面 (primary.50 と同じ値) */
  selected: ["blue.50", "blue.900"],
  selectedStrong: ["blue.100", "blue.800"],
  accent: ["blue.500", "blue.400"],
  /** 選んでいる項目の文字・線のラベルの矢印の記号 */
  accentText: ["blue.600", "blue.300"],
  warningText: ["orange.600", "orange.300"],
  warningTextStrong: ["orange.700", "orange.300"],
  dangerText: ["red.600", "red.300"],
  dangerLine: ["red.300", "red.700"],
  dangerSurface: ["red.50", "red.900"],
  nodeBorder: ["#1a365d", "blue.200"],
  frameSurface: ["rgba(255, 255, 222, 0.45)", "rgba(253, 226, 144, 0.06)"],
  /** xyflow の線 (--xy-edge-stroke)。ライトは xyflow の既定の値 */
  edgeStroke: ["#b1b1b7", "gray.500"],
  /** 選んだノード・テーブル・枠の輪 (spec 28)。新しく足した名で、置き換える前の値は無い */
  selectionRing: ["blue.500", "blue.400"],
};

export const theme = extendTheme({ semantics: { colors: COLOR_TOKENS } })();
