/**
 * 赤線の行が、利用者の見ている本文の行と一致するか（spec 10 D5・査読 3）。
 * mermaid は parse の前に `%%` の注釈の行と先頭の空白を消すので、報告される行は消した後の本文の行になる。
 * 本物の mermaid で確かめる（jsdom の vitest でも mermaid.parse は動く。境界 mermaid-render は模擬されているので、ここは直接 import する）
 */
import { describe, expect, test } from "vitest";
import { prepareForParse, toParseIssue } from "@/components/ui/mermaid-parse-issue";

async function issueLine(source: string): Promise<number | null | "ok"> {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true });
  const { text, lineOffset } = prepareForParse(source);
  try {
    await mermaid.parse(text);
    return "ok";
  } catch (e) {
    const issue = toParseIssue(e, lineOffset);
    return issue.line;
  }
}

describe("prepareForParse + toParseIssue — 本物の mermaid の行と本文の行", () => {
  test("注釈も空行も無ければそのまま", async () => {
    expect(await issueLine("flowchart TD\n  A --> B\n  B --> --> C")).toBe(3);
  });

  test("注釈の行の後の誤り", async () => {
    expect(await issueLine("flowchart TD\n  %% メモ\n  A --> B\n  B --> --> C")).toBe(4);
  });

  test("先頭の空行の後の誤り", async () => {
    expect(await issueLine("\n\nflowchart TD\n  A --> B\n  B --> --> C")).toBe(5);
  });

  test("先頭の注釈の後の誤り", async () => {
    expect(await issueLine("%% 先頭のメモ\nflowchart TD\n  A --> B\n  B --> --> C")).toBe(4);
  });

  test("途中の空行の後の誤り", async () => {
    expect(await issueLine("flowchart TD\n  A --> B\n\n  B --> --> C")).toBe(4);
  });

  test("指示の行 (%%{init}%%) の後の誤り", async () => {
    expect(await issueLine('%%{init: {"theme": "dark"}}%%\nflowchart TD\n  B --> --> C')).toBe(3);
  });

  test("erDiagram の注釈の後の誤り", async () => {
    expect(await issueLine("erDiagram\n  %% メモ\n  顧客 ||--o{ 注文 注文する")).toBe(3);
  });

  test("通る本文は通る (注釈を空行にしても意味を変えない)", async () => {
    expect(await issueLine("flowchart TD\n  %% メモ\n  A --> B")).toBe("ok");
  });
});
