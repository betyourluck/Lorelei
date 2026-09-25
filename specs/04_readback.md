# Spec: 人が GUI で直した図を AI が読み戻す

**ID**: 04
**Date**: 2026-09-25
**Status**: In Progress（rev1 承認 2026-09-25。rev0 に査読 2 件を反映。P0〜P2 着地、次は P3）
**Branch**: なし（Phase 単位で main へ直接コミット）

## Goal

AI が `open_in_editor` で渡した図を、人が GUI で手直しした**後の今の図**を、AI が MCP で読めるようにする。
「AI が書く → 人が直す → AI が読んで続きをする（コードへ反映する・説明を書く・書き出す）」の往復を閉じる。

spec 03 で MCP を GUI の中へ移したのは、この読み戻しのため（spec 03 Goal の 1）。

## 現況（実測 2026-09-25）

### 1. 今の図は、既に Rust 側のファイルにある

- 図の一覧の 1 件は `{app_data_dir}/documents/{id}.json`（`Document`）。`source` はフォーク元の生成器が出した**今の図の Mermaid**で、
  エディタの変化から 1 秒後に自動保存される（`lib/desktop/use-doc-session.ts` の `AUTOSAVE_DELAY_MS = 1000`、図の切り替え・閉じる前は flush）
- **AI・インポートで届いた図の `source` は、作った時点では空**。エディタに載って最初の自動保存で埋まる（`incoming_source_becomes_a_new_document` のテスト）。原文は `original_source`
- 今開いている図は `state.json` の `lastOpened`（フロントが図を開くたびに `set_last_opened`）。起動時に `lastOpened` が無い・消えていれば、GUI は一覧の先頭を開いて `lastOpened` を書き直す
- `unsaved` も**ファイルだけで決まる**: `updated_at > (saved_at ?? created_at)`（spec 02 D12。最後の「保存」(Ctrl+S) の後に中身が変わったか）。画面上のまだ書き込まれていない編集のことではない
- 一覧の並びは `saved_at ?? created_at` の新しい順（`Store::list`）。`updated_at` は並びの鍵ではない
- つまり**読み戻しは GUI の画面に問い合わせなくても、Rust の `documents::Store` を読めば足りる**（最後の 1 秒の編集を除く）

### 2. `open_in_editor` は、作った図の id を返していない

戻り値は `{ opened, editor, dropped, reason }`。AI は自分が渡した図がどれか、題名でしか見分けられない（題名は重複を許す）。
`editor` と `dropped` は `lorelei_mcp` が口（`EditorPort::open`）を呼ぶ**前に**変換で決めている。口が返すのは成否（`Result<(), String>`）だけ。

### 3. 生成器を通すと、原文から落ちるものがある（`documents/` の実物を原文と比べた）

| 原文 | 今の `source` |
|---|---|
| `flowchart LR` | `flowchart TD`（向きが落ちる） |
| `int 顧客id FK` | `int 顧客id`（FK の印が落ちる。`open_in_editor` の `dropped` に fk として出ている） |
| `申込 --> 確認{確認}`（1 行に辺と形） | ノードの宣言と辺に分けて並べ直す（意味は同じ） |
| subgraph / classDef / style | 落ちる（`dropped` に出ている） |

人が触っていなくても、`source` は原文と一致しない。原文は `original_source` に残っている（以後書き換えない）。

### 4. `source` がエディタの初期図で潰れている図が 2 件ある（読み戻しの前に直すべき不具合の疑い）

| 図 | 原文 | 今の `source` | いつ潰れたか |
|---|---|---|---|
| 「P4 確認 — 商品と在庫の ER 図」 | 商品・在庫の 2 テーブル | ER エディタの初期図そのもの（`ユーザー` テーブル） | 00:56。`updatedAt` = `createdAt` = **空の `source` への最初の書き込み**で初期図が入った。spec 02 P4 のコミット 01:11 より前（failures #6 を直している最中） |
| 「spec 03 P2 の確認」 | `受付 --> 確認 --> 完了`（LR） | フローチャートの初期図 `startNode[Start]` に **`Node 2` / `Node 3` を足して繋いだ図** | **04:22:59**（spec 03 P2 のコミット 04:12 の後、P3 の `tauri dev` の確認中）。`updatedAt` が進んでいる = 中身のある `source` を上書きした |

- 1 件目は #6 の修正前の産物の見込み。**2 件目は今のコードで起きた疑いがある**
- 2 件目の `Node 2` / `Node 3` はフォーク元の「ノード追加」の名前（`flow-helpers.ts`）。**エディタが AI の図ではなく初期図を出したまま、その上で編集され、保存された**。
  読み込みの途中でエディタの初期図を「準備済み」と見なした可能性（spec 02 の準備済みの門、failures #4〜#6 と同じ系統）。2 件目は `state.json` の `lastOpened`（起動時に開く図）だった
- 読み戻しはこの `source` をそのまま AI に渡すので、潰れた図を「人が直した結果」として読ませてしまう
- 原文は `original_source` に残っているので、図そのものは失われていない

## 決めること

### D1. 読むのは Rust のファイル。画面には問い合わせない（利用者裁定 2026-09-25: 保存済みのファイルを読む）

読み戻しのツールは `documents::Store` と `state.json` を読む。GUI の画面（webview）へ「今の図をくれ」と問い合わせる経路は作らない。

- 利点: 画面が図の切り替え中・読み込み中でも答えが決まる。フロントに要求と応答の口を足さずに済む。GUI を最小化していても同じ
- 代わりに負うもの: **最後の 1 秒の編集は読めない**（自動保存の待ち時間）。人が「直したから読んで」と AI に言う頃には過ぎている、と見なす。
  ツールの説明に「GUI での編集は約 1 秒後にファイルへ書かれる。直後の編集は含まれないことがある」と書く
- 返す `unsaved` は現況 1 のとおりファイルの時刻の比較（spec 02 D12 の「保存」の後に変わったか）で、この 1 秒の遅れとは別のもの。説明にもそう書く
- 別案（採らない）: 読む前にフロントへ flush を頼み、終わりを待つ（イベント → 応答の command、時間切れつき）。確実だが、画面が固まっている時に待たされる経路が増える

### D2. ツール（2 本足し、1 本の戻り値を増やす）

```text
list_diagrams() → { diagrams: [DiagramSummary] }
  DiagramSummary = { id, title, editor, origin, created_at, updated_at, saved_at, unsaved, open }
  並びは GUI の一覧と同じ（saved_at ?? created_at の新しい順 = Store::list のまま）
  open = lastOpened と一致する図（今 GUI で開いている図）。一致する図が無ければ全件 false

read_diagram(id?, include_original = false) → Diagram
  Diagram = DiagramSummary の全項目 + source + original_source（下の規則）
  id を省くと lastOpened の図

open_in_editor(...) → { opened, editor, dropped, reason, document_id }
  document_id は opened=true の時は作った図の id、false の時は null
```

- **`id` と `document_id` は同じ uuid**（`Document.id`）。`open_in_editor` の `document_id` をそのまま `read_diagram` の `id` に渡せる
- **`original_source` の出し方**: `include_original=false` の時は**キーごと出さない**。`true` の時は必ず出し、ai / import の図は原文の文字列、new の図は `null`
- **`source` が空文字**のとき（エラーにしない。注記の欄も設けない — 空文字そのものが状態を表す）:
  - new の図: 作ってからまだ一度も保存されていない
  - ai / import の図: まだエディタに載っていない（`open_in_editor` の直後、または GUI がまだその図を開いていない）。原文は `include_original` で読める
  - この 2 つの意味をツールの説明に書く
- **エラー**（ツール結果のエラー `isError: true`。ファイルのパスは載せない）:
  - `id` が uuid の形でない・その図が無い・ごみ箱に移した → 「図が見つかりません（id: …）」
  - `id` を省いたのに、`lastOpened` が無い・指している図が無い → 「今開いている図がありません。id を指定するか、GUI で図を開いてください」
    （GUI が動いていれば起動時に `lastOpened` が書き直されるので、普通は起きない。図が 0 件の時などに起きる）
- 位置（`layout`）は返さない。AI が使う場面が無い（Mermaid に位置の文法が無い）
- ツールの説明に「`source` はエディタが出した Mermaid。向き・FK の印・subgraph などは落ちている。渡した原文は `include_original` で読める」と書く（現況 3）

### D3. 口は `EditorPort` を広げる（`lorelei_mcp` は Tauri に依存しないまま）

```rust
pub trait EditorPort: Send + Sync + 'static {
    /// Ok = 作った図の id（opened: true, document_id）/ Err = 理由（opened: false, reason, document_id: null）
    fn open(&self, source: String, title: Option<String>) -> Result<String, String>;
    fn list(&self) -> Result<Vec<DiagramSummary>, String>;
    /// original_source は常に詰めて返す。include_original で省くのはツールの層
    fn read(&self, id: Option<String>) -> Result<Diagram, String>;
}
```

- `open` の戻り値に `opened` / `editor` / `dropped` を持たせない。`editor` と `dropped` は今どおり `lorelei_mcp` が口を呼ぶ前に変換で決め（現況 2）、
  `opened` は `Ok` / `Err` で表す。`Err` の文字列がそのまま `reason` になる（今と同じ。二重の管理にならない）
- `read` に `include_original` を渡さない。`Store::load` はファイルを丸ごと読むので、口は常に `original_source` まで詰めて返し、ツールの層で省く
- `DiagramSummary` / `Diagram` は `lorelei_mcp` の型（MCP の出力の形、snake_case）。GUI の実装が `documents::Store` と `state.json` から詰める
- id は今の `Store` と同じく uuid の形だけ受け付ける（パスを外へ出さない）

### D4. 読み戻しの前に、現況 4 の不具合を突き止めて直す（利用者裁定 2026-09-25: spec 04 の P0 で直す）

読み戻しは `source` の正しさに乗っている。

1. **本丸は画面側の門**: 「図の読み込み（`loadDocument` → `convertSource` → エディタへの取り込み）が済み、取り込んだノードがエディタに揃うまで、自動保存を始めない」が
   どこで漏れているかを P0 で再現して直す。現況 4 の 2 件目は、エディタが初期図を出したまま人が編集できてしまった（保存を止めるだけでは足りず、**初期図を AI の図として見せてしまうこと**自体が不具合）
2. **Rust の保存の手前に保険を置く**（再現できてもできなくても置く）: `origin` が ai / import の図に、**その種類のエディタの初期図と一字一句同じ `source`** を書こうとしたら拒む。
   - 前の `source` が何であっても拒む（1 件目は空の `source` への最初の書き込みで起きた）
   - new の図は対象外（初期図で始まるのが正しい）。`origin` はすべての `Document` が持つ必須の欄なので、「origin の無い古い図」は無い
   - 初期図の中身は種類ごとに 2 つ（flowchart: `startNode[Start]` だけの図、erDiagram: `ユーザー` テーブルだけの図）。data_contract に定数として凍結し、
     フォーク元の初期図の生成器の出力がその定数と一致することを vitest で確かめる（フォーク元の初期図を変えたら落ちて気付く）
   - **この保険は 1 件目の形しか止めない**。2 件目（初期図の上で編集された）は一致しないので素通りする。2 件目を止めるのは 1 の門
   - 拒んだ時、フロントは通知を出してその書き込みを捨てる（「保存できなければ離れない」に掛かって、図を切り替えられなくならないように）。利用者が手で全部消して、初期図とちょうど同じ図を作った場合も拒まれるが、起きる見込みは低いので受け入れる

潰れている 2 件の図は、`original_source` から戻せる。戻すかどうか（手で開き直す・放置する）は利用者が決める。

## Phase

- **P0（調査と修正）**: 現況 4 の再現。dev と配布版で、AI から届いた図を開いたまま (1) 起動し直す (2) 再読み込み（dev は HMR も）(3) 図を素早く切り替える。
  潰れる手順が見つかったら Red のテストにしてから直す（spec 02 の門のテスト `doc-session.test.ts` / `use-desktop-open.test.tsx` に足す）。
  あわせて D4-2 の保険（data_contract に初期図の定数 → Rust の `save` で拒むテスト → フロントの通知と捨てる処理 → 初期図の一致の vitest）
- **P1**: data_contract を先に凍結する（`McpServer.tools` に `list_diagrams` / `read_diagram`、`open_in_editor.output.document_id`、`McpServer.http.editor_port` の 3 つの口。
  MCP のツールの入出力も data_contract にある — 別のファイルは作らない）→ `lorelei_mcp` にツール 2 本と口の拡張。テストは `tests/http.rs` に HTTP で足す
- **P2**: GUI の実装（`GuiEditor` が `Store` と `state.json` を読む、`open` が id を返す）。LORELEI.md のツール表と頼み方の例
- **P3**: 実機 — 配布ビルドで「AI が `open_in_editor` → 人がノードを 1 つ足して名前を変える → AI が `read_diagram` で読む → `render` で書き出す」

## P0 結果（2026-09-25）

**現況 4 の真因は 2 つだった**（failures #7・#8）。

1. **エディタに載る前の AI の図を「新規作成の直後」と取り違えた**（#7。2 件の潰れの真因）: AI・インポートの図は最初の自動保存まで `source` が空で、`open()` は空なら原文を見ずに初期図で準備済みにした。
   2 件とも時刻が合う — 1 件目は `updatedAt` = `createdAt`（空への最初の書き込み）、2 件目は作られた 03:39 が spec 03 P2 で dev の画面が 3001 番に立ち上がり映らなかった時で、04:22 に `lastOpened` として開かれ、初期図の上に「ノード追加」2 回が重なった
2. **実機で再現を試す中で、別の不具合を見つけた**（#8）: 2 つの図を素早く交互に押すと、遅れて効いたページ移動で ER 図のエディタが載り、そのノードがフローの図として保存された（`node部署[]`）。
   保存の門が、ノードが今の図の種類のエディタのものかを見ていなかった

直したもの（どれもテストで Red → Green）:

| # | 直したこと | テスト |
|---|---|---|
| 1 | `source` が空なら `original_source` から開く（`use-doc-session.ts`） | `document-list.test.tsx`「まだエディタに載っていない AI の図は、原文から開く」 |
| 2 | 保存の判定にページの種類を足す。今の図と違えば保存も準備済みもしない（`onNodesChanged` の `page`） | `doc-session.test.ts`「ページのエディタが今の図の種類と違えば…」 |
| 3 | 図を開き直したら、前に預けた「開く要求」を捨てる（`queueOpen` は置き換え） | `use-desktop-open.test.tsx`「図を開き直したら、前に預けた『開く図』は捨てる」 |
| 4 | 今の図と違うページに居て取り込む図も無ければ、今の図を開き直してそのページへ戻す | `document-list.test.tsx`「遅れて効いたページ移動で…今の図のページへ戻す」 |
| 5 | D4-2 の保険: Rust の `save` が ai / import の図に初期図と同じ中身を書かせない。拒まれた書き込みはフロントが通知して捨てる（`Autosaver` の捨ててよい失敗） | `documents.rs` `an_ai_or_imported_diagram_is_not_overwritten_by_the_initial_figure`、`doc-session.test.ts` の Autosaver 1 件と初期図の突き合わせ 2 件 |

- 初期図の突き合わせのため、フォーク元の初期図を export した（`flow-editor.tsx` の `initialFlowNodes`、`er-diagram-editor.tsx` の `initialERNodes` — ER 図はコンポーネントの中からモジュールの直下へ移しただけで、振る舞いは同じ）
- data_contract: `Document.initial_sources` と `Document.save_guard` を足した
- 全体: vitest 531 件中 530 件緑（落ちた 1 件は ArrowTypeSelector の時間切れ、failures #3 の顔ぶれ）、Rust の src-tauri 31 件緑、clippy 警告 0、型検査・lint（変更したファイル）通過
- **実機（`tauri dev`）**: `source` が空で原文だけを持つ AI の図を 2 件（フロー・ER）置いて開いた。1 回目は原文から開けたが、交互に素早く押すと #8 が出た。2〜5 を入れた後、
  利用者が交互に素早く押しても中身は崩れず、ファイルも原文どおり（`updatedAt` は作った時刻のまま = 余計な書き込みなし）。**利用者が確認**
- 潰れている 2 件（「P4 確認 — 商品と在庫の ER 図」「spec 03 P2 の確認」）は、直した後も中身は初期図のまま（`source` が空ではないので原文からは開かない）。戻すかは利用者が決める
- **残した課題（利用者 FB 2026-09-25）**: 図を開くと、エディタの初期図が一瞬見えてから届いた図に変わる。見せ方の工夫が要る（読み込み中は覆いを掛ける等）。spec 04 では扱わない

## P1 結果（2026-09-25）

- data_contract を先に凍結: `McpServer.tools` に `list_diagrams` / `read_diagram`（入出力とエラー 2 種）、`open_in_editor.output.document_id`、
  `McpServer.http.editor_port` の 3 つの口、型 `DiagramSummary` / `Diagram`（`original_source` の出し方と空の `source` の意味）
- `lorelei_mcp`: `EditorPort` を `open → Result<String, String>`（id）・`list`・`read(id?)` に広げ、ツール 2 本を足した。`include_original=false` の時に
  `original_source` のキーを消すのはツールの層（`diagram_value`）。口の `Err` はツール結果のエラー `{ error }` にそのまま載せる
- テスト（Red → Green）: `tests/http.rs` に 2 件 — 一覧・`id` 省略・`include_original`（ai は原文、new は `null` でキーあり、false ならキー無し）・空の `source` はエラーにしない・
  口へ `id` をそのまま渡す / 口のエラー 2 種（見つからない・開いている図が無い）が `isError: true`。既存の 2 件に `document_id`（作った id・断った時は null）を足した。
  src-tauri は `deliver` が作った図の id を返すことを足した
- src-tauri の `GuiEditor` は、`open` が id を返すところまで。`list` / `read` は P2 まで「まだ使えません」のエラーを返す
- Rust は `lorelei_mcp` 10 件・src-tauri 31 件とも緑、clippy 警告 0（両 project）。CLAUDE.md のツールの本数を 5 本に直した

## P2 結果（2026-09-25）

- 着地: `src-tauri/src/readback.rs`（`list` / `read`。`Store` と `state.json` だけを読む）、`Store::contains`（uuid の形でない id・ごみ箱の図は false）、
  `GuiEditor` の `list` / `read` は `readback` を呼ぶだけ。LORELEI.md のツール表（5 本）・頼み方の例・「読み戻しの注意」
- テスト（Red → Green）: `readback` 6 件 — GUI の一覧と同じ並びと `open` / `last_opened` が消えた図を指す時は全件 `open: false` /
  エディタに載る前は空の `source` と原文、人が直した後は直した `source`・`unsaved`（最初の書き込みでは立たず、人の編集で立ち、「保存」で消える）/
  new の図は原文が `null` / 存在しない・形の不正な・ごみ箱の id は「図が見つかりません」でパスを載せない / id を省いて開いている図が無い時のエラー
- src-tauri 37 件緑、clippy 警告 0
- 実機（`tauri dev`）: HTTP 越しに `list_diagrams` で実物の一覧 10 件（開いている図に `open: true`、● の図に `unsaved: true`）、
  `read_diagram`（id 省略・`include_original`）で開いている図のエディタの出力と原文、`id: "../mcp_server"` は「図が見つかりません」
- 起動の時、Next が 3001 番に立ち上がった（P0 の dev の Next が残って 3000 番を握っていた）。止めて起動し直した。コードの問題ではない（spec 03 P2 と同じ）
- このセッションの Claude Code のツール一覧は、つないだ時の 3 本のまま（新しい 2 本はつなぎ直すと出る）。P3 で登録し直して確かめる

## 受け入れ条件

1. 人が GUI で直した図を、1 秒待った後に `read_diagram` で読むと、直した後の Mermaid が返る
2. `open_in_editor` の戻り値の `document_id` で、その図を `read_diagram` で読める。エディタに載る前に読むと `source` は空文字で、エラーにならない
3. `id` を省くと今開いている図が返る。`list_diagrams` の並び（`saved_at ?? created_at` の新しい順）・`open`・`unsaved` が GUI の一覧（並び・選択・●）と合う
4. `include_original=false` では `original_source` のキーが無い。`true` では ai / import の図は原文、new の図は `null`
5. uuid の形でない id・存在しない id・ごみ箱の id、開いている図が無いのに id を省いた時は、ツール結果のエラーで返る（パスを外へ出さない）
6. ai / import の図にエディタの初期図と同じ `source` を書こうとすると、Rust の `save` が拒む（自動テスト）。フロントは通知を出し、図を切り替えられる
7. P0 で再現した手順（見つかった場合）で、AI の図を開いてもエディタが初期図を出さず、`source` が潰れない（自動テスト + 実機）

## スコープ外

- AI が既存の図を書き換える（`update_diagram` のような書き込み）— 読み戻しの後の段（利用者裁定 2026-09-25: 読むだけ、書き換えは後）。今は `open_in_editor` で新しい 1 件として送る
- 生成器で落ちる向き・FK の印の対応（フォーク元のエディタの改修。上流へ返せる候補として別の spec）
- 位置（`layout`）を AI に渡す・AI から受け取る
- 図が変わった時に AI へ知らせる（MCP の通知・購読）

## 未検証のまま置いているもの

- 現況 4 の 2 件目の真因（P0）

## 査読の採否（rev0 → rev1）

| 指摘 | 採否 | 反映 |
|---|---|---|
| 査読 1-1 / 査読 2-(2): `read` に `include_original` が無い | 採る | D3: 口は常に `original_source` まで返し、ツールの層で省く（査読 2 の案） |
| 査読 1-1 / 1-3: `open` が `opened` を返せず、`document_id = null` を表せない | 採らない（説明を足した） | `Ok(id)` = opened true、`Err(理由)` = opened false で表せる。`editor` / `dropped` は口の前に決まっている（現況 2・D3）。`OpenResult { id, opened }` は `Result` と二重になる |
| 査読 1-2: `unsaved` はファイルから判定できず D1 と矛盾する | 採らない（誤読。査読 2-(1) の注釈を採る） | `unsaved` はファイルの時刻の比較（spec 02 D12）。現況 1 と D1 に定義を明記 |
| 査読 1-4 / 2-(4): 空の図の返し方 | 定義を足した | 空文字そのものが状態。注記の欄は設けず、new と ai / import での意味をツールの説明に書く（D2） |
| 査読 1-5: 並びの鍵が `updated_at` の可能性 | 定義を足した | 鍵は `saved_at ?? created_at`（`Store::list`）。現況 1・D2・受け入れ 3 |
| 査読 1-6 / 2-(5): `original_source` の null と省略 | 採る | false はキー無し、true は文字列か null（D2・受け入れ 4） |
| 査読 1-7 / 2-(3): id を省いて開いている図が無い時 | 採る | D2 のエラー・受け入れ 5 |
| 査読 1-8: 保険の判定条件 | 採る | D4-2: 前の中身に依らず拒む（1 件目は空への最初の書き込み）、new は対象外、定数は data_contract + vitest。**調べ直して、2 件目はこの保険で止まらないと分かった**（現況 4）ので、本丸を門に置いた |
| 査読 1-9: 受け入れ 6 が条件つき | 採る | 保険を無条件の受け入れ 6 に、再現の手順を受け入れ 7 に分けた |
| 査読 2-3: 門を本丸、Rust の保険は予備 | 採る | D4-1・D4-2。拒んだ時に図を切り替えられなくならないことも足した |
| 査読 1 軽微: `document_id` と `id` の呼び方 | 採る | D2 に「同じ uuid」 |
| 査読 1 軽微: 将来の `update_diagram` の余白を口に残す | 採らない | 書き換えはスコープ外（利用者裁定）。使わない口を先に足さない。足す時に口を広げる |
| 査読 1 軽微: `data_contract` → `mcp/tools.json` → `EditorPort` の順 | 一部採る | 凍結は data_contract が先（P1）。MCP のツールの入出力も data_contract の `McpServer.tools` にあり、`mcp/tools.json` は無い |
