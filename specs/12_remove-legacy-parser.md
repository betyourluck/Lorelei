# Spec: フォーク元の正規表現のパーサーを撤去する

**ID**: 12
**Date**: 2026-09-29
**Status**: **Done**（2026-09-29。rev0 → P1・P2 着地。受け入れ条件 1〜4 通過 —「P1・P2 結果」節）
**Branch**: なし（Phase 単位で main へ直接コミット）

## Goal

spec 11 でインポートの取り込みを mermaid.js の解析に替え、フォーク元のパーサー（`parseMermaidCode` / `convertMermaidToERData`、1 行ずつの正規表現）は
アプリのどこからも呼ばれなくなった（spec 11 D6 で「消すのは別の変更」とした）。残すと「どちらが取り込みの正か」が読み手に分からず、
テストが古いパーサーの挙動（連鎖を扱えない等）を前提に書かれ続ける。**収縮**の変更。

**フォーク元の改善**（Web 版の中の死んだコード）なので、デスクトップのテストの変更とはコミットを分け、上流へ PR で返せる形にする（掟）。

## 現況（2026-09-29、grep）

- 本番のコードの呼び出し: **0**。残っている使い道はテストだけ
  - パーサー自身のテスト: `features/flowchart/__tests__/utils/mermaid/parse-mermaid-code.test.ts`・`parse-mermaid-code-without-header.test.ts`・
    `features/er-diagram/__tests__/import-mermaid-to-er.test.ts` の `convertMermaidToERData` の describe
  - 往復のテスト `features/flowchart/__tests__/utils/mermaid/round-trip.test.ts`（生成 → 古いパーサー）
  - デスクトップのテスト `__tests__/lib/desktop/update-diagram.test.tsx`・`direction-save.test.tsx`（Rust の `convert_source` の模擬の変換に使う）
- **残すもの**（本番で使う）: 型 `ParsedMermaidData` / `ParsedMermaidNode` / `ParsedMermaidEdge`（`hooks/mermaid.ts`）・`ParsedMermaidERData` / `ParsedERTableData`
  と取り込み時の配置 `convertParsedDataToNodes`（`import-mermaid-to-er.ts`。ER 図のエディタが使う）
- 往復は spec 11 の `round-trip-mermaid.test.ts` が mermaid.js の経路で持つが、形は四角・円・ひし形・スタジアム、矢印は 4 種だけ。
  古い `round-trip.test.ts` にしか無いもの: 角丸・六角形・太い双方向・予約語の名前の付け替え（`start` → `node_start`）・4 つの向き
- `TESTING.md` の例が `parseMermaidCode` を使っている。`docs/storybook/` の束（ビルドの生成物、git に入っている）にも名前が残る

## 決めること

### D1. 消すもの

- `features/flowchart/hooks/mermaid.ts`: `parseMermaidCode` と私的な `extractNodeFromEdgeLine` / `parseNodeDefinition` / `parseEdgeDefinition`（使わなくなる import も）
- `features/er-diagram/utils/import-mermaid-to-er.ts`: `convertMermaidToERData` と、それだけが使う定数・関数（多重度の逆引き・列/関係/テーブルの正規表現・`sanitizeTableName`・`parseColumns`）。
  ファイル名は変えない（`convertParsedDataToNodes` は取り込み時の配置で名前に合う。上流との差を小さくする）
- パーサー自身のテスト 2 ファイルと、`import-mermaid-to-er.test.ts` の `convertMermaidToERData` の describe（3 つ）。`convertParsedDataToNodes` のテストは残し、
  入力を古いパーサーで作っていた 1 件（LR の配置）は入力を直接書く

### D2. 古いテストにしか無い検査は mermaid.js の経路へ移す

- `round-trip.test.ts` を mermaid.js の経路（`readMermaidDiagram` → `flowFromMermaid`、本物の mermaid）に書き替える。検査の中身（形 6 つ・矢印 5 つ・予約語の付け替え・4 つの向き）は保つ
- パーサー自身のテストは、**古いパーサーの挙動**（読めない行を飛ばす・`decimal(10,2)` を読めない 等）を固めたもので、spec 11 で意図して変えた。移さない。
  入力の種類で新しい経路に無いもの（ER 図のハイフンを含むテーブル名・同じテーブルの間の複数の関係）は `features/er-diagram/__tests__/from-mermaid.test.ts` に足す

### D3. デスクトップのテストの模擬の変換

- `convert_source` の模擬は、Rust の `to_editor` と同じ対応表を持つ TS の変換（`readFlowchartForImport`、spec 11 D1）を使う。連鎖を扱えない制約の注記は消す

### D4. 文書

- `TESTING.md` の例は今の関数（`flowFromMermaid` の往復）に替える
- `docs/storybook/` の束は再ビルドしない（Storybook の書き出しの生成物。次に書き出す時に消える）

## Phase

- **P1**（デスクトップ）: D3。テスト: 既存の 2 ファイルが緑
- **P2**（フォーク元の改善）: D1・D2・D4。テスト: 往復の書き替えと足した 2 件が緑（Red → Green: 足した 2 件は新しい経路で一度落ちないことを確かめる = 既に正しい挙動の固定なので Red は無い。消したものが残っていないことは grep で確かめる）
- 台帳: spec 11 D6・スコープ外に「spec 12 で撤去」、CLAUDE.md の現状

## 受け入れ条件

1. `parseMermaidCode` / `convertMermaidToERData` の名前が、生成物（`docs/storybook/`）と台帳の経緯の記述を除いて repo に無い
2. vitest は全件緑かつ exit 0。型検査が通る
3. 往復のテストが形 6 つ・矢印 5 つ・予約語・4 つの向きを mermaid.js の経路で検める
4. Web 版の静的書き出しが通る（`next build`）

## スコープ外

- `import-mermaid-to-er.ts` の改名、型の置き場所の整理
- `docs/storybook/` の再書き出し

## P1・P2 結果（2026-09-29）

| コミット | 中身 | テスト |
|---|---|---|
| `2aa6a1e`（デスクトップ） | D3: `convert_source` の模擬を `readFlowchartForImport` に。`update-diagram` の入力を連鎖 1 行に | 2 ファイル単独で緑 |
| `24363a0`（デスクトップ） | 両ファイルの `beforeAll` で mermaid を 1 度読んでおく | 全件で緑（下） |
| `cecb959`（**フォーク元の改善**） | D1・D2・D4: パーサー本体と補助・自身のテスト 2 ファイルと describe 3 つを削除、往復のテストを mermaid.js の経路へ、ER 図の入力 1 件を足す、TESTING.md の例 | 往復 5 件・配置 3 件・ER 図 8 件 |

- **P1 の穴（直した）**: 模擬の変換が mermaid.js になり、**単独では緑だが全件を並列に回すと 2 件が時間切れ**（図を開き終える待ち 8 秒の間に mermaid の初回の読み込みが入る）。
  `beforeAll` で先に読み込んでおく形にし、全件を **2 回**回して 2 回とも緑（1 回の緑を信じない、failures #3）
- **P2 の確かめ**: 素の `next build` を回して、git の中の `docs/`（GitHub Pages）を上書きし `docs/storybook/` を消した（failures #18。戻した）。
  `TAURI_ENV_PLATFORM` 付き（→ `out/`）で回し直して通過、`git status` は汚れない
- コミットの作り直し: `git rm` でステージしたテスト 2 ファイルの削除が、先に作ったデスクトップのコミットへ紛れた。未 push だったので分け直した（上の表が分け直した後）
- 足した ER 図のテスト（ハイフン・括弧の型・複数の関係）は、今の経路で既に正しい挙動の固定なので Red は無い（D2 のとおり）
- 全体: vitest 73 ファイル 654 件、exit 0（2 回）。型検査（`tsc --noEmit`）・lint（変えたファイル）通過。削除 1918 行・追加 74 行（フォーク元のコミット）

### 受け入れ条件の結果（2026-09-29）

| # | 結果 | 根拠 |
|---|---|---|
| 1 | **通過** | grep: 残るのは specs の経緯の記述（01・02・07・08・10・11・12）と `docs/storybook/` の束だけ |
| 2 | **通過** | vitest exit 0 を 2 回、`tsc --noEmit` exit 0 |
| 3 | **通過** | `round-trip.test.ts`（本物の mermaid、`dropped` が空であることも検める） |
| 4 | **通過** | `TAURI_ENV_PLATFORM` 付きの `next build`（`out/`）。素の build（`docs/`）も通ったが公開物を上書きしたので戻した |

- **上流へ返せるコミット**: `cecb959`（spec 11 の `7cc6bbb`・`c9c2469` の後に当たる）。PR を出すかは利用者が決める
- 査読はこの規模（削除と、テストの移し替え）なので立てなかった
