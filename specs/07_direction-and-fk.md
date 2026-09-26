# Spec: 図の向きと ER 図の FK をエディタで扱う（取り込みで落とさない）

**ID**: 07
**Date**: 2026-09-26
**Status**: In Progress（rev1 承認 2026-09-26。rev0 に査読 2 件を反映。P0 着地、次は P1）
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

## 受け入れ条件

1. `flowchart LR` を開くと、`dropped` に `direction:LR` が出ず、保存・読み戻しの Mermaid も `flowchart LR`
2. `int user_id PK, FK` を開くと `dropped` に `fk` が出ず、テーブルで FK がチェックされ、保存・読み戻しで `PK, FK` が戻る
3. エディタで FK を付け外しでき、「コード生成」に反映される
4. ツールバー（デスクトップ）・パネル（Web）で向きを変えると「コード生成」と保存に反映される（向きだけ変えても保存される）。ER 図も同じ
5. Web 版でも FK と向きが扱える。フォーク元の既存テストの落ちる顔ぶれが変わらない（failures #3 = この環境では変更と無関係に時間切れで落ちるものがある。2026-09-26 時点では ArrowTypeSelector の 1 件）
6. `flowchart LR` の図を取り込むと、ノードが左から右へ並び、線は左右の接続点でつながる
7. `flowchart TB` を開いても `dropped` に出ず、`TD` として保存される。`FK, PK` の順で来たカラムは `PK, FK` の順で書かれる

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
