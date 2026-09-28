/**
 * 取り込むと消える書き方の行に付ける印 (spec 11 D4)。字句で見つける目安で、正確な数は取り込みの結果 (flowFromMermaid の dropped) が持つ。
 * 文字列 ("…") と線のラベル (|…|) の中は見ない
 */

export interface DropWarning {
  /** 1 始まり */
  line: number;
  message: string;
}

const STATEMENTS: [RegExp, string][] = [
  [/^subgraph\b/, "サブグラフの枠は取り込まれません（中のノードと線は取り込みます）"],
  [/^classDef\b/, "classDef（見た目の定義）は取り込まれません"],
  [/^class\s/, "class 指定は取り込まれません"],
  [/^style\s/, "style 指定は取り込まれません"],
  [/^linkStyle\b/, "linkStyle（線の見た目の指定）は取り込まれません"],
  [/^click\s/, "click（リンク・動作）は取り込まれません"],
];

/** 文字列とラベルの中身を空にする (中の記号で誤って印を付けない) */
export const stripTexts = (line: string): string => line.replace(/"[^"]*"/g, '""').replace(/\|[^|]*\|/g, "||");

// tsconfig の target では u の正規表現リテラルが書けないので、\p を使うものは RegExp で作る
export const CLASS_SHORTHAND = new RegExp(":::[\\p{L}\\p{N}_]", "u");

const INLINE: [RegExp, string][] = [
  [CLASS_SHORTHAND, "::: の class 指定は取り込まれません"],
  // ID のすぐ後のエディタに無い形の開き: [( 円柱、[[ サブルーチン、[/ [\ 台形・平行四辺形、((( 二重円、> 旗
  [new RegExp("[\\p{L}\\p{N}_](?:\\[\\(|\\[\\[|\\[\\/|\\[\\\\|\\(\\(\\(|>)", "u"), "エディタに無い形なので、四角として取り込みます"],
  [/(?:-{3,}>|={3,}>|-\.{2,}->)/, "矢印の長さ指定は取り込まれません（普通の長さにします）"],
  [/(?<![-=.<])(?:-{3,}|={3,}|-\.+-)(?![->=.ox])/, "矢印の無い線は、矢印（-->）として取り込みます"],
  [new RegExp("(?:--|==|-\\.-)[ox](?![\\p{L}\\p{N}_])", "u"), "丸・バツの矢印は、普通の矢印（-->）として取り込みます"],
];

/** 先頭の frontmatter (--- … ---) の行の番号 (0 始まり)。中の --- を線と読まない (rev1、査読 11) */
export function frontmatterLines(lines: string[]): Set<number> {
  const first = lines.findIndex((l) => l.trim() !== "");
  if (first < 0 || lines[first].trim() !== "---") return new Set();
  const close = lines.findIndex((l, i) => i > first && l.trim() === "---");
  if (close < 0) return new Set();
  return new Set(Array.from({ length: close - first + 1 }, (_, k) => first + k));
}

export function flowchartDropWarnings(text: string): DropWarning[] {
  const warnings: DropWarning[] = [];
  const all = text.split("\n");
  const front = frontmatterLines(all);
  all.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("%%") || front.has(i)) return;
    const messages: string[] = [];
    for (const [re, message] of STATEMENTS) if (re.test(line)) messages.push(message);
    if (messages.length === 0) {
      const code = stripTexts(line);
      for (const [re, message] of INLINE) if (re.test(code)) messages.push(message);
    }
    if (messages.length) warnings.push({ line: i + 1, message: messages.join("。") });
  });
  return warnings;
}
