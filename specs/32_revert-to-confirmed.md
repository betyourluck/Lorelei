# Spec: 最後の「確定」へ戻す（デスクトップ）

**ID**: 32
**Date**: 2026-10-31
**Status**: **Draft** — rev1（spec 30 rev1 の査読で spec 30 rev0 の D4・D5 を分けて起票 → 査読 1 本（「査読の採否」）→ rev1。D1〜D6 の裁定待ち。rev1 で「AI の書き換えを 1 手にする」を外し、
査読で見つけた今ある不具合（載せ替えの後の揃え書きに人の編集が混ざる）を [spec 33](33_normalize-race.md) に分けた。spec 33 の後に進める）
**Branch**: 切らない（Phase 単位で main へ直接コミット）。デスクトップ専用（`src-tauri/`・`lib/desktop/`）。エディタの取り込みに足す省略できる引数（D4）だけフォーク元の改善のコミットに分ける

## Goal

利用者の言（2026-10-30、spec 30 と同じ）: 「現在では確定ボタンはほとんど意味をなしていない。せめて確定するまえに戻せるなどがよい」

デスクトップの「確定」を**戻れる区切り**にする: 確定した時の中身を残し、最後に確定した中身へ戻せるようにする。● は「最後の確定と中身が違う」を表すようにする（戻せば ● が消える）

## 現況（2026-10-31、コードを読んだ。rev1 で査読の確かめを足した）

- **「確定」**（spec 02 D12）: `mark_document_saved`（Rust の `mark_saved`, `documents.rs:278-284`）が `saved_at` を書いて一覧の先頭へ上げ、● を消すだけ。**確定した時の中身は残していない**。
  フロントの `save()` は `autosaver.flush()` の後に呼び、flush が捨ててよい失敗（`STALE_BASE`・`INITIAL_FIGURE_REJECTED`・`DOCUMENT_GONE`, `use-doc-session.ts:187`）を成功として扱って、そのまま確定へ進む
  （AI が書いた、人が見ていない中身を確定しうる）
- **確定を押せる時**: ツールバーの「確定」は `disabled={!current}` だけ（`toolbar.tsx`）。**Ctrl+S（`desktop-shell.tsx` の keydown）は何も止めていない** — 開いている途中・開けない図（`unopenable`）・ダイアログが開いている間も確定が走る
- **● は時刻で決まる**: `unsaved = updated_at > (saved_at ?? created_at)`（`documents.rs:71-73`、data_contract `DocumentSummary.unsaved`・MCP の `DiagramSummary.unsaved`）。
  中身を確定と同じに戻しても、自動保存は中身が変わるので `updated_at` を進め（`documents.rs:235`）、● は消えない
- **確定と自動保存の競合**: `Autosaver.flush` は、待ち時間で走り出した保存を待たない（`doc-session.ts:204-216`）。その保存（base B0）の途中で確定も B0 を添えて送ると、自動保存が先に鍵を取れば確定が `STALE_BASE` で落ち、
  確定が先なら自動保存の `STALE_BASE` が「AI が図を書き換えたので開き直します」を誤って出しうる（`use-doc-session.ts:164-171`）。flush の待ち漏れは `leave()` にも効いている
- **載せ直す経路**: 開く・載せ替える経路（`useDesktopOpen` の `take` → `beforeImport` → `handleImportMermaid` → 次の描画で `withLayout`）は `becomeCurrent` で準備を false にし、`hide()` で epoch を進めて Undo の履歴を捨てる（spec 30 D3）。
  エディタの `handleImportMermaid` は data があれば同期で、向き・テーマ・ノード・線・番号を 1 回で当てる（`flow-editor.tsx:564-693`、`er-diagram-editor.tsx:162-193`）
- **要約の写し**: `becomeCurrent` が通す `summaryOf`（`use-doc-session.ts:81-90`）は欄を選んで写す。`open()` が渡すのは `load_document` の `Document`（要約で計算する欄を持たない）
- **MCP の読み戻し**: `readback::read`・`summary()` は欄を選ぶ（`readback.rs:31-49`）ので、`Document` に欄を足しても MCP には出ない。`update`・`save` は読んで直して書くので、足した欄は残る。ごみ箱・`history/` へはファイルごと動く。`Document` に `deny_unknown_fields` は無い
- **位置の往復**: `withLayout` は絶対座標を相対に直し、`collectLayout` は親を足し戻す。`collectLayout` が作った値の往復は一致するが、互いに無関係な値の `(a − b) + b` は浮動小数点で一致しないことがある（査読の試算、`453.18 → 453.18000000000006`）

## 決めること

### D1. 確定の書き方

- **推奨: 新しいコマンド `confirm_document(id, source, layout, base_updated_at)` で `mark_document_saved` を置き換える**（呼び手は `use-doc-session` の `save` だけ）。
  Rust は 1 つの鍵の中で、`save` と同じ中身の書き込み（内部の関数に切り出す。楽観ロック・`first_fill`・初期図の保険がそのまま揃う）→ `saved_at` と `confirmed: { source, layout }` を書く
  - `STALE_BASE`・`INITIAL_FIGURE_REJECTED`・`DOCUMENT_GONE` なら確定しない（`confirmed` も `saved_at` も書かず、知らせる）。空の `source` は確定しない
  - `normalize_pending` が立っていれば、確定は印を消し、中身がファイルと違えば `updated_at` を進める（揃え書きとして通さない）
  - `#[serde(default, skip_serializing_if = "Option::is_none")]`。Lorelei の前の版がその図を**書く**と `confirmed` は消える（中身が同じで書かない時は残る）
- **フロントは確定を自動保存の列に並べる**: `Autosaver` が走っている保存の Promise を持ち、`flush` はそれも待つ。確定は待ち終えて `base_updated_at` が新しくなってから送る（`leave()` の待ち漏れも同じ直しで塞ぐ）
- **押せる時**: 図の準備ができている時（`historyReady`。開けない図では false）だけ。ダイアログが開いている間も止める。ツールバーのボタンと Ctrl+S の両方
- **前の版で確定した図の移行**: `saved_at` があって `updated_at ≤ saved_at` なら今の中身が確定した中身そのものなので、Rust が読んだ時に `confirmed` を埋める（次の書き込みで残る）。そうでない図は「確定へ戻す」を押せない（`title` で理由）

### D2. ● の決め方

- **推奨: 案 A — `confirmed` がある図は「`source` が完全一致、`layout` はキーの集合が同じで各値の差が 1e-6 以下」なら ● を付けない**。`confirmed` が無い図は今の時刻の規則のまま
  - 生成器や位置の往復が崩れる図は、今でも開いただけで ● が付く（`save` の完全一致の比べ）。**案 A が今より悪くなる図は無い**
  - MCP の `DiagramSummary.unsaved` の意味が「最後の確定の後に中身が違う」に変わる（今のツールの説明の文にむしろ近い）。data_contract・`lorelei_mcp/src/lib.rs` の説明・`documents.rs`・LORELEI.md・`fake-backend.ts` を追従する
- 案 B: ● は今の時刻のまま（戻しても ● が残り、D3 の「変更がある時だけ押せる」も成り立たない）。採らない
- 案（採らない）: `source` だけを比べる — 位置だけの変更で ● が出なくなる

### D3. 「確定へ戻す」

- **推奨**: ツールバーの「確定」の隣に「確定へ戻す」。押すと確認を出してから、`confirmed` の中身をエディタに載せ直す。**戻す操作は spec 30 の 1 手**（Undo で取り消せる）
- 押せるのは、`confirmed` があり ● が付いている（D2）時だけ。ボタンの出し分けは、● と同じく一覧の項目（`DocumentSummary`）から読む（`summaryOf` と `load_document` の写しは使わない）
  - ボタンと ● は保存の戻り（約 1 秒後）で変わる。編集の直後と戻した直後に 1 秒遅れるのは許す（`title` に書かない）
- `original_source`（作った・取り込んだ・AI が届けた時の中身）へ戻す案は入れない（位置を持たず、`update_diagram` で上書きされる）
- MCP には何も足さない（`read_diagram` は今の中身を返す）。`update_diagram` は `confirmed` を変えない

### D4. 載せ直す経路

- **推奨: 開く・載せ替える経路は使わず、門（`HistoryGate`）を開けたまま、その場で 1 回の描画で当てる**
  - `await convertSource(confirmed.source)` は門が開いたまま済ませる（エディタはまだ変えない）。済んだら、**図の id と epoch が押した時と同じかを確かめてから**同期でエディタの取り込みを呼ぶ（await の間に別の図を開く・載せ替え・ごみ箱が起きたら当てない）
  - **口**: エディタの `handleImportMermaid` に省略できる第 2 引数 `adjust?: (nodes) => nodes` を足し、`setNodes` の直前にかける（各エディタ 2 行、フォーク元の改善のコミット。`lib/desktop` を参照しない。Web 版のパネルは引数 1 つで呼ぶので変わらない）。デスクトップからは `withLayout(confirmed.layout)` を渡す。取り込みは `DesktopActions` に載せて外枠から呼ぶ
  - これで取り込みと位置が 1 回の `setNodes` になり、Undo の 1 手にまとまる（2 段だと記録のフレームで割れうる）。`onNodesChanged` も準備ができたまま普通の自動保存へ進む
- 確認のダイアログが閉じ切ってから当てる（閉じかけのダイアログが DOM に残ると、記録が保留されて次の編集と 1 手にまとまる, spec 30 D1）

### D5. 範囲

- デスクトップだけ（Web 版には「確定」が無い）。spec 33（揃え書きの不具合）の後に進める（D1 の自動保存の列は spec 33 の直しと同じ所を触る）

### D6. AI の書き換えを 1 手にする（rev0 の D5）

- **推奨: この spec から外す**（後の候補）。載せ替えの経路（spec 08）と揃え書きの再設計で、危険の範囲が違う。spec 30 の裁定 D4（載せ替えで履歴を捨てる）とそのテストを覆すことになる。
  AI の変更を取り消したい時は、この spec の「確定へ戻す」で戻せる

## 受け入れ条件（rev1）

1. 確定すると `confirmed` に今の中身と位置が残る。走っている自動保存と重なっても `STALE_BASE` や偽の「開き直します」が出ず、`confirmed` は確定を押した時の中身
2. 確定は `STALE_BASE`・初期図の保険・ごみ箱・空の中身では書かない。準備の前・開けない図・ダイアログの間は、ボタンも Ctrl+S も効かない
3. 「確定へ戻す」で最後に確定した中身と位置（枠の入れ子・枠の大きさを含む）に戻り、戻した後の自動保存で ● が消え、それも Undo で取り消せる。await の間に図が替わると当てない
4. 確定したことの無い図・確定の後に変更の無い図では押せない。前の版で確定した図は D1 の移行どおり
5. ● が D2 の規則で出る（Rust・MCP の `list_diagrams` も同じ）。生成器の往復（開くだけで書かない）を fixture の全部の図で確かめる
6. 古い `documents/{id}.json`（`confirmed` が無い）を読める。MCP の出力に `confirmed` が出ない
7. テスト（Rust・vitest）。要の分岐を壊して落ちる
8. 配布ビルドで利用者が確かめる

## Phase

- **P0**: 生成器と位置の往復を fixture の全部の図で確かめる（D2 の許容誤差の当たり）、data_contract の名詞を凍結（`Document.confirmed`・`confirm_document`・`DocumentSummary` の欄・`unsaved` の意味）
- **P1**: Rust（`confirm_document`・`confirmed`・移行・`unsaved`・MCP の説明）
- **P2**: エディタの取り込みの `adjust`（フォーク元の改善のコミット）・`lib/desktop`（確定の列・押せる時・確定へ戻す）→ `tauri dev`
- **P3**: 配布ビルドで利用者が確かめる

## スコープ外

- AI の書き換えを Undo の 1 手にする（D6、後の候補）
- 確定を何世代も残す（最後の 1 つだけ）
- `history/`（`update_diagram` の 1 世代）を GUI から戻す

## 査読の採否（rev1、2026-10-31）

査読 1 本（こちらから依頼、spec とコードだけを渡した）。根拠の行（`touch` が待ち中の中身を差し替える・`normalize_pending` なら中身に依らず `updated_at` を進めない・`flush` が走り出した保存を待たない・Ctrl+S が止めない）はコードで確かめてから採った。

| # | 指摘 | 採否 |
| - | ---- | ---- |
| 現況 | 確定の disabled の行・Ctrl+S が止めていない・前の版で消えるのは書いた時・開けない図でも確定できる | **採る** — 現況・D1 |
| 1 | 確定と走っている自動保存の base が食い違う | **採る** — D1（確定を自動保存の列に並べる） |
| 2 | 確定の時の STALE_BASE・初期図・ごみ箱の扱い | **採る** — D1・受け入れ条件 2 |
| 3 | `normalize_pending` の時の確定 | **採る** — D1 |
| 4 | Rust の形（内部の関数に切り出す）・`mark_document_saved` を置き換える | **採る** — D1 |
| 5 | 「確定した中身があるか」は `summaryOf`・`load_document` の写しを通らない | **採る** — D3（一覧の項目から読む） |
| 6 | 前の版で確定した図の移行 | **採る** — D1 |
| 7 | 案 A を推す。位置は許容誤差で | **採る** — D2 |
| 8 | `unsaved` の意味を変える追従の範囲 | **採る** — D2 |
| 9 | 開く・載せ替える経路を使うと 1 手にならない。その場で 1 回で当てる口 | **採る** — D4 |
| 10 | await の間に図が替わった時の守り | **採る** — D4・受け入れ条件 3 |
| 11 | 確認のダイアログとの順序 | **採る** — D4 |
| 12 | ボタンと ● が 1 秒遅れる | **採る** — D3（許す） |
| 13 | 揃え書きに人の編集が混ざる（今ある不具合） | **採る** — [spec 33](33_normalize-race.md) に分けて先に直す |
| 14 | 「揃え書きまで Undo を効かせない」は今の門で書けない | **採る** — D6 で外したので不要 |
| 15 | D5 は spec 30 の裁定 D4 とテストを覆す | **採る** — D6 で外した |
| 16 | AI の書き換えを 1 手にするのは別の spec へ | **採る** — D6（後の候補） |
| 17 | 受け入れ条件に足すもの | **採る** — 受け入れ条件 1〜6 |
| 18 | テストのしやすさ | **採る** — Phase の分担 |
| 19 | Web 版・コミットの分け方 | 問題なし |
