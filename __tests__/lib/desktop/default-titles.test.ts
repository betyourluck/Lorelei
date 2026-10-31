/**
 * spec 34 D4・D5: 新しい図の題・保存ダイアログの題・About の部品は、画面の言語で訳して Rust に渡す。
 * AI の図の題のひな形は素の {time} のまま渡す (i18next の補間をかけない。時刻は Rust が %H:%M:%S で入れる)
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/components/i18n/i18n";
import {
  aiTitleTemplate,
  clockTime,
  importTitle,
  newDocumentTitle,
} from "@/lib/desktop/default-titles";
import { desktopResources } from "@/lib/desktop/i18n";
import { exportDiagram, showAbout } from "@/lib/desktop/tauri";

const invoke = vi.fn(async () => null);
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...(a as [])) }));

afterEach(() => {
  invoke.mockClear();
  void i18n.changeLanguage("ja");
});

const AT = new Date(2026, 9, 31, 9, 5, 7);

describe("新しい図の題 (spec 34 D5)", () => {
  it("時刻は Rust の %H:%M:%S と同じ形 (地方時・2 桁)", () => {
    expect(clockTime(AT)).toBe("09:05:07");
    expect(clockTime(new Date(2026, 0, 1, 23, 59, 0))).toBe("23:59:00");
  });

  it("画面の言語で付く", async () => {
    expect(newDocumentTitle("flowchart")).toBe("無題のフローチャート");
    expect(newDocumentTitle("erDiagram")).toBe("無題の ER 図");
    expect(importTitle(AT)).toBe("インポート 09:05:07");
    await i18n.changeLanguage("en");
    expect(newDocumentTitle("flowchart")).toBe("Untitled flowchart");
    expect(importTitle(AT)).toBe("Import 09:05:07");
  });

  it.each(Object.keys(desktopResources))(
    "%s: AI の図のひな形は素の {time} を 1 つ持ち、補間されずに渡る",
    async (lng) => {
      await i18n.changeLanguage(lng);
      const template = aiTitleTemplate();
      expect(template.match(/\{time\}/g)).toHaveLength(1);
      expect(template).not.toContain("{{");
      expect(template).toBe(desktopResources[lng as keyof typeof desktopResources].defaultTitle.ai);
    }
  );
});

describe("保存ダイアログの題と About (spec 34 D4)", () => {
  it("保存ダイアログの題は拡張子の大文字を入れて訳す", async () => {
    await exportDiagram("flowchart TD\n  A", "png", "flow");
    expect(invoke).toHaveBeenLastCalledWith("export_diagram", {
      source: "flowchart TD\n  A",
      format: "png",
      fileStem: "flow",
      dialogTitle: "PNG として保存",
    });
    await i18n.changeLanguage("en");
    await exportDiagram("x", "mmd", "er");
    expect(invoke).toHaveBeenLastCalledWith(
      "export_diagram",
      expect.objectContaining({ dialogTitle: "Save as MMD" })
    );
  });

  it("About は訳す部品だけを渡す", async () => {
    await i18n.changeLanguage("en");
    await showAbout();
    expect(invoke).toHaveBeenLastCalledWith("show_about", {
      labels: {
        title: "About Lorelei",
        description: expect.stringContaining("Mermaid"),
        forkedFrom: "Forked from:",
        licenses: "Licenses",
        mermanPatched: "(merman-core is bundled with patches)",
        fullText: expect.stringContaining("licenses folder"),
      },
    });
  });
});
