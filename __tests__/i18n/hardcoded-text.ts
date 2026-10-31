/**
 * 画面の言葉の直書きを見つける道具 (spec 31 D10、spec 34 D1 で切り出した)。TypeScript のコンパイラ API で文字列・テンプレート・JSX の文字だけを見て、
 * かな・CJK の漢字を含むものを数える (コメントは見ない。全角の記号だけのもの — 矢印の「～」など — は数えない)。
 * 認めた例外は行に「i18n-allow」のコメントを付ける (data_contract UiMessages.not_translated)
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export const ROOT = path.resolve(__dirname, "../..");
const JAPANESE = /[぀-ヿ㐀-䶿一-鿿]/;

/** dir の下の画面のコード (.ts・.tsx。テスト・stories・型の宣言と、skip の名のフォルダを除く) */
export const sourceFiles = (dir: string, skip: ReadonlySet<string>): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return skip.has(e.name) ? [] : sourceFiles(p, skip);
    return /\.tsx?$/.test(e.name) && !/\.(test|stories|d)\.tsx?$/.test(e.name) ? [p] : [];
  });

/** 直書きの文字 (ファイル:行 と中身) */
export const hardcodedText = (file: string): string[] => {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  const sf = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const hits: string[] = [];
  const check = (node: ts.Node, text: string) => {
    if (!JAPANESE.test(text)) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    if (lines[line].includes("i18n-allow")) return;
    hits.push(
      `${path.relative(ROOT, file).replace(/\\/g, "/")}:${line + 1} ${text.trim().slice(0, 60)}`
    );
  };
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      check(node, node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))
      check(node, node.text);
    else if (ts.isJsxText(node)) check(node, node.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
};
