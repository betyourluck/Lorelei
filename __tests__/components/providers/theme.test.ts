import { describe, expect, it } from "vitest";
import { COLOR_TOKENS, theme } from "@/components/providers/theme";

// spec 27 D4 (data_contract UiColorTokens): 直に書いていた色を [ライト, dark] の名に置き換える。
// ライトの値は置き換える前の値そのもの (ライトの見た目を変えない)
const LIGHT_BEFORE: Record<string, string> = {
  surface: "white",
  surfaceSubtle: "gray.50",
  surfaceSubtleHover: "gray.100",
  surfaceSubtleActive: "gray.200",
  line: "gray.200",
  lineStrong: "gray.300",
  text: "black",
  textAlpha: "blackAlpha.800",
  textSubtle: "gray.700",
  textHint: "gray.600",
  textCaption: "gray.500",
  selected: "blue.50",
  selectedStrong: "blue.100",
  accent: "blue.500",
  accentText: "blue.600",
  warningText: "orange.600",
  warningTextStrong: "orange.700",
  dangerText: "red.600",
  dangerLine: "red.300",
  dangerSurface: "red.50",
  nodeBorder: "#1a365d",
  frameSurface: "rgba(255, 255, 222, 0.45)",
  edgeStroke: "#b1b1b7",
};

/** 置き換えではなく新しく足した名 (前の値は無い) */
const NEW_TOKENS: Record<string, [string, string]> = {
  selectionRing: ["blue.500", "blue.400"], // 選んだノードの輪 (spec 28 D3)
};

describe("画面の色の名 (spec 27 D4)", () => {
  it("置き換えた 23 の名のライトの値は、置き換える前の値そのもの (ほかは新しい名だけ)", () => {
    expect(Object.keys(COLOR_TOKENS).sort()).toEqual(
      [...Object.keys(LIGHT_BEFORE), ...Object.keys(NEW_TOKENS)].sort()
    );
    for (const [name, light] of Object.entries(LIGHT_BEFORE))
      expect([name, COLOR_TOKENS[name][0]]).toEqual([name, light]);
  });

  it("新しく足した名の値", () => {
    for (const [name, pair] of Object.entries(NEW_TOKENS))
      expect([name, COLOR_TOKENS[name]]).toEqual([name, pair]);
  });

  it("dark の値はどれもライトと違う", () => {
    for (const [name, [light, dark]] of Object.entries(COLOR_TOKENS))
      expect([name, dark]).not.toEqual([name, light]);
  });

  it("theme の semantic の色に入り、yamada-ui の既定の名 (primary・muted など) も残る", () => {
    const colors = theme.semantics?.colors as Record<string, unknown>;
    for (const [name, pair] of Object.entries(COLOR_TOKENS)) expect(colors[name]).toEqual(pair);
    expect(colors.primary).toBe("blue.500");
    expect(colors.muted).toEqual(["#656565", "#b3b3b3"]);
    expect(theme.components?.Button).toBeDefined();
  });
});
