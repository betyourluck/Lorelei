/**
 * 画面の言語の選び方と切り替え (spec 31 D4・D5・D6)。テストは日本語で走る (setup.ts) ので、言語ごとの確かめはここに集める
 */
import { act } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { render, screen, waitFor } from "@/__tests__/test-utils";
import {
  detectLocale,
  i18n,
  LOCALE_STORAGE_KEY,
  LanguageMenu,
  LocaleSync,
  setLocale,
  storedLocale,
} from "@/components/i18n";
import { deleteTitle } from "@/components/ui/confirm-delete";
import { HistoryButtons } from "@/components/ui/history-buttons";
import { describeDropped } from "@/components/ui/mermaid-dropped";
import { createNewERTableNode } from "@/features/er-diagram/hooks/er-diagram-helpers";
import { nextFrameName } from "@/features/flowchart/utils/frame-edit";

const noop = () => {};

describe("detectLocale (D4)", () => {
  test.each([
    [["ja-JP"], "ja"],
    [["ja"], "ja"],
    [["en-US"], "en"],
    [["en-GB", "ja-JP"], "en"],
    [["fr-FR", "ja-JP"], "ja"],
    [["ko-KR"], "ko"],
    [["zh-TW", "ja"], "ja"], // 繁体字は簡体字に寄せない
    [["zh-CN"], "zh-Hans"],
    [["zh-Hans-HK"], "zh-Hans"],
    [["zh-Hant-CN"], "en"],
    [["de-DE"], "en"], // 一覧に無い言語 → 英語
    [[], "en"],
  ])("%j → %s", (languages, expected) => {
    expect(detectLocale(languages)).toBe(expected);
  });

  // 中国語は文字体系 (Hans・Hant) を地域より先に見る (spec 35 D9)。簡体字が一覧にある時の振る舞いは、選べる言語を渡して見る
  const withSimplified = ["ja", "en", "zh-Hans"] as const;
  test.each([
    [["zh-CN"], "zh-Hans"],
    [["zh"], "zh-Hans"],
    [["zh-SG"], "zh-Hans"],
    [["zh-Hans"], "zh-Hans"],
    [["zh-Hans-HK"], "zh-Hans"], // 地域が香港でも文字体系は簡体字
    [["zh-Hans-TW"], "zh-Hans"],
    [["zh-TW", "ja"], "ja"],
    [["zh-HK"], "en"],
    [["zh-MO"], "en"],
    [["zh-Hant"], "en"],
    [["zh-Hant-CN"], "en"], // 地域が中国でも文字体系は繁体字
  ])("簡体字が一覧にある時 %j → %s", (languages, expected) => {
    expect(detectLocale(languages, withSimplified)).toBe(expected);
  });
});

describe("覚える (D4)", () => {
  test("選んだ言語を覚え、知らない値は覚えていない扱い", () => {
    expect(storedLocale()).toBeNull();
    act(() => setLocale("en"));
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
    expect(storedLocale()).toBe("en");
    expect(i18n.language).toBe("en");
    localStorage.setItem(LOCALE_STORAGE_KEY, "xx");
    expect(storedLocale()).toBeNull();
  });
});

describe("LocaleSync (D5)", () => {
  test("マウントの後に、覚えた言語をブラウザの言語より先に当て、<html lang> を合わせる", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    render(<LocaleSync />);
    await waitFor(() => expect(i18n.language).toBe("en"));
    expect(document.documentElement.lang).toBe("en");
  });

  test("覚えていなければブラウザの言語 (setup で ja-JP)", async () => {
    await act(() => i18n.changeLanguage("en"));
    render(<LocaleSync />);
    await waitFor(() => expect(i18n.language).toBe("ja"));
    expect(document.documentElement.lang).toBe("ja");
  });
});

describe("切り替え (D6)", () => {
  test("開いている部品の言葉が、開き直さずに変わる", async () => {
    render(<HistoryButtons undo={noop} redo={noop} canUndo canRedo />);
    expect(screen.getByRole("button", { name: "元に戻す" })).toBeInTheDocument();
    act(() => setLocale("en"));
    expect(await screen.findByRole("button", { name: "Undo" })).toHaveAttribute(
      "title",
      "Undo (Ctrl+Z)"
    );
  });

  test("部品の外の関数は、呼ばれた時の言語で訳す", () => {
    expect(deleteTitle("node", ["A", "B"])).toBe("選択した 2 個のノードを削除しますか？");
    expect(
      describeDropped([
        { construct: "subgraph", count: 2 },
        { construct: "style", count: 1 },
      ])
    ).toBe("サブグラフ ×2、style 指定 ×1");
    act(() => setLocale("en"));
    expect(deleteTitle("node", ["A", "B"])).toBe("Delete the 2 selected nodes?");
    expect(deleteTitle("table", ["users"])).toBe("Delete “users”?");
    expect(
      describeDropped([
        { construct: "subgraph", count: 2 },
        { construct: "style", count: 1 },
      ])
    ).toBe("Subgraph ×2, style ×1");
  });
});

describe("言語のメニュー (D9)", () => {
  test("言語の名をその言語で並べ、選ぶとすぐ切り替わって覚える", async () => {
    const { user } = render(<LanguageMenu />);
    await user.click(screen.getByRole("button", { name: "画面の言語: 日本語" }));
    // メニューは開いてから項目に menuitem が付く (閉じた yamada-ui の Menu は文字だけ持つ)。重い時は遅れるので待つ
    expect(await screen.findByRole("menuitem", { name: "日本語" })).toHaveAttribute("lang", "ja");
    await user.click(screen.getByRole("menuitem", { name: "English" }));
    expect(i18n.language).toBe("en");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
    expect(await screen.findByRole("button", { name: "Language: English" })).toHaveAttribute(
      "title",
      "Display language"
    );
  });
});

describe("新しい要素の既定の名 (D8)", () => {
  test("テーブルと枠の名は作った時の言語で付き、枠の ID は言語に依らない", () => {
    const handlers = { onNameChange: noop, onColumnsChange: noop };
    expect(createNewERTableNode(3, { x: 0, y: 0 }, handlers).data.name).toBe("テーブル3");
    expect(nextFrameName([])).toEqual({ variableName: "group1", title: "グループ1" });
    act(() => setLocale("en"));
    expect(createNewERTableNode(3, { x: 0, y: 0 }, handlers).data.name).toBe("Table3");
    expect(nextFrameName([])).toEqual({ variableName: "group1", title: "Group1" });
  });
});
