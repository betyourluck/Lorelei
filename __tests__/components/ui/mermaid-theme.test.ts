/**
 * spec 24: テーマの書き方・背景・取り込みでの取り出し
 */
import { describe, expect, test } from "vitest";
import { DropCounter } from "@/components/ui/mermaid-dropped";
import {
  isMermaidTheme,
  MERMAID_THEMES,
  themeBackground,
  themeFromConfig,
  themeFrontmatter,
} from "@/components/ui/mermaid-theme";

describe("mermaid-theme (spec 24)", () => {
  test("選べるテーマは default・neutral・dark・forest の 4 つ (D3)", () => {
    expect([...MERMAID_THEMES]).toEqual(["default", "neutral", "dark", "forest"]);
    expect(isMermaidTheme("dark")).toBe(true);
    expect(isMermaidTheme("base")).toBe(false);
    expect(isMermaidTheme(undefined)).toBe(false);
  });

  test("frontmatter は default とテーマ無しで空 (D2)", () => {
    expect(themeFrontmatter(undefined)).toBe("");
    expect(themeFrontmatter("default")).toBe("");
    expect(themeFrontmatter("neutral")).toBe("---\nconfig:\n  theme: neutral\n---\n");
  });

  test("背景は dark だけ #333、ほかは白 (D5)", () => {
    expect(themeBackground("dark")).toBe("#333");
    for (const t of [undefined, "default", "neutral", "forest"] as const)
      expect(themeBackground(t)).toBe("white");
  });

  test("取り込みで、テーマを取り出し、持てない設定を数える (D4)", () => {
    const drops = new DropCounter();
    expect(themeFromConfig(undefined, drops)).toBeUndefined();
    expect(themeFromConfig({ theme: "dark", keys: [] }, drops)).toBe("dark");
    expect(themeFromConfig({ theme: "default", keys: [] }, drops)).toBeUndefined();
    expect(
      themeFromConfig({ theme: "neo", keys: ["look", "themeVariables"] }, drops)
    ).toBeUndefined();
    expect(themeFromConfig({ keys: ["wrap"] }, drops)).toBeUndefined();
    expect(drops.toList()).toEqual([
      { construct: "config:look", count: 1 },
      { construct: "config:themeVariables", count: 1 },
      { construct: "config:wrap", count: 1 },
      { construct: "theme:neo", count: 1 },
    ]);
  });
});
