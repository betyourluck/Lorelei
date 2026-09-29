# Spec: merman の ER 図の字句解析で、`to`・`one`・`many` を語の境界で取る（写しの修正と上流 PR）

**ID**: 14
**Date**: 2026-09-29
**Status**: **Done**（2026-09-29。rev1 → P0〜P3 着地。上流 PR [Latias94/merman#153](https://github.com/Latias94/merman/pull/153) は 2026-09-29 にマージ済み（`2d70832e`） —「P3 結果」「受け入れ条件の結果」）
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
- この判定を `many`・`one`・`to` と複数語の 8 つ、`|o`・`}o` の一致の条件に足す。`many(0)`・`many(1)`・`0+`・`1+` と記号には足さない（mermaid.js にも無い）。
  記号のうち `|o`・`}o` だけに足すのは、末尾が語の文字 `o` だから（mermaid.js もこの 2 つだけ `\b` を持つ。`||`・`o{` などは末尾が記号で、後ろに語が続いても境界は要らない）
- 振り分けの順は変えない（境界で外れた入力は `lex_name_or_str` に落ちる = mermaid.js の名前の規則に落ちるのと同じ）

### D2. 範囲外（残っている差として記録する）

merman が mermaid.js より**緩い**向きの食い違いは直さない（名前を誤って割る不具合ではない）: `starts_with_word_ci` の境界が空白と `:{}[];` だけ（`end-user`・`style-guide`・`end注文` を通す）/
`direction` を名前に使うと merman だけが誤り（mermaid.js は `direction` + 空白 + 向き の時だけ向き）/ 行頭の `u-table`・`1abc`。`LORELEI_PATCH.md` の「残っている差」に書く

### D3. Lorelei 側

- spec 13 の `quoteErName` は囲み続ける（修正後も mermaid.js の `\b` の食い違い — `Many`・`to注文`・`one-to-one` — は残り、囲むのは安全側）。
  `er-names.ts` の理由のコメントを「merman の旧版は境界なしで取った（spec 14 で直した）」に直す
- `LORELEI_PATCH.md` に節を足し、消す条件を「#146 と spec 14 の修正の両方を含む merman の版が crates.io に出たら」にする。ルートの `Cargo.toml`（33〜34 行目）と
  `src-tauri/Cargo.toml`（39〜41 行目）の、#146 の時の古いコメントを直す

## Phase

- **P0（PoC）**: 現況の実測を写しで確かめ直す（使い捨てのテスト）。直した後に通るべき入力と、誤りのまま残るべき入力の表を作る
- **P1**（写しの修正）: D1。テスト（Red → Green）: 写しの `src/tests/er.rs` に「`to`・`one`・`many` で始まる名前とラベルが通る」（`tokens`・`topic`・`total`・`toy`・`oneshot`・
  `manyToMany`・`many_items`・`TOTAL`）と「境界は ASCII のまま」（`to`・`one`・`many`・`to注文`・ラベル `one-to-one` は誤り、`A one to onerous : x` は誤り）。
  写しの ER 図の既存のテスト 49 本が通る。写しは workspace の外（ルートの `Cargo.toml` の `exclude = ["vendor"]`）なので、写しのテストは `cargo test --manifest-path vendor/merman-core/Cargo.toml` で回す
  （`cargo test --workspace` では走らない）。写しの中で回すと `vendor/merman-core/Cargo.lock` ができ、これは `.gitignore` で除かれない（`target/` は除かれる）— **コミットに入れない**。
  コミット前に `git status --short` の件数を見る（failures #1）。Lorelei の `crates/lorelei_core/tests/editor.rs` に `to_editor` の 1 件、`src-tauri` の patch の見張り（`lib.rs` 413 行目と同じ形）に 1 件
- **P2**（台帳）: D3。`LORELEI_PATCH.md`・ルートと `src-tauri` の `Cargo.toml` のコメント・`er-names.ts` のコメント・CLAUDE.md（merman-core の写しの行）
- **P3**（上流 PR）: fork の枝に同じ差分と上流側のテストを載せ、上流のテスト（`cargo test -p merman-core` の ER 図）を通してから PR を出す。
  **PR を出す直前に、本文と差分を利用者に見せて了解を取る**（外に出す操作）。提出前に同種の issue・PR が無いことを確かめ直す

## 受け入れ条件

1. `tokens`・`topic`・`oneshot`・`manyToMany` などの ER 図のテーブル名・関係のラベルが、merman（Lorelei の MCP の `validate` / `to_editor`）で mermaid.js と同じく通る
2. `to`・`one`・`many` 単独・`to注文`・`one-to-one` は誤りのまま（mermaid.js と同じ）。`A one to onerous : x` は誤りになる（黙って化けない）
3. 上流の作業場所（上流 main に同じ差分を当てたもの）で `merman-core` の全テストと `merman-render` の ER 図のテストが通り、Lorelei の `cargo test --workspace`・`src-tauri` の `cargo test` が通る
   （rev1 の「写しのテストを `--manifest-path` で回す」は成り立たなかった —「P0・P1 結果」）
4. 上流へ PR を出した（利用者の了解のうえ）。PR の番号を `LORELEI_PATCH.md` に書く

## スコープ外

- D2 の緩い向きの食い違い
- 上流の新しい版を待って写しを消すこと（消す条件だけ書く）

## 査読の採否（rev0 → rev1）

査読 1 本（利用者の持ち込み。同じ本文が 2 回貼られていたので 1 本として扱う）。指摘はファイルで確かめてから採った。

| 指摘 | 採否 | 反映 |
|---|---|---|
| 1: `src-tauri/Cargo.toml` の古いコメント（39〜41 行目）が D3・P2 に無い | 採る | D3・P2 に足した |
| 2: 写しは workspace の外で、`cargo test --workspace` では写しのテストが走らない / failures #1 の `target/` | 採る（加えて、`vendor/merman-core/Cargo.lock` は今の `.gitignore` で除かれないことを確かめた） | P1 に回し方・Cargo.lock を入れないこと・`git status --short` の件数、受け入れ条件 3 に `--manifest-path` |
| 3: 記号のうち `|o`・`}o` だけに境界を足す理由 | 採る | D1 に「末尾が語の文字 `o` だから」 |

## P0・P1 結果（2026-09-29）

| コミット | 中身 | テスト（Red → Green） |
|---|---|---|
| `bd2962a`（写しの修正 = 上流 PR と同じ差分） | `vendor/merman-core/src/diagrams/er.rs` に `ends_word_at`（直後が入力の終わりか ASCII の `[A-Za-z0-9_]` 以外）を足し、複数語の 8 つ・`many`・`one`・`to`・`|o`・`}o` の一致の条件に。`src/tests/er.rs` に 2 本 | 上流の作業場所で: 足した 2 本は直す前に 2 本とも落ち、直した後に通る |
| `2ef2682`（Lorelei 側） | `crates/lorelei_core/tests/editor.rs` に 2 本、`src-tauri/src/lib.rs` に patch の見張り 1 本 | `lorelei_core` の 2 本は直す前に落ち（`tokens` は `unexpected identifying; expected name`、`A one to onerous : x` は通ってしまう）、直した後に通る |

- **P0（確かめ直し）**: 上のとおり、Lorelei 側のテストを直す前に回した結果が、エージェントの下調べの実測（誤りと化け）と一致した
- **写しの中では merman-core のテストをコンパイルできない**: 写しのテストは上流のリポジトリの `fixtures/` を `include_str!` で読む（`flowchart.rs:2341`・`theme.rs:478`）。
  rev1 で査読から採った「`cargo test --manifest-path vendor/merman-core/Cargo.toml` で回す」は、採る前に回して確かめていなかった。前回（#146）も上流側のテストは上流で回していた（`LORELEI_PATCH.md`）
- **上流の作業場所**: 上流 main（`72c02477`）を scratchpad に `--depth 1` で clone（Windows では fixtures のファイル名が長く、`git -c core.longpaths=true clone` が要る）。
  上流の `crates/merman-core/src/diagrams/er.rs`・`src/tests/er.rs` は写しの HEAD と同じ（改行を揃えて一致）なので、直した写しの 2 ファイルを LF にして置いた。
  `cargo test -p merman-core`: 単体 1,554 本と結合テストすべて通過。`cargo test -p merman-render er`: 通過（ER 図の描画のゴールデンは動かない）
- 写しの中で `cargo test` を回した時にできた `vendor/merman-core/Cargo.lock` は消した（コミットしていない）
- Lorelei: `cargo test --workspace`・`src-tauri` の `cargo test` 通過

## P2 結果（2026-09-29）

- `vendor/merman-core/LORELEI_PATCH.md` に「2. ER 図の多重度の語を語の境界で取る」（症状 / 原因 / 修正 / テスト / 経緯 / 残っている差）を足し、冒頭の消す条件を「1 と 2 の両方を含む版が出たら」にした
- ルートと `src-tauri` の `Cargo.toml` の `[patch.crates-io]` のコメント、`features/er-diagram/utils/er-names.ts` の理由のコメント（フォーク元のコードなので Lorelei・spec への言及は入れない）、CLAUDE.md の merman-core の行と現状

## P3 結果（2026-09-29）

- 上流 main（`72c02477`）の作業場所に枝 `fix/er-cardinality-word-boundary` を切り、写しと同じ差分をコミット（`f4b362bc`、2 ファイル +81 −5）。
  `rustfmt --check --edition 2024`（変えた 2 ファイル。`cargo fmt --all` はこの Windows で os error 206、#146 と同じ）・`cargo clippy -p merman-core --all-targets -- -D warnings` 通過
- 提出前に確かめ直したこと: 同種の issue・PR が無い / PR の表の 10 行を mermaid.js 11.17.2（TS の境界 `readMermaidDiagram`）・上流 main・修正後の 3 つで実測し、すべて表どおり /
  上流の `fixtures/er/` と `_deferred/er` の 102 本で、列のブロックの外に `to`・`one`・`many` で始まる囲まない語が無い（関係の記号 `o{` を除いてから数えた。最初の数え方は `o{` をブロックの始まりと数える穴があった）
- 利用者が本文と差分を読んで了解したうえで、fork（`betyourluck/merman`）へ push し、**PR #153** を作った（題 `fix(er): match cardinality words only at a word boundary`、本文は上流のテンプレートに沿う英語）

### 受け入れ条件の結果（2026-09-29）

| # | 結果 | 根拠 |
|---|---|---|
| 1 | **通過** | `lorelei_core` の `er_names_may_start_with_cardinality_words_like_mermaid_js`、`src-tauri` の見張り |
| 2 | **通過** | `er_cardinality_word_boundary_is_ascii_like_mermaid_js`、上流の `parse_diagram_er_cardinality_word_boundary_is_ascii` |
| 3 | **通過** | 上流の作業場所で `merman-core` 全テスト・`merman-render` の ER 図のテスト、Lorelei の `cargo test --workspace`・`src-tauri` の `cargo test` |
| 4 | **通過** | PR #153 を提出（マージは上流次第）。番号を `LORELEI_PATCH.md` に書いた |

## マージ（2026-09-29）

- 上流の Latias94 がテストを 1 コミット足して（`83b5b205` `test(er): cover cardinality alias word boundaries`）マージした（`2d70832e`）。lexer（`er.rs`）はマージ版と写しで同じ
- 写しの `src/tests/er.rs` をマージ版に揃えた（+35 行。`|o`・`}o`・複数語の多重度の直後に名前が続くと誤り、`A one optionally toone B` も誤り）。写しの挙動は変わらない
- crates.io の最新は 2026-09-30 時点で `0.8.0-alpha.6` のまま。#146 と #153 の両方を含む版が出たら写しと patch を消す

