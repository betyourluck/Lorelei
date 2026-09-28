import { describe, expect, test } from "vitest";
import { flowchartDropWarnings } from "@/features/flowchart/utils/drop-warnings";

const lines = (text: string) => flowchartDropWarnings(text).map((w) => w.line);
const messageAt = (text: string, line: number) => flowchartDropWarnings(text).find((w) => w.line === line)?.message;

// spec 11 D4: 取り込むと消える書き方の行に付ける印 (字句で見つける目安)
describe("flowchartDropWarnings", () => {
  test("消えない書き方には印を付けない", () => {
    expect(
      lines(
        [
          "flowchart TD",
          "  %% style や subgraph と書いた注釈",
          '  A["style を書く"] --> B{"end?"}',
          "  B -->|はい| C((円))",
          "  C -.-> D([スタジアム])",
          "  D ==> E{{六角形}}",
          "  E <--> F(角丸)",
          "  F ~~~ G",
          "  A & B --> G",
          "  A --> B --> C",
        ].join("\n")
      )
    ).toEqual([]);
  });

  test("subgraph ・ classDef ・ class ・ style ・ linkStyle ・ click ・ :::", () => {
    const text = [
      "flowchart TD",
      "  subgraph S[倉庫]",
      "    A --> B",
      "  end",
      "  classDef red fill:#f00",
      "  class A red",
      "  style B fill:#0f0",
      "  linkStyle 0 stroke:#f00",
      '  click A "https://example.com"',
      "  C:::red --> D",
    ].join("\n");
    expect(lines(text)).toEqual([2, 5, 6, 7, 8, 9, 10]);
    expect(messageAt(text, 2)).toContain("サブグラフの枠は取り込まれません");
  });

  test("エディタに無い形", () => {
    const text = "flowchart TD\n  A[(DB)] --> B[[sub]]\n  C>旗] --> D[/台形/]\n";
    expect(lines(text)).toEqual([2, 3]);
    expect(messageAt(text, 2)).toContain("四角として取り込みます");
  });

  test("エディタに無い矢印と、長い矢印", () => {
    const text = "flowchart TD\n  A --- B\n  B --o C\n  C --x D\n  D ---> E\n  E ==> F\n";
    expect(lines(text)).toEqual([2, 3, 4, 5]);
    expect(messageAt(text, 5)).toContain("長さ");
  });

  test("frontmatter の --- は線ではない (rev1、査読 11)", () => {
    expect(lines("---\ntitle: 図\n---\nflowchart TD\n  A --> B\n")).toEqual([]);
  });

  test("引用符やラベルの中の記号では印を付けない", () => {
    expect(lines('flowchart TD\n  A["x --- y > z"] -->|"a --o b"| B\n')).toEqual([]);
  });
});
