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

/** 行の中のノードの ID (目安。線の端と、線の無い行の先頭の ID) */
const idsOnLine = (code: string): string[] => {
  const ends = edgeEnds(code);
  if (ends.length > 0) return ends;
  const m = LEADING_ID.exec(code);
  return m && !/^(?:subgraph|end|direction|classDef|class|style|linkStyle|click)$/.test(m[1]) ? [m[1]] : [];
};

export function flowchartDropWarnings(text: string): DropWarning[] {
  const warnings: DropWarning[] = [];
  const all = text.split("\n");
  const front = frontmatterLines(all);
  // 枠は取り込む (spec 15)。枠を指す線と枠の中の direction も取り込む (spec 16)。
  // 落ちるのは枠と自分の中を結ぶ線 (描画されない, spec 16 裁定 2)。中にあるかは、ID が最初に出た時に開いていた枠で決める (目安)
  const subgraphIds = new Set<string>();
  const enclosing = new Map<string, string[]>();
  const open: string[] = [];
  all.forEach((raw, i) => {
    if (front.has(i)) return;
    const line = raw.trim();
    if (!line || line.startsWith("%%")) return;
    if (/^subgraph\b/.test(line)) {
      const m = SUBGRAPH_ID.exec(line);
      const id = m ? m[1] : `\u0000${i}`;
      if (m) subgraphIds.add(id);
      if (!enclosing.has(id)) enclosing.set(id, [...open]);
      open.push(id);
    } else if (/^end\s*;?$/.test(line)) open.pop();
    else idsOnLine(stripTexts(line)).forEach((id) => !enclosing.has(id) && enclosing.set(id, [...open]));
  });
  const intoOwn = (a: string, b: string) =>
    a !== b &&
    ((subgraphIds.has(a) && (enclosing.get(b) ?? []).includes(a)) ||
      (subgraphIds.has(b) && (enclosing.get(a) ?? []).includes(b)));
  all.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("%%") || front.has(i)) return;
    const messages: string[] = [];
    for (const [re, message] of STATEMENTS) if (re.test(line)) messages.push(message);
    if (messages.length === 0) {
      const code = stripTexts(line);
      for (const [re, message] of INLINE) if (re.test(code)) messages.push(message);
      const ends = edgeEnds(code);
      // 隣り合う端どうし (連鎖 A --> B --> C の A と C は結ばない。& の行は目安のまま)
      if (ends.some((a, k) => k > 0 && intoOwn(ends[k - 1], a)))
        messages.push("枠とその中を結ぶ線は描画されないので取り込みません");
    }
    if (messages.length) warnings.push({ line: i + 1, message: messages.join("。") });
  });
  return warnings;
}
