/**
 * CodeMirror の組み込み UI 文言の和訳。検索・置換パネルと行へ移動は Kataribe の editorPhrases.ts から写し、
 * lint・補完・view・commands・language の文言を足した（spec 10 D2）。
 *
 * CodeMirror の部品は自前の英語ラベルを `state.phrase("Find")` のように引き、
 * `EditorState.phrases` ファセットで差し替えられる。ゆえに**キーはライブラリ側の英語文字列そのもの**で、
 * 1 字でも違えば黙って英語のまま出る。網羅は `editor-phrases.test.ts` が dist から実際のキーを抜いて照合する。
 *
 * `$` はライブラリ側の差し込み位置（件数・行番号）なので必ず残す。
 */
export const EDITOR_PHRASES_JA: Readonly<Record<string, string>> = {
  // 検索・置換パネル (@codemirror/search)
  Find: "検索",
  Replace: "置換",
  next: "次へ",
  previous: "前へ",
  all: "すべて選択",
  "match case": "大文字小文字を区別",
  regexp: "正規表現",
  "by word": "単語単位",
  replace: "置換",
  "replace all": "すべて置換",
  close: "閉じる",
  // 読み上げ用のアナウンス（画面には出ないがスクリーンリーダーが読む）
  "current match": "現在の一致",
  "on line": "行",
  "replaced $ matches": "$ 件を置換しました",
  "replaced match on line $": "$ 行目の一致を置換しました",
  // 行へ移動（Alt-G）
  "Go to line": "行へ移動",
  go: "移動",
  // 赤線の一覧 (@codemirror/lint)
  Diagnostics: "問題",
  "No diagnostics": "問題はありません",
  // 補完の窓 (@codemirror/autocomplete。読み上げ用の名前)
  Completions: "補完の候補",
  // 見えない制御文字の印 (@codemirror/view)
  "Control character": "制御文字",
  // 読み上げ用のアナウンス (@codemirror/commands)
  "Selection deleted": "選択範囲を削除しました",
  // 折り畳み (@codemirror/language。今は折り畳みを付けていないが、付けた時に英語が出ないよう覆う)
  "folded code": "折り畳んだコード",
  to: "〜",
  unfold: "展開",
};
