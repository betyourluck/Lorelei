# Lorelei が merman-core に当てている修正

この `vendor/merman-core/` は crates.io の `merman-core 0.8.0-alpha.6` の写し（上流:
https://github.com/Latias94/merman 、MIT OR Apache-2.0）。ルートの `Cargo.toml` の
`[patch.crates-io]` で差し替えている。**`src-tauri/Cargo.toml` にも同じ patch がある**（独立 project なのでルートの patch が効かない）。

**修正は上流にマージ済み（[Latias94/merman#146](https://github.com/Latias94/merman/pull/146)、2026-09-24、`d61d92c`）。
crates.io に `0.8.0-alpha.6` より新しい版が出たら、`Cargo.toml` の `merman` の版を上げ、この写しと両方の patch を消す。**
2026-09-28 時点で crates.io の最新は `0.8.0-alpha.6`（09-02 公開）のままで、マージ版を含む版はまだ無い。
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
