# Spec: 最後の「確定」へ戻す（デスクトップ）

**ID**: 32
**Date**: 2026-10-31
**Status**: **Draft** — rev0（spec 30 rev1 の査読で、spec 30 rev0 の D4・D5 を分けて起票。D1〜D6 の裁定待ち。spec 30 の後に進める）
**Branch**: 切らない（Phase 単位で main へ直接コミット）。デスクトップ専用（`src-tauri/`・`lib/desktop/`）。エディタに「取り込みと位置を 1 回で当てる口」を足すならフォーク元の改善のコミットに分ける

## Goal

利用者の言（2026-10-30、spec 30 と同じ）: 「現在では確定ボタンはほとんど意味をなしていない。せめて確定するまえに戻せるなどがよい」

デスクトップの「確定」を**戻れる区切り**にする: 確定した時の中身を残し、最後に確定した中身へ戻せるようにする。あわせて、AI の書き換え（`update_diagram`）を人が取り消せるようにする

## 現況（2026-10-31、コードを読んだ。spec 30 rev1 の査読で確かめたもの）

- **「確定」**（spec 02 D12）: `mark_document_saved`（Rust の `mark_saved`, `documents.rs:278-284`）が `saved_at` を書いて一覧の先頭へ上げ、● を消すだけ。**確定した時の中身は残していない**
- **● は時刻で決まる**: `unsaved = updated_at > (saved_at ?? created_at)`（`documents.rs:71-73`、data_contract `DocumentSummary.unsaved`・MCP の `DiagramSummary.unsaved`）。
  中身を確定と同じに戻しても、自動保存は中身が変わるので `updated_at` を進め（`documents.rs:235`）、● は消えない
- **確定と自動保存の競合**: `Autosaver.flush` は、待ち時間で走り出した保存を待たない（`doc-session.ts` の `flush`: `pending` を取り出した後なので空と見て戻る）。その保存の途中で「確定」を押すと、`mark_saved` が先に走りうる。
  ツールバーの「確定」は `disabled={!current}` だけで（`toolbar.tsx:95`）、開いている途中（`source` が空、`first_fill` の前）でも押せる
- **残っている過去の版**: AI の `update_diagram` が書き換える前の 1 世代だけ（`history/{id}.json`, spec 08 D5。GUI からは戻せない）
- **載せ替え**（spec 08 D3）: 取り込み（`handleImportMermaid`）→ 次の描画で位置（`withLayout`）と段に分かれ、最初の保存は揃え書き（`normalize_pending`、`updated_at` を進めない, `documents.rs:226-236`）
- **MCP の読み戻し**: `readback::read` は欄を選んで `Diagram` を組む（`readback.rs:31-35`）ので、`Document` に欄を足しても MCP の出力には出ない。`update`・`save` は構造体を写し直すので、足した欄は残る。`history/`・ごみ箱へはファイルごと動く
- Lorelei の前の版で開き直すと、未知の欄は捨てて書く（serde の既定）

## 決めること

### D1. 確定した中身を残す

- **推奨: `Document.confirmed: { source, layout, saved_at }`（`documents/{id}.json` の中、`#[serde(default, skip_serializing_if = "Option::is_none")]`）**。「確定」で書く
- **確定はフロントが今の `source`・`layout`・`base_updated_at` を送り、Rust が自動保存と `confirmed` を 1 つの鍵の中で書く**（競合で古い中身を `confirmed` にしない）。空の `source` は `confirmed` にしない。確定は図の準備ができている時だけ押せる
- `DocumentSummary` に「確定した中身があるか」を足す（ボタンの出し分け）。data_contract `DocumentSummary.fields`・`fake-backend.ts`・`serializes_with_contract_names` のテストも追従する
- この版より前に確定した図は `saved_at` があっても `confirmed` が無い（押せない理由を `title` で言う）

### D2. ● の決め方

- 案 A: `confirmed` がある図は「`source`・`layout` が `confirmed` と同じか」で `unsaved` を決める（戻せば ● が消える）。MCP の `DiagramSummary.unsaved` の意味も変わるので data_contract を改める。位置の小数が往復で同じになるか（`withLayout` は相対に直し、`collectLayout` は絶対に足し戻す）を P0 で確かめる
- 案 B: ● は今のまま時刻で決め、「戻した後も ● が残る」とする
- **推奨は P0 の後に決める**（位置の往復が一致しなければ案 A は ● が消えない図を作る）

### D3. 「確定へ戻す」

- **推奨**: ツールバーの「確定」の隣に「確定へ戻す」。押すと確認を出してから、`confirmed` の中身をエディタに載せ直す。戻す操作も spec 30 の 1 手（Undo で取り消せる）
- 押せるのは、`confirmed` があり、確定の後に変更がある時だけ（D2 で「変更がある」の意味が決まる）
- `original_source`（作った・取り込んだ・AI が届けた時の中身）へ戻す案は入れない（位置を持たず、`update_diagram` で上書きされる）
- MCP には何も足さない（`read_diagram` は今の中身を返す）。`update_diagram` は `confirmed` を変えない

### D4. 載せ直す経路

- **推奨: エディタに「取り込みと位置を 1 回の `setNodes` で当てる」口を作り**（`withLayout` は位置と変数名しか使わない純粋な関数なので、同じエディタの中なら同期で当てられる）、確定へ戻すと AI の載せ替えの両方をこれで 1 手にする
- 載せ替えの経路を変えるので、failures #4〜#13 の台本（載せ替え・初期図の保険・開いている途中）を回し直す

### D5. AI の書き換えを 1 手にする（spec 30 rev0 の D4）

- D4 の口ができたら、載せ替えを spec 30 の 1 手にする（戻すと AI が書き換える前の図）
- **揃え書きとの順序**: 載せ替えの 1 手を記録するのは、揃え書きが書き終わった後にする（位置を当てたら待たずに flush する）。それまでは Undo を効かせない。
  これが無いと、載せ替えから 1 秒以内に戻した中身が揃え書きとして `updated_at` を進めずに書かれ、AI が持つ `expected_updated_at` が通って、人の戻しを知らずに上書きできる（spec 30 の査読 5）
- 偽のバックエンド（`fake-backend.ts` は揃え書きを真似ている）で Red → Green にする

### D6. 範囲

- デスクトップだけ（Web 版には「確定」が無い）。spec 30 の Undo/Redo の後に進める（D3・D5 は spec 30 の履歴を使う）

## 受け入れ条件（rev0）

1. 確定すると `confirmed` に今の中身と位置が残る。自動保存と競合しても `confirmed` は確定を押した時の中身。開いている途中は確定できない
2. 「確定へ戻す」で最後に確定した中身と位置に戻り、それも Undo で取り消せる。確定したことの無い図・この版より前に確定した図・変更の無い図では押せない（理由を `title` で）
3. ● が D2 の裁定どおりに出る
4. AI の書き換えを 1 手で戻せ、その後の AI の `update_diagram` は楽観ロックで断られる（載せ替えから 1 秒以内に戻した時も）
5. 古い `documents/{id}.json`（`confirmed` が無い）を読める。MCP の出力に `confirmed` が出ない
6. テスト（Rust・vitest）。要の分岐を壊して落ちる
7. 配布ビルドで利用者が確かめる

## Phase

- **P0**: 位置の往復の一致（D2）、D4 の口の形、data_contract の名詞を凍結（`Document.confirmed`・`DocumentSummary` の欄・`unsaved` の意味）
- **P1**: Rust（`confirmed`・確定の書き方・`DocumentSummary`）
- **P2**: エディタの口（フォーク元の改善のコミット）・`lib/desktop`（確定へ戻す・載せ替えを 1 手に）→ `tauri dev`
- **P3**: 配布ビルドで利用者が確かめる

## スコープ外

- 確定を何世代も残す（最後の 1 つだけ）
- `history/`（`update_diagram` の 1 世代）を GUI から戻す
