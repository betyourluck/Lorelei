# Spec: AI の書き換えの直後の人の編集が、揃え書きとして時刻を進めずに書かれる（不具合）

**ID**: 33
**Date**: 2026-10-31
**Status**: **Draft** — rev0（spec 32 rev0 の査読（指摘 13）で見つけた。D1〜D3 の裁定待ち。spec 32 より先に直す）
**Branch**: 切らない（Phase 単位で main へ直接コミット）。デスクトップ専用（`src-tauri/`・`lib/desktop/`）

## Goal

AI が `update_diagram` で開いている図を書き換えた直後に人が編集した時、その編集を「人の変更」として書く（`updated_at` を進める）。
AI が古い `expected_updated_at` のまま次の `update_diagram` を送ったら、楽観ロック（spec 08 D2）で断られ、人の編集が知らされずに上書きされないようにする

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
