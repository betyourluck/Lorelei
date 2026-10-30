# Spec: AI の書き換えの直後の人の編集が、揃え書きとして時刻を進めずに書かれる（不具合）

**ID**: 33
**Date**: 2026-10-31
**Status**: **Active** — rev0（spec 32 rev0 の査読（指摘 13）で見つけた → 裁定（「裁定」、推奨どおり）→ P0・P1 着地（「P0・P1 結果」）。残りは P2（配布ビルド。spec 32 と同じビルドで確かめる））
**Branch**: 切らない（Phase 単位で main へ直接コミット）。デスクトップ専用（`src-tauri/`・`lib/desktop/`）

## Goal

AI が `update_diagram` で開いている図を書き換えた直後に人が編集した時、その編集を「人の変更」として書く（`updated_at` を進める）。
AI が古い `expected_updated_at` のまま次の `update_diagram` を送ったら、楽観ロック（spec 08 D2）で断られ、人の編集が知らされずに上書きされないようにする

## 裁定（2026-10-31、利用者）

利用者の言: 「推奨どおりで進める」 — D1（揃え書きは準備ができた時の中身だけを待たずに書く + 保存に揃え書きの印を持たせ、印の無い保存は揃え書きにしない）・D2（`Autosaver` が走っている保存を待つ）・D3（範囲）を推奨どおりに決めた

## P0・P1 結果（2026-10-31）

- **PoC（P0）**: `__tests__/lib/desktop/normalize-race.test.tsx` 1 件目で、載せ替えの後、揃え書きの前（押した時点で保存 0 回・印が立ったまま）にツールバーの「ノード追加」を押すと、
  その後の保存で `updated_at` が AI の版のまま（`2026-09-24T12:00:02` のまま）になる赤を見た。**間合いで出たり出なかったりする**（1 回目は押すのが 1 秒の待ちより遅れて、時刻の確かめが通った）
- **入れたもの（P1、デスクトップ）**:
  - Rust `Store::save(.., normalize: bool)`・`save_document` の引数 `normalize`: 印は どの保存でも消し、`updated_at` を進めないのは揃え書き（印付き）・中身が同じ・`first_fill` の時だけ。テスト `an_unmarked_save_after_update_is_a_human_edit`（印の無い保存は進める・AI の古い版の `update` は Conflict・中身が同じなら進めない）。
    前の規則（印が立っていれば進めない）に戻すと落ちた。テストの `sv` と呼び手 6 か所は印付き（今までと同じ揃え書き）を明示
  - `Autosaver`: 保存を 1 つずつ順に送る（走っている保存の戻りを待つ）・`saveNow`（揃え書き。`touch` に上書きされない別の枠）・`cancel` は揃え書きも捨てる。テスト 3 件（走っている保存を待つ・揃え書きの後の `touch` は印の無い別の保存・cancel）
  - `use-doc-session`: 準備ができてから最初の保存だけを、その時の中身で `saveNow`（印付き）。以後は `touch`。外枠が消える時に `autosaver.cancel()`（failures #54）
  - **途中で見つけた前からの不具合**（failures #53）: 位置を当てる指示の直後に当たる前のノードの変化が 1 回届き、それで準備済み（保存・見せる・**Undo の起点**）になっていた。
    `onNodesChanged` に `awaitingLayout` を足し、ノードが実際にその位置になったのを見てから準備済みにした。テスト 1 件（当たる前は保存しない・当たったら保存・位置の無いキーは見ない）
  - 偽のバックエンドの `save_document` を Rust と同じ規則にした（中身が同じなら書かない・印の規則）
- **壊して落ちるか**: 揃え書きを `touch` に戻すと spec 33 のテストが、`awaitingLayout` を見ないと 4 件が落ちた
- vitest の全部（110 ファイル 1242 件）が緑で終了コード 0、`tsc` 0 件、eslint 0。`src-tauri` の Rust のテスト 51 件が緑
- spec 08 の台本（`update-diagram.test.tsx` の 3 件・起動直後の載せ替え）と spec 30 のデスクトップのテスト 4 件は通る

## 現況（2026-10-31、コードを読んだ。実物での再現はまだ — P0）

- **揃え書き**（spec 08 D1）: `update_diagram` は書き換えた図に `normalize_pending` を立てる。その後の最初の保存は、中身が何であっても `normalize_pending` を消して書き、`updated_at` を進めない（`documents.rs:226-236`）。
  エディタの生成器が書いた形（揃えた形）に直すだけの書き込みを、AI の書き換えと同じ版に数えるため
- **載せ替えの後の保存**: 図の準備ができると、`onNodesChanged` が `save: true` を返し、`autosaver.touch` で **1 秒待ってから** 保存する（`use-doc-session.ts:391-402`、`AUTOSAVE_DELAY_MS = 1000`）。
  `touch` は待っている中身を差し替える（`doc-session.ts:192-201`）ので、**その 1 秒の間の人の編集（ドラッグ・ラベル・ノード追加など）は揃え書きの中身に混ざり、`updated_at` を進めずに書かれる**
- 結果: AI が持っている `expected_updated_at`（書き換えの戻りの `updated_at`）はそのまま通る。AI が読み直さずに次の `update_diagram` を送ると、人の編集は知らされずに上書きされる（spec 08 が防ぎたかった形）
- 起動直後に載せ替えが届いていた時（failures #13 の経路）も、準備ができた後は同じ `touch` を通る

## 決めること

### D1. 直し方

- **推奨: 揃え書きは、図の準備ができた時の中身だけを、待たずにすぐ書く**（`touch` ではなく即時の保存）。その後の変更は、揃え書きの戻りを待ってから普通の保存（`updated_at` を進める）で書く
  - 揃え書きが走っている間の人の編集は、揃え書きの戻りで新しくなった `base_updated_at` を添えて次の保存で書く
- **堅くする（推奨、D1 と重ねる）**: `save_document` に「揃え書きか」の印を引数で持たせ、印の無い保存は `normalize_pending` が立っていても揃え書きにしない（`updated_at` を進め、印を消す）。
  フロントの取り違えがあっても Rust が人の編集を AI の版に数えない
- 案（採らない）: 揃え書きをやめる — 開いただけで `updated_at` が進み、AI の楽観ロックが毎回断られる（spec 08 の前の問題に戻る）

### D2. 自動保存の列

- 揃え書きの即時の保存と、その後の保存の順序を守るため、`Autosaver` が走っている保存の Promise を持ち、`flush` はそれも待つ（spec 32 D1 の「確定を自動保存の列に並べる」と同じ直し。こちらで先に入れる）

### D3. 範囲

- デスクトップだけ（Web 版には保存が無い）。MCP のツールの入出力は変えない（`save_document` は GUI のコマンド。data_contract の `Document.save_normalize` と `GuiCommands.save_document` の引数を改める）

## 受け入れ条件（rev0）

1. **PoC（Red → Green）**: 載せ替えの後、揃え書きの前（1 秒以内）に人がノードを足すと、今のコードでは `updated_at` が進まず AI の古い `expected_updated_at` が通ることを、偽のバックエンドのテストで先に赤にする。直した後は、揃え書きは AI の中身だけを `updated_at` を進めずに書き、人の編集は `updated_at` を進めて書き、AI の古い `expected_updated_at` は断られる
2. Rust: 印の無い保存は `normalize_pending` でも `updated_at` を進めて印を消す。印のある保存は今の揃え書き
3. 走っている保存の後の保存が `STALE_BASE` にならない（`flush` が待つ）。`leave()`（図を離れる時）も走っている保存を待つ
4. spec 08 の台本（`update-diagram.test.tsx` の 3 件・起動直後の載せ替え failures #13）が通る
5. `tauri dev` か配布ビルドで、AI の書き換えの直後にノードを動かし、AI の次の `update_diagram` が断られることを確かめる（MCP の HTTP の口を直接叩く）

## Phase

- **P0**: 偽のバックエンドで再現のテストを書いて赤を見る（PoC）。data_contract を改める（`Document.save_normalize`・`save_document` の引数）
- **P1**: Rust（印の引数）・`lib/desktop`（揃え書きの即時の保存・`Autosaver` の待ち）→ テストが緑
- **P2**: `tauri dev` か配布ビルドで確かめる

## スコープ外

- AI の書き換えを Undo の 1 手にする（spec 32 D6、後の候補）
