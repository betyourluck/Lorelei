/**
 * Rust のエラーの読み手 (spec 34 D3)。新しい形 ({ code, params, detail }) と、前の版の頭に印の付いた文字列の両方を読む
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { setLocale } from "@/components/i18n";
import {
  isDocumentGone,
  isInitialFigureRejected,
  isStaleBase,
  staleBaseCurrent,
} from "@/lib/desktop/doc-session";
import { describeError, errorCode, readError } from "@/lib/desktop/errors";
import { desktopResources } from "@/lib/desktop/i18n";

const stale = { code: "STALE_BASE", params: { currentUpdatedAt: "2026-10-31T10:00:00+09:00" } };

describe("読み手 (spec 34 D3)", () => {
  test("新しい形と前の版の文字列から、同じ code と値を読む", () => {
    expect(readError(stale)).toEqual(stale);
    expect(readError("STALE_BASE: 2026-10-31T10:00:00+09:00")).toEqual(stale);
    expect(errorCode("DOCUMENT_GONE: 図が一覧にありません")).toBe("DOCUMENT_GONE");
    expect(errorCode({ code: "INITIAL_FIGURE_REJECTED" })).toBe("INITIAL_FIGURE_REJECTED");
    expect(errorCode("保存できません: disk full")).toBeNull();
    expect(errorCode(new Error("x"))).toBeNull();
  });

  test("見分けの関数は両方の形で効く (Rust の形を変える前後で STALE_BASE などの扱いが外れない)", () => {
    for (const e of [stale, "STALE_BASE: 2026-10-31T10:00:00+09:00"]) {
      expect(isStaleBase(e)).toBe(true);
      expect(staleBaseCurrent(e)).toBe("2026-10-31T10:00:00+09:00");
    }
    expect(isDocumentGone({ code: "DOCUMENT_GONE" })).toBe(true);
    expect(isDocumentGone("DOCUMENT_GONE: x")).toBe(true);
    expect(isInitialFigureRejected({ code: "INITIAL_FIGURE_REJECTED" })).toBe(true);
    expect(isStaleBase({ code: "DOCUMENT_GONE" })).toBe(false);
    expect(staleBaseCurrent({ code: "DOCUMENT_GONE" })).toBeNull();
  });

  test("画面の文は code を今の言語で訳し、詳しい文を後ろに付ける", () => {
    expect(describeError({ code: "MCP_LISTEN_FAILED", params: { port: 39642 } })).toBe(
      "127.0.0.1:39642 で待ち受けられません"
    );
    expect(describeError({ code: "DOC_WRITE_FAILED", detail: "os error 28" })).toBe(
      "保存できません: os error 28"
    );
    act(() => setLocale("en"));
    expect(describeError({ code: "DOC_WRITE_FAILED", detail: "os error 28" })).toBe(
      "Cannot save: os error 28"
    );
  });

  test("code の無いもの・知らない code は文のまま", () => {
    expect(describeError({ code: "OTHER", detail: "invalid args" })).toBe("invalid args");
    expect(describeError({ code: "NEW_CODE", detail: "何か" })).toBe("何か");
    expect(describeError("保存できません: disk full")).toBe("保存できません: disk full");
    expect(describeError(new Error("boom"))).toBe("boom");
    expect(describeError(null)).toBe("");
  });
});

describe("コードの訳 (spec 34 D3)", () => {
  // Rust の ALL_CODES を書いた fixture (src-tauri の error.rs のテストが LORELEI_UPDATE_FIXTURES=1 で書き直す)
  const codes: string[] = JSON.parse(
    readFileSync(
      path.resolve(__dirname, "../../../src-tauri/tests/fixtures/desktop_error_codes.json"),
      "utf8"
    )
  );

  test.each(Object.keys(desktopResources))("%s は Rust の全部の code の訳を持つ", (lng) => {
    expect(codes.length).toBeGreaterThan(15);
    const errors = (
      desktopResources as unknown as Record<string, { error: Record<string, string> }>
    )[lng].error;
    expect(codes.filter((c) => !errors[c])).toEqual([]);
    // Rust に無い code の訳を抱えない (withDetail は文の組み立て)
    expect(Object.keys(errors).filter((k) => k !== "withDetail" && !codes.includes(k))).toEqual([]);
  });
});
