# Lorelei が merman-core に当てている修正

この `vendor/merman-core/` は crates.io の `merman-core 0.8.0-alpha.6` の写し（上流:
https://github.com/Latias94/merman 、MIT OR Apache-2.0）。ルートの `Cargo.toml` の
`[patch.crates-io]` で差し替えている。**上流が同等の修正を含む版を出したら、この写しと patch を消す。**

無改変の写しは `dd4cca1`。そこからの差分が下の修正のすべて（`git diff dd4cca1 -- vendor/`）。

## 1. flowchart のノード ID に ASCII 以外の文字を許す（2026-09-24）

- **症状**: `flowchart TD\n  開始 --> 終了` が `Unexpected character at 15` で失敗する。
  mermaid.js 11.17.2（merman が追従する版）は受け付ける。
- **原因**: `src/diagrams/flowchart/lexer.rs` の `lex_id` / `lex_edge_id` / `starts_with_kw` /
  `lex_direction` が、ID の文字を ASCII 英数字と `_`（`-`）のバイトだけで判定していた。
- **修正**: ASCII 以外の文字は `char::is_alphabetic()` なら ID に含める（1 文字単位で進める）。
  漢字・かな・長音記号 `ー`・アクセント付きラテン文字が通る。**数字（全角 `１`）と句読点（`、`）は通さない** —
  mermaid.js 11.17.2 で両方ともエラーになることを確認したため（2026-09-24、jsDelivr の ESM を `mermaid.parse`）。
- **テスト**: Lorelei 側は `crates/lorelei_core/tests/editor.rs` の `japanese_*` と
  `fullwidth_digits_and_touten_in_ids_are_rejected_like_mermaid_js`。
  上流側は `patches/0001-flowchart-unicode-node-ids.upstream-main.patch` に含まれる 2 本
  （修正を外すと 1 本目が落ちる = Red を確認済み。上流 main `54d257aa` で merman-core の全テストが緑）。

### 上流の状況

- 上流 main（`54d257aa`、2026-09-24 時点）でも `lex_id` は ASCII のみ。`lex_edge_id` だけは既に
  Unicode 対応に書き換わっているので、**上流向けの差分は `lex_edge_id` を含まない**（`patches/` の方）。
- 関連 issue は無い（"unicode OR japanese OR CJK OR non-ascii" で検索）。
- **PR は未提出**（利用者の GitHub アカウントから出す）。

### 残っている差（今回の修正の範囲外）

- **全角スペース（U+3000）を区切りに使う**: mermaid.js は受け付ける（JS の `\s` に含まれる）。merman の
  `skip_ws` は `' '` `\t` `\r` しか飛ばさない。ID の修正とは別の処理なので別件。
- **このエラーは行番号を失う**: 字句解析のエラーは生成時に span を持つが、`Engine::parse_diagram_sync` の
  戻り値では `span: None` になっている。validate が行番号を返せない。別件として上流に報告する候補。
- `char::is_alphabetic()` は Unicode の Alphabetic 属性で、mermaid.js の `UNICODE_TEXT`（文字カテゴリ L*）より
  わずかに広い（結合記号の一部など）。日本語の範囲では差は無い。

## 上流へ出す PR の下書き

**Title**: `fix(flowchart): accept non-ASCII letters in node ids`

**Body**:

> Mermaid's flowchart lexer accepts `UNICODE_TEXT` in node ids, so diagrams such as
>
> ```mermaid
> flowchart TD
>   開始 --> 終了
> ```
>
> parse in mermaid@11.17.2, but merman rejects them with `Unexpected character at 15`: `lex_id`
> (and the keyword/direction boundary checks) only treat ASCII alphanumerics and `_` as id characters.
>
> This PR lets a non-ASCII character continue an id when `char::is_alphabetic()` holds, stepping by
> whole characters. Non-ASCII digits (`１`) and punctuation (`、`) are still rejected — mermaid@11.17.2
> rejects both as well (checked with `mermaid.parse` from the jsDelivr ESM build). `lex_edge_id` is
> already Unicode-aware on main and is unchanged.
>
> Tests: `parse_diagram_flowchart_accepts_non_ascii_node_ids` (fails without the lexer change) and
> `parse_diagram_flowchart_rejects_non_ascii_digits_and_punctuation_in_ids`. `cargo test -p merman-core`
> is green locally (Windows).
>
> Not addressed here: U+3000 as a separator (mermaid accepts it via JS `\s`), and the lexer error's
> span being dropped before it reaches `parse_diagram_sync` callers.
