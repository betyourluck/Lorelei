# Spec: インポートの取り込みを mermaid.js の解析に替え、取り込むと消えるものに警告を出す

**ID**: 11
**Date**: 2026-09-29
**Status**: **Done**（2026-09-29。rev1 → P0〜P3 着地。P3 の途中で D7（デスクトップのインポート）と Rust の穴 2 つを足した。受け入れ条件 1〜7 通過 —「受け入れ条件の結果」節）
**Branch**: なし（Phase 単位で main へ直接コミット）

## Goal

spec 10 の後の次の候補「インポートのエディタで、取り込むと消える要素に警告を出す」（spec 10 では裁定で外した）。
リサーチで、フォーク元のパーサー（`parseMermaidCode` / `convertMermaidToERData`、1 行ずつの正規表現）が、mermaid.js が正しいと認める書き方を
**黙って捨てる**だけでなく**間違って取り込む**ことが分かった（下の現況）。警告だけでは誤りが残るので、取り込みを mermaid.js 11.17.2 の構文解析の結果から作る。

**フォーク元の改善**（Web 版にもある誤り）なので、デスクトップの変更とはコミットを分け、上流へ PR で返せる形にする（掟）。

## 裁定（2026-09-29、利用者）

- 取り込みは **mermaid.js の解析に替える + 警告**（対案の「警告だけ」「警告 + 正規表現のパーサーの個別修正」は採らない）

## 現況（2026-09-29）

- **フォーク元のパーサー**（使い捨てのテストで実測。右は mermaid.js 11.17.2 の `parse`）:

  | 書き方 | フォーク元の取り込み | mermaid.js |
  |---|---|---|
  | `A --> B --> C` | **`B` が消え、`A → C` という無い線ができる** | 通る |
  | `subgraph S … end` | 中のノードは入るが、**`end` という名前のノードができる** | 通る |
  | `A["開始する"]` | ラベルに `"` が残る | 通る |
  | `A & B --> C`・行末の `;`・`A:::red`・`A --- B`・`A --o B`・`node-1`（ID に `-`） | 行ごと捨てる | 通る |
  | `classDef` / `class` / `style` / `click` | 行ごと捨てる（エディタに入れる所が無いので正しいが、知らせない） | 通る |
  | ER 図の日本語の列名（`string 名前`） | **列が消える**（列名の正規表現が `[A-Za-z0-9_]+`） | 通る |
  | ER 図の列の注釈（`int id PK "主キー"`） | 列が消える | 通る |
  | ER 図の 7 組以外の多重度（`}|--|{`） | 関係もテーブルも消える | 通る |
  | ER 図の別名（`C["顧客"] {`） | テーブル名が `C["顧客"]` になる | 通る |
  | 見出しの無いフローチャート（`A --> B` だけ） | 読む（`parse-mermaid-code-without-header.test.ts`） | 誤り（図の種類が無い） |

- **mermaid.js の解析の結果**: `mermaid.mermaidAPI.getDiagramFromText(text)`（型定義で公開）の `db` に、実測で次があった:
  - flowchart: `getVertices()`（Map。`id`・`text`・`type` = square / round / diamond / circle / stadium / hexagon / cylinder / odd …、括弧の無いノードは `type` 無し・`classes`・`styles`）/
    `getEdges()`（`start`・`end`・`type` = arrow_point / arrow_open / arrow_circle …・`stroke` = normal / thick / dotted / invisible・`text`・`length`）/
    `getSubGraphs()`（`id`・`title`・`nodes`・`dir`）/ `getClasses()`（classDef）/ `getDirection()`
  - erDiagram: `getEntities()`（Map。キー = テーブル名、`id` = `entity-<名前>-<出現順>`・`alias`・`attributes` = `{ type, name, keys, comment }`）/
    `getRelationships()`（`entityA` / `entityB` は entity の `id`・`roleA`・`relSpec` = `{ cardA, cardB, relType }`）/ `getDirection()`
  - 名前の付け方は merman と同じ（merman は mermaid の移植）。**MCP の経路の対応表（data_contract の `EditorPayload.mapping`、Rust の `lorelei_core::editor::to_editor`）がそのまま使える**。
    例: `注文 ||--o{ 明細` は `cardB = ONLY_ONE`（左）・`cardA = ZERO_OR_MORE`（右）= one-to-many
- **フォーク元の生成器**（`generateMermaidCode`）は、線のラベルは特殊文字があれば `"…"` で囲むが、**ノードのラベルは囲まない**。実測で `処理(1)`・`x[y]`・`{z}`・`a|b`・`"` を含むラベルの
  ノードは、**生成したコード自体が mermaid.js で誤り**（spec 09 のプレビューも赤くなる）。取り込みを mermaid.js に替えると「コード生成 → インポート」の往復が壊れる。
  ER 図の生成器は、名前に空白があると誤り（`注文 明細 {`）
- 「取り込むと消えるもの」の日本語の名前と 1 行の要約は `lib/desktop/open-requests.ts` の `LABELS` / `describeDropped` にある（MCP で届いた図の通知に使う。デスクトップ専用の置き場）
- `parseMermaidCode` / `convertMermaidToERData` はインポートのほかに、テスト（`update-diagram` / `direction-save` / `round-trip` / パーサー自身のテスト）が使う

## 決めること

### D1. 取り込みは mermaid.js の解析の結果から作る

- 境界 `components/ui/mermaid-render.ts` に `readMermaidDiagram(code)` を足す。`getDiagramFromText` の `db` から**素のデータの写し**（`MermaidSnapshot`）を作って返す
  （mermaid の内部の形はここで閉じる。版は 11.17.2 に固定なので、内部の関数名が変わるのは版を上げる時だけ — その時はここのテストが落ちる）。文法の誤りは `ParseIssue`（spec 10）で返す
- 変換は純粋関数（mermaid に依らない。テストできる）:
  - `features/flowchart/utils/from-mermaid.ts` の `flowFromMermaid(snapshot) → { data: ParsedMermaidData, dropped: DroppedItem[] }`
  - `features/er-diagram/utils/from-mermaid.ts` の `erFromMermaid(snapshot) → { data: ParsedMermaidERData, dropped: DroppedItem[] }`
  - 対応は **data_contract の `EditorPayload.mapping` と同じ**（形・矢印・多重度・線の ID `{source}-{target}`（2 本目から `-2`）・落としたものの数え方・向き）。Rust の `to_editor` と同じ入力で同じ出力になることをテストで固める
- 出力の形は今のパーサーと同じ（`ParsedMermaidData` / `ParsedMermaidERData`）なので、エディタの取り込み（`handleImportMermaid`）は変えない
- **rev1 で足したこと**（査読）: 写しの文字は「内部の符号 → `&…;` → 文字」の順で戻す / click は class の `clickable`・`link`・`haveCallback` のどれかで数える /
  ER 図の subgraph（名前のテーブルと、それを指す関係を落として `subgraph` / `edge_to_subgraph`）/ `@{ shape: rect | rounded | diam | hex | stadium | circle }` もエディタの形に写す /
  線の ID は使った集合を持ち、ぶつかれば空くまで番号を足す / 空白だけのラベルは空にする /
  境界は描画・検査・読み取りを 1 本の列に並べ（mermaid の全体の状態を触るため）、「直前の本文 → 読み取りの結果」を 1 件覚えて赤線と要約で使い回す /
  `flowchart-elk` もフローチャート / 誤りの型 `MermaidSyntaxError` は模擬しない `mermaid-parse-issue.ts` に置く

### D2. 見出しの無いフローチャートは今どおり読む

フォーク元は `A --> B` だけのコードも読む（テストあり）。mermaid.js は図の種類が無いと誤りなので、フローチャートのインポートでは、最初の意味のある行が図の種類でなければ
`flowchart TD` を補ってから解析する（Web 版の今の使い方を壊さない）。補った時は行番号を 1 つずらして誤りを示す。
**rev1**: 補うかどうかは mermaid が「図の種類が無い」（`No diagram type detected`）と言ったかで決める（字句で推測しない）。補いは境界の選択肢（`defaultHeader`）にして、
取り込み・要約・赤線・プレビューのすべてに通す（取り込めるのに赤線とプレビューだけ赤い、を作らない）。`prepareForParse` は frontmatter の行も空行にする（spec 10 の穴）

### D3. 取り込みの流れ

- 「インポート」を押すと: 解析 → 文法の誤りなら「Mermaid の文法の誤りで取り込めません（N 行目）」と誤りの文の 1 行目 → 図の種類が違えば（フローチャートのダイアログに erDiagram など）
  「フローチャートではありません」/「ER 図ではありません」→ ノード（テーブル）が 0 なら今の文言 → それ以外は `onImport(data)`
- mermaid の読み込みと解析は非同期。今の「インポート中...」の表示をそのまま使う
- **利用者に見える変化**（rev1、査読 7）: フォーク元は読めない行を飛ばして残りを取り込んだが、これからは **1 行でも文法の誤りがあれば全体を取り込まず、誤りの行を示す**
  （エディタの赤線とプレビューで取り込む前に分かる）。見出しが 2 つある・`invalid code` のような文も、今は「見つかりませんでした」、これからは文法の誤り

### D4. 取り込むと消えるものの警告

- **要約（正確）**: エディタの下に「取り込むと消えるもの: サブグラフ ×1、style 指定 ×1」。プレビューと同じく打鍵が 400ms 止まったら、D1 の解析 + 変換の `dropped` から作る（取り込みと同じ計算なので食い違わない）。無ければ出さない
- **行の印（目安）**: エディタの赤線（spec 10 D5）と同じ lint に、**黄色の警告**として、消える書き方の行に印を付ける。字句で見つける目安（`subgraph` / `end` / `classDef` / `class` / `style` / `linkStyle` / `click` の行、
  `:::`、エディタに無い形（`[(` `>` `[[` `[/` など）、エディタに無い矢印（`--o` `--x` `---` の矢印なし・長い矢印 `--->`）、ER 図の別名・列の注釈・`..`（非識別）・7 組以外の多重度）。
  文は「サブグラフの枠は取り込まれません（中のノードと線は取り込みます）」のように、何が起きるかを書く
- `LABELS` / `describeDropped` / `DroppedItem` をフォーク元の側（`components/ui/mermaid-dropped.ts`）へ移し、`lib/desktop/open-requests.ts` はそれを使う（MCP の通知と同じ言葉にする）

### D5. 生成器のノードのラベルを囲む

- `formatMermaidShape` は、線のラベルと同じ規則（`sanitizeMermaidLabel`: 英数字・`-`・`_`・日本語・空白だけならそのまま、ほかは `"…"`）でノードのラベルを囲む
- 囲んだ中の `"` は、今の `\"` ではなく mermaid.js の実体参照 `#quot;` にする（P0 で `\"` が誤りになるかを確かめる）
- 往復のテスト: 特殊文字のラベル（上の現況の例）で「生成 → mermaid.js で解析 → 取り込み」が同じラベル・形・矢印に戻る
- **rev1**: 囲む規則は「括弧・縦棒・引用符（実測で誤りになる文字）か `#語;` を含む時だけ」（線の規則のように英数字と日本語以外をすべて囲むと、`？` や `/` のラベルまで出力が変わる）。
  `#語;` の `#` は `#35;` にする / 空のラベルは `[" "]`（`B[]`・`B[""]` は誤り）/ `<b>` のような HTML は mermaid がラベルを HTML として扱うのでそのまま書く（`<br>` の改行を壊さない）/
  **ER 図の生成器**: 関係のラベルは常に `"…"` で囲み、中の `"` は `#quot;` にする（囲まないと空白・括弧で誤り）

### D6. 今のパーサーは残す

インポートは使わなくなるが、テストと MCP の経路の外の使い道（`round-trip` など）があるので、この spec では消さない（収縮は別の変更で。スコープ外）。
**→ [spec 12](12_remove-legacy-parser.md) で撤去した**（テストは mermaid.js の経路へ移した）

## Phase

- **P0（PoC、コードの前）**: 済みの実測（上の現況）に加えて — (1) 線のラベルの `\"` と `#quot;` の mermaid.js での扱い (2) `~~~`・`<-->`・`<==>`・`-. x .->`・`==>|x|` の `db` の `type` / `stroke` / `text`
  (3) `getDiagramFromText` を jsdom の vitest で呼べる（リサーチで確認済み）・Web 版の静的書き出しで呼べる (4) 見出しを補った時の行番号
- **P1**: D1・D2。テスト（Red → Green）: 変換の純粋関数（対応表の各行・線の ID の重複・落としたものの数え方・向き・ER 図の id → 名前）/
  本物の mermaid での統合（現況の表の各行が正しく取り込まれる・見出しの補い）/ `lorelei_core` の `to_editor` のテストと同じ入力で同じ出力
- **P2**: D3〜D5。テスト: インポートのダイアログ（誤り・図の種類の違い・0 件・成功、要約の表示）/ 行の印（字句の目安の各行）/ 生成器の囲み / 往復
- **コミットの分け方**: フォーク元の改善（P1・P2）と、`lib/desktop/open-requests.ts` を共通の言葉に替えるデスクトップのコミットを分ける。台帳は別
- **P3**: 実機 — 配布ビルドで、現況の表の書き方を貼って取り込み、警告の要約と行の印、コード生成 → インポートの往復（特殊文字のラベル）。Web 版（静的書き出し）でも

## 受け入れ条件

1. 現況の表の書き方が、mermaid.js の意味どおりに取り込まれる（連鎖・`&`・subgraph の中身・引用符・日本語の列名・列の注釈・7 組以外の多重度（近い多重度にして警告）・別名（名前は本来の名前））
2. 取り込むと消えるものが、取り込む前に要約と行の印で分かる。要約は取り込みの結果と食い違わない
3. 文法の誤り・図の種類の違いは、取り込まずに理由を出す
4. 見出しの無いフローチャートは今どおり取り込める
5. 特殊文字のラベルのノードで、コード生成のコードが mermaid.js で通り（プレビューが赤くならない）、インポートで元に戻る
6. MCP の通知の「落としたもの」の言葉が、インポートの警告と同じ
7. Web 版でも同じく動く。vitest は全件緑かつ exit 0

## スコープ外

- 今のパーサー（`parseMermaidCode` / `convertMermaidToERData`）の撤去（→ spec 12）
- ER 図の名前の空白（生成器が書くコードが誤りになる。既知の制約として LORELEI.md に書く）/ ラベルの改行
- subgraph・classDef・style などをエディタで扱えるようにすること
- markdown の文字列（`` "`**太字**`" ``）の記法は、記法のまま取り込む（査読 12）

## P0 結果（2026-09-29）

- リサーチ（現況の表）は、フォーク元のパーサーと mermaid.js を同じ入力で並べた使い捨てのテストで取った（コミットしていない）
- (1) 引用符の中の `"`: 今の生成器の `\"` は mermaid.js で**通るが壊れる**（`A -->|"say \"hi\""| B` の線の文字は `say \hi\`）。`#quot;` は通り、解析の結果の文字は mermaid の内部の符号
  `ﬂ°quot¶ß`（描く時に `&quot;` → `"` へ戻す前の形）になる → 取り込みで符号と HTML の実体参照を戻す。`処理(1)`・`x[y]`・`{z}`・`a|b` は `"…"` で囲めば通り、文字もそのまま
- (2) 矢印の `db`（`type` / `stroke` / `text` / `length`）: `~~~` = arrow_open / invisible、`<-->` = double_arrow_point / normal、`<==>` = double_arrow_point / thick、
  `-. x .->` = arrow_point / dotted / x、`==>|y|` = arrow_point / thick / y、`--x` = arrow_cross / normal、`--->` = arrow_point / normal / length 2、`<-- w -->` = double_arrow_point / normal / w
  → どれも Rust の `arrow_type` の表と落とし方で扱える（`--x` は近い矢印 arrow にして `edge:arrow_cross`、`--->` は `edge_length`）
- (3) `getDiagramFromText` は jsdom の vitest で呼べる。呼ぶたびに新しい `db` を作り、前の呼び出しの結果と混ざらない（後の呼び出しの後も前の `db` の中身はそのまま）
- (4) 見出しを補った本文の誤りは 1 行後ろにずれる（`flowchart TD` を補った 2 行目の誤りが「line 3」）→ 補った時は 1 を引く

## P3 の途中で足したこと（2026-09-29）

### D7. デスクトップのインポートのダイアログも同じ本文にする

- 配布ビルドの確かめで、**デスクトップ版のツールバーの「インポート」はフォーク元の ImportModal ではなく `lib/desktop/import-dialog.tsx`**（spec 02 D10。普通の入力欄・`size="2xl"`・
  変換は Rust）を開くと分かった。デスクトップではフォーク元のパネル（とその中のインポート）は `desktop-shell.tsx` の `HIDE_FORK_PANELS` で隠している
- つまり **spec 10 のインポートのダイアログの変更（大きく・CodeMirror・右のプレビュー）と、この spec の D1〜D4 は Web 版にしか効いていなかった**。
  spec 10 P4 の「配布ビルドでインポートを確認」は別のダイアログを見ていた（spec 10 に訂正を書いた。failures #17）
- 処方: デスクトップのインポートのダイアログを `MermaidEditorWithPreview` の本文にした（大きなダイアログ・CodeMirror（補完・赤線）・右のプレビュー・消えるものの要約と行の印・本文がある時は Esc で閉じない）。
  **取り込みは今どおり Rust**（MCP と同じ変換。取り込んだ後の通知もそのまま）。両方の図を受けるので、行の印の規則は 1 行目の図の種類で選び、要約は TS の変換（Rust と同じ対応表）で出す。
  見出しの補い（D2）は付けない（Rust の変換は見出しの無いコードを受けない）

### Rust の変換（`lorelei_core::editor::to_editor`）の穴 2 つ

査読 2・8 の入力を Rust にも通して確かめた（使い捨てのテスト）:

- **ER 図の subgraph**: 関係が subgraph を指すと「merman の意味モデルの形が想定と違います: relationships の entity id」で**止まっていた**（MCP の `open_in_editor` とデスクトップのインポートが失敗する）
- **線の ID**: `a-b --> c` と `a --> b-c` の 2 本がどちらも `a-b-c`
- 処方: TS の取り込みと同じにした（subgraph はテーブルにせず、指す関係を落として `subgraph` / `edge_to_subgraph`。線の ID は使った集合を持ち空くまで番号を足す）。
  `crates/lorelei_core/tests/editor.rs` に 2 件（Red → Green）

## P1〜P3 結果（2026-09-29）

| コミット | 中身 | テスト（Red → Green） |
|---|---|---|
| `7cc6bbb`（フォーク元の改善） | 境界の `readMermaidDiagram`（写し・列・覚え・`defaultHeader`）、`mermaid-snapshot.ts`・`mermaid-dropped.ts`、変換 `from-mermaid.ts`（2 つ）、インポートの読み取り `import-flowchart.ts` / `import-er.ts`、行の印 `drop-warnings.ts`（2 つ）、エディタの `warnings` / `defaultHeader`、2 つのインポートのダイアログ、生成器（ノードのラベル・空のラベル・`#語;`・ER 図の関係のラベル）、`prepareForParse` の frontmatter、setup（`readMermaidDiagram` は本物） | 変換 11 + 7 件（Rust の `to_editor` のテストと同じ入力、**本物の mermaid**）、読み取り 5 + 3 件、行の印 6 + 3 件、往復（フローチャート 13 ラベル × 4 形・ER 図 6 ラベル）、エディタの黄色の印、ダイアログ（フロー 17・ER 4）、frontmatter の行 |
| `c736d59`（デスクトップ） | `lib/desktop/open-requests.ts` の言葉を共通の `mermaid-dropped.ts` の再エクスポートに（`fk` を消した） | 既存の `open-requests.test.ts` |
| `c9c2469`（フォーク元の改善） | インポートの本文で図の種類を省けるように | — |
| `ad19078`（デスクトップ） | D7: デスクトップのインポートのダイアログを同じ本文に | `toolbar.test.tsx` +1 件（2 列・要約・ER 図の規則の印） |
| `f74fea0`（Rust） | `to_editor` の ER 図の subgraph と線の ID | `tests/editor.rs` +2 件 |

- **P1 と P2 を 1 つのコミットにまとめた**（境界の変更が両方にまたがる。spec 10 と同じ）
- テストの作りの誤り（直した）: ER 図の往復のテストの線に `type: "erEdge"` を付け忘れた（生成器は erEdge だけ書く）/ 要約の並びを名前の順（Rust の BTreeMap と同じ）でなく書いた /
  ER 図の行の印でフローチャートの「ラベル `|…|` を空にする」処理を使い、多重度 `}|--|{` を消していた（規則の誤り。ER 図は文字列だけを空にする）
- `<b>` のような HTML のラベルは往復で `<b></b>` に整えられる（mermaid がラベルを HTML として扱う）。生成器は `<` `>` をそのまま書く（`<br>` の改行を壊さない）ので、往復のテストから外した
- 全体: vitest 75 ファイル 710 件、exit 0（未処理のエラー 0）。`cargo test --workspace` と `src-tauri` の `cargo test` も通過。型検査・lint（変更したファイル）通過
- **P3（配布ビルド、利用者が確認）**: 現況の表の書き方（連鎖・`&`・subgraph・`"受付(電話)"`・style）を貼り、デスクトップのインポートのダイアログで要約「style 指定 ×1、サブグラフ ×1」と
  `subgraph` / `style` の行の黄色の印、右のプレビュー（subgraph の枠・style の赤も描かれる）→ 取り込むとノード 6 つ・線 5 本（「なし」のラベル付き 2 本）、`end` や `S` のノードは無い /
  ER 図の日本語の列名が残る / 日本語の ID の補完で IME の確定が二重にならない（spec 10 で一言の確認だった所）/ 利用者:「1〜4 を検証し、問題ないことを確認しました」
- 静的書き出し（Web 版の中身）をブラウザで: フォーク元のインポートで同じコードを取り込み、ノード 6 つ・要約・印を確かめた（線とダイアログを閉じる所は、ブラウザの枠が画面に出ておらず描画が止まっていて見られていない）

### 受け入れ条件の結果（2026-09-29）

| # | 結果 | 根拠 |
|---|---|---|
| 1 | **通過** | 変換のテスト（本物の mermaid）・ダイアログのテスト・P3 の配布ビルド（Rust の経路。同じ対応表） |
| 2 | **通過** | 要約は取り込みと同じ計算（テスト）。P3 で要約と印を目視 |
| 3 | **通過** | 読み取りとダイアログのテスト（文法の誤り・図の種類の違い） |
| 4 | **通過** | 読み取りとダイアログのテスト（見出しの補い）。Web 版のインポートだけ（デスクトップは Rust の変換が見出しを要る — D7） |
| 5 | **通過** | 往復のテスト（フローチャート・ER 図）・生成器のテスト |
| 6 | **通過** | `open-requests.ts` が共通の言葉を再エクスポート。P3 の取り込み後の通知が同じ言葉 |
| 7 | **通過** | vitest exit 0。Web 版はブラウザで取り込みを確認（線の描画は未確認） |

- **上流へ返せるコミット**（フォーク元の改善だけ）: `7cc6bbb`・`c9c2469`。PR を出すかは利用者が決める

## 査読の採否（rev0 → rev1）

査読 1 本（エージェント。フォーク元・Rust・mermaid 11.17.2 の dist を読んだもの）。設計を変える指摘は、採る前に本物の mermaid で確かめた（使い捨てのテスト）。

| 指摘 | 採否 | 反映 |
|---|---|---|
| 1 高: 写しの文字が mermaid の内部の形（符号・`&amp;`）のまま入る / `#12;` のような文字が化ける | 採る | D1: 写しの文字は「内部の符号 → `&…;` → 文字」の順で戻す（実装済みの `decodeText`）。D5: `#語;` を含むラベルは `#` を `#35;` にして囲む。data_contract の label の行を直す |
| 2 高: ER 図の subgraph を扱っていない | 採る（実測で確認: 関係の行き先が subgraph の ID `G` のまま入り、`G` がテーブルにも現れる） | D1: ER 図の写しにも subgraph を持たせ、subgraph の名前のテーブルと、それを指す関係を落として `subgraph` / `edge_to_subgraph` を数える。Rust の MCP の経路も同じ入力で止まるはずなので、別の不具合として failures に書く |
| 3 中: strict では関数の `click` に `haveCallback` が付かず数え落とす | 採る（実測で確認: 印は class の `clickable` だけ） | D1: click は `clickable` の class・`link`・`haveCallback` のどれかで数える |
| 4 中: `getDiagramFromText` は mermaid の順番待ちの外で動き、全体の状態（題・アクセシビリティ・設定）を触る | 採る | D1: 境界の中で、描画・検査・読み取りを 1 本の Promise の列に並べる。写しは解析の直後に同期で取る |
| 5 中: 打鍵が止まるたびに 3 回解析する | 採る（形を変えて） | D1: 境界が「直前の本文 → 読み取りの結果」を 1 件覚え、赤線の `parseMermaid` と要約はそれを使い回す（描画は別。描かないと絵にならない） |
| 6 中: 見出しの補い（D2）がほかの画面と食い違う / frontmatter の行のずれ / `flowchart-elk` | 採る | D2: 補いは境界の選択肢（`defaultHeader`）にし、取り込み・要約・赤線・プレビューのすべてに通す。`prepareForParse` は frontmatter の行も空行にする。`flowchart-elk` もフローチャートとして扱う |
| 7 中: 今は読めてこれから誤りになる入力（1 行の誤りで全体を取り込まない・見出しが複数・空のラベル `B[]`） | 採る（実測: `B[]`・`B[""]` は誤り、`B[" "]` は通る） | D3: 「1 行でも文法の誤りがあれば全体を取り込まない（誤りの行を示す）」を利用者に見える変化として書く。D5: 生成器は空のラベルを `[" "]` と書き、取り込みは空白だけのラベルを空にする |
| 8 中: 線の ID `{source}-{target}` が `-` を含む ID でぶつかる | 採る | D1: 使った ID の集合を持ち、空くまで末尾に番号を足す（Rust も同じ穴があるので failures に書く） |
| 9 中: ER 図の生成器の関係のラベルを囲まない（空白・括弧で誤り） | 採る（実測で確認） | D5: 関係のラベルは常に `"…"` で囲み、中の `"` は `#quot;` にする。往復のテストを ER 図にも |
| 10 中: 全体の模擬に `readMermaidDiagram` が無い / 誤りの型の `instanceof` | 採る | 境界の模擬は `readMermaidDiagram` だけ本物（`vi.importActual`）を返す。誤りの型 `MermaidSyntaxError` は模擬しない `mermaid-parse-issue.ts` へ移す。ダイアログのテストは P2 で書き直す |
| 11 低: 行の印の誤検出（frontmatter の `---`・注釈・引用符・`..` がラベルに当たる）/ 非識別の別の書き方 | 採る（一部） | D4: frontmatter を除き、非識別は `..` に加えて `.-` / `-.` も見る。注釈・引用符・線のラベルは既に除いている（テストあり）。「要約にその種類がある時だけ印を出す」は採らない — 印は目安で、要約が正確（D4 に書いたとおり） |
| 12 低: `@{ shape: … }` の形の名前・markdown の文字列・空の関係のラベル・`fk` | 採る（一部） | D1: `@{ shape }` の名前（rect / rounded / diam / hex / stadium / circle）もエディタの形に写す（実測で確認）。markdown の記法はそのまま入る（スコープ外に書く）。空の関係のラベルは今どおり生成器が補う。`LABELS` の `fk` は移す時に消す |
