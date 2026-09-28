/**
 * ER 図で取り込むと消える書き方の行に付ける印 (spec 11 D4)。字句で見つける目安で、正確な数は取り込みの結果 (erFromMermaid の dropped) が持つ
 */
import { CLASS_SHORTHAND, frontmatterLines, type DropWarning } from "@/features/flowchart/utils/drop-warnings";
import { CARDINALITY } from "./from-mermaid";

/** 文字列の中身だけを空にする (ER 図の多重度 `}|--|{` は | を含むので、フローチャートのようにラベル |…| を空にしてはいけない) */
const stripStrings = (line: string): string => line.replace(/"[^"]*"/g, '""');

/** 多重度の片側の記号 → mermaid の意味 (どちらの側にもどちらの向きでも書ける) */
const SIDE: Record<string, string> = {
  "||": "ONLY_ONE",
  "|o": "ZERO_OR_ONE",
  "o|": "ZERO_OR_ONE",
  "}o": "ZERO_OR_MORE",
  "o{": "ZERO_OR_MORE",
  "}|": "ONE_OR_MORE",
  "|{": "ONE_OR_MORE",
};

// 非識別は .. のほかに .- と -. でも書ける (rev1、査読 11)
const RELATION = /^\S+\s+([|}o]{2})(--|\.\.|\.-|-\.)([|{o]{2})\s/;

const STATEMENTS: [RegExp, string][] = [
  [/^classDef\b/, "classDef（見た目の定義）は取り込まれません"],
  [/^class\s/, "class 指定は取り込まれません"],
  [/^style\s/, "style 指定は取り込まれません"],
];

export function erDropWarnings(text: string): DropWarning[] {
  const warnings: DropWarning[] = [];
  let inEntity = false;
  const all = text.split("\n");
  const front = frontmatterLines(all);
  all.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("%%") || front.has(i)) return;
    const messages: string[] = [];
    if (inEntity) {
      if (line === "}") inEntity = false;
      else if (line.includes('"')) messages.push("列の注釈は取り込まれません");
    } else {
      for (const [re, message] of STATEMENTS) if (re.test(line)) messages.push(message);
      if (/^[^\s{}[]+\s*\[\s*"/.test(line)) messages.push("テーブルの別名は取り込まれません（識別子を名前にします）");
      if (line.endsWith("{")) inEntity = true;
      const code = stripStrings(line);
      if (CLASS_SHORTHAND.test(code)) messages.push("::: の class 指定は取り込まれません");
      const rel = RELATION.exec(code);
      if (rel) {
        const [, left, sep, right] = rel;
        if (sep !== "--") messages.push("非識別の関係（点線）は、実線として取り込みます");
        if (!CARDINALITY[`${SIDE[left]},${SIDE[right]}`]) {
          messages.push("エディタに無い多重度なので、1 対 多 として取り込みます");
        }
      }
    }
    if (messages.length) warnings.push({ line: i + 1, message: messages.join("。") });
  });
  return warnings;
}
