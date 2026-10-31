/**
 * Mermaid の補完の芯（spec 10 D4）。CodeMirror に依らない純粋関数なのでテストできる。
 * flowchart / graph と erDiagram だけを扱う（エディタで開けるのはこの 2 つ）。
 */
import { i18n } from "@/components/i18n";

export interface MermaidOption {
  label: string;
  /** 候補の脇に出す短い説明 */
  detail?: string;
  /** 入れる文字列（無ければ label） */
  insert?: string;
  /** 入れた後に選ぶ範囲（insert の中の [from, to]）。形のラベルを選んだ状態にする */
  select?: [number, number];
  /** 入れる前に、カーソルの前の空白をこの数だけ詰める（形は ID に続けて書く） */
  eatBefore?: number;
  type: "keyword" | "variable" | "type" | "operator";
}

export interface MermaidCandidates {
  options: MermaidOption[];
  /** 置換の始まり（打ちかけの語の頭） */
  from: number;
  /** 打ちかけの語 */
  typed: string;
  /** 結果を使い回してよい文字列。打ちかけの語と**同じ文字集合**にする（IME の確定で二重に挿さらない, Kataribe spec 28） */
  validFor: RegExp;
  /**
   * 打ち始めなくても開いてよい位置か。行頭・1 行目は false（Enter の改行で候補を確定させない）。
   * 次に書くものが決まっている位置（向き・矢印の後・空白の後の矢印や多重度・キー）は true
   */
  auto: boolean;
}

/** どのダイアログのエディタか（1 行目の候補を絞る） */
export type MermaidKind = "flowchart" | "er";

// ID・テーブル名は日本語で書かれる (mermaid の UNICODE_TEXT)
const WORD_CHARS = "[\\p{L}\\p{N}_]";
const WORD_TAIL = new RegExp(`${WORD_CHARS}*$`, "u");
const WORD_VALID = new RegExp(`^${WORD_CHARS}*$`, "u");
const WORD_ALL = new RegExp(`${WORD_CHARS}+`, "gu");
const WORD_THEN_SPACE = new RegExp(`${WORD_CHARS}\\s+$`, "u");
const ONE_WORD_THEN_SPACE = new RegExp(`^\\s*${WORD_CHARS}+\\s+$`, "u");

// 候補の説明・形のラベルは画面の言語で書く。表は呼ばれた時に作る (読み込み時に訳すと切り替えに付いてこない, spec 31 D6)
const t = i18n.t.bind(i18n);

const headers = (): MermaidOption[] => [
  { label: "flowchart TD", detail: t("completion.header.flowchartTD"), type: "keyword" },
  { label: "flowchart LR", detail: t("completion.header.flowchartLR"), type: "keyword" },
  { label: "graph TD", detail: t("completion.header.graphTD"), type: "keyword" },
  { label: "erDiagram", detail: t("completion.header.erDiagram"), type: "keyword" },
];

const directions = (): MermaidOption[] => [
  { label: "TD", detail: t("completion.direction.TD"), type: "keyword" },
  { label: "TB", detail: t("completion.direction.TB"), type: "keyword" },
  { label: "BT", detail: t("completion.direction.BT"), type: "keyword" },
  { label: "LR", detail: t("completion.direction.LR"), type: "keyword" },
  { label: "RL", detail: t("completion.direction.RL"), type: "keyword" },
];

const arrows = (): MermaidOption[] => {
  const label = t("completion.arrow.labelText");
  return [
    { label: "-->", detail: t("completion.arrow.arrow"), type: "operator", insert: "--> " },
    { label: "---", detail: t("completion.arrow.line"), type: "operator", insert: "--- " },
    { label: "-.->", detail: t("completion.arrow.dotted"), type: "operator", insert: "-.-> " },
    { label: "==>", detail: t("completion.arrow.thick"), type: "operator", insert: "==> " },
    { label: "<-->", detail: t("completion.arrow.both"), type: "operator", insert: "<--> " },
    {
      label: `-->|${label}|`,
      detail: t("completion.arrow.labeled"),
      type: "operator",
      insert: `-->|${label}| `,
      select: [4, 4 + label.length],
    },
  ];
};

/** フォーク元のエディタが扱える形（インポートのヘルプの一行と同じ 6 つ） */
const shapes = (): MermaidOption[] => [
  shape(`[${t("completion.shape.rectangleText")}]`, t("completion.shape.rectangle")),
  shape(`(${t("completion.shape.roundText")})`, t("completion.shape.round")),
  shape(`{${t("completion.shape.diamondText")}}`, t("completion.shape.diamond")),
  shape(`((${t("completion.shape.circleText")}))`, t("completion.shape.circle")),
  shape(`([${t("completion.shape.stadiumText")}])`, t("completion.shape.stadium")),
  shape(`{{${t("completion.shape.hexagonText")}}}`, t("completion.shape.hexagon")),
];

function shape(text: string, detail: string): MermaidOption {
  const open = text.search(/[^[({]/);
  const close = text.length - open;
  return { label: text, detail, type: "operator", insert: text, select: [open, close] };
}

/** フォーク元のエディタが扱える多重度（data_contract の cardinality の 7 組） */
const cardinalities = (): MermaidOption[] =>
  (
    [
      ["||--||", "oneToOne"],
      ["||--o{", "oneToZeroOrMore"],
      ["||--|{", "oneToOneOrMore"],
      ["||--o|", "oneToZeroOrOne"],
      ["}o--||", "zeroOrMoreToOne"],
      ["}o--o{", "manyToMany"],
      ["o|--||", "zeroOrOneToOne"],
    ] as const
  ).map(([label, key]) => ({ label, detail: t(`completion.cardinality.${key}`), type: "operator", insert: `${label} ` }));

const ER_TYPE_NAMES = ["int", "string", "varchar", "text", "float", "decimal", "boolean", "date", "datetime", "timestamp", "uuid"];
const erTypes = (): MermaidOption[] =>
  ER_TYPE_NAMES.map((name): MermaidOption => ({ label: name, detail: t("completion.er.type"), type: "type", insert: `${name} ` }));
const erKeys = (): MermaidOption[] => [
  { label: "PK", detail: t("completion.er.pk"), type: "keyword" },
  { label: "FK", detail: t("completion.er.fk"), type: "keyword" },
  { label: "UK", detail: t("completion.er.uk"), type: "keyword" },
];

const FLOW_KEYWORDS = new Set(["subgraph", "end", "direction", "classDef", "class", "style", "linkStyle", "click", "flowchart", "graph"]);
const DIRECTION_WORDS = new Set(["TD", "TB", "BT", "LR", "RL"]);
const ARROW_TAIL = /(?:<?(?:-{2,}|={2,}|-\.+-|~{3})[>ox]?(?:\|[^|]*\|)?|&)\s*$/;
const ARROW_ALL = /<?(?:-{2,}|={2,}|-\.+-|~{3})[>ox]?/g;
const CARDINALITY_TAIL =
  /(?:\|o|o\||\}o|o\{|\}\||\|\{|\|\|)(?:--|\.\.)(?:\|o|o\||\}o|o\{|\}\||\|\{|\|\|)\s*$/;
const ER_RELATION = new RegExp(
  `^\\s*(${WORD_CHARS}+)\\s+(?:\\|o|o\\||\\}o|o\\{|\\}\\||\\|\\{|\\|\\|)(?:--|\\.\\.)(?:\\|o|o\\||\\}o|o\\{|\\}\\||\\|\\{|\\|\\|)\\s+(${WORD_CHARS}+)`,
  "u"
);
const ER_ENTITY = new RegExp(`^\\s*(${WORD_CHARS}+)\\s*(?:\\[[^\\]]*\\])?\\s*\\{`, "u");

type Diagram = "flow" | "er";

/** 1 語目から図の種類を決める（コメント・空行は飛ばす） */
function diagramOf(lines: string[]): Diagram | null {
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("%%")) continue;
    if (/^(?:flowchart|graph)\b/.test(t)) return "flow";
    if (/^erDiagram\b/.test(t)) return "er";
    return null;
  }
  return null;
}

const count = (s: string, ch: string) => s.split(ch).length - 1;

/** 文字列・ラベル・形の中にいるか（その行の、カーソルより前だけを見る） */
function insideFlowText(before: string): boolean {
  if (count(before, '"') % 2 === 1) return true;
  if (count(before.replace(ARROW_ALL, ""), "|") % 2 === 1) return true;
  const stripped = before.replace(/"[^"]*"/g, "");
  let depth = 0;
  for (const ch of stripped) {
    if (ch === "[" || ch === "(" || ch === "{") depth++;
    else if (ch === "]" || ch === ")" || ch === "}") depth = Math.max(0, depth - 1);
  }
  return depth > 0;
}

/** flowchart のノード ID を文書から拾う */
function flowIds(lines: string[]): string[] {
  const ids = new Set<string>();
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^(?:flowchart|graph)\b/.test(t)) continue;
    if (/^(?:classDef|class|style|linkStyle|click)\b/.test(t)) continue;
    let s = t
      .replace(/"[^"]*"/g, " ")
      .replace(/\|[^|]*\|/g, " ")
      .replace(/:::\S+/g, " ");
    // 形の中身を消す（入れ子の (( )) なども内側から）
    for (let i = 0; i < 3; i++) s = s.replace(/\[[^[\]]*\]|\([^()]*\)|\{[^{}]*\}|>[^\]]*\]/g, " ");
    s = s.replace(ARROW_ALL, " ");
    for (const m of Array.from(s.matchAll(WORD_ALL))) {
      if (!FLOW_KEYWORDS.has(m[0]) && !DIRECTION_WORDS.has(m[0])) ids.add(m[0]);
    }
  }
  return Array.from(ids);
}

/** erDiagram のテーブル名を文書から拾う */
function erEntities(lines: string[]): string[] {
  const names = new Set<string>();
  for (const line of lines) {
    const rel = ER_RELATION.exec(line);
    if (rel) {
      names.add(rel[1]);
      names.add(rel[2]);
      continue;
    }
    const ent = ER_ENTITY.exec(line);
    if (ent) names.add(ent[1]);
  }
  return Array.from(names);
}

/** カーソルが erDiagram の `{ … }` の中か */
function insideEntity(textBefore: string): boolean {
  let depth = 0;
  for (const line of textBefore.split("\n")) {
    const s = line.replace(/%%.*$/, "").replace(/"[^"]*"/g, "");
    // 多重度の `o{` `|{` `}o` `}|` は括弧ではない
    const t = s.replace(CARDINALITY_TAIL, "").replace(
      /(?:\|o|o\||\}o|o\{|\}\||\|\{|\|\|)(?:--|\.\.)(?:\|o|o\||\}o|o\{|\}\||\|\{|\|\|)/g,
      ""
    );
    for (const ch of t) {
      if (ch === "{") depth = 1;
      else if (ch === "}") depth = 0;
    }
  }
  return depth > 0;
}

const asIds = (names: string[], detail: string): MermaidOption[] =>
  names.map((label) => ({ label, detail, type: "variable" }));

/** カーソル位置で出すべき候補 */
export function mermaidCandidates(text: string, pos: number, kind?: MermaidKind): MermaidCandidates {
  const textBefore = text.slice(0, pos);
  const lineStart = textBefore.lastIndexOf("\n") + 1;
  const lineBefore = textBefore.slice(lineStart);
  const typed = WORD_TAIL.exec(lineBefore)?.[0] ?? "";
  const from = pos - typed.length;
  const rest = lineBefore.slice(0, lineBefore.length - typed.length);
  const result = (options: MermaidOption[], auto = false): MermaidCandidates => ({ options, from, typed, validFor: WORD_VALID, auto });

  if (lineBefore.includes("%%")) return result([]);

  // 自分が今打っている語は拾わない（カーソルの前後の語を抜いた文書から拾う）
  const tailAfter = new RegExp(`^${WORD_CHARS}*`, "u").exec(text.slice(pos))?.[0] ?? "";
  const others = (text.slice(0, from) + text.slice(pos + tailAfter.length)).split("\n");

  const diagram = diagramOf(textBefore.slice(0, lineStart).split("\n"));
  if (diagram === null) {
    // 1 行目（図の種類がまだ無い）
    if (/^\s*(?:flowchart|graph)\s+$/.test(rest)) return result(directions(), true);
    if (rest.trim() === "") return result(headers().filter((h) => !kind || (kind === "er") === (h.label === "erDiagram")));
    return result([]);
  }
  if (/(?:^|\s)direction\s+$/.test(rest)) return result(directions(), true);

  if (diagram === "flow") {
    if (insideFlowText(lineBefore)) return result([]);
    if (rest.trim() === "") return result(asIds(flowIds(others), t("completion.id.node")));
    if (ARROW_TAIL.test(rest)) return result(asIds(flowIds(others), t("completion.id.node")), true);
    if (typed === "" && WORD_THEN_SPACE.test(rest) || (typed === "" && /[\])}]\s+$/.test(rest))) {
      const spaces = /\s+$/.exec(rest)?.[0].length ?? 0;
      return result([...arrows(), ...shapes().map((s) => ({ ...s, eatBefore: spaces }))], true);
    }
    return result([]);
  }

  // erDiagram
  if (count(lineBefore, '"') % 2 === 1) return result([]);
  if (insideEntity(textBefore)) {
    const words = rest.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return result(erTypes());
    if (words.length >= 2) return result(erKeys(), true);
    return result([]);
  }
  if (rest.trim() === "") return result(asIds(erEntities(others), t("completion.id.table")));
  if (CARDINALITY_TAIL.test(rest)) return result(asIds(erEntities(others), t("completion.id.table")), true);
  if (typed === "" && ONE_WORD_THEN_SPACE.test(rest)) {
    return result([...cardinalities(), { label: "{", detail: t("completion.er.columns"), type: "operator" }], true);
  }
  return result([]);
}
