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

/** `subgraph <ID>` の ID。題だけの書き方 (`subgraph 受付 審査`) は ID を持たないので拾わない */
const SUBGRAPH_ID = new RegExp("^subgraph\\s+([\\p{L}\\p{N}_-]+)\\s*(?:\\[|$)", "u");
/** 線の記号 (矢印・丸・バツ・矢印なし・見えない線) と & で行を区切る */
const EDGE_SPLIT = /\s*(?:<?(?:-{2,}|={2,}|-\.+-|~{3,})[>ox]?|&)\s*/;
/** 区切った片の先頭の ID。線のラベル (空にした ||) が前に付くことがある */
const LEADING_ID = new RegExp("^(?:\\|[^|]*\\|\\s*)?([\\p{L}\\p{N}_-]+)", "u");

/** 線の両端の ID (目安)。線の無い行は空 */
const edgeEnds = (code: string): string[] => {
  const parts = code.split(EDGE_SPLIT);
  if (parts.length < 2) return [];
  return parts.flatMap((part) => {
    const m = LEADING_ID.exec(part.trim());
    return m ? [m[1]] : [];
  });
};

export function flowchartDropWarnings(text: string): DropWarning[] {
  const warnings: DropWarning[] = [];
  const all = text.split("\n");
  const front = frontmatterLines(all);
  // 枠は取り込む (spec 15)。落ちるのは枠を指す線と、枠の中の direction (D6)
  const subgraphIds = new Set<string>();
  all.forEach((raw, i) => {
    const m = front.has(i) ? null : SUBGRAPH_ID.exec(raw.trim());
    if (m) subgraphIds.add(m[1]);
  });
  let depth = 0;
  all.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("%%") || front.has(i)) return;
    const messages: string[] = [];
    if (/^subgraph\b/.test(line)) depth++;
    else if (/^end\s*;?$/.test(line)) depth = Math.max(0, depth - 1);
    else if (depth > 0 && /^direction\s/.test(line))
      messages.push("サブグラフの中の向きは取り込まれません（図全体の向きで並べます）");
    for (const [re, message] of STATEMENTS) if (re.test(line)) messages.push(message);
    if (messages.length === 0) {
      const code = stripTexts(line);
      for (const [re, message] of INLINE) if (re.test(code)) messages.push(message);
      if (edgeEnds(code).some((id) => subgraphIds.has(id))) messages.push("サブグラフを指す線は取り込まれません");
    }
    if (messages.length) warnings.push({ line: i + 1, message: messages.join("。") });
  });
  return warnings;
}
