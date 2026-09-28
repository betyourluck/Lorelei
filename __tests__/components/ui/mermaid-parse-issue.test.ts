import { describe, expect, test } from "vitest";
import { toParseIssue } from "@/components/ui/mermaid-parse-issue";

describe("toParseIssue — mermaid.parse の例外から位置を取り出す", () => {
  test("hash.loc があれば行と列の範囲 (spec 10 P0 の実測の形)", () => {
    // flowchart の実測: "Parse error on line 3" / loc.first_line 3 (1 始まり)、列 3〜8
    const err = Object.assign(new Error("Parse error on line 3:\n...\nExpecting 'AMP', got 'LINK'"), {
      hash: {
        line: 2,
        loc: { first_line: 3, first_column: 3, last_line: 3, last_column: 8 },
        text: "--> ",
        token: "LINK",
      },
    });
    expect(toParseIssue(err)).toEqual({
      line: 3,
      fromColumn: 3,
      toColumn: 8,
      message: "Parse error on line 3:\n...\nExpecting 'AMP', got 'LINK'",
    });
  });

  test("hash が無ければ文の on line N から行だけ", () => {
    expect(toParseIssue(new Error("Lexical error on line 4. Unrecognized text."))).toEqual({
      line: 4,
      fromColumn: null,
      toColumn: null,
      message: "Lexical error on line 4. Unrecognized text.",
    });
  });

  test("どちらも無ければ位置なし (先頭に出す。位置を偽らない)", () => {
    expect(toParseIssue(new Error("No diagram type detected"))).toEqual({
      line: null,
      fromColumn: null,
      toColumn: null,
      message: "No diagram type detected",
    });
  });

  test("Error でないものも文にする", () => {
    expect(toParseIssue("boom").message).toBe("boom");
  });
});
