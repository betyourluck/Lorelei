/**
 * CodeMirror の組み込み UI 文言の訳。検索・置換パネルと行へ移動は Kataribe の editorPhrases.ts から写し、
 * lint・補完・view・commands・language の文言を足した（spec 10 D2）。訳は画面の言語の訳のファイルに持つ（spec 31 D7）。
 *
 * CodeMirror の部品は自前の英語ラベルを `state.phrase("Find")` のように引き、
 * `EditorState.phrases` ファセットで差し替えられる。ゆえに**左のキーはライブラリ側の英語文字列そのもの**で、
 * 1 字でも違えば黙って英語のまま出る。網羅は `editor-phrases.test.ts` が dist から実際のキーを抜いて照合する。
 *
 * `$` はライブラリ側の差し込み位置（件数・行番号）なので、どの言語の訳にも必ず残す。
 */
import type { ParseKeys } from "i18next";
import { i18n } from "@/components/i18n";

/** ライブラリのキー → 訳のファイルのキー */
export const EDITOR_PHRASE_KEYS: Readonly<Record<string, ParseKeys>> = {
  // 検索・置換パネル (@codemirror/search)
  Find: "codeEditor.phrase.find",
  Replace: "codeEditor.phrase.replaceField",
  next: "codeEditor.phrase.next",
  previous: "codeEditor.phrase.previous",
  all: "codeEditor.phrase.all",
  "match case": "codeEditor.phrase.matchCase",
  regexp: "codeEditor.phrase.regexp",
  "by word": "codeEditor.phrase.byWord",
  replace: "codeEditor.phrase.replace",
  "replace all": "codeEditor.phrase.replaceAll",
  close: "codeEditor.phrase.close",
  // 読み上げ用のアナウンス（画面には出ないがスクリーンリーダーが読む）
  "current match": "codeEditor.phrase.currentMatch",
  "on line": "codeEditor.phrase.onLine",
  "replaced $ matches": "codeEditor.phrase.replacedMatches",
  "replaced match on line $": "codeEditor.phrase.replacedMatchOnLine",
  // 行へ移動（Alt-G）
  "Go to line": "codeEditor.phrase.goToLine",
  go: "codeEditor.phrase.go",
  // 赤線の一覧 (@codemirror/lint)
  Diagnostics: "codeEditor.phrase.diagnostics",
  "No diagnostics": "codeEditor.phrase.noDiagnostics",
  // 補完の窓 (@codemirror/autocomplete。読み上げ用の名前)
  Completions: "codeEditor.phrase.completions",
  // 見えない制御文字の印 (@codemirror/view)
  "Control character": "codeEditor.phrase.controlCharacter",
  // 読み上げ用のアナウンス (@codemirror/commands)
  "Selection deleted": "codeEditor.phrase.selectionDeleted",
  // 折り畳み (@codemirror/language。今は折り畳みを付けていないが、付けた時に英語が出ないよう覆う)
  "folded code": "codeEditor.phrase.foldedCode",
  to: "codeEditor.phrase.to",
  unfold: "codeEditor.phrase.unfold",
};

/** その言語 (省略時は今の言語) の CodeMirror の文言の表 */
export const editorPhrases = (lng?: string): Record<string, string> => {
  const t = lng ? i18n.getFixedT(lng) : i18n.t.bind(i18n);
  return Object.fromEntries(Object.entries(EDITOR_PHRASE_KEYS).map(([lib, key]) => [lib, t(key)]));
};
