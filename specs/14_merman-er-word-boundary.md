# Spec: merman の ER 図の字句解析で、`to`・`one`・`many` を語の境界で取る（写しの修正と上流 PR）

**ID**: 14
**Date**: 2026-09-29
**Status**: 起票（rev0。査読前）
**Branch**: 切らない（Phase 単位で main へ直接コミット）。上流への PR は fork `betyourluck/merman` の枝から出す（spec 01 の #146 と同じ流れ）

## Goal

merman（`vendor/merman-core` の写し）が、`to`・`one`・`many` で始まる ER 図のテーブル名・関係のラベル（`tokens`・`topic`・`total`・`oneshot`・`manyToMany`…）を
誤りにする・黙って化けさせる不具合を、mermaid.js 11.17.2 と同じ「語の境界」で取るように直す。
AI が書いた ER 図が、Lorelei の MCP（`validate` / `render` / `open_in_editor` / `update_diagram`）で mermaid.js と同じく通るようにする。
同じ差分を上流（Latias94/merman）へ PR で返す（2026-09-29 利用者裁定: 「(a) で進める」）。

## 裁定（2026-09-29、利用者）

- 写しに直しを当てて上流へ PR を出す（記録だけにする案は採らない）

## 現況（2026-09-29。spec 13 P0 の実測と、エージェントの下調べ。P0 で確かめ直す）

- **不具合**: `vendor/merman-core/src/diagrams/er.rs` の `lex_rel_tokens`（1705〜1802 行目）が、`many`・`one`・`to`（1742・1746・1754 行目）と複数語の 8 つ
  （`one or zero`・`only one`・`optionally to` など、1710〜1724 行目）を `lower.starts_with(…)` で**境界を見ずに**取る。字句解析の振り分け（2046〜2126 行目）で
  `lex_rel_tokens`（2111 行目）は名前の `lex_name_or_str`（2115 行目）より先に呼ばれるので、名前の先頭が関係の記号として食われる
- **実測**（merman / mermaid.js）:
  - `tokens`・`topic`・`total`・`toy`・`oneshot`・`manyToMany`・`many_items`（テーブル名）: 誤り / 通る
  - ラベル `tokens`・`one_x`・`to2`: 誤り / 通る
  - **黙って化ける**: `A one to onerous : x` → merman はテーブル名 `rous` で通す / mermaid.js は誤り。`A only one to oneself : has` → `self`
- **mermaid.js 11.17.2 の規則**（ER 図のパーサーの字句規則。全規則が大文字小文字を問わず、先に一致した規則が勝つ）: `many\b`・`one\b`・`to\b`・複数語の規則・`|o\b`・`}o\b` は
  **末尾に `\b`**（Unicode フラグなし = ASCII の `[A-Za-z0-9_]` が語の文字。ASCII 以外・`-`・`.` の前は境界）。`many(0)`・`many(1)`・`0+`・`1+`・`||`・`o|`・`o{`・`|{`・`}|`・`..`・`--`・`.-`・`-.` は境界なし
- **上流の状況**: 上流 main（`72c02477`、2026-09-24）の `crates/merman-core/src/diagrams/er.rs` は写しと**同じ**（LF に揃えてバイト単位で一致）。未修正で、issue・PR も無い。
  crates.io の最新は `0.8.0-alpha.6`。#146（日本語のノード ID、マージ済み）の後の #147（Unicode の扱い）も er.rs は触っていない
- **既存の上流のテスト**（写しの `src/tests/er.rs`、ER 図 49 本）: 語の別名を直接検めるのは `parse_diagram_er_relationship_word_aliases_match_upstream_spec_minimally`（441 行目。
  `HOUSE one to one ROOM`・`many(0) to many(1)`・`only one optionally to 1+` など）。ほかに記号の組み合わせ（328 行目）・数字の多重度（508・782 行目）・`u--o{`（740 行目）・
  editor facts の span（827 行目〜）・`1.5 ||--|| Sales.Order`（er.rs の `mod tests`）。上流のフィクスチャ `fixtures/er/` の 102 本に、名前の先頭の `to`・`one`・`many` は無い
- **前回の patch**（spec 01）: 写しの出どころと修正ごとの節（症状 / 原因 / 修正 / テスト / 経緯 / 残っている差）は `vendor/merman-core/LORELEI_PATCH.md`。
  無改変の写しは `dd4cca1`。patch はルートの `Cargo.toml`（35〜36 行目）と `src-tauri/Cargo.toml`（42〜43 行目）の `[patch.crates-io]`。
  ルートの 33〜34 行目のコメント「修正版を上流へ PR するまで写しを使う」は #146 のマージ後に古くなっている
- **Lorelei 側**: spec 13 の `quoteErName` は `to`・`one`・`many` で始まる名前を囲むので、生成器の出力はこの不具合に当たらない。当たるのは AI が書いた ER 図

## 決めること

### D1. 語の境界の判定を足す

- `Lexer` に「語の終わり」の判定を 1 つ足す: 一致した語の直後のバイトが無い（入力の終わり）か、ASCII の `[A-Za-z0-9_]` でなければ真（JS の `\b` と同じ。UTF-8 の多バイトの先頭は 0x80 以上なので、
  `to注文` は mermaid.js と同じく割れる — spec 01 の patch の「境界は ASCII」と揃う）
- この判定を `many`・`one`・`to` と複数語の 8 つ、`|o`・`}o` の一致の条件に足す。`many(0)`・`many(1)`・`0+`・`1+` と記号には足さない（mermaid.js にも無い）
- 振り分けの順は変えない（境界で外れた入力は `lex_name_or_str` に落ちる = mermaid.js の名前の規則に落ちるのと同じ）

### D2. 範囲外（残っている差として記録する）

merman が mermaid.js より**緩い**向きの食い違いは直さない（名前を誤って割る不具合ではない）: `starts_with_word_ci` の境界が空白と `:{}[];` だけ（`end-user`・`style-guide`・`end注文` を通す）/
`direction` を名前に使うと merman だけが誤り（mermaid.js は `direction` + 空白 + 向き の時だけ向き）/ 行頭の `u-table`・`1abc`。`LORELEI_PATCH.md` の「残っている差」に書く

### D3. Lorelei 側

- spec 13 の `quoteErName` は囲み続ける（修正後も mermaid.js の `\b` の食い違い — `Many`・`to注文`・`one-to-one` — は残り、囲むのは安全側）。
  `er-names.ts` の理由のコメントを「merman の旧版は境界なしで取った（spec 14 で直した）」に直す
- `LORELEI_PATCH.md` に節を足し、消す条件を「#146 と spec 14 の修正の両方を含む merman の版が crates.io に出たら」にする。ルートの `Cargo.toml` の古いコメントを直す

## Phase

- **P0（PoC）**: 現況の実測を写しで確かめ直す（使い捨てのテスト）。直した後に通るべき入力と、誤りのまま残るべき入力の表を作る
- **P1**（写しの修正）: D1。テスト（Red → Green）: 写しの `src/tests/er.rs` に「`to`・`one`・`many` で始まる名前とラベルが通る」（`tokens`・`topic`・`total`・`toy`・`oneshot`・
  `manyToMany`・`many_items`・`TOTAL`）と「境界は ASCII のまま」（`to`・`one`・`many`・`to注文`・ラベル `one-to-one` は誤り、`A one to onerous : x` は誤り）。
  写しの ER 図の既存のテスト 49 本が通る。Lorelei の `crates/lorelei_core/tests/editor.rs` に `to_editor` の 1 件、`src-tauri` の patch の見張り（`lib.rs` 413 行目と同じ形）に 1 件
- **P2**（台帳）: D3。`LORELEI_PATCH.md`・ルートの `Cargo.toml` のコメント・`er-names.ts` のコメント・CLAUDE.md（merman-core の写しの行）
- **P3**（上流 PR）: fork の枝に同じ差分と上流側のテストを載せ、上流のテスト（`cargo test -p merman-core` の ER 図）を通してから PR を出す。
  **PR を出す直前に、本文と差分を利用者に見せて了解を取る**（外に出す操作）。提出前に同種の issue・PR が無いことを確かめ直す

## 受け入れ条件

1. `tokens`・`topic`・`oneshot`・`manyToMany` などの ER 図のテーブル名・関係のラベルが、merman（Lorelei の MCP の `validate` / `to_editor`）で mermaid.js と同じく通る
2. `to`・`one`・`many` 単独・`to注文`・`one-to-one` は誤りのまま（mermaid.js と同じ）。`A one to onerous : x` は誤りになる（黙って化けない）
3. 写しの ER 図の既存のテストと、`cargo test --workspace`・`src-tauri` の `cargo test` が通る
4. 上流へ PR を出した（利用者の了解のうえ）。PR の番号を `LORELEI_PATCH.md` に書く

## スコープ外

- D2 の緩い向きの食い違い
- 上流の新しい版を待って写しを消すこと（消す条件だけ書く）
