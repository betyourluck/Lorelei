# Spec: Mermaid のテーマを選び、出力に反映する

**ID**: 24
**Date**: 2026-10-14
**Status**: Draft（rev0。起票。査読待ち）
**Branch**: 切らない（Phase 単位で main へ直接コミット）。spec 15〜23 と同じく、**フォーク元の改善と台帳・デスクトップはコミットを分け**、フォーク元のコミットだけで上流へ PR を出せる形にする
（フォーク元のコミットは `lib/desktop/`・`src-tauri/`・`crates/` と台帳を含まない。PR を出すか・いつ出すかは利用者が決める, CLAUDE.md）

## Goal

利用者の言（2026-10-14）: 「Mermaid のテーマを切り替えられるようにしたい。ただ編集画面にテーマを被せるというより、出力ファイルにテーマが反映されるようにしたい」。
参考に挙げられた記事（Zenn、`zenn.dev/junkawa/articles/zenn-mermaidjs-theme-config`。2021-10 公開・2022-07 更新）は、図の先頭の `%%{init:{'theme':'base'}}%%` で default・dark・forest・neutral・base を選び、
`themeVariables`（`primaryColor` など）・`themeCSS` で色を変える形を書いている（frontmatter の `config` は扱っていない）。

**出力**とは、この spec では次の 3 つを指す（言葉の定義）:

- **書き出しの絵**: デスクトップの SVG・PNG・PDF（Rust の merman で描く）と、MCP の `render`
- **Mermaid のテキスト**: コード生成のダイアログのコード（コピー・`.mmd` のダウンロード）、保存される図の `source`、MCP の `read_diagram` が返す Mermaid
- **コード生成のプレビュー**: ダイアログの右の mermaid.js の描画（書き出しの前に見る絵）

**編集画面（xyflow のキャンバス）の見た目は変えない**（利用者の言）。保存ファイル・コード生成・書き出しの経路にテーマを通す。

## 現況（2026-10-14、コードを読んで確かめた）

- **書き出しの口はもうテーマを持つ**: `lorelei_core::RenderOptions` に `theme: Theme`（`Default`・`Neutral`・`Dark`・`Forest`。`base` は無い, `crates/lorelei_core/src/render.rs:30-71`）。
  merman にはサイトの設定として `theme` を渡す（`engine.rs:27-34`）。図の中の `%%{init}%%`・frontmatter の `theme` はサイトの設定より勝つ（`theme` は上書きさせない鍵 `SECURE_KEYS` に入っていない）
- **使っているのは MCP の `render` だけ**: `render` の `options.theme`（`crates/lorelei_mcp/src/lib.rs:176-212`）。
  **GUI の書き出しは `RenderOptions::default()` に固定**（`src-tauri/src/desktop.rs:38-41`。テーマは default、背景は白、倍率 2）。書き出しのボタンはコード生成のダイアログの中（`lib/desktop/export-buttons.tsx`、デスクトップだけ）
- **生成器はテーマを書かない**: フローチャートの `generateMermaidCode`（`features/flowchart/hooks/mermaid.ts:302-377`）も ER 図の `generateERDiagramMermaidCode`（`features/er-diagram/utils/generate-mermaid-code.ts`）も、`%%{init}%%` も frontmatter も出さない
- **取り込みはテーマを黙って落とす**:
  - Web 版（mermaid.js の写し）: `prepareForParse`（`components/ui/mermaid-parse-issue.ts:43-54`）が `%%` で始まる行と先頭の frontmatter を空行にしてから読む。
    取り込むと消えるものの要約（`mermaid-dropped.ts`）にも載らない
  - デスクトップ・MCP（Rust の `to_editor`）: merman の前処理が frontmatter と init を読んで `meta.config` に入れるが、Lorelei は読まない（`EditorPayload` にテーマの欄が無い）。
    原文は `Document.original_source` に残るが、`source` は最初の自動保存で生成器の出力になり、テーマが消える。MCP の `update_diagram` も同じ（`normalize_pending` の後）
- **コード生成のプレビュー**: `mermaid.initialize({ theme: "default", … })`（`components/ui/mermaid-render.ts:18-37`）。mermaid.js 11.17.2 の `render` は毎回コードの中の init・frontmatter を当て直すので、**コードにテーマが書いてあればプレビューに効く**。
  プレビューの枠は `bg="white"` に固定（`mermaid-code-with-preview.tsx:47-48`）
- **Web 版**の出力は Mermaid のテキストだけ（`.mmd` のダウンロードとコピー）。SVG・PNG・PDF の書き出しはデスクトップだけ
- `Document`（`src-tauri/src/documents.rs:42-62`）にテーマや書き出しの設定の欄は無い。アプリにほかの配色の設定は無い（yamada-ui の色のモードも、設定画面の配色の欄も無い。CodeMirror は固定の暗い配色）

## 起票前の下調べ（2026-10-14、配布ビルドの MCP `render` で SVG を描かせた）

同じフローチャート（`A[開始] --> B{判定}`、`B -->|はい| C[終了]`）の先頭に書き方を変えて、ノードの四角の塗り（`.node rect` の `fill`）を読んだ。

| 図の先頭 | ノードの塗り | 線 |
|---|---|---|
| 書かない | `#ECECFF`（default） | `#333333` |
| `%%{init: {"theme": "dark"}}%%` | `#1f2020`（dark） | lightgrey |
| frontmatter `config: theme: forest` | `#cde498`（forest） | — |
| `%%{init: {"theme": "dark"}}%%` の ER 図 | `#1f2020` | — |
| base + `themeVariables.primaryColor: #6A7FAB`（init・一重引用符・frontmatter の 3 形） | `#fff4dd`（**base の既定のまま**） | `#0b0b0b`（`lineColor` も効かない） |
| テーマ名なし + `themeVariables` | `#ECECFF` | `#333333` |

- **テーマの名前は、init でも frontmatter でも、フローチャートでも ER 図でも書き出しに効く**
- **`themeVariables` は書き出しに効かない**。Lorelei の `SECURE_KEYS`（`engine.rs:13-25`）が、merman の既定の守り（`HARDENED_SECURE_KEYS`: `fontFamily`・`altFontFamily`・`themeCSS`・`themeVariables` などを図から上書きさせない）を写しているため。
  mermaid.js の既定の守りは `themeVariables` を含まないので、**今でもコード生成のプレビュー（mermaid.js）では効き、書き出し（merman）では効かない**食い違いがある（AI が `themeVariables` を書いた図で起きうる）
- **背景はどのテーマでも白**（SVG のルートに `background-color:white`。`RenderOptions.background` が無い時の merman の既定）。
  merman の写しのテーマの値（`vendor/merman-core/src/generated/theme_variables_11_17_2.json`）では、`background` は default・forest が white、neutral が #ffffff、**dark が #333**、base が #f4f4f4。
  dark は線が lightgrey・文字が #ccc なので、白い背景の上では見づらい（絵は見ていない。P0 で見る）

## 言葉の定義

```text
テーマ            = Mermaid の配色の名前。default / neutral / dark / forest (/ base)。図ごとに 1 つ
テーマの書き方    = Mermaid のテキストの先頭に書く。frontmatter (---\nconfig:\n  theme: dark\n---) か init (%%{init: {"theme": "dark"}}%%)
出力              = 書き出しの絵 (SVG・PNG・PDF、MCP render) と Mermaid のテキスト (コード生成・.mmd・保存の source・read_diagram) とコード生成のプレビュー
編集画面          = xyflow のキャンバス。この spec では見た目を変えない
```

## 決めること

### D1. テーマをどこに持つか

- **案 A（推奨）: 図の Mermaid のテキストに書く（図ごと）** — 生成器がテーマを先頭に書き、取り込み（Web・デスクトップ・MCP）はテーマを読んでエディタの状態に持つ。
  保存される `source`・コード生成・`.mmd`・`read_diagram` にそのまま入り、外（GitHub・Zenn・mermaid.live）に貼ってもテーマが効く。
  `Document` に欄を足さない（`source` が真実）。Web 版でも同じ形（フォーク元に返せる）
- 案 B: `Document` に `theme` の欄を足し、書き出しの時だけ使う — Mermaid のテキストにテーマが入らないので、`.mmd` やコピーを外に貼るとテーマが落ちる。Web 版には保存が無いので効かない
- 案 C: アプリ全体の設定（全部の図に同じテーマ） — 図ごとに変えられない。出力のテキストに入らないなら案 B と同じ穴

推す理由: 利用者の言の「出力ファイルにテーマが反映される」の中心は、書き出しの絵だけでなく Mermaid のテキストにもテーマが入ること（外の描き手でも同じ配色になる）。
案 A なら、取り込みで今テーマを黙って落としている穴（現況）も同時に塞がる。

### D2. テーマの書き方

- **案 A（推奨）: frontmatter の `config.theme`** — Mermaid の今の文書が推す書き方（init は古い書き方として残っている）。merman も mermaid.js 11.17.2 も読む（下調べ）
- 案 B: `%%{init: {"theme": "…"}}%%` — 参考の記事（Zenn）の書き方。古い Mermaid でも読める
- どちらでも、**default の時は何も書かない**（今の図の出力をバイト単位で変えない。受け入れ条件 6）。取り込みは両方の書き方を読む
- 外の描き手（GitHub・Zenn・mermaid.live）がどちらを読むかは P0 で確かめる（Zenn の Mermaid の版が古く frontmatter を読まないなら、案 B か、利用者が選べる形を考える）

### D3. 選べるテーマ

- **案 A（推奨）: default・neutral・dark・forest の 4 つ** — 今の `RenderOptions.theme`・MCP の `ThemeParam` と同じ。名前だけで配色が決まる
- 案 B: 4 つ + base — base は `themeVariables` で色を足すための土台で、名前だけだと薄いベージュの図になる（下調べ）。D4 で `themeVariables` を扱う時に足す
- merman は neo・redux などの新しいテーマも持つが、mermaid.js 11.17.2 で同じ絵になるかは分からないので入れない

### D4. `themeVariables`・`themeCSS` と、ほかの設定（`flowchart.rankSpacing` など）

- **案 A（推奨）: この spec ではテーマの名前だけを扱う** — 取り込みでテーマ以外の設定は今どおり落とすが、**取り込むと消えるものの要約に「テーマ以外の設定」として出す**（今は黙って消える）。
  書き出しで `themeVariables` が効かない食い違い（下調べ）は、LORELEI.md の既知の制約に書き、次の spec の候補にする
- 案 B: `themeVariables` も持ち回り、書き出しにも効かせる（`SECURE_KEYS` から `themeVariables` を外す） — merman の既定の守りを緩める。
  `themeVariables.fontFamily` は同梱フォントの都合で効かせられない（spec 01 P0）。値が CSS に入るので、守りを外してよいかを merman のソースで確かめてから（P0 では材料だけ集める）
- 案 C: GUI で色を選ぶ — この spec の外

### D5. 書き出しの背景

- **案 A（推奨）: テーマの背景に合わせる** — 書き出しの背景を、テーマの `background`（dark なら #333）にする。default・forest・neutral は白のまま（今と同じ）
- 案 B: 今のまま白 — dark が見づらい
- 案 C: 透過 — 貼る先の背景しだいで、dark の線と文字が見えたり見えなかったりする
- コード生成のプレビューの枠（今は白に固定）も同じ背景にする。MCP の `render` で `options.background` を渡した時は、それが勝つ（今と同じ）

### D6. GUI のどこで選ぶか

- **案 A（推奨）: コード生成のダイアログ**（向きのメニューと書き出しのボタンの並び） — 出力に効く設定だと、その場で分かる。プレビューがすぐ変わる。
  Web 版とデスクトップが同じダイアログを使う（デスクトップのツールバーの「コード生成」もフォーク元のダイアログを開く。failures #17 の「どの操作がどの部品を開くか」は P1 で確かめる）
- 案 B: デスクトップのツールバー — 編集中に選べるが、Web 版には無い。キャンバスの見た目が変わらないので、選んだ効き目が見えない
- 案 C: 設定画面 — アプリ全体（D1 の案 C）向き

### D7. MCP

- `open_in_editor`・`update_diagram` に渡した Mermaid のテーマは、エディタの状態に残り、`read_diagram` で返る（D1 の帰結）
- `render` の `options.theme` は今のまま（図の中のテーマが勝つ）。`ThemeParam` の値は D3 に揃える。ツールの説明に、図の先頭に書いたテーマが出力に残ることを一言足す

## Phase

- **P0（リサーチ）**: 結果を「P0 結果」に表で書く。**コミットするコードは変えない**
  1. D3 の 4 つのテーマで、フローチャート・ER 図（枠・ラベル・向きを含む小さな図）を、merman（MCP `render` の SVG と PNG）と mermaid.js 11.17.2（コード生成のプレビューと同じ版）で描いて並べる。配色が揃うか
  2. dark の書き出しを、白・#333・透過の背景で並べる（D5）
  3. frontmatter と init を、GitHub（Markdown の mermaid の囲み）・Zenn・mermaid.live がそれぞれ読むか（**外へ公開する確かめは利用者に頼む**。Lorelei の側は merman と mermaid.js で読めることを確かめる）
  4. 取り込みの往復: テーマを書いた Mermaid を Web の取り込み・デスクトップの取り込み・MCP の `open_in_editor` で開き、何が残り何が消えるか（今のコードで。テーマ以外の設定も）
  5. D4 の案 B の材料: merman が `themeVariables` を守りに入れた理由（ソースと上流の履歴）、外した時に書き出しの絵が mermaid.js と揃うか
  - 結果で D1〜D7 を確定させ、rev1 → 裁定 → rev2
- **P1（フォーク元）**: 生成器がテーマを書く（default は書かない）・Web の取り込みがテーマを読む（消えるものの要約に、テーマ以外の設定を出す）・コード生成のダイアログのテーマのメニュー・プレビューの背景。
  Web 版の画面で確かめる。生成器の出力を変えたら fixture（`er_names.json`・`flow_subgraphs.json`）を書き直し、Rust のテストも回す（CLAUDE.md の開発コマンド）
- **P2（デスクトップ・Rust）**: `to_editor` が merman の `meta.config` からテーマを読む（`EditorPayload` にテーマ）・デスクトップの書き出し（`export_diagram`）がテーマと背景を渡す・MCP の説明と `ThemeParam`・
  data_contract（`EditorPayload`・`RenderOptions`・`GuiCommands.export_diagram`）・LORELEI.md。`tauri dev` で MCP の往復を確かめる
- **P3（配布ビルド）**: 利用者がテーマを選んで書き出し、SVG・PNG・PDF と `.mmd` を外で開いて確かめる

## 受け入れ条件

1. GUI でテーマを選ぶと、コード生成の Mermaid の先頭にテーマが書かれ、コピーと `.mmd` にも入る。保存される図の `source` と `read_diagram` にも入る
2. デスクトップの SVG・PNG・PDF の書き出しが、選んだテーマの配色（と D5 の背景）になる
3. コード生成のプレビューも、選んだテーマで描かれる
4. テーマを書いた Mermaid を取り込むと（Web・デスクトップ・MCP の `open_in_editor`・`update_diagram`）、テーマが残り、編集して生成し直しても消えない。テーマ以外の設定が消える時は、消えるものの要約に出る
5. 編集画面（キャンバス）の見た目は変わらない
6. テーマを選ばない（default の）図の出力は、今とバイト単位で同じ（Mermaid のテキストにも、書き出しの絵にも何も足さない）
7. Web 版（GitHub Pages）でも 1（`.mmd` とコピー）・3・4 が成り立つ（デスクトップ専用の変更を含まない）

## スコープ外

- 編集画面（キャンバス）にテーマを被せること（利用者の言）
- `themeVariables`・`themeCSS` を GUI で選ぶこと、書き出しに効かせること（D4 で案 B を採らない限り）
- テーマ以外の Mermaid の設定（`flowchart.rankSpacing`・`look`・`layout` など）を持ち回ること
- フォント（同梱の Noto Sans JP のまま。テーマの `fontFamily` は効かせない, spec 01）
- neo・redux などの新しいテーマ（D3）
- アプリの UI の暗い配色（ダークモード）
