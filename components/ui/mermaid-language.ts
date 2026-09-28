import { StreamLanguage, type StreamParser, type StringStream } from "@codemirror/language";

/**
 * Mermaid の色付け。flowchart / graph と erDiagram だけを扱う小さな字句解析。
 *
 * 既製品の codemirror-lang-mermaid は erDiagram を持たず、2023 年から止まっているので使わない。
 * 札の名前は CodeMirror の標準の札（keyword / string / comment / operator / variableName /
 * typeName / propertyName / atom / meta / bracket / punctuation）で、配色はエディタの側が決める。
 */

interface MermaidState {
  /** 1 語目で決まる図の種類 */
  diagram: "flow" | "er" | null;
  /** erDiagram の `{ … }` の中 */
  inEntity: boolean;
  /** `{ … }` の中で、その行の何語目か（型 → 名前 → キー） */
  field: number;
}

// ID・テーブル名は日本語で書かれる (mermaid の UNICODE_TEXT)。tsconfig の target では
// \p の正規表現リテラルが書けないので RegExp で作る
const WORD = new RegExp("^[\\p{L}\\p{N}_]+", "u");
const ER_TYPE = new RegExp("^[\\p{L}\\p{N}_]+(?:\\([^)]*\\))?(?:\\[\\])?", "u");

const DIRECTION = /^(?:TD|TB|BT|LR|RL)(?![\w])/;
const FLOW_KEYWORDS = new Set([
  "subgraph",
  "end",
  "direction",
  "classDef",
  "class",
  "style",
  "linkStyle",
  "click",
]);
const ER_KEYS = new Set(["PK", "FK", "UK"]);

/** 矢印: `-->` `---` `-.->` `==>` `--o` `--x` `<-->` `~~~` など */
const ARROW = /^<?(?:-{2,}|={2,}|-\.+-|~{3})[>ox]?/;
/** ER の多重度: `||--o{` `}o..o{` `o|--||` など (mermaid はどちらの側にもどちらの向きの記号も書ける) */
const CARDINALITY =
  /^(?:\|o|o\||\}o|o\{|\}\||\|\{|\|\|)(?:--|\.\.)(?:\|o|o\||\}o|o\{|\}\||\|\{|\|\|)/;

/** 形の開き → 閉じ（長いものから） */
const SHAPES: [string, string[]][] = [
  ["(((", [")))"]],
  ["((", ["))"]],
  ["([", ["])"]],
  ["[[", ["]]"]],
  ["[(", [")]"]],
  ["{{", ["}}"]],
  ["[/", ["/]", "\\]"]],
  ["[\\", ["\\]", "/]"]],
  ["[", ["]"]],
  ["(", [")"]],
  ["{", ["}"]],
  [">", ["]"]],
];

/** 形のラベルを閉じまで読む。中の `"…"` は閉じの文字を含みうるので飛ばす */
function readShape(stream: StringStream, closers: string[]): void {
  const text = stream.string;
  let i = stream.pos;
  if (text[i] === '"') {
    const q = text.indexOf('"', i + 1);
    if (q >= 0) i = q + 1;
  }
  const ends = closers.map((c) => text.indexOf(c, i)).filter((n) => n >= 0);
  if (ends.length === 0) {
    stream.skipToEnd();
    return;
  }
  const end = Math.min(...ends);
  const closer = closers.find((c) => text.startsWith(c, end)) ?? closers[0];
  stream.pos = end + closer.length;
}

function readString(stream: StringStream): string {
  stream.next(); // 開きの "
  while (!stream.eol()) {
    if (stream.next() === '"') break;
  }
  return "string";
}

function tokenFlow(stream: StringStream): string | null {
  if (stream.match(DIRECTION)) return "atom";
  if (stream.match(":::")) {
    stream.match(WORD);
    return "meta";
  }
  if (stream.peek() === "|") {
    stream.next();
    const end = stream.string.indexOf("|", stream.pos);
    if (end >= 0) stream.pos = end + 1;
    else stream.skipToEnd();
    return "string";
  }
  if (stream.match(ARROW)) return "operator";
  for (const [open, closers] of SHAPES) {
    if (stream.match(open)) {
      readShape(stream, closers);
      return "string";
    }
  }
  const word = stream.match(WORD) as RegExpMatchArray | null;
  if (word) return FLOW_KEYWORDS.has(word[0]) ? "keyword" : "variableName";
  if (stream.eat("&")) return "operator";
  if (stream.eat(";")) return "punctuation";
  stream.next();
  return null;
}

function tokenEr(stream: StringStream, state: MermaidState): string | null {
  if (stream.eat("{")) {
    state.inEntity = true;
    state.field = 0;
    return "bracket";
  }
  if (stream.eat("}")) {
    state.inEntity = false;
    return "bracket";
  }
  if (state.inEntity) {
    if (stream.eat(",")) return "punctuation";
    const word = (state.field === 0 ? stream.match(ER_TYPE) : stream.match(WORD)) as RegExpMatchArray | null;
    if (word) {
      const field = state.field++;
      if (ER_KEYS.has(word[0])) return "keyword";
      return field === 0 ? "typeName" : "propertyName";
    }
    stream.next();
    return null;
  }
  if (stream.match(CARDINALITY)) return "operator";
  if (stream.match(DIRECTION)) return "atom";
  if (stream.eat(":")) return "punctuation";
  if (stream.match("[")) {
    readShape(stream, ["]"]);
    return "string";
  }
  const word = stream.match(WORD) as RegExpMatchArray | null;
  if (word) return word[0] === "direction" ? "keyword" : "variableName";
  stream.next();
  return null;
}

export const mermaidStreamParser: StreamParser<MermaidState> = {
  name: "mermaid",
  startState: () => ({ diagram: null, inEntity: false, field: 0 }),
  copyState: (s) => ({ ...s }),
  token(stream, state) {
    if (stream.sol()) state.field = 0;
    if (stream.eatSpace()) return null;
    if (stream.match("%%")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.peek() === '"') return readString(stream);
    if (state.diagram === null) {
      const head = stream.match(/^(?:flowchart|graph|erDiagram)\b/) as RegExpMatchArray | null;
      if (head) {
        state.diagram = head[0] === "erDiagram" ? "er" : "flow";
        return "keyword";
      }
    }
    return state.diagram === "er" ? tokenEr(stream, state) : tokenFlow(stream);
  },
  languageData: {
    commentTokens: { line: "%%" },
    // `{` は自動で閉じない: ER の多重度 `||--o{` を打つと `}` が補われて `o{}` に壊れる (spec 10 査読 4)
    closeBrackets: { brackets: ["(", "[", '"'] },
  },
};

/** CodeMirror に渡す言語 */
export const mermaidLanguage = StreamLanguage.define(mermaidStreamParser);
