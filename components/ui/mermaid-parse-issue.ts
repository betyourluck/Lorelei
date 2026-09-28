/** mermaid.parse の誤り 1 件（spec 10 D5）。位置が分からなければ null（先頭に出す。位置を偽らない） */
export interface ParseIssue {
  /** 1 始まり */
  line: number | null;
  /** その行の中の列（0 始まり）。誤りの語の範囲 */
  fromColumn: number | null;
  toColumn: number | null;
  message: string;
}

interface JisonHash {
  loc?: { first_line?: number; first_column?: number; last_line?: number; last_column?: number };
}

/**
 * mermaid.parse に渡す本文を作る（spec 10 D5・査読 3）。
 *
 * mermaid は parse の前に `%%` の注釈・指示の行と先頭の空白を消すので、例外の行は**消した後の本文の行**になる
 * （実測: 注釈 1 行の後の 4 行目の誤りが「3 行目」）。そこで注釈・指示の行を空行に置き換えて行数を保ち、
 * それでも消える先頭の空行の数を `lineOffset` として返す（`toParseIssue` が足し戻す）
 */
export function prepareForParse(source: string): { text: string; lineOffset: number } {
  const lines = source.split("\n").map((line) => (/^\s*%%/.test(line) ? "" : line));
  let lineOffset = 0;
  while (lineOffset < lines.length && lines[lineOffset].trim() === "") lineOffset++;
  return { text: lines.join("\n"), lineOffset };
}

/**
 * mermaid.parse の例外を ParseIssue にする。`lineOffset` は `prepareForParse` の返り値（消えた先頭の行の数）。
 * flowchart / erDiagram (jison) の例外は `hash.loc` を持つ（first_line は 1 始まり。spec 10 P0 の実測）。
 * 無ければ文の `on line N` から行だけを取る
 */
export function toParseIssue(error: unknown, lineOffset = 0): ParseIssue {
  const message = error instanceof Error ? error.message : String(error);
  const loc = (error as { hash?: JisonHash } | null)?.hash?.loc;
  if (loc && typeof loc.first_line === "number") {
    const sameLine = loc.last_line === undefined || loc.last_line === loc.first_line;
    return {
      line: loc.first_line + lineOffset,
      fromColumn: loc.first_column ?? null,
      toColumn: sameLine ? (loc.last_column ?? null) : null,
      message,
    };
  }
  const m = /\bon line (\d+)/.exec(message);
  return { line: m ? Number(m[1]) + lineOffset : null, fromColumn: null, toColumn: null, message };
}
