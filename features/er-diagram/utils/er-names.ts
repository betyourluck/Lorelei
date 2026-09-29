/**
 * ER 図の名前 (テーブル名・関係のラベル) の書き方と、列を Mermaid に書けるかの判定 (spec 13 D1・D2)。
 * 規則は mermaid.js 11.17.2 と merman の両方に同じ入力を通して決めた (spec 13「P0 結果」)。
 * 生成器のコードは mermaid.js (プレビュー・Web 版のインポート) と merman (MCP・デスクトップで開き直す) の両方が読む
 */

/** 囲まずに書ける形。Unicode の文字か _ で始まり、文字・数字・_・- だけ (数字始まりは mermaid.js が多重度として割る) */
const BARE_NAME = new RegExp("^[\\p{L}_][\\p{L}\\p{N}_-]*$", "u");
/**
 * キーワード・関係の記号で始まる名前は囲む。境界を見ない前方一致 (大文字小文字を問わない):
 * merman は to / one / many を境界なしで関係の記号として取り (tokens が割れる)、mermaid.js は end注文 のような ASCII の語の後の非 ASCII を境界とみなす
 */
const RESERVED_PREFIX = /^(?:erdiagram|style|classdef|class|subgraph|end|direction|acctitle|accdescr|many|one|to)/i;
/** u- / u. は両方の解析器が「親」の記号 (u) として取る */
const MD_PARENT_PREFIX = /^u[-.]/i;

const ENTITY_HASH = new RegExp("#(?=[\\p{L}\\p{N}_]+;)", "gu");
/** mermaid.js は囲みの中でも `direction` + 空白 + 向き を含む行を向きの行として食う。空白を実体参照にして避ける */
const DIRECTION_RUN = /(direction)(\s+)(?=(?:tb|bt|rl|lr))/gi;

/**
 * テーブル名・関係のラベルを、両方の解析器で同じ 1 つの名前として読める形で書く。そのままでは読めない時だけ "…" で囲む。
 * 囲む時の書き換えはこの順: ① #語; の # → #35; ② & → #38; ③ " → #quot; ④ % → #37; ⑤ \ → #92;
 * ⑥ direction + 空白 + 向き の空白 1 字ずつ → #<符号位置>;。① を先にするので、② 以降で入れた #…; は書き換わらない。
 * & は、名前の中の &amp; のような文字が取り込みで実体参照として解かれないようにする。% と \ は囲みの中でも両方の解析器が許さない
 */
export function quoteErName(name: string): string {
  if (BARE_NAME.test(name) && !RESERVED_PREFIX.test(name) && !MD_PARENT_PREFIX.test(name)) return name;
  const escaped = name
    .replace(ENTITY_HASH, "#35;")
    .replace(/&/g, "#38;")
    .replace(/"/g, "#quot;")
    .replace(/%/g, "#37;")
    .replace(/\\/g, "#92;")
    .replace(DIRECTION_RUN, (_m, word: string, space: string) =>
      word + Array.from(space, (c) => `#${c.codePointAt(0)};`).join("")
    );
  return `"${escaped}"`;
}

/**
 * 列名・型に書ける形 (mermaid.js の列の規則と同じ。両方の解析器の共通部分)。UTF-16 の符号単位で見る (u フラグなし) ので、
 * U+10000 以上の文字 (絵文字など) も U+00C0〜U+FFFF の範囲 (サロゲート) に入る。U+0080〜U+00BF (° · ¥) は mermaid.js が受けない
 */
const COLUMN_WORD = /^[A-Za-z_*À-￿][A-Za-z0-9_\-*.,()[\]À-￿]*$/;
/** 型だけは ~ を 2 つ含む総称型 (List~int~) も書ける */
const GENERIC_TYPE = /^[A-Za-z_*À-￿][A-Za-z0-9_\-*.,()[\]À-￿]*~[A-Za-z0-9_\-*.,()[\]À-￿]+~[A-Za-z0-9_\-*.,()[\]À-￿]*$/;
/** PK / FK / UK の後が語の文字でない形はキーとして先に取られる (pk・PK-x は書けない、pk_id は書ける) */
const KEY_PREFIX = /^(?:pk|fk|uk)(?![A-Za-z0-9_])/i;

/**
 * 列を Mermaid に書けない理由。書ける時は null。
 * - empty: 名前も型も空 (「カラム追加」の直後。入力欄に印は出さない — spec 13 D2)
 * - empty-name / empty-type: 片方だけ空
 * - bad-name / bad-type: 書けない文字・形 (空白・記号・数字始まり・PK 等)
 */
export type ColumnIssue = "empty" | "empty-name" | "empty-type" | "bad-name" | "bad-type";

export function columnIssue(column: { name: string; type: string }): ColumnIssue | null {
  const noName = column.name.trim() === "";
  const noType = column.type.trim() === "";
  if (noName && noType) return "empty";
  if (noName) return "empty-name";
  if (noType) return "empty-type";
  if (!COLUMN_WORD.test(column.name) || KEY_PREFIX.test(column.name)) return "bad-name";
  if (!(COLUMN_WORD.test(column.type) || GENERIC_TYPE.test(column.type)) || KEY_PREFIX.test(column.type)) return "bad-type";
  return null;
}
