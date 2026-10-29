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

describe("画面の色の名 (spec 27 D4)", () => {
  it("23 の名がそろい、ライトの値は置き換える前の値そのもの", () => {
    expect(Object.keys(COLOR_TOKENS).sort()).toEqual(Object.keys(LIGHT_BEFORE).sort());
    for (const [name, light] of Object.entries(LIGHT_BEFORE))
      expect([name, COLOR_TOKENS[name][0]]).toEqual([name, light]);
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
