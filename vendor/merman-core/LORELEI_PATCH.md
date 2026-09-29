# Lorelei が merman-core に当てている修正

この `vendor/merman-core/` は crates.io の `merman-core 0.8.0-alpha.6` の写し（上流:
https://github.com/Latias94/merman 、MIT OR Apache-2.0）。ルートの `Cargo.toml` の
`[patch.crates-io]` で差し替えている。**`src-tauri/Cargo.toml` にも同じ patch がある**（独立 project なのでルートの patch が効かない）。

修正は 2 つ。1 は上流にマージ済み（[Latias94/merman#146](https://github.com/Latias94/merman/pull/146)、2026-09-24、`d61d92c`）。
2 も上流にマージ済み（[Latias94/merman#153](https://github.com/Latias94/merman/pull/153)、2026-09-29、`2d70832e`）。
**crates.io に 1 と 2 の両方を含む版が出たら、`Cargo.toml` の `merman` の版を上げ、この写しと両方の patch を消す。**
2026-09-30 時点で crates.io の最新は `0.8.0-alpha.6`（09-02 公開）のままで、1・2 を含む版はまだ無い。
上流 main を git 依存で指す案は採らなかった（alpha.6 から 70 コミット先で、#120 の flowchart parity など 300 ファイルの未検証の変更が入るため）。

無改変の写しは `dd4cca1`。そこからの差分が下の修正のすべて（`git diff dd4cca1 -- vendor/`）。

## 1. flowchart のノード ID に ASCII 以外の文字を許す（2026-09-24、2026-09-28 に上流のマージ版へ揃えた）

- **症状**: `flowchart TD\n  開始 --> 終了` が `Unexpected character at 15` で失敗する。
  mermaid.js 11.17.2（merman が追従する版）は受け付ける。
- **原因**: `src/diagrams/flowchart/lexer.rs` の `lex_id` / `lex_edge_id`（と shape data `A@{...}` の ID の先読み）が、
  ID の文字を ASCII 英数字と `_`（`-`）のバイトだけで判定していた。
- **修正**: mermaid.js 11.17.2 の `UNICODE_TEXT` トークンの範囲表（BMP の区間 300 余り）を `MERMAID_UNICODE_TEXT_RANGES` として持ち、
  ASCII 以外の文字はその表に入っていれば ID に含める（1 文字単位で進める）。漢字・かな・長音記号 `ー`・`々`・アクセント付きラテン文字が通る。
  **通さないもの**: 全角数字 `１`、句読点 `、`、結合記号（`Aͅ`）、BMP の外の文字（`𠀀`）— mermaid.js 11.17.2 がどれもエラーにするため。
- **キーワード・向きの境界は ASCII のまま**: `end開始` は `end` + `開始` で誤り、`flowchart TD開始` は向き TD + ノード `開始`
  （mermaid.js と同じ）。初稿では境界の判定も Unicode へ広げていて（`continues_word`）、ここが mermaid.js と食い違っていた（下の「経緯」）。
- **テスト**: `crates/lorelei_core/tests/editor.rs` の `japanese_*`、`fullwidth_digits_and_touten_in_ids_are_rejected_like_mermaid_js`（4 例）、
  `ascii_keyword_boundaries_are_kept_before_unicode_like_mermaid_js`。上流の 3 本（`parse_diagram_flowchart_accepts_non_ascii_node_ids` /
  `..._rejects_non_ascii_digits_and_punctuation_in_ids` / `..._preserves_ascii_keyword_boundaries_before_unicode`）と同じ入力。
  GUI の殻の側は `src-tauri` の `japanese_node_ids_are_accepted_in_the_gui_build`（patch が効いていることの見張り）。

### 経緯

- 2026-09-24: `char::is_alphabetic()` で判定する初稿を写しに当て、同じ内容を上流に PR #146 として提出（betyourluck/merman の
  `fix/flowchart-unicode-node-ids`。提出前に同種の PR / issue が無いことを全件で確認）。
- 2026-09-24: 上流の Latias94 が 1 コミット足して（`fix(flowchart): match Mermaid Unicode token boundaries`）マージ。
  `is_alphabetic()` を mermaid.js の範囲表に置き換え、境界のテストを追加した。マージ版の lexer の差分は `lex_id` だけ
  （上流 main は #120 で `lex_edge_id` と境界の判定が既に書き換わっている）。
- 2026-09-28: 写しで実測して 4 つの食い違い（`end開始` / `TD開始` / `Aͅ` / `𠀀` を写しは通す）を確認し、写しをマージ版の意味に揃えた。
  写しは alpha.6 なので上流のファイルをそのまま置けず、範囲表と `non_ascii_id_char_len` を移し、境界の判定を alpha.6 の元のバイト判定に戻した
  （UTF-8 の先頭バイトは英数字でないので、元の判定がそのまま「Unicode の文字は語を続けない」になる）。
  上流向けの差分ファイル `patches/` はマージ済みなので消した。

### 残っている差（今回の修正の範囲外）

- **全角スペース（U+3000）を区切りに使う**: mermaid.js は受け付ける（JS の `\s` に含まれる）。merman の
  `skip_ws` は `' '` `\t` `\r` しか飛ばさない。ID の修正とは別の処理なので別件。
- **このエラーは行番号を失う**: 字句解析のエラーは生成時に span を持つが、`Engine::parse_diagram_sync` の
  戻り値では `span: None` になっている。validate が行番号を返せない。別件として上流に報告する候補。
- 範囲表の CJK 統合漢字は `U+4E00..U+9FCC`（mermaid.js の表のまま）。`U+9FCD` 以降に後から足された漢字は通らないが、実用上は出会わない。

## 2. ER 図の多重度の語（`many` / `one` / `to` など）を語の境界で取る（2026-09-29、spec 14）

- **症状**: `erDiagram\n  A ||--o{ tokens : has` が `unexpected identifying; expected name` で失敗する。`topic`・`total`・`oneshot`・`manyToMany` も同じ。
  関係のラベルの `tokens` も誤り。`A one to onerous : x` は誤りにならず、テーブル名が **`rous`** に化けて通る。mermaid.js 11.17.2 は前者を通し、後者を誤りにする。
- **原因**: `src/diagrams/er.rs` の `lex_rel_tokens` が、複数語の多重度 8 つ（`one or zero`・`only one`・`optionally to` など）と `many`・`one`・`to` を
  `lower.starts_with(…)` で境界を見ずに取っていた。字句解析の振り分けで `lex_rel_tokens` は `lex_name_or_str` より先に呼ばれるので、名前の先頭が多重度の語として食われる。
  mermaid.js は `/^(?:many\b)/i`・`/^(?:to\b)/i` などで、末尾に `\b` を持つ（`|o\b`・`}o\b` も）。
- **修正**: `ends_word_at`（一致した語の直後が入力の終わりか、ASCII の `[A-Za-z0-9_]` でなければ真 = mermaid.js の Unicode フラグなしの `\b`）を足し、
  複数語の 8 つ・`many`・`one`・`to`・`|o`・`}o` の一致の条件にした。`many(0)`・`many(1)`・`0+`・`1+` と記号には足さない（mermaid.js にも無い）。
  **境界は ASCII のまま**: `to-do`・`to注文`・ラベルの `one-to-one` は mermaid.js と同じく誤り。
- **テスト**: 写しの `src/tests/er.rs` に `parse_diagram_er_entity_names_may_start_with_cardinality_words` / `parse_diagram_er_cardinality_word_boundary_is_ascii`（上流 PR と同じ）。
  写しの中では merman-core のテストをコンパイルできない（上流の `fixtures/` を `include_str!` で読む）ので、上流 main（`72c02477`。er.rs は写しと同じ）に同じ差分を当てた作業場所で回した:
  足した 2 本は直す前に落ち、直した後に通る。`merman-core` の全テストと `merman-render` の ER 図のテストも通る。
  Lorelei 側は `crates/lorelei_core/tests/editor.rs` の `er_names_may_start_with_cardinality_words_like_mermaid_js` / `er_cardinality_word_boundary_is_ascii_like_mermaid_js`、
  `src-tauri` の `er_names_starting_with_cardinality_words_are_accepted_in_the_gui_build`（patch の見張り）。
- **Lorelei の生成器への影響は無い**: spec 13 の `quoteErName` は `to`・`one`・`many` で始まる名前を囲んで書く（修正の前から当たらない）。当たっていたのは AI が書いた ER 図。

### 経緯

- 2026-09-29: spec 13 の P0（名前の格子を mermaid.js と merman に通した実測）で見つけた。上流 main も未修正で、issue・PR も無い（全件で確認）。写しに当てた（`bd2962a`）。
- 2026-09-29: 同じ差分を上流に PR #153 として提出（betyourluck/merman の `fix/er-cardinality-word-boundary`、上流 main `72c02477` から切ったコミット `f4b362bc`。
  提出前に同種の PR / issue が無いこと、表の各行の mermaid.js と merman の挙動、`fixtures/er/` に影響する名前が無いことを確かめ直した）。
  マージ版が写しと違ったら、#146 の時と同じく写しをマージ版の意味に揃える
- 2026-09-29: 上流の Latias94 がテストを 1 コミット足して（`test(er): cover cardinality alias word boundaries`。`|o`・`}o`・複数語の多重度の直後に名前が続くと誤り、
  `A one optionally toone B` も誤り）マージ（`2d70832e`）。lexer（`src/diagrams/er.rs`）はマージ版と写しで同じ。写しの `src/tests/er.rs` をマージ版に揃えた（+35 行、テストだけ）

### 残っている差（今回の修正の範囲外。merman のほうが緩い向き）

- `starts_with_word_ci` の境界は空白と `:{}[];` だけ: `end-user`・`style-guide`・`end注文` を merman は名前として通し、mermaid.js は誤りにする。
- `direction` を名前に使うと merman だけが誤り（mermaid.js は `direction` + 空白 + 向き の時だけ向きとして読む）。
- 行頭（インデントなし）の `u-table`・`1abc` は merman が通し、mermaid.js は割る・誤りにする。
