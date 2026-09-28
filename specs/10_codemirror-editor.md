# Spec: Mermaid のエディタを CodeMirror 6 にし、補完とエラーの赤線を入れ、インポートのダイアログを広げてプレビューを並べる

**ID**: 10
**Date**: 2026-09-28
**Status**: **Done**（2026-09-29。rev1 → P0〜P4 着地。受け入れ条件 1〜7 通過（VRT の基準画像の更新は未了）—「受け入れ条件の結果」節）
**Branch**: なし（Phase 単位で main へ直接コミット）

## Goal

利用者の要望（2026-09-28、spec 09 の直後）:

> インポートのダイアログも大きくしたい。またエディタを lorekeel と同じエディタにしたい。mermaid の IntelliSense もいれたい。

「lorekeel と同じエディタ」は **Kataribe（`D:\Github\Kataribe`）の CodeMirror 6**（利用者の確認, 2026-09-28）。Kataribe は Vue、Lorelei は React なので部品は持ち込めない。
**同じライブラリ・同じ設定と操作感の、React 用の薄い包み**を作る。

**フォーク元の改善**（Web 版にもある。Tauri に依らない）なので、`lib/desktop/` には触らず、上流へ PR で返せるコミットに分ける（掟）。

## 裁定（2026-09-28、利用者）

- インポートのダイアログは **左にエディタ、右にプレビュー**（コード生成と同じ 90%×85%）
- コード生成のダイアログの左のコードも **CodeMirror に揃える（読むだけ）**
- IntelliSense は **補完** と **エラーの赤線**。「エディタで捨てられる要素（subgraph・classDef・style など）の警告」は入れない

## 現況（2026-09-28）

- **インポート**: `features/flowchart/components/mermaid/import-modal.tsx` と `features/er-diagram/components/mermaid/import-modal.tsx`。`Modal size="2xl"`、
  本文は説明・`EditableMermaidHighlight`（`features/flowchart/components/mermaid/editable-mermaid-highlight.tsx`。react-simple-code-editor + Prism の色付け、`minHeight` 300px）・エラーの Alert・ヘルプの一行。
  取り込みはフォーク元のパーサー（`parseMermaidCode` / `convertMermaidToERData`）
- **コード生成**: spec 09 で 2 列にした。左は `MermaidHighlight`（react-syntax-highlighter の Prism、`vscDarkPlus`。読むだけ）と `CopyButton`、右は `MermaidPreview`（mermaid.js 11.17.2）
- 使っている色付けの依存: `react-simple-code-editor`・`prismjs`・`@types/prismjs`（編集）、`react-syntax-highlighter`・`@types/react-syntax-highlighter`（読むだけ）。
  使うのは上の 2 部品だけ（`components/ui/mermaid-highlight.tsx`・`editable-mermaid-highlight.tsx`。ほかに README / TESTING.md / DEVELOPMENT.md が名前を挙げる）
- **Kataribe のエディタ**（`app/src/components/CodeEditor.vue`、2026-09-23 時点）: `@codemirror/{autocomplete, commands, lang-json, lang-yaml, language, lint, search, state, view}` 6 系を直接使う薄い包み
  （`@uiw/*` のようなラッパーは使わない）。持つもの: 行番号（`text` 以外）・現在行の強調・履歴・複数選択・折り返し・検索パネル（上）と一致の強調・補完（供給源を差し替えられる）・括弧の自動補完・
  Tab で字下げ・**Ctrl+R を飲む**（WebView の再読込で編集中の本文が消えるのを防ぐ）・外部の検査結果の lint（500ms 遅延）とガター・読むだけ・プレースホルダ・
  **検索パネルの和訳**（`editorPhrases.ts`。キーはライブラリの英語文字列そのもので、テストが dist から実際のキーを抜いて照合する）・
  フッタ（行・列・全体の行数・文字数をコードポイントで数える、挿入/上書き。Insert で切り替え、フッタを出す時だけ）。
  補完は IME の確定で候補が二重に挿さる事故を踏んでいる（`validFor` と置換範囲を同じ文字集合で切る, Kataribe spec 28）
- CodeMirror の Mermaid の既製品 `codemirror-lang-mermaid`（0.5.0、2023-09 が最後）は **erDiagram に対応していない**（mindmap・pie・flowchart・sequence・journey・requirement・gantt）。色付けと折り畳みだけ
- npm の最新（2026-09-28）: `@codemirror/view` 6.43.13・`state` 6.7.6・`autocomplete` 6.20.3・`lint` 6.9.7・`search` 6.7.2・`commands` 6.11.1・`language` 6.12.4
- mermaid.js 11.17.2 は spec 09 で入っている（`components/ui/mermaid-render.ts` の境界だけが触る）。`mermaid.parse(text)` は文法の誤りで throw する（エラーの文に `Parse error on line N:`）

## 決めること

### D1. ライブラリ — CodeMirror 6 を直接使う（Kataribe と同じ）

- `@codemirror/{state, view, commands, language, autocomplete, lint, search}` と、暗い配色の `HighlightStyle` の札に `@lezer/highlight`（pnpm は推移的な依存を直接 import させないので、直接の依存に入れる）。
  版は `"6"` / `"1"`（P0 結果）
- `@uiw/react-codemirror` などのラッパーは使わない。Kataribe と同じく Compartment で読むだけ・プレースホルダを差し替える薄い包みを自分で持つ（依存を増やさない・設定を Kataribe と揃えられる）
- 読み込み（査読 7）: ダイアログが import するのは**遅延の包み** `components/ui/lazy-code-editor.tsx`（`next/dynamic`、`ssr: false`）だけ。
  `@codemirror/*` の実体・色付け・補完・lint の組み立ては**チャンクの中**（`components/ui/code-editor.tsx` とそれが import するもの）に閉じる。
  ダイアログのファイルが `@codemirror/*` を直接 import すると、パネルから静的に読まれてページの最初の読み込みに入る（`flow-panel.tsx` / `er-diagram-panel.tsx` が import-modal を静的に読む）

### D2. エディタの部品 `components/ui/code-editor.tsx`

Kataribe の `CodeEditor.vue` を React に写す。props: `value`・`onChange`・`readOnly`・`placeholder`・`height`・`mermaid`（`"flowchart" | "er"`。図の種類ごとに補完を絞る, 査読 7）・
`intellisense`（補完と赤線を付けるか。インポートだけ）・`status`（フッタ）。補完と lint の供給源は props で渡さず、チャンクの中で組み立てる（D1）。

- 持つもの（Kataribe と同じ）: 行番号・現在行の強調・履歴・複数選択・折り返し・検索パネル（上、和訳）・一致の強調・補完・括弧の自動補完・Tab で字下げ・Ctrl+R を飲む・lint とガター・
  フッタ（行・列・行数・文字数、挿入/上書き。`status` の時だけ、読むだけならモードは出さない）
- 和訳の表と、文字数・上書きの純粋関数（`countChars`・`overwriteSpan`）は Kataribe から写す（`components/ui/editor-phrases.ts`・`editor-typing.ts`）。
  和訳は search に加えて **lint・autocomplete・view・commands・language** が `phrase()` で引く文言も覆う（査読 12。dist から抜いた 9 つ: close / Diagnostics / No diagnostics / Completions /
  Control character / Selection deleted / folded code / to / unfold）。テストは 6 つの dist からキーを抜いて照合する
- 配色: 今のコードの見た目（VS Code Dark+、`vscDarkPlus`）に合わせた**暗い固定の配色**（`HighlightStyle`）。アプリの明暗の切り替えには追従しない（今も追従していない）
- **React の包みの約束**（査読 5）: `EditorView` は `useEffect` で 1 つだけ作り、cleanup で `destroy` する（開発時の StrictMode の二度走りでも 1 つ）。
  `onChange` は ref で持ち（古い関数を呼ばない）、`value` を外から変えた時（コード生成で向きを変えた時）は**差し替えの印（annotation）を付けて** dispatch し、その変化では `onChange` を出さない
- **Esc**（査読 1）: CodeMirror は補完の窓・検索パネルを閉じる Esc で `preventDefault` するだけで伝播を止めず、Yamada のダイアログは `defaultPrevented` を見ずに Esc で閉じる
  （`@yamada-ui/modal` の onKeyDown）。包みの要素で、**CodeMirror が使った Esc（`defaultPrevented`）の伝播を止める**。何も開いていない時の Esc は今どおりダイアログを閉じる
- **窓の置き場**（査読 8）: 補完・lint のツールチップは `tooltips({ parent: document.body })` で body に出し、z-index をダイアログより上にする（ダイアログの本文は `overflow: hidden`、
  開く時の transform で CodeMirror のツールチップが absolute になり切れうる）

### D3. Mermaid の色付け — 自前の小さな字句解析（`StreamLanguage`）

`components/ui/mermaid-language.ts`。flowchart / graph と erDiagram だけを扱う（エディタで開けるのはこの 2 つ）。既製品は erDiagram が無く、2023 年から止まっているので使わない。

- 札: 図の種類（`flowchart` `graph` `erDiagram`）・向き（`TD` `TB` `BT` `LR` `RL`）・キーワード（`subgraph` `end` `direction` `classDef` `class` `style` `linkStyle` `click`）・
  矢印（`-->` `---` `-.->` `==>` `--o` `--x` `<-->` など）・ER の多重度（`||--o{` など）・ER のキー（`PK` `FK` `UK`）と型・文字列（`"…"`）・ラベル（`|…|`）・コメント（`%%`）
- ノードの形の中のラベル（`[…]` `(…)` `{…}` など）は文字列と同じ色
- 言語の付帯情報（査読 4）: `commentTokens: { line: "%%" }`（Ctrl+/ で注釈）、`closeBrackets: { brackets: ["(", "[", "\""] }` — **`{` は自動で閉じない**
  （`A ||--o` の行末で `{` を打つと `}` が補われて多重度が `o{}` に壊れる）

### D4. 補完 — 純粋関数 + 供給源

`components/ui/mermaid-completion.ts` の `mermaidCandidates(text, pos)`（CodeMirror に依らない。テストできる）と、それを包む供給源。候補には短い説明（`detail`）を付ける。

| 場所 | 候補 |
|---|---|
| 1 行目（図の種類がまだ無い） | フローチャートのダイアログ: `flowchart TD` `flowchart LR` `graph TD` / ER 図のダイアログ: `erDiagram`（査読 7） |
| `flowchart` / `graph` / `direction` の直後 | 向き 5 つ（説明: 上から下 など） |
| flowchart の行頭・矢印の後 | 文書の中のノード ID（`A[…]` の `A` などを拾う。今打っている語は除く） |
| flowchart のノード ID の後に空白 | 矢印（`-->` `---` `-.->` `==>` `<-->` `-->|ラベル|`）と形（`[四角]` `(角丸)` `{ひし形}` `((円))` `([スタジアム])` `{{六角形}}`）。
  形は**直前の空白を詰めて** ID に続け、中のラベルを選んだ状態で入る（ID を打ちかけの位置で出すと、CodeMirror が打ちかけの語で候補を絞って形が消えるため。P2 で決めた） |
| erDiagram の行頭（`{}` の外） | 文書の中のテーブル名 |
| erDiagram のテーブル名の後 | フォーク元のエディタが扱える多重度 7 つ（data_contract の cardinality: `||--||` `||--o{` `||--|{` `||--o|` `}o--||` `}o--o{` `o|--||`、説明: 1 対 多（0 以上）など）と `{` |
| erDiagram の多重度の後 | テーブル名 |
| erDiagram の `{}` の中の行頭 | 型（`int` `string` `varchar` `date` `datetime` `boolean` `float` など） |
| erDiagram の `{}` の中の型と名前の後 | `PK` `FK` `UK` |

- キーワードの位置は打ち始めてから（または Ctrl+Space）開く（行頭で常に開くとうるさい, Kataribe と同じ）
- **ID・テーブル名は日本語で書かれる**。打ちかけの語（置換範囲）と `validFor` を**同じ文字集合**で切り、IME の確定で候補が二重に挿さらないようにする（Kataribe spec 28 の事故）。
  文字集合は `[\p{L}\p{N}_]`（`-` `=` `.` `|` は含めない = 矢印を打つと候補が閉じる）。mermaid の `UNICODE_TEXT` の範囲表より広いが、ここは**置換の範囲**にしか使わず、
  ID として通るかの検査は D5（mermaid.parse）がする（査読 10 は「範囲表に揃える」を採らない — failures #12 は検査の側の話で、補完の範囲を狭めても誤りは防げない）
- 文字列・ラベル（`|…|`）・形の中・注釈の中では出さない
- エディタでだけ付ける（コード生成の読むだけの側には付けない）

### D5. エラーの赤線 — mermaid.js の `parse`

- 境界 `components/ui/mermaid-render.ts` に `parseMermaid(code): Promise<ParseIssue | null>` を足す。mermaid に触るのは引き続きこの境界だけ。
  `__tests__/setup.ts` の全体の模擬にも `parseMermaid` を足す（査読 2。無いとインポートを描くテストが「No export defined on mock」で落ちる）
- 例外から位置を取る部分は mermaid に依らない純粋関数 `toParseIssue`（`components/ui/mermaid-parse-issue.ts`）: `{ line, fromColumn, toColumn, message }`。
  行は `hash.loc.first_line`（1 始まり）、無ければ文の `on line N`、どちらも無ければ `null`（先頭に出す。位置を偽らない, Kataribe と同じ）。列は同じ行の時だけ
- **行のずれを直す**（査読 3、実測で確認）: mermaid は parse の前に `%%` の注釈の行と先頭の空白を消すので、報告される行は**消した後の本文の行**になる
  （実測: 注釈 1 行の後の 4 行目の誤りが「3 行目」、先頭の空行 2 つの後の 5 行目が「3 行目」）。parse に渡す前に、注釈・指示（`%%{…}%%`）の行を**空行に置き換え**（行数を保つ）、
  先頭の空行の数を足し戻す。対応は mermaid の本物で確かめるテストで固める（jsdom の vitest で `mermaid.parse` は動く — 査読 3 の確かめで判明）
- 500ms 遅延（Kataribe と同じ）。空の時は出さない。エディタでだけ付ける
- プレビューも同じ誤りを右の列に出すので二重になるが、赤線は**どの行か**、プレビューは**文**を見せる役割の違いとして残す

### D6. インポートのダイアログ（裁定: 左にエディタ、右にプレビュー）

- フローチャート・ER 図とも、コード生成と同じ `maxW="90vw" h="85vh"` と 2 列（狭い幅では上下）。2 列の枠はコード生成と共有する（spec 09 の `MermaidCodeWithPreview` の枠を切り出す）
- 左: `CodeEditor`（編集・補完・赤線・フッタ）。プレースホルダの例は今のまま。説明・ヘルプの一行・エラーの Alert は左の列の上下に残す
- 右: `MermaidPreview`。**打鍵から 400ms 止まったら**描き直す（打つたびに描くと重い）。空の時は「左に Mermaid を貼ると、ここに図が出ます」。
  **打っている途中の誤りで図を消さない**（査読 9）: `MermaidPreview` に `keepLast` を足し、描けない時は最後に描けた図を残したまま、誤りの文を上に帯で重ねる（コード生成は今どおり）
- **本文がある時は Esc で閉じない**（`closeOnEsc={!本文}`。閉じると本文が消える, 査読 1）
- 取り込み（フォーク元のパーサー）・「インポート」「キャンセル」の動きは変えない

### D7. コード生成のダイアログ（裁定: 揃える、読むだけ）

- 左の `MermaidHighlight` を `CodeEditor`（`readOnly`、補完・赤線なし、フッタなし）に置き換える。行番号・検索（Ctrl+F）が使える。コピーのボタンは今の位置
- 撤去（**収縮**、査読 11 で一覧を正した）:
  - 部品: `components/ui/mermaid-highlight.tsx`・`features/flowchart/components/mermaid/editable-mermaid-highlight.tsx`
  - 再エクスポート: `components/ui/index.ts`・`features/flowchart/components/mermaid/index.ts`
  - テスト: `__tests__/components/ui/mermaid-highlight.test.tsx`・`features/flowchart/__tests__/components/mermaid/editable-mermaid-highlight.test.tsx`
  - 依存: `react-simple-code-editor`・`prismjs`・`@types/prismjs`・`react-syntax-highlighter`・`@types/react-syntax-highlighter`
  - 文書: README・TESTING.md・DEVELOPMENT.md の記述（掟の「撤去したら grep」）。`docs/` は GitHub Pages のビルド物なので触らない
- VRT の基準画像（コード生成・インポートの story）は形が変わる。VRT はこの環境で回していないので、回す時に更新する（spec 09 と同じく未了として残す）

## Phase

- **P0（PoC、コードの前）**: 捨てるページで — (1) CodeMirror を静的書き出しに入れ、spec 09 と同じく今の CSP（inline script のハッシュ付き）で配って、編集・検索パネル・補完の窓が動き、CSP の違反が出ない
  (CodeMirror は `<style>` を差し込むので style-src `'unsafe-inline'` に頼る) (2) `next/dynamic` で分けたチャンクの大きさ (3) `mermaid.parse` の例外の形（flowchart・erDiagram、`hash.loc` の有無）
  (4) vitest の jsdom で CodeMirror の `EditorView` が作れ、打鍵を `dispatch` で入れられるか（部品のテストの足場）
- **P1**: D1〜D3。`CodeEditor`・色付け・和訳。テスト: 和訳のキーの網羅（6 つの dist から抽出）・`countChars` / `overwriteSpan`・字句解析の札（代表の行）・
  `CodeEditor` が値を出し、`value` の差し替えで `onChange` を出さず、読むだけで打てない・**StrictMode でも `.cm-editor` は 1 つ**・**CodeMirror が使った Esc は外へ伝わらない**・`{` は自動で閉じない。
  jsdom の Range に `getClientRects` が無いので、CodeMirror の測定が rAF の中で落ちないよう setup に最小の polyfill を置く（査読 6）
- **P2**: D4・D5。テスト: `mermaidCandidates` の表の各行・日本語の打ちかけの語の置換範囲・`toParseIssue`・**本物の mermaid での行の対応**（注釈の後・先頭の空行・erDiagram）
- **P3**: D6・D7。インポートのダイアログ・コード生成の左・古い部品と依存の撤去・台帳の追従。
  テスト（査読 6）: ダイアログが import する遅延の包み（`lazy-code-editor`）を `setup.ts` で**全体に静的に模擬**する（textarea。`placeholder` / `value` / `onChange` / `readOnly`）。
  `CodeEditor` 自身のテストだけ本物を使う。既存の `import-modal.test.tsx`・`panel-content.test.tsx`（`getByPlaceholderText(/例:/)` で打つ）・`download-modal.test.tsx`（`mermaid-highlight` を模擬）を追従させる。
  ER 図のインポートにテストが無いので 1 本足す。`MermaidPreview` の `keepLast`（描けない時に前の図を残す）
- **コミットの分け方**: フォーク元の改善だけのコミット（P1・P2・P3 をそれぞれ）。台帳は別
- **P4**: 実機 — **配布ビルド**でインポート（貼る・打つ・補完・赤線・プレビューの追従・取り込み）とコード生成（読むだけ・検索）。日本語の ID の補完で IME の確定が二重にならない。
  補完の窓・検索パネルを Esc で閉じてもダイアログは閉じない。最終行での補完・列の端の赤線の窓が切れない（査読 8）。
  Web 版（静的書き出し）でも。**`tauri dev` を動かしたままビルドしない**（failures #15）

## P0 結果（2026-09-28）

- 依存: `corepack pnpm@9 add` で `@codemirror/{state 6.7.6, view 6.43.13, commands 6.11.1, language 6.12.4, autocomplete 6.20.3, lint 6.9.7, search 6.7.2}` と `@lezer/highlight`。
  PowerShell から corepack の shim を通すと `^` が落ち、package.json には `"6"` / `"1"` と書かれた（semver では `6.x` と同じ。既存の `"@tauri-apps/api": "2"` と同じ書き方なのでこのままにする）。lock の変更は追加だけ
- (1) 捨てるページ（`next/dynamic` で分けたエディタ + mermaid）を静的書き出しにし、spec 09 と同じく今の CSP（inline script のハッシュ付き）で配った: 編集・補完の窓（日本語の候補）・Ctrl+F の検索パネルが動き、
  **CSP の違反なし・コンソールは空**。CodeMirror は `<style>` を差し込む（style-src `'unsafe-inline'` で通る）
- (2) CodeMirror は 2 つのチャンクで計 約 346 KB（圧縮前）。PoC のページの初回の読み込みは 87.5 kB（既存ページは 546 kB で変わらず）= `next/dynamic` で分かれている
- (3) `mermaid.parse` は文法の誤りで throw し、例外は `hash` を持つ（flowchart・erDiagram とも jison）: `hash.loc.first_line`（**1 始まり**）・`first_column` / `last_column`（誤りの語の範囲）・
  `hash.line`（0 始まり）・`hash.text`・`hash.token`・`hash.expected`。通る時は `{ diagramType }` を返す（flowchart は `flowchart-v2`、ER は `er`）
  → D5 は**行だけでなく誤りの語の範囲**に赤線を引ける
- (4) vitest の jsdom で `EditorView` が作れ、`dispatch` で打てて、`startCompletion` で補完が開く → 部品のテストは jsdom で書ける

## P1〜P3 結果（2026-09-28〜29）

フォーク元の改善のコミットを 2 つに分けた（`lib/desktop/` と台帳を含まない。上流へ PR で返す時に切り出せる）。
**P1 と P2 は 1 つのコミットにまとめた** — エディタ本体（`code-editor.tsx`）が補完と赤線をチャンクの中で組み立てる（D1）ので、分けると片方が単独で成り立たない。

| コミット | 中身 | テスト（Red → Green） |
|---|---|---|
| `b7ba6b7` (P1+P2) | 依存（CodeMirror 6・`@lezer/highlight`）・`code-editor.tsx`・`mermaid-language.ts`・`mermaid-completion.ts`・`mermaid-intellisense.ts`・`mermaid-parse-issue.ts`・`mermaid-render.ts` の `parseMermaid`・`editor-phrases.ts`・`editor-typing.ts`・setup（`parseMermaid` の模擬・Range の polyfill） | `code-editor.test.tsx` 14 件・`mermaid-completion.test.ts` 18 件・`mermaid-language.test.ts` 8 件・`mermaid-parse-issue.test.ts` 4 件・`mermaid-parse-lines.test.ts` 8 件（**本物の mermaid**）・`editor-phrases.test.ts` 3 件・`editor-typing.test.ts` 8 件 |
| `f9b1448` (P3) | `lazy-code-editor.tsx`・`mermaid-editor-with-preview.tsx`・2 列の枠の切り出し（`MermaidTwoPane`）・`MermaidPreview` の `keepLast`・`use-debounced-value.ts`・2 つのインポートとコード生成・撤去（部品 2・テスト 2・依存 5・README / DEVELOPMENT.md / TESTING.md）・setup（`lazy-code-editor` の模擬） | `import-modal.test.tsx` +3 件・`er-import-modal.test.tsx` 2 件（新規）・`mermaid-preview.test.tsx` +2 件・`download-modal.test.tsx`・`mermaid-code-with-preview.test.tsx` を追従 |

- **テストが守っているかの確かめ**: 和訳の表から 1 行抜く / `{` を閉じる括弧に戻す / Esc の伝播を止めない、の 3 つの仕掛けで、該当のテストがそれぞれ名指しで落ちることを見てから戻した
- **P2 で決めたこと**: 形の候補は ID の後の**空白の位置**で出し、選ぶと空白を詰める（ID を打ちかけの位置で出すと、CodeMirror が打ちかけの語で候補を絞って形が消える）。
  打ち始めずに自動で開くのは「次に書くものが決まっている位置」だけ（`auto`）。行頭で常に開くと、Enter の改行で候補を確定してしまう
- 補完のテストで、カーソルの印に `|` を使って Mermaid のラベル・多重度の `|` と取り違えた（テストの作りの誤り。印を `█` にした）
- 字句解析のテストは先に書いたが、本体の無い状態で一度も回さずに書き進めた（Red は「モジュールが無い」だけ）
- 型検査: tsconfig に target が無い（既定が古い版）ので、Set・`matchAll` の反復は `Array.from` で書く。`\p{L}` の正規表現は `new RegExp(…, "u")` で作る
- コード生成のコピーのボタンは**右下**へ移した（右上は検索パネルの閉じるボタンと重なる。spec 09 D2 の「右上」を改めた）
- 全体: vitest 67 ファイル 642 件すべて緑。未処理のエラーは 167 件（spec 08 時点 163 件、同じ 2 種類 = xyflow の `DOMMatrixReadOnly` と動的 import の競合による本物の Tauri API。
  発生元はどれも今回触っていないテストファイル。4 件の差の内訳は突き止めていない）。型検査・lint（変更したファイル）通過
- 副次的な効果: react-syntax-highlighter（Prism の全言語を抱える）を外したので、フローチャートのページの初回の読み込みが **546 kB → 316 kB**

## P4 結果（2026-09-29）

- 静的書き出し（`out/` = Web 版と同じ中身）を CSP 付きで配り、ブラウザで: ダイアログを開くまで CodeMirror は読まれず、インポートを開くと 3 つのチャンクが読まれる /
  打つと補完（文書の中のノード ID）が出て、窓は body に出る / 文法の誤りで赤線 1 件・プレビューに誤りの帯 / 描ける本文から壊すと**前の図を残したまま**帯を重ねる /
  フッタ（行・列・行数・文字数・挿入）/ **コンソールは空**（CSP の違反なし）
- **配布ビルド**（`tauri build --no-bundle`）で利用者が確認:「問題ありません」。スクリーンショットはコード生成（ER 図、読むだけのエディタ・色付け・右下のコピー・右の図）。
  インポート側のチェックリスト（IME の確定・形の補完・赤線・Esc・窓の切れ・`{`）は**利用者の一言での確認**で、個別の画面は受け取っていない

### 受け入れ条件の結果（2026-09-29）

| # | 結果 | 根拠 |
|---|---|---|
| 1 | **通過** | P4（ブラウザ・配布ビルド）。自動テスト（列・打つと少し遅れてプレビュー） |
| 2 | **通過** | 自動テスト（和訳・StrictMode・Esc・フッタと上書き・読むだけ）。P4 |
| 3 | **通過**（IME は利用者の一言） | 自動テスト（表の各行・日本語の置換範囲と `validFor`）。IME の確定は配布ビルドで利用者が「問題ありません」 |
| 4 | **通過** | 自動テスト（本物の mermaid で行の対応 8 通り・赤線）。P4 のブラウザで赤線 1 件 |
| 5 | **通過** | P4 の配布ビルド（利用者のスクリーンショット）。自動テスト（読むだけ・コピー・向き） |
| 6 | **通過** | grep（spec の記録を除いて 0 件）・依存 5 つを外した・文書 3 つを追従 |
| 7 | **通過** | 配布ビルドで描けた・P4 のコンソールが空・開くまで読み込まない。既存テストは全件緑（未処理のエラーは上の P1〜P3 結果） |

- **未了**: VRT の基準画像の更新（spec 09 と同じく、VRT を回す時に）
- **上流へ返せるコミット**（フォーク元の改善だけ）: `b7ba6b7`・`f9b1448`。PR を出すかは利用者が決める

## 受け入れ条件

1. インポートのダイアログが 90%×85% で開き、左にエディタ、右にプレビューが並ぶ。打つとプレビューが追従する
2. エディタは CodeMirror 6 で、Kataribe と同じ操作（行番号・検索の和訳・履歴・括弧・Tab・Ctrl+R を飲む・フッタと上書き）ができる
3. 補完が D4 の表のとおりに出る。日本語の ID・テーブル名を IME で打って確定しても二重にならない
4. 文法の誤りの行に赤線が出て、その文が見られる
5. コード生成の左も CodeMirror（読むだけ）で、検索できる。コピー・ダウンロード・書き出し・向きの切り替えは今どおり
6. 古い色付けの部品と依存が消え、台帳が追従している
7. 配布ビルドで CSP を緩めずに動く。Web 版でも動き、エディタはダイアログを開くまで読み込まれない。フォーク元の既存テストで落ちるものが変更前と同じ顔ぶれ

## スコープ外

- エディタで捨てられる要素の警告（裁定で外した）/ マウスを重ねた時の説明（hover）/ 定義へ飛ぶ
- flowchart / erDiagram 以外の図の色付け・補完
- コード生成で直したコードを図に戻すこと（戻すのはインポート）
- 取り込みのパーサーを mermaid.js / merman に替えること（フォーク元のパーサーのまま）
- アプリの明暗への追従

## 査読の採否（rev0 → rev1）

査読 1 本（エージェント、Kataribe と Lorelei のコード・CodeMirror / Yamada / mermaid の dist を読んだもの）。設計を変える指摘は、採る前に実物で確かめた（1: `@yamada-ui/modal` の onKeyDown、3: 本物の mermaid.parse で行のずれを実測）。

| 指摘 | 採否 | 反映 |
|---|---|---|
| 1 高: CodeMirror の Esc が伝播し、ダイアログごと閉じて本文が消える | 採る（実物で確認） | D2: 使った Esc の伝播を止める / D6: 本文がある時は Esc で閉じない / P1・P4 |
| 2 高: 全体の模擬に `parseMermaid` が無い | 採る | D5・位置の取り出しは純粋関数 `toParseIssue` |
| 3 高: 赤線の行がずれる | 採る（実測で確認: 注釈と先頭の空行のぶん前にずれる） | D5: 注釈・指示の行を空行に置き換え、先頭の空行を足し戻す。本物の mermaid で対応を確かめる。「`hash.line+1` を優先」は採らない — 実測では `loc.first_line` と常に一致し、`loc` は列の範囲も持つ |
| 4 高: `{` の自動の閉じが多重度を壊す | 採る | D3: `closeBrackets` から `{` を外す・`commentTokens` |
| 5 中: React の包みの約束 | 採る | D2 |
| 6 中: P3 のテスト改修の範囲・jsdom の Range | 採る | P1（polyfill）・P3（遅延の包みを全体に模擬、ER のインポートのテスト） |
| 7 中: 遅延読み込みの境界 / 図の種類で絞る | 採る | D1（`lazy-code-editor` だけを import）・D2（`mermaid` の prop）・D4 の 1 行目 |
| 8 中: ツールチップが枠で切れうる | 採る | D2（body に出す）・P4 |
| 9 中: 打つ途中の誤りでプレビューが消える | 採る | D6（`keepLast`） |
| 10 中: ID の文字集合を範囲表に揃える | 採らない（一部） | D4: `[\p{L}\p{N}_]` と明記。補完の置換範囲にしか使わず、検査は mermaid.parse がする |
| 11 低: 撤去の一覧の漏れ | 採る | D7 |
| 12 低: 和訳の網羅を lint・autocomplete などへ | 採る | D2（9 つの文言、6 つの dist で照合） |
