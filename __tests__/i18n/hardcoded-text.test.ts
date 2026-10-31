/**
 * 画面の言葉の直書きを見つける (spec 31 D10)。TypeScript のコンパイラ API で文字列・テンプレート・JSX の文字だけを見て、
 * かな・CJK の漢字を含むものを数える (コメントは見ない。全角の記号だけのもの — 矢印の「～」など — は数えない)。
 * 認めた例外は行に「i18n-allow」のコメントを付ける (data_contract UiMessages.not_translated)。
 * 英語の直書きはこれでは捕まらないので、eslint の i18next/no-literal-string で見る
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
/** フォーク元の画面のコード。lib/desktop は spec 34 で足す */
const DIRS = ["app", "features", "components", "lib"];
const SKIP_DIRS = new Set(["__tests__", "stories", "node_modules", "desktop"]);
const JAPANESE = /[぀-ヿ㐀-䶿一-鿿]/;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.(test|stories|d)\.tsx?$/.test(e.name) ? [p] : [];
  });

/** 直書きの文字 (ファイル:行 と中身) */
const hardcodedText = (file: string): string[] => {
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

describe("画面の言葉の直書き", () => {
  test("フォーク元の画面のコードに、日本語の直書きが無い (訳のファイルへ)", () => {
    const files = DIRS.flatMap((d) => sourceFiles(path.join(ROOT, d)));
    expect(files.length).toBeGreaterThan(50); // 探し方そのものが壊れていないことの下限
    expect(files.flatMap(hardcodedText)).toEqual([]);
  });

  test("見つけ方: 文字列・テンプレート・JSX の文字を拾い、コメントと i18n-allow の行は拾わない", () => {
    const tmp = path.join(ROOT, "__tests__/i18n/__fixtures__/hardcoded-sample.tsx");
    expect(hardcodedText(tmp).map((h) => h.replace(/^.*?:(\d+) /, "$1 "))).toEqual([
      "4 文字列",
      "5 前",
      "6 中身",
    ]);
  });
});
