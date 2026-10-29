# Spec: 画面のダークテーマ

**ID**: 27
**Date**: 2026-10-29
**Status**: **Done** — rev1（起票 → P0 着地（「P0 結果」）→ 裁定（「裁定」、推奨どおり）→ P1 着地（「P1 結果」、フォーク元 `5c20d15`）→ P2 着地（「P2 結果」、`faf1d07`）→ P3（「P3 結果」、配布ビルドで利用者が「問題なし」））
**Branch**: 切らない（Phase 単位で main へ直接コミット）。spec 15〜24 と同じく、**フォーク元の改善と台帳・デスクトップはコミットを分け**、フォーク元のコミットだけで上流へ PR を出せる形にする
（フォーク元のコミットは `lib/desktop/`・`src-tauri/`・`crates/` と台帳を含まない。PR を出すかは利用者が決める, CLAUDE.md）

## Goal

利用者の言（2026-10-29）: 「UI のダークテーマが欲しい」（同じ日の 3 点の 3 つ目。1・2 は [spec 26](26_mcp-json-and-minimap.md)）。

**編集画面そのもの**（外枠・エディタ・ダイアログ）を暗い配色で使えるようにする。**図の出力の色**（Mermaid のテーマ, spec 24）とは別のもの — UI をダークにしても、書き出す SVG・PNG・PDF とコード生成のコードは変わらない。

## 裁定（2026-10-29、利用者。P0 の後）

**推奨どおり**（「推奨どおりで P1」）。

- **D1** — ライト・ダーク・OS に合わせる の 3 つ。既定はライト
- **D2: 案 A** — デスクトップはタイトルバーに切り替え（P2）
- **D3: 案 A** — 暗い配色はフォーク元の部品に書くが、Web 版には切り替えを出さない（light のまま）
- **D4** — ライトの値ごとに 1 つの名（23）を yamada-ui の semantic token に足す（data_contract `UiColorTokens`）。dark の値は P0 の表の案から始め、P1 で画面とコントラストを見て決める。線のラベルの CSS Modules は yamada-ui の CSS 変数で読む
- **D5** — `colorMode` を渡し、dark の線の色を足す
- **D6・D7** — rev0 のまま（D7 は P2・P3 で確かめる）
- 受け入れ条件 2・4 を P0 の推奨のとおり改めた（下）。測りの台本は P1 で `scripts/` に入れる

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

## P0 結果（2026-10-29、`9048616` の作業場所。コードは変えていない）

確かめた道具: フォーク元と `lib/desktop` の grep、yamada-ui（theme 1.20.6・core 1.17.3）と xyflow 12.8.2 の `dist` のソース、Web 版（`web-dev`）を裏の Edge（Playwright の `channel: "msedge"`・headless・使い捨てのプロファイル・1280×800）で回す台本。
台本・記録・撮った画面は scratchpad の `spec27-p0/`（`light-snapshot.mjs`・`compare.mjs`・`agg.mjs`）。

### 1. 試しの dark の姿（P0 の 2）

コードを変えずに、yamada-ui は覚えた色モード（localStorage の `ui-color-mode` を `dark`）で、xyflow は `.react-flow` の class を `light` → `dark` に替えて dark にした
（xyflow は `colorMode` を渡さなくても `light` の class を付けるので、`dark` を足すだけでは足りず、`light` を外す）。
**デスクトップの外枠**（`lib/desktop`）は `isTauri()` の時だけ描かれるので、**偽の `__TAURI_INTERNALS__`**（図の一覧 3 件・MCP は待ち受け中を返し、図の中身は空 = 初期図で開く）を差し込んで、同じ Edge で描かせた。

- **yamada-ui の部品は dark で読める**: ダイアログ（インポート・コード生成・設定・削除の確認）の地 `#141414`・文字 `#fbfbfb`、メニュー、入力欄、タブ、チェックボックス、色付きのボタン。CodeMirror は今も暗く、Mermaid のプレビューの中は白（D6 のとおり）
- **白い面が残り、その上の文字が白で読めない**（文字は `body` の色を継ぐので `#fbfbfb` になる）:
  - ノード（フローチャート・ER 図のテーブル）の面と、その中のラベル・ER 図の列の入力欄の文字（比 1.0）
  - 線のラベル（CSS Modules の `#fbfbfb`）の文字（比 1.0）、矢印のメニュー・枠の向きのメニュー
  - Web 版の左上のパネルの面（題・「フローチャートエディタ」のボタンの文字が比 1.0〜1.02）
  - デスクトップのツールバーの面（「ER図」「枠を追加」「コード生成」「インポート」「確定」の文字が比 1.02）、タイトルバーと図の一覧（`gray.50` の面に白、比 1.21〜1.29）
- **選んでいる項目の面**（`primary.50`・`blue.50`・`blue.100`）は dark でも淡い青のままで、白い文字が比 1.14〜1.29（テーマ・向き・枠の向きのメニュー、図の一覧の開いている図）
- **ノードの縁 `#1a365d`**（紺）は暗い地で比 1.52 で見えない。**線**は xyflow の dark の既定 `#3e3e3e` で、地 `#141414` に比 1.72（ライトの今の線 `#b1b1b7` も地に 2.06 と薄い）
- **弱い文字**（`gray.500`・`gray.600`）は dark の地で比 2.74〜3.81（インポートの説明・設定画面の説明）。**枠**の面 `rgba(255, 255, 222, 0.45)` は暗い地に重なってくすんだ黄土色（`rgb(126, 126, 111)`）になり、ID の `S1`（`gray.500`）が比 1.17
- 文字のコントラストの数（台本の `contrast`: 文字を直に持つ要素ごとに、文字の色と祖先の背景を重ねた色の比。CodeMirror と SVG の中を除く。要素の `opacity` は見ない近似）:

| 場面（場面ごとの延べ） | 文字の数 | ライト 4.5 未満 / 3 未満 | 試しの dark 4.5 未満 / 3 未満 |
| --------------------- | -------: | -----------------------: | ----------------------------: |
| Web 版 12 場面の合計  |      329 |                103 / 20 |                     195 / 142 |
| デスクトップ 5 場面   |      148 |                 27 / 10 |                       77 / 63 |

  ライトで 4.5 未満の多くは **yamada-ui の色付きのボタンの白い文字**（`blue.500` の上で 3.38、`green` 3.25、`purple` 3.82、`red` 3.79）と、ノードの ID の札（`[A]` など、3.38）、
  「枠を追加」の黄色の枠線のボタン（2.44）、xyflow の「React Flow」の印（2.8）、未確定の ●（`blue.500` が `gray.50` の上で 2.62）。これらは今の見た目のまま

撮った画面（dark の試し）: `spec27-p0/trial/` の 1〜5（デスクトップ・フローチャート・ER 図・コード生成のダイアログのテーマのメニュー・設定画面）

### 2. 直に書いた色の表（P0 の 1、D4）

**数え方**: `app` `components` `features` `lib` の `.tsx` `.ts` `.css`（テスト・stories を除く 111 ファイル）で、
色の props（`bg` `bgColor` `color` `borderColor` `border="… #…"`・`_hover` などの中の `bg` `color`）・16 進・`rgb(a)`・CSS Modules の色の値を拾い、色の名の値で役目に分けた。
rev0 の「29 ファイル 69 か所」は `bgColor` と `border="2px solid #…"` の形を落としていた。

| 役目                                   | ライトの今の値                                                    |  か所 | 所（ファイル:行）                                                                                                                                                                                                                                                                                                                                                                                       | dark の値の案（P1 で画面を見て決める）                                     |
| -------------------------------------- | ----------------------------------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| A. 面                                  | `white`（`#fbfbfb`）                                              |    15 | `toolbar.tsx:39`、`flow-panel.tsx:66`、`er-diagram-panel.tsx:68`、`editable-node.tsx:177`、`er-table-content.tsx:177`、`subgraph-node.tsx:102`（題の入力欄）、`editable-edge.tsx:128`、`er-editable-edge.tsx:62・72`、`arrow-type-selector.tsx:92・98・103`、`variable-name-editor.tsx:66`、`edge-label.module.css:21・46`                                                                     | `gray.900`（`#1c1e21`。地 `#141414` より一段明るい）                       |
| B. 一段沈んだ面・マウスを乗せた面      | `gray.50`・`gray.100`・`gray.200`                                 |     6 | `title-bar.tsx:64`、`document-list.tsx:46`（面）、`document-list.tsx:74`・`title-bar.tsx:139`・`arrow-type-selector.tsx:95`・`edge-label.module.css:69`（乗せた時）                                                                                                                                                                                                                                       | `gray.800`（`#2e3138`）・乗せた時 `gray.700`                               |
| C. 線・仕切り                          | `gray.200`・`gray.300`（`rgb(158, 163, 174)`）                    |    13 | `gray.200`: `document-list.tsx:48`、`title-bar.tsx:66・115`、`toolbar.tsx:41・56`、`arrow-type-selector.tsx:98`、`pane-splitter.tsx:54` / `gray.300`: `arrow-type-selector.tsx:94`、`editable-edge.tsx:130`、`er-editable-edge.tsx:64・78`、`edge-label.module.css:19・44`                                                                                                                                | `gray.700`（`#434851`）・`gray.600`（`#565c67`）                           |
| D. 弱い文字                            | `gray.500`・`gray.600`・`gray.700`                                |    21 | `gray.500`: 2 つの `import-modal.tsx`（`:151`・`:121`）、`subgraph-node.tsx:166・217・242`、`desktop-shell.tsx:189`、`document-list.tsx:78・117`、`settings-dialog.tsx:134・243` / `gray.600`: 2 つの `import-modal.tsx`（`:144`・`:114`）、`er-diagram-panel.tsx:81`、`flow-panel.tsx:79`、`frame-direction-menu.tsx:38`、`import-dialog.tsx:82`、`settings-dialog.tsx:83`、`title-bar.tsx:76・106・138` / `gray.700`: `arrow-type-selector.tsx:104` | `gray.400`・`gray.300`・`gray.200`（地 `#141414` で 5.24・7.28・それ以上） |
| E. 強い文字                            | `black`・`rgba(0, 0, 0, 0.8)`                                     |     2 | `variable-name-editor.tsx:67`、`edge-label.module.css:47`                                                                                                                                                                                                                                                                                                                                               | `white`・`whiteAlpha.800`                                                  |
| F. 選んでいる・強調                    | `primary.50` = `blue.50`（`#e2edfd`）・`blue.100`・文字 `blue.600`・`blue.500` | 10 | 面: `shape-selector.tsx:23`、`direction-menu.tsx:45`、`frame-direction-menu.tsx:55`、`theme-menu.tsx:34`、`arrow-type-selector.tsx:103`、`document-list.tsx:73・74` / 文字: `arrow-type-selector.tsx:104`、`document-list.tsx:107`（●）、`edge-label.module.css:29`（矢印の記号）                                                                                                                 | 面 `blue.900`（白い文字で 11.18）・`blue.800`（8.16）、文字 `blue.300`・`blue.400` |
| G. 知らせの文字                        | `orange.600`・`orange.700`・`red.600`、× の `red.300`・`red.50`    |     9 | `er-diagram-mermaid-modal.tsx:66`、`download-modal.tsx:99`、`settings-dialog.tsx:102・159`、`title-bar.tsx:81・88`、`edge-label.module.css:77・78・82`                                                                                                                                                                                                                                                    | `orange.300`・`red.300`（地で 9.87・7.76）、× の乗せた時 `red.900`         |
| H. 図の部品                            | ノードの縁 `#1a365d`、枠の面と縁、線（xyflow の既定 `#b1b1b7`）     | 4 + 線 | `editable-node.tsx:178`、`er-table-content.tsx:178`（縁）、`subgraph-node.tsx:115・116`（枠の面・縁 `#aaaa33` / 選んだ時 `#8a8a1f`）                                                                                                                                                                                                                                                                  | 縁 `blue.200`（11.14）、枠の面は淡い黄の薄い重ね・縁は今のまま、線は地で 3 以上（`gray.500` で 3.81） |
| I. 両方で今のままでよい                |                                                                   |    14 | `variable-name-editor.tsx:40・41・49`（ID の札の `blue.500` と白）、`pane-splitter.tsx:54〜56`（つまみの `blue.400`）、`title-bar.tsx:34〜39`（MCP の点）・`:139`（閉じるの `#e53935`）、`edge-label.module.css:73・87`（フォーカスの輪）、`contribution-panel.tsx:26〜28`（Web 版の右上、`gray.600` の地）、`edge-layout.ts:145`（循環の線の色。既定で使わない）  | —                                                                          |

- **変えないもの（D6）**: `code-editor.tsx` の VS Code Dark+ の色（30 余り）、`lazy-code-editor.tsx:16`（読み込み中の地。CodeMirror と同じ `#1e1e1e`）、`copy-button.tsx`（CodeMirror の上のボタン）、
  `mermaid-preview.tsx`・`mermaid-code-with-preview.tsx`・`mermaid-editor-with-preview.tsx:104`・`mermaid-theme.ts`（プレビューの中と、その上の案内）。`colorScheme` の props（25 か所ほど）は yamada-ui が dark の値を持つ
- **名の数**: ライトの今の値を変えないには、役目が同じでも**ライトの値ごとに 1 つの名**が要る（A 1・B 3・C 2・D 3・E 2・F 4・G 5・H 3 で **23**）。表の所は合わせて 94（`document-list.tsx:74`・`pane-splitter.tsx:54` は 2 つの役目に数えた）。
  所ごとに `_dark` を書くと 80 か所ほどに散り、同じ役目の所の dark の値がそろう保証が無い
- **yamada-ui は色の名を CSS 変数で出している**（`--ui-colors-border`・`--ui-colors-muted`・`--ui-colors-primary-50` など、Web 版の画面で 311 個）。
  semantic token に足した名も変数になる見込みなので、**線のラベルの CSS Modules は `var(--ui-colors-…)` で両方の色に追従できる**（rev0 の `:global(.ui-dark)` は要らない見込み。P1 で確かめる）
- yamada-ui の dark の値（ソース）: `body` の地 `black` = `#141414`・文字 `white` = `#fbfbfb`、Modal・Menu・Popover・Tooltip の地も `black`、枠線の名 `border` は `["#dcdcde", "#434248"]`、`muted` は `["#656565", "#b3b3b3"]`。
  **`primary` などの semantic の色は 1 つの値**（`primary.50` は dark でも `#e2edfd`）なので、F は名を足さないと直らない

### 3. D5（xyflow）・D7（チラつき）

- **D5**: xyflow の dark の地は `#141414` で、**yamada-ui の dark の地と同じ値**（キャンバスとダイアログの地がそろう）。ミニマップ（`#141414`・ノード `#2b2b2b`）・Controls（`#2b2b2b`・文字 `#f8f8f8`）・点の模様（`#777`）は読める。
  **線は xyflow の dark の既定 `#3e3e3e` では比 1.72 で読めない** → 線の色を H の名に入れる（`--xy-edge-stroke` を dark の時だけ替える）。xyflow の dark のノードの既定（`#1e1e1e`）は既定の型のノードだけに効き、今のノードは自前なので効かない
- **D7**: yamada-ui は覚えた色モードを `useState` の初めに読み、`body` の class を**プロバイダの effect** で付ける。デスクトップの外枠は `DesktopShell` の effect で `isTauri()` を見た**次の描画**で `Shell` を差し込み、その effect で窓を出す（`desktop-shell.tsx:46-49`）。
  プロバイダの effect は最初の描画の後に走るので、**窓を出す時には class が付いている**見込み（`disableTransitionOnChange` は既定で真）。P2 の `tauri dev` と P3 の配布ビルドで確かめる。Web 版は D3 案 A なら light に固定で起きない
- 「OS に合わせる」: WebView2 の `prefers-color-scheme` が Windows のアプリの色に追従するかは見ていない（P2 で）

### 4. ライトが前と同じかの測り（P0 の 4）

- **台本**（`light-snapshot.mjs`）: Web 版 12 場面（フローチャートの最初・インポートのダイアログ・取り込んだ後・矢印のメニュー・枠の向きのメニュー・コード生成のダイアログ・テーマのメニュー・削除の確認、ER 図の最初・インポート・取り込んだ後・コード生成）と、
  偽の Tauri でデスクトップ 5 場面（外枠・設定画面・設定画面の JSON のタブ・インポートのダイアログ・コード生成のダイアログ）で、
  全部の要素の計算されたスタイル 26 項目（色・背景・4 辺の枠の色と太さ・影・輪郭・`fill`・`stroke`・`opacity`・`color-scheme`・字の大きさと太さ・`display` など）と位置・大きさ、入力欄の `::placeholder` の色、画素を記録する
- **揺れの床**（`9048616` で 2 回ずつ回して比べた）: Web 版 180,399 項目のうち違いは 6 項目（CodeMirror の行番号の位置の 0.1px）、デスクトップ 64,966 項目は 0。
  画素はキャンバスの場面が差 0、**ダイアログの場面は同じコードで 1,200〜4,700 画素揺れる**（Mermaid のプレビューかダイアログの出方。突き止めていない）→ 画素はキャンバスの場面だけで見る
- **今（`9048616`）の記録**を `spec27-p0/base-1`・`desk-1` に取ってある（P1・P2 の前の基準。失っても `9048616` で回し直せば同じものが取れる）
- 同じ台本の `TRIAL_DARK=1` で、dark のコントラストを場面ごとに数えられる（上の表）。P1 で台本を `scripts/` に入れるかは裁定で

## 裁定を仰ぐこと（P0 を受けて）

- **D2（デスクトップの切り替えの置き場所）**・**D3（Web 版に切り替えを出すか）**: P0 で変わったことは無い。推奨は rev0 のまま（D2 案 A: タイトルバー、D3 案 A: Web 版は light に固定）
- **D4**: 推奨は rev0 の方向のまま、**ライトの値ごとに 1 つの名（23）を yamada-ui の theme の semantic token に足す**。dark の値は上の表の案から始め、P1 で画面とコントラストの数を見て決める。線のラベルの CSS Modules は yamada-ui の CSS 変数で読む
- **D5**: `colorMode` に加え、**dark の線の色を足す**（xyflow の既定では読めない）
- **受け入れ条件 2 を改める**（推奨）: 「本文 4.5:1」は、ライトでも yamada-ui の色付きのボタンが 3.25〜3.82 なので、そのままでは満たせない。
  → 「dark の文字のコントラスト比は 4.5 以上、またはライトの同じ文字の比以上（CodeMirror と Mermaid のプレビューの中を除く）。測りは P0 の台本」
- **受け入れ条件 4 を改める**（推奨）: → 「ライトの計算されたスタイルが `9048616` の記録と一致する（揺れの床の 0.1px を除く）。画素はキャンバスの場面で差 0」
- 測りの台本（偽の Tauri を含む）を P1 で `scripts/` に入れる（推奨。デスクトップの外枠を `tauri dev` なしで描けるので、P2 の確かめにも使える）

## P1 結果（2026-10-29、フォーク元 `5c20d15`・台本 `19b9cec` `326f3f6`）

- **入れたもの**（フォーク元の改善。`lib/desktop/` と台帳を含まないコミット = 上流へ返せる）:
  - `components/providers/theme.ts` の `COLOR_TOKENS`（23 の名、`[ライト, dark]`）と `theme`（`extendTheme({ semantics: { colors } })()`）。`AppProviders` が `UIProvider` に渡す
  - フォーク元の部品の直に書いた色 48 か所を色の名に（P0 の表の A〜H のうちフォーク元の分。I は今のまま）。ノードの縁は `border="2px solid #1a365d"` を `border="2px solid"` + `borderColor="nodeBorder"` に分けた
  - 線のラベルの CSS Modules は `var(--ui-colors-surface)` などで読む（yamada-ui は semantic token を `--ui-colors-<名>` に出し、名の camelCase はそのまま。dark では `.ui-dark` などの下で値が替わる）
  - `components/layout/use-canvas-colors.ts` の `useCanvasColors()`: yamada-ui の解決した色モードを 2 つの `<ReactFlow>` の `colorMode` に渡し、`--xy-edge-stroke` を `var(--ui-colors-edgeStroke)` にする
  - **dark の値は data_contract の始まりの案のまま**、枠の面だけ重ねの濃さを 0.1 → 0.06 にした（0.1 では枠の ID「S1」（`textCaption` = `gray.400`）が 4.16 で受け入れ条件 2 を満たさず、0.06 で 4.63）
- **`AppProviders` を client component（`"use client"`）にした**: server component のまま `extendTheme` を呼ぶと、vitest は緑のまま `next dev` のページが描けず、`next build` も「Cannot access semantics.colors on the server」で落ちた（failures #48）
- **テスト**（先に書いて落ちるのを見てから実装）: `__tests__/components/providers/` に 3 ファイル 11 件と `app-providers.test.tsx` に 1 件（spec 26 の時の 1173 件から 1185 件へ）
  - `theme.test.ts`: 23 の名がそろい、ライトの値は置き換える前の値そのもの・dark はどれもライトと違う・yamada-ui の既定の名（`primary`・`muted`）が残る
  - `canvas-color-mode.test.tsx`: 2 つのエディタで、色モード light / dark が xyflow の class になる・線の色を `var(--ui-colors-edgeStroke)` で読む
  - `no-direct-colors.test.ts`: `app` `components` `features` に直に書いた色が残っていない（D6 のファイルと P0 の表の I を許しの一覧で除く。許しの一覧の所がコードに残っていることも見る）。直す前は 48 か所を挙げて落ちた
  - **要の分岐を 1 つずつ壊すと 7 つとも落ちた**（ライトの値を変える・dark をライトと同じに・色モードを渡さない・線の色を渡さない・部品に直の色を戻す・CSS に直の色を戻す・テーマを渡さない）
  - vitest の全部（102 ファイル 1185 件）が緑で終了コード 0（ほかに何も回さない時。開発サーバーや整形の確かめを同時に回した 2 回は、重いテスト 2〜4 件が 15〜20 秒の時間切れで落ち、単独では通った — failures #3 の形）。`tsc` 0 件、eslint 0。整形は HEAD で整形済みのファイルと新しいファイルにかけた（failures #23）
- **実物**（Web 版、`web-dev` を裏の Edge で。`scripts/ui-style-snapshot.mjs`・`ui-style-compare.mjs`）:
  - **ライト（受け入れ条件 4）**: 直す前（`19b9cec` の作業場所でフォーク元の変更を外して取った記録）と比べ、Web 版 12 場面 180,399 項目・デスクトップ 5 場面 64,966 項目の計算されたスタイルが**全部同じ**。
    画素はキャンバスの場面が差 0、ダイアログの場面は 0〜2,335（同じコードどうしの揺れ 2〜4,543 の中）
  - CSS 変数: ライトは `surface` `#fbfbfb`・`lineStrong` `#9ea3ae`・`textAlpha` `rgba(0, 0, 0, 0.80)`・`edgeStroke` `#b1b1b7` など前の値、dark は `#1c1e21`・`#565c67`・`rgba(255, 255, 255, 0.80)`・`#6b7280`。`.react-flow` の class は `light` / `dark` が色モードに従う
  - **dark の文字（受け入れ条件 2）**: Web 版 12 場面で、4.5 にもライトの比にも届かない文字が **0**（ノードのラベル・線のラベル・パネル・メニューの選んでいる項目・ER 図の列の入力欄・ダイアログ）
  - **dark の面（受け入れ条件 1 のフォーク元の分）**: ノード・枠・線・線のラベル・パネル・メニュー・ER 図のテーブル・ミニマップ・Controls に白い面が残らない（撮った画面を見た）。Mermaid のプレビューの中は白（D6）
  - デスクトップ 5 場面の dark で満たさないのは**外枠（`lib/desktop`）の文字だけ**: タイトルバー・ツールバー・図の一覧（`gray.50` や `white` の面に白い文字、1.02〜1.29）、設定画面とインポートの説明（`gray.600` 2.74・`gray.500` 3.81）→ P2
  - 静的書き出し（`TAURI_ENV_PLATFORM` 付きの `next build`）は通り、`docs/` は書き換わらない
  - 台本の要素の名を兄弟の番号で作っていたので、Next が差し込む script の数が変わると番号がずれた（failures #49。`326f3f6` で script・style などを数えない形に）
- 撮った画面と記録は scratchpad の `spec27-p1/`（`after-web-dark/` など）
- **P2 で残るもの**: `lib/desktop` の色（タイトルバー・ツールバー・図の一覧・つまみ・設定画面・インポートのダイアログ・外枠の案内の文字。P0 の表の `lib/desktop` の所。`surfaceSubtle*`・`selectedStrong`・`accent`・`warningText`・`dangerText` はここで使う）、
  タイトルバーの切り替え（D2）、見張りのテストを `lib/desktop` にも広げる、D7（窓を出す時に色が付いているか）と「OS に合わせる」の追従

## P2 結果（2026-10-29、`faf1d07`・台本 `0cdd502`）

- **入れたもの**（デスクトップ専用のコミット。フォーク元のファイルは触っていない）:
  - `lib/desktop/color-mode-menu.tsx` の `ColorModeMenu`: タイトルバーの「?」の左のボタン（アイコンは選んでいる色: 太陽・月・画面、`aria-label`「画面の色: <色>」）。
    押すとメニュー「ライト」「ダーク」「OS に合わせる」（選んでいる項目は `selected` の地）。選ぶと yamada-ui の `changeColorMode`（`ui-color-mode` に覚える）。
    ボタンの形はタイトルバーの他のボタンと同じ（`BAR_BUTTON` を共有）。data_contract `UiColorMode` の `control.desktop`・`window_show`
  - 外枠の直に書いた色 27 か所を色の名に（タイトルバー・ツールバー・図の一覧・つまみ・設定画面・インポートのダイアログ・外枠の案内の文字）。MCP の点・閉じるボタンの赤・つまみの青は今のまま（P0 の表の I）
  - LORELEI.md に「画面の色」の節（図の出力の色とは別であること）
- **テスト**: `__tests__/lib/desktop/color-mode-menu.test.tsx` 6 件（既定はライト・ダークを選ぶと暗くなり覚える・覚えた色で始まる・OS に合わせるは `system` を覚え OS が暗ければ暗い・ライトに戻す・「Lorelei について」の左に置く）、
  `no-direct-colors.test.ts`（外枠。許しの一覧の文字を行から除いた残りを見る）2 件、`desktop-shell.test.tsx` に D7 の 1 件。先に書いて、メニューの部品が無い・直の色 27 か所で落ちるのを見てから実装した。
  **D7 のテストは最初から緑**（コードの順が D7 の見込みどおり: yamada-ui のプロバイダの effect が body に class を付け、その後の描画で外枠が窓を出す）。
  **要の分岐を 1 つずつ壊すと 6 つとも落ちた**（選んでも替えない・解決した色で名乗る・「?」の右に置く・タイトルバーに直の色・許した行の残りに直の色・色の class より先に窓を出す（= D7 のテストが落ちる））。
  vitest の全部（104 ファイル 1194 件）が緑で終了コード 0、`tsc` 0 件、eslint 0
- **台本で測った**（Web 版の開発サーバーを裏の Edge で。デスクトップの外枠は偽の Tauri）:
  - 色だけ替えた段（切り替えを足す前）: デスクトップ 5 場面のライトの計算されたスタイル 64,966 項目が P1 の後と**全部同じ**、dark の文字は 5 場面で満たさないもの **0**
  - 切り替えを足した後: ライトの違いは**全部タイトルバーの中**（ボタンが 1 つ増え、右の要素が 44px ずれた分。タイトルバーの外の違い 0、画素の違いも x 1003〜1086・y 9〜22 だけ）。
    dark の文字は 6 場面（メニューを開いた所を含む）で満たさないもの **0**
  - Web 版 12 場面は P1 の後と計算されたスタイルが全部同じで、切り替えのボタンは出ない（受け入れ条件 5）
- **実物**（`tauri dev`、computer-use で開発版の窓を操作。許可は `"lorelei.exe"`, failures #45）:
  タイトルバーのボタンでメニューが出て、「ダーク」で外枠・キャンバス・ノード・線・線のラベル・図の一覧が暗くなった。**窓を閉じて開き直しても暗いまま始まった**。
  「OS に合わせる」は、Windows のアプリの色がダーク（`AppsUseLightTheme` = 0）の今、暗いまま（アイコンは画面）。最後にライトへ戻して閉じた
  - **見ていないこと**: OS の色を切り替えた時に追従するか（システムの設定を変えることになるので、こちらでは試していない → P3 で利用者に）。
    起動直後に明るい画面が一瞬見えないか（D7）は、窓が出る瞬間を撮れず目では見ていない（上のテストとコードの順で確かめた）→ P3 で利用者に
- 撮った画面と記録は scratchpad の `spec27-p2/`（`menu-desk-dark/`・`tauri-dev-dark.jpg`）

## P3 結果（2026-10-29、配布ビルド）

- `tauri build --no-bundle`（`20d35bd` の作業場所。`docs/` は書き換わらず、`out/` の chunk に「画面の色」「OS に合わせる」と色の名が入っていることを確かめた）を、利用者が次の手順で確かめ、**「問題なし」**:
  - A. 最初はライトで今までと同じ見た目 → 「ダーク」でタイトルバー・ツールバー・図の一覧・キャンバス・ノード・線・線のラベル・ミニマップが暗くなり読める →
    設定・インポート・コード生成（テーマのメニュー）・削除の確認・矢印のメニュー・ER 図も暗い配色で読める → ダークのまま閉じて開き直すと暗いまま始まり、開いた直後に明るい画面が一瞬見えないか（D7）を見る
  - B. 「OS に合わせる」で今の Windows のアプリの色（ダーク）に合う。Windows のアプリ モードをライトに切り替えて追従するかは**任意の手順**として頼んだ
  - C. ライトに戻して今までと同じ見た目
- これで受け入れ条件 1〜6 を通過とした。ただし**受け入れ条件 3 の後半（「OS に合わせる」が OS の切り替えに追従する）は、手順 B の切り替えを任意にしたので、確かめたかは聞いていない**（未確認として残す。
  今の OS の色に合うことは P2 の `tauri dev` と P3 で確かめた）。D7 は P2 のテストと、手順 A の目視（利用者の「問題なし」）
- README・README.ja の画面の色の案内は、spec 26 の JSON のタブと同じく次の版を出す時に足す（LORELEI.md には P2 で書いた）

## 受け入れ条件（rev1。2・4 を P0 の後に改めた）

1. ダークにすると、タイトルバー・ツールバー・図の一覧・2 つのエディタ（キャンバス・ノード・枠・線・線のラベル・ミニマップ・Controls）・ダイアログ（設定・インポート・コード生成・削除の確認）が暗い配色になり、**白い面が残らない**（Mermaid のプレビューの中の図の背景を除く）
2. dark の文字のコントラスト比は **4.5 以上、またはライトの同じ文字の比以上**（ライトで既に 4.5 未満のもの = yamada-ui の色付きのボタンの白い文字など、は今の見た目のまま）。CodeMirror と Mermaid のプレビューの中を除く。測りは P0 の台本（`scripts/`）
3. 選んだ色を窓を閉じて開いても覚える。「OS に合わせる」は OS の切り替えに追従する
4. **ライトの見た目は今と同じ**: 計算されたスタイルが `9048616` の記録と一致する（揺れの床の 0.1px を除く）。画素はキャンバスの場面で差 0
5. Web 版は今と同じ（切り替えは出ない。light のまま）
6. テスト（vitest）: 切り替えと覚え・xyflow に渡す色・直に書いた色が残っていないこと。要の分岐を壊して落ちる

## Phase

- **P0**: 下調べ → 裁定（済み）
- **P1**: `components/providers/theme.ts` の色の名・フォーク元の部品の直に書いた色の置き換え・2 つの `<ReactFlow>` の `colorMode` と線の色・線のラベルの CSS Modules（**フォーク元の改善のコミット**）。
  測りの台本を `scripts/` に入れる（別のコミット）。→ Web 版で、ライトが `9048616` と一致し、試しの dark（覚えた色モードを dark にする）でフォーク元の部品が受け入れ条件 1・2 を満たす
- **P2**: デスクトップの切り替え（タイトルバー）と外枠（`lib/desktop/`）の色 → 台本の偽の Tauri と `tauri dev`
- **P3**: 配布ビルドで利用者が確かめる

## スコープ外

- 図の出力の色（spec 24 のテーマ）を UI の色に合わせること
- ライト・ダーク以外の配色（ハイコントラストなど）
