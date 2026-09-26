# Spec: 図の向きと ER 図の FK をエディタで扱う（取り込みで落とさない）

**ID**: 07
**Date**: 2026-09-26
**Status**: **Done**（2026-09-27。rev1 → P0〜P3 着地。受け入れ条件 1〜7 通過（4 は注記あり）。古い向きでの書き戻しが 2 回あり、原因は未解明のまま閉じる（利用者裁定）—「P3 結果」節）
**Branch**: なし（Phase 単位で main へ直接コミット）

## Goal

AI が送った図をエディタで開くと、**向き（`flowchart LR` など）と ER 図の FK の印が落ちる**（spec 04 現況 3、`open_in_editor` の `dropped` に `direction:LR` / `fk`）。
人が直した図を読み戻すと、AI が書いた向きと FK が消えている（spec 04 の `read_diagram` の注記）。これをなくす。

- フォーク元のエディタに**向き**と **FK** を持たせる（フォーク元の改善。Web 版にも効く。上流へ返せる形のコミットに分ける — 掟）
- Rust の変換（`lorelei_core::editor`）はそれを落とさずに渡す。デスクトップの保存（`toSource`）は向きと FK を含めて書く

## 現況（2026-09-26）

### 1. 向き

| 所 | 今 |
|---|---|
| フォーク元の生成器 `generateMermaidCode(flowData, direction = "TD")`（`features/flowchart/hooks/mermaid.ts`） | 向きを**引数で**取れる（`GraphType = "TD" \| "LR" \| "RL" \| "BT"`） |
| フォーク元の「コード生成」のモーダル（`download-modal.tsx`） | 向きをその場で選ぶ（`useState<GraphType>("TD")`。図の状態ではなく、閉じると忘れる） |
| フォーク元の読み込み `parseMermaidCode` | `flowchart` / `graph` の行を読み飛ばす（向きを捨てる） |
| エディタの状態 | 向きを持たない。取り込み時の配置は上から下の階層（`layoutNodes`） |
| ER 図の生成器・読み込み | 向き（`direction LR`）を扱わない |
| Rust `to_editor`（`crates/lorelei_core/src/editor.rs`） | `TB` / `TD` 以外は `direction:{dir}` として数えて落とす（フロー・ER 図とも） |
| デスクトップの保存 `toSource`（`lib/desktop/doc-session.ts`） | `generateMermaidCode({ nodes, edges })` — 向きを渡さない（常に `TD`） |

### 2. FK

| 所 | 今 |
|---|---|
| カラムの型 `ERColumn` | `{ name, type, pk, uk }`。PK と UK は片方しか選べない（UI で排他） |
| ER 図の生成器 `generateERDiagramMermaidCode` | キーを 1 つだけ出す（PK があれば PK、無ければ UK） |
| ER 図の読み込み `import-mermaid-to-er.ts` | `(PK\|UK)` の 1 つだけ。コメントに「複数属性は公式 Mermaid が対応していない」とあるが**誤り** — Mermaid の ER 図はキーをカンマで並べられる（`int user_id PK, FK`） |
| Rust `to_editor` | `keys` に `FK` があれば `fk` として数えて落とす。`pk` / `uk` は写す |

## 決めること

### D1. 向きを図の状態にする

- フローチャートと ER 図のエディタに `direction`（`GraphType` = `TD` / `LR` / `RL` / `BT`、既定 `TD`）の状態を持たせる。**生成器はこの値で書く**（「コード生成」も保存も）。
  エディタの向きが**ただ 1 つの持ち主**で、ツールバー・パネル・「コード生成」のモーダルはそれを読み書きする（モーダルを開いたまま向きを変えても食い違わない）
- 生成器の形（P0 で凍結）: フロー `generateMermaidCode(flowData, direction)`（今の第 2 引数のまま。フォーク元の既存の呼び手を壊さない）、
  ER 図 `generateERDiagramMermaidCode(nodes, edges, direction = "TD")`（第 3 引数を任意で足す）
- **`TB` の扱い**: Mermaid では `TB` と `TD` は同じ意味。読み込み（フォーク元・Rust とも）で `TB` は `TD` にそろえ、`dropped` に出さない。書くのはいつも `TD`（`flowchart TB` で来たら `flowchart TD` で戻る）。
  `graph LR` は `flowchart LR` と同じ意味で、生成器はいつも `flowchart` と書く（今と同じ）
- **ER 図の生成規則**: `TD` / `TB` の時は `direction` の行を書かない（今の出力を変えない）。`LR` / `RL` / `BT` の時は `erDiagram` の次の行に `direction LR` などを書く
- **向きを変える UI**（利用者裁定 2026-09-26）: デスクトップはツールバー、Web はフォーク元のパネルに向きの切り替え（`TD` / `LR` / `RL` / `BT`）を置く。
  「コード生成」のモーダルの向きの選択は、エディタの向きを初期値にする（モーダルで変えたら、エディタの向きも変える — 2 か所で食い違わせない。P0 で形を決める）
- **取り込み時の配置**（利用者裁定 2026-09-26）: 向きに合わせて並べる。規則は 2 つに分けて決める — **軸** = `LR` / `RL` なら横（階層を左右に）、`TD` / `BT` なら縦 /
  **逆向き** = `BT` / `RL` なら階層の順を反対に。保存してある位置（デスクトップの `layout`）があれば、今までどおりそちらを優先する。
  **並べ直すのは取り込みの時だけ**（配置の関数を向き付きで呼ぶのは取り込みの経路だけ。ツールバー・パネルで向きを変えた時は呼ばない = スコープ外の「並べ直さない」）
- **ノードの接続点（Handle）を向きに合わせる**（査読 2-(1) を受けて足した）: 今はフロー・ER 図とも入口が上・出口が下に固定。`LR` なら入口 左・出口 右、`RL` なら入口 右・出口 左、
  `BT` なら入口 下・出口 上。向きを変えるとすぐ変わる（線の付き方だけで、ノードの位置は動かさない）
- **ER 図の向きも同じ仕組みで扱う**（利用者裁定 2026-09-26）。ER 図の生成器は `erDiagram` の次の行に `direction LR` を書く（`TD` / `TB` の時は書かない — 今の出力を変えない）

### D2. ER 図の FK

- `ERColumn` に `fk?: boolean` を**任意で**足す（無ければ false。フォーク元の既存のテストのデータや古い保存データを壊さない。spec 06 の `onDelete?` と同じ方針）
- テーブルのカラムの表に「FK」の列（チェックボックス）を足す。**FK は PK・UK のどちらとも同時に付けられる**。PK と UK の排他（片方を付けるともう片方を押せない）はフォーク元のまま、
  **その排他で FK を押せなくしない**
- 生成器はキーを**決まった順（PK → UK → FK）**でカンマで並べる（`PK, FK` / `UK, FK` / `FK`）。読み込みはカンマ区切りの複数のキーを**どの順でも**読む（`FK, PK` も）。
  往復すると決まった順になる（読み戻しで順が揃う。差分として扱わない）。誤ったコメントを直す

### D3. デスクトップとの境目

- Rust `to_editor`: `direction` をペイロードに入れて落とさない（`dropped` から `direction:*` が消える）。ER 図の `fk` も写して落とさない
- data_contract `EditorPayload` に `direction`（無ければ `TD`）、ER 図のカラムに `fk`（無ければ false）を足す（先に凍結。Rust の serde も既定値を付ける）
- `toSource` は向きを渡して書く。**シェル（図の一覧）はエディタの向きを知らない**ので、エディタから受け取る口が要る — 既存の `useDesktopActions` の登録に
  `direction` と `setDirection` を足す（ツールバーの切り替えもこれを使う）。シェルは今の向きを `useDocSession` に渡し、`toSource` がそれで書く
- **向きを変えただけでも自動保存する**（査読 2-(2)）: 自動保存はノード・辺の変化で走るので、向きだけ変えると保存されない。`useDocSession` は向きの変化でも（準備済みなら）`autosaver.touch` する
- 保存済みの図は `source` に向きが入るので、開き直すと向きが戻る
- ER 図の「コード生成」のモーダルには向きの選択を足さない（エディタの向きで書くだけ。向きはパネル・ツールバーで変える）。フローのモーダルの選択はエディタの向きを読み書きする

## Phase

- **P0**: 型と形の凍結 — data_contract（`EditorPayload.direction`・カラムの `fk` と既定値）、生成器の形（D1）、`useDesktopActions` の `direction` / `setDirection`（D3）。
  フォーク元の生成器・読み込みのテストの書き方の確認
- **P1**: フォーク元の改善（上流へ返せるコミット）— FK（D2）/ 向きの状態・生成・読み込み・取り込みの配置・接続点（D1）/ パネルの向きの切り替え。テストは Red → Green。
  コミットは spec 06 と同じく main へ直接、フォーク元の改善だけのもの（`lib/desktop/`・台帳と分ける。PR の時に切り出す）
- **P2**: デスクトップ — data_contract → Rust の変換（D3）→ `toSource`。MCP の `open_in_editor` で `dropped` から消えること、`read_diagram` で向きと FK が戻ること
- **P3**: 実機 — AI が送った `flowchart LR` と FK 付きの ER 図を開き、直して、読み戻す。Web 版の「コード生成」も

## P0 結果（2026-09-26）

data_contract に凍結した（コードはまだ触らない）:

- `EditorPayload.mapping`: フローと ER 図の出力に `direction?`（`GraphType`、無ければ `TD`、merman の `TB` は `TD` にそろえる）、ER 図のカラムに `fk?`（無ければ false）、
  キーは merman の `attribute.keys`（順は問わない）から写す。`dropped_constructs` から `direction:<…>` と `fk` を外した
- `EditorDirection`（新規）: 値・既定・生成の規則（フローは `generateMermaidCode(flowData, direction)` の第 2 引数のまま、ER 図は `generateERDiagramMermaidCode(nodes, edges, direction = TD)` を足し、
  `TD` なら向きの行を書かない）・キーの書く順（PK → UK → FK）・取り込み時の配置（軸と逆向き、取り込みの時だけ）・向きごとの接続点
- `DesktopActions`（新規。これまで data_contract に無かった `useDesktopActions` の形を名詞にした）: `add` / `code` に `direction` / `setDirection` を足し、外枠は向きの変化でも自動保存する
- フォーク元のテストの置き場を確かめた: 生成器・読み込み・往復は `features/flowchart/__tests__/utils/mermaid/`（`generate-mermaid-code` / `parse-mermaid-code` / `round-trip`）と
  `features/er-diagram/__tests__/`（`generate-mermaid-code` / `import-mermaid-to-er`）。P1 はここに Red から足す

## P1 結果（2026-09-26）

フォーク元の改善のコミットを 3 つ（上流へ返せる。`lib/desktop/`・台帳を含まない）:

| コミット | 中身 | テスト（Red → Green） |
|---|---|---|
| `76be364` | FK（D2）: `ERColumn.fk?`、表の FK の列（PK・UK の排他に巻き込まない）、生成は PK → UK → FK のカンマ区切り、読み込みはどの順でも | 生成 1・読み込み 1・表 1 |
| `a132d70` | フローの向き（D1）: `hooks/direction.ts`（`normalizeDirection`・`placeByDirection`・`handlePositions`）、`DirectionContext`、`DirectionMenu`（モーダルの向きのメニューを部品にした）、エディタの向きの状態・取り込み時の配置・パネルの切り替え・モーダルはエディタの向きを読み書き（props は任意）・接続点 | 純粋関数 3・読み込み 2・往復 1・部品 1・モーダル 1・エディタ 2 |
| `09fc2dc` | ER 図の向き（D1）: 同じ部品を使う。生成は `TD` なら向きの行を書かず、`LR` / `RL` / `BT` なら書く。読み込みは `direction` の行を読む | 生成 1・読み込み 1・配置 1・エディタ 1 |

- 読み込みは `TD` 以外の時だけ `direction` を持つ（data_contract の「無ければ TD」。フォーク元の既存の `toEqual` のテストを壊さない）。
  フォーク元の既存テスト 1 件（`graph LR` のヘッダーを読み飛ばす）は、向きを捨てる今までの振る舞いを期待していたので、期待値に `direction: "LR"` を足した（意図した変更）
- 横向き（`LR` / `RL`）の時は、段の間と並びの間を入れ替えた値を使う（ノード・テーブルは横に長いので、縦の時の段の間では重なる）
- テストで分かったこと: フォーク元のインポートのテストは入力欄を模擬に差し替えていて、`data-testid` はその模擬のもの。エディタ全体のテストでは本物の `textarea`（ダイアログの中の `textbox`）で探す
- 全体: vitest 582 件中、落ちるのは ArrowTypeSelector の時間切れ 1 件（failures #3、変更前と同じ顔ぶれ）。型検査通過

## P2 結果（2026-09-26）

- Rust `lorelei_core::editor`: `FlowData` / `ErData` に `direction`（`LR` / `RL` / `BT` の時だけ。`TD` と `TB` は持たない）、`ErColumn` に `fk`（有る時だけ）。
  `direction:*` と `fk` を `dropped` から外した。PK と UK は排他（PK を優先。フォーク元の読み込みと同じ）
- `lib/desktop`: `DesktopActions` に `direction` / `setDirection`（向きが変わったら登録し直す）、ツールバーに `DirectionMenu`（エディタが向きを持つ時だけ）、
  `toSource(editor, nodes, edges, direction)`、`useDocSession(direction)` は向きが変わっても自動保存する。フォーク元のパネル 2 つの `useDesktopActions` に向きを足した（デスクトップへの差し込みの行）
- 台帳: ツールの説明（`read_diagram`）・data_contract（`Diagram.source`）・LORELEI.md の「落ちるもの」から向きと FK を外した
- テスト（Red → Green）: Rust 2 件新規（フローの向きを写す・`TB` は `TD` / ER 図のキーをどの順でも写す）と既存 2 件の期待値（向きと FK は落とさない）、
  src-tauri 1 件の期待値（`LR` は `dropped` ではなくペイロードに）/ vitest 3 件（`toSource` の向き・ツールバーの切り替え・向きだけ変えても自動保存）
- 全体: Rust（ワークスペース・src-tauri 39 件）緑、clippy 警告 0。vitest 585 件中、落ちるのは ArrowTypeSelector の 2 件（failures #3 の顔ぶれ。今回は同じファイルのもう 1 件も負荷で時間切れ）。型検査通過

## P3 結果（2026-09-26〜27）

- 実機（`tauri dev`）: MCP（HTTP）で `flowchart LR` と、`direction LR`・`FK`・`PK, FK` の ER 図を送ると、`dropped` が空（以前は `direction:LR` と `fk ×2`）。
  エディタに載って保存された後の `read_diagram` でも、`flowchart LR`・`direction LR`・`int 顧客_id FK`・`int 注文_id PK, FK` が残っていた
- **利用者が確認**: ノード・テーブルが左から右へ並び、線は左右の接続点でつながる / ツールバーの向きで接続点が変わる / FK のチェックが付いている /
  Web 版（`http://localhost:3000`）のパネルに向きの切り替え、ER 図の表に FK の列
- 向きの切り替え・FK の付け外し・型の書き換えが保存されることを、ファイルの書き込みを見張りながら確かめた（向き `TD` ↔ `LR`、「数量」の FK、`int` → `bigint`）

### 未解明のまま閉じる不具合（利用者裁定 2026-09-27: 記録して閉じる）

**古い向きで書き戻されることが 2 回あった**:

1. 1 回目の確認（23:2x）: 利用者がデスクトップで「フローの向きを `TD` に」「数量に FK」をしたが、フローのファイルは書かれず、ER 図は FK なしで保存された
2. 23:36: フローを `TD` にして保存された（23:36:06）後、「保存」を押すと、フローが `LR`（開いた時の向き）で書き戻された（23:36:11）。その後 23:36:47 に `TD` で書かれた

- 「保存」は書きかけの変更を書いてから（flush）時刻を記録する（`mark_document_saved`）。2 の書き戻しは、**開いた時の向きのまま残っていた書きかけの変更**が、切り替えの後で書かれたことを示す
- 調査用のログ（外枠が受け取る登録の向き・自動保存の予約の向き・Rust が受け取った保存）を一時的に入れ、同じ手順を 3 通り試した
  （`TD` の図 → `LR` → 保存 / `LR` の図 → `TD` → 保存 / 起動し直した直後の `LR` の図 → `TD` → 保存）。**どれも再現しなかった**。
  図を開くと、作り直したエディタの既定（`TD`）で登録された後、取り込みの後に図の向きで登録し直され、自動保存の予約は図の向きで行われていた
- jsdom のテスト（`__tests__/lib/desktop/direction-save.test.tsx`: 保存した `LR` の図を開き、ツールバーで `TD` にし、「保存」を押しても `TD` のまま）も通る。回帰を防ぐテストとして残した
- 調査用のログは取り除いた。次に起きたら、同じログを入れて記録を拾う

## 受け入れ条件

1. `flowchart LR` を開くと、`dropped` に `direction:LR` が出ず、保存・読み戻しの Mermaid も `flowchart LR`
2. `int user_id PK, FK` を開くと `dropped` に `fk` が出ず、テーブルで FK がチェックされ、保存・読み戻しで `PK, FK` が戻る
3. エディタで FK を付け外しでき、「コード生成」に反映される
4. ツールバー（デスクトップ）・パネル（Web）で向きを変えると「コード生成」と保存に反映される（向きだけ変えても保存される）。ER 図も同じ
5. Web 版でも FK と向きが扱える。フォーク元の既存テストの落ちる顔ぶれが変わらない（failures #3 = この環境では変更と無関係に時間切れで落ちるものがある。2026-09-26 時点では ArrowTypeSelector の 1 件）
6. `flowchart LR` の図を取り込むと、ノードが左から右へ並び、線は左右の接続点でつながる
7. `flowchart TB` を開いても `dropped` に出ず、`TD` として保存される。`FK, PK` の順で来たカラムは `PK, FK` の順で書かれる

### 受け入れ条件の結果（2026-09-27）

| # | 結果 | 根拠 |
|---|---|---|
| 1 | **通過** | P3 の実機: `flowchart LR` が `dropped` に出ず、保存・読み戻しも `flowchart LR` |
| 2 | **通過** | P3 の実機: `PK, FK` が `dropped` に出ず、表で FK がチェックされ、読み戻しで `PK, FK` |
| 3 | **通過** | P3 の実機: FK の付け外しが保存に反映。コード生成は自動テスト |
| 4 | **通過（注記あり）** | P3 の実機: ツールバーで向きを変えると保存に反映（向きだけでも保存）。ただし古い向きでの書き戻しが 2 回あり、原因は未解明（上の節） |
| 5 | **通過** | P3 の実機: Web 版にパネルの向きと FK の列。vitest で落ちるのは ArrowTypeSelector の時間切れ（failures #3 の顔ぶれ） |
| 6 | **通過** | P3 の実機: 左から右へ並び、線は左右の接続点 |
| 7 | **通過（自動テスト）** | Rust `flowchart_direction_is_carried_and_tb_means_td`・`er_keys_are_carried_in_any_order` |

## スコープ外

- ほかの落ちる要素（subgraph・classDef・style・非識別関係の点線 など）
- 向きを変えた時に、既存のノードを並べ直す（配置はノードごとの位置のまま。裁定 2 は取り込み時の話）

## 査読の採否（rev0 → rev1）

| 指摘 | 採否 | 反映 |
|---|---|---|
| 査読 1-1: ER 図の `RL` / `BT` の書き方が無い | 採る | D1: `TD` / `TB` は書かず、`LR` / `RL` / `BT` は `direction` の行を書く |
| 査読 1-2: P0 と P1 の順が逆、生成器の形が未定 | 採る | P0 で型と形を凍結。フローの生成器は第 2 引数のまま（フォーク元の呼び手を壊さない）、ER 図は第 3 引数を任意で足す |
| 査読 1-3: 配置の規則の解釈が割れる、向きを変えた時に並べ直さない分岐 | 採る | D1: 軸と逆向きに分けた。並べるのは取り込みの経路だけ |
| 査読 1-4: `TB` と `graph` の扱い | 採る | D1: `TB` は `TD` にそろえ `dropped` に出さない。`graph` は `flowchart` で書く。受け入れ条件 7 |
| 査読 1-5: FK の UI の排他・キーの順・既定値 | 採る | D2: 排他で FK を押せなくしない、書く順は PK → UK → FK、読むのはどの順でも。D3: data_contract と serde の既定値 |
| 査読 1 その他: 受け入れ条件の番号・failures #3 の中身 | 採る | 番号を直し、中身を書いた |
| 査読 1 その他: モーダルを開いたまま向きを変えた時の同期 | 採る | D1: エディタの向きがただ 1 つの持ち主で、モーダルはそれを読み書きする |
| 査読 1 その他: フォーク元の改善は別ブランチに | 採らない | spec 06 と同じく main へ直接、フォーク元の改善だけのコミットに分ける。PR の時に切り出せる |
| 査読 2-(1): 接続点が上下に固定 | 採る（案 A） | D1: 向きに合わせて接続点を切り替える。`LR` で並べても線が上下から回り込むのでは、裁定 2（向きに合わせて並べる）の意味がない |
| 査読 2-(2): 向きだけ変えると自動保存されない | 採る | D3: 向きの変化でも `autosaver.touch` |
| 査読 2-(3): `fk` は任意に | 採る | D2: `fk?: boolean` |
| 査読 2-(4): ER 図のモーダルの向き | 採る | D3: ER 図のモーダルには選択を足さず、エディタの向きで書く |
| 査読 2-(5): 番号の乱れ | 採る | 受け入れ条件 |
