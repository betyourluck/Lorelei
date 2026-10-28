# Spec: 画面のダークテーマ

**ID**: 27
**Date**: 2026-10-29
**Status**: Draft（rev0。起票。査読・P0・裁定待ち）
**Branch**: 切らない（Phase 単位で main へ直接コミット）。spec 15〜24 と同じく、**フォーク元の改善と台帳・デスクトップはコミットを分け**、フォーク元のコミットだけで上流へ PR を出せる形にする
（フォーク元のコミットは `lib/desktop/`・`src-tauri/`・`crates/` と台帳を含まない。PR を出すかは利用者が決める, CLAUDE.md）

## Goal

利用者の言（2026-10-29）: 「UI のダークテーマが欲しい」（同じ日の 3 点の 3 つ目。1・2 は [spec 26](26_mcp-json-and-minimap.md)）。

**編集画面そのもの**（外枠・エディタ・ダイアログ）を暗い配色で使えるようにする。**図の出力の色**（Mermaid のテーマ, spec 24）とは別のもの — UI をダークにしても、書き出す SVG・PNG・PDF とコード生成のコードは変わらない。

## 現況（2026-10-29、コードとライブラリのソースを読んで確かめた）

- **yamada-ui**（`@yamada-ui/react` 1.7.7、中の core 1.17.3）は色モード light / dark / system を持つ。`useColorMode()` の `changeColorMode` で替え、**localStorage の `ui-color-mode` に覚え**、`body` に `ui-dark` / `ui-light`、`html` に `data-mode` と `color-scheme` を付ける（core の `dist/index.js` の色モードの節）。
  部品の props に `_dark`（`.ui-dark` か `[data-mode=dark]` の下で効く）を書ける。既定は light。
  `UIProvider` は `components/providers/app-providers.tsx` で設定なしに包んでいる。チラつきを止める `ColorModeScript` は入れていない
- yamada-ui の部品（Button・Modal・Input・Menu・Tabs・notice など）は dark の配色を持つ。**色を直に書いた所は変わらない**:
  - props に色の名を書いた所が **29 ファイル・69 か所**（数え方: tsx で `(bg|color|borderColor|background|fill|stroke)="…"`。テストと stories を除く）。
    多いのは `lib/desktop/title-bar.tsx` 8・`settings-dialog.tsx` 5・`document-list.tsx` 5、フォーク元の `subgraph-node.tsx` 5・`variable-name-editor.tsx` 4・`arrow-type-selector.tsx` 4・`er-editable-edge.tsx` 4 など。
    ほかに `_hover={{ bg: … }}` の形が 5 か所
  - 16 進の色が 6 か所（`editable-node.tsx:178`・`er-table-content.tsx:178` の `#1a365d`、`subgraph-node.tsx:116`、`edge-layout.ts:145` の `#ff6b6b`、`title-bar.tsx:139` の閉じるボタンの `#e53935`）
  - 線のラベル（`features/flowchart/components/edge/edge-label.module.css`, spec 23）は yamada-ui を通さず、light の計算値を写した色が 14 か所（`#fbfbfb`・`rgb(158, 163, 174)` など）
- **xyflow**（`@xyflow/react` 12.8.2）は `ReactFlow` の `colorMode`（`'light' | 'dark' | 'system'`、既定 light）で `.react-flow.dark` の CSS 変数を切り替える（背景・ミニマップ `#141414`・Controls・**既定の線 `#3e3e3e`** など）。
  今は 2 か所の `<ReactFlow>`（`flow-editor.tsx:747`・`er-diagram-editor.tsx:326`）とも渡していない
- **CodeMirror のエディタ**（`components/ui/code-editor.tsx`、インポートとコード生成）は今も常に暗い配色（VS Code Dark+）
- **Mermaid のプレビュー**の背景は図のテーマで決まる（spec 24 D5: dark は `#333`、ほかは白, `components/ui/mermaid-theme.ts`）。これは出力の見た目なので UI の色に合わせない
- デスクトップの窓は隠したまま起動し、外枠が描けたら出す（spec 05 D5）。設定の入口はタイトルバーの「● MCP」だけ（spec 02 D12 の追記で歯車を外した）
- 表示の記憶は WebView の localStorage に置く先例がある（`lib/desktop/pane-layout.ts`）

## 決めること

### D1. 選べる色

- **推奨: ライト・ダーク・OS に合わせる の 3 つ。既定はライト**（今と同じ見た目で始まる）。yamada-ui の light / dark / system にそのまま写す。
  「OS に合わせる」は OS の切り替えに追従する（yamada-ui が `prefers-color-scheme` を見る）

### D2. デスクトップの切り替えの置き場所

- **案 A（推奨）: タイトルバーに切り替えのボタン**（「?」の左。今の色のアイコン（太陽・月・画面）、押すと 3 つを選ぶメニュー）。
  設定の入口が「● MCP」だけなので、設定画面に置くと **MCP のボタンを押さないと見つからない**
- 案 B: 設定画面に「外観」の節を足し、タイトルバーに歯車を戻して入口にする — spec 02 D12 の追記（歯車を外した）を改めることになる
- 案 C: 設定画面に「外観」の節を足すだけ（入口は「● MCP」のまま） — 見つけにくい

### D3. Web 版

- **案 A（推奨）: 暗い配色はフォーク元の部品に書く（上流へ返せる）が、Web 版には切り替えを出さない**（Web 版は今のまま light に固定）。デスクトップの切り替えは `lib/desktop/`。
  Web 版の見た目と操作は変わらない
- 案 B: Web 版にも切り替えを出す（フォーク元の右上のパネルの横など）— 上流へ返す改善としては揃うが、Web 版の画面が変わる。案 A の後に足せる

### D4. 暗い配色の値の決め方（P0 で決める）

- 推奨の方向: 直に書いた色の名を、**light と dark の 2 つの値を持つ名（yamada-ui の theme を広げた semantic token）にまとめる**（例: 面・一段沈んだ面・枠線・弱い文字）。
  所ごとに `_dark` を書くより、同じ役目の所が同じ色にそろい、ライトの値は今と同じに置ける。値は yamada-ui の dark の既定（部品の地の色）に合わせる。
  P0 で 69 + 5 + 6 か所の表（ファイル・行・役目・ライトの今の値・ダークの値の案）を作り、名の数を決める
- 線のラベルの CSS Modules は `:global(.ui-dark)` の下で色を替える（yamada-ui を通さない形は spec 23 のまま）

### D5. キャンバス（xyflow）

- **推奨: `colorMode` を yamada-ui の解決した色（OS に合わせる時は OS の色）に合わせて渡す**（2 か所の `<ReactFlow>`）。背景・ミニマップ・Controls は xyflow の dark に任せる。
  線は今の部品が色を持つか、xyflow の既定の `#3e3e3e`（暗い背景に近い）に落ちるかを P0 で確かめ、読めなければ線の色を D4 の名に入れる

### D6. 変えないもの

- CodeMirror のエディタ（今も暗い）・Mermaid のプレビューの中（図のテーマの色）・書き出しとコード生成の出力

### D7. チラつき

- デスクトップは窓を隠して起動するので、外枠が描けるまでに色が入れば見えない見込み（P0 で確かめる）。Web 版は D3 案 A なら light に固定なので起きない

## P0（下調べ。実装の前）

1. 色を直に書いた所の全部の表（D4）。`_hover` などの形・16 進・CSS Modules・`style={{…}}` も拾い、数え方を書く
2. Web 版の画面（`web-dev`）で、`ColorModeScript` を入れず yamada-ui を dark にし xyflow に `colorMode="dark"` を渡した**試しの姿**を撮る: 白く残る面・読めない文字・線・枠のノード・線のラベル・ダイアログ
3. yamada-ui の dark の地の色・文字の色の実際の値（計算されたスタイル）
4. ライトの見た目が前と同じであることの確かめ方（spec 23 と同じく計算されたスタイルを前後で比べる）

## 受け入れ条件（案。P0 の後に改める）

1. ダークにすると、タイトルバー・ツールバー・図の一覧・2 つのエディタ（キャンバス・ノード・枠・線・線のラベル・ミニマップ・Controls）・ダイアログ（設定・インポート・コード生成・削除の確認）が暗い配色になり、**白い面が残らない**（Mermaid のプレビューの中の図の背景を除く）
2. 本文の文字と背景のコントラストが 4.5:1 以上（P0 の表の組で測る）
3. 選んだ色を窓を閉じて開いても覚える。「OS に合わせる」は OS の切り替えに追従する
4. **ライトの見た目は今と同じ**（計算されたスタイルで前と一致）
5. Web 版は今と同じ（D3 案 A の時）
6. テスト（vitest）: 切り替えと覚え・xyflow に渡す色。要の分岐を壊して落ちる

## Phase（案）

- **P0**: 上の下調べ → 裁定
- **P1**: フォーク元の部品の暗い配色と xyflow の `colorMode`（フォーク元の改善のコミット）→ Web 版の画面で、試しに dark にして確かめる
- **P2**: デスクトップの切り替えと外枠（`lib/desktop/`）の色 → `tauri dev`
- **P3**: 配布ビルドで利用者が確かめる

## スコープ外

- 図の出力の色（spec 24 のテーマ）を UI の色に合わせること
- ライト・ダーク以外の配色（ハイコントラストなど）
