# Spec: コード生成のダイアログを広げ、左にコード・右に図のプレビューを出す

**ID**: 09
**Date**: 2026-09-28
**Status**: **Done**（2026-09-28。rev2 → P0〜P2 着地。受け入れ条件 1〜7 通過（5 の実機の書き出しと VRT は未確認）—「受け入れ条件の結果」節）
**Branch**: なし（Phase 単位で main へ直接コミット）

## Goal

利用者の要望（2026-09-28）:

> 編集でどんな図かある程度はわかるが、Mermaid 形式のテキストがどのような正式な Mermaid の図になるか画像を保存しないとわからないが、プレビューである程度わかるようにしたい。
> コード生成ボタンのダイアログをもっと大きくして左にコード右にプレビューが見れるといい。
> プレビューの表示は JavaScript などのライブラリで一般的なのがあると思うのでそちらを使う。

「コード生成」のダイアログ（フローチャート・ER 図の両方）を大きくし、**左に生成された Mermaid、右にその Mermaid を mermaid.js で描いた図**を並べる。
画像を保存しなくても、そのコードが Mermaid としてどう描かれるかが分かるようにする。

**フォーク元の改善**（Web 版にもある不足。Tauri に依らない）なので、`lib/desktop/` には触らず、上流へ PR で返せるコミットに分ける（掟）。

## 裁定（2026-09-28、利用者）

- D1: mermaid は **11.17.2 に固定**（書き出しの merman と同じ版。12 は merman が追従してから）
- D3: フローチャートのラベルは **mermaid.js の既定（HTML ラベル）**。書き出しの `htmlLabels: false` には寄せない

## 現況（2026-09-28）

- **フローチャート**: `features/flowchart/components/mermaid/download-modal.tsx`（`DownloadModal`）。`Modal size="2xl"`。見出しに「ダウンロード」・`ExportButtons`（デスクトップだけ）・`DirectionMenu`。
  本文（`ModalBody`、`position="relative"`）は、`CopyButton`（本文を基準に `absolute` で右上）と `MermaidHighlight`（`components/ui/mermaid-highlight.tsx`。react-syntax-highlighter の Prism で色付けするだけ、`minHeight` 400px、高さの上限なし）
- **ER 図**: `features/er-diagram/components/panel/er-diagram-mermaid-modal.tsx`（`ERDiagramMermaidModal`）。同じ形で、向きのメニューは無い
- どちらのダイアログもコードは**読むだけ**（編集できない）。コードが変わるのは開いた時と、フローで向きを変えた時だけ。
  `flow-panel.tsx` は `flowData` を描くたびに新しいオブジェクトで渡す（コードの文字列は同じでも参照は変わる）
- Yamada UI の `ModalBody` は `display: flex; flex-direction: column; align-items: flex-start; overflow: auto`。
  レスポンシブの指定は**既定が `down`**（`base` が最も広い幅、`md` は 768px 以下）。既存の `justify={{ base: ..., md: ... }}` もこの意味
- 図の描画は今どこにも無い。画像になるのはデスクトップの `ExportButtons` → Rust の `lorelei_core`（merman で SVG、resvg / krilla-svg で PNG / PDF。同梱の Noto Sans JP）だけ
- `package.json` に mermaid は無い（P0 で足した）。Next 14.1.0（静的書き出し）、React 18、Yamada UI 1.7（`Modal` は `...rest` を中身に渡すので `maxW` / `h` の直接指定が効く）
- デスクトップの CSP（`src-tauri/tauri.conf.json`）: `default-src 'self' ipc: http://ipc.localhost; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost`。
  `script-src` は `default-src` に落ちるので `'unsafe-eval'` は無い。Tauri は配る HTML の inline script のハッシュを自動で足す（style-src への自動追記は止めてある, failures #2）。
  **`tauri dev`（`next dev` を読む）では CSP は確かめたことにならない**（failures #2。`next dev` は eval を使うのに動いている）
- mermaid.js（npm `mermaid`）: 最新は **12.0.0（2026-09-10）**、その前が **11.17.2（2026-08-25）**。
  merman（書き出しに使うもの）は **11.17.2 に追従**している（`vendor/merman-core/LORELEI_PATCH.md`）。
  12.0.0 の破壊的変更（リリースノート）: フローチャート・ER 図などの既定の配置が dagre → **ELK**、既定のテーマが `default`/`classic` → `neo`（「再配置・再配色される」）、
  ES2024（Node 22.12+、Safari 17.4+）が要る、`defaultRenderer` の撤去
- mermaid 11.17.2 の `render(id, text, container?)`（`mermaid.core.mjs` で確認）: 最初に `document.getElementById(id)` を**消す**。container を渡さないと `document.body` に一時的な div を作ってそこで寸法を測る。
  `id` は `#id` の CSS セレクタにも使う。`render` は大域のキューで**直列**に走る。`suppressErrorRendering: true` で爆弾の SVG を出さずに throw する

## 決めること

### D1. プレビューに使うライブラリと版 — mermaid **11.17.2 に固定**（裁定）

- ライブラリは mermaid.js（Mermaid の本家。GitHub・GitLab・Notion などが描くのもこれ）。他に一般的な選択肢は無い（ラッパーの多くは中で mermaid.js を呼ぶだけ）
- 版は `11.17.2` に固定（`^` を付けない）。理由:
  - 書き出し（merman）が追従している版と同じにする。12 にすると、プレビューは ELK・`neo`、書き出しは dagre・`default` になり、**プレビューと保存した画像の配置と色が食い違う**
  - 12.0.0 は出て 18 日。周りの描き手（GitHub など）がまだ 11 の配置で描いている可能性が高い
- 12 にする時（merman が 12 に追従したら）は別の変更として上げる。12 を使いつつ `layout: 'dagre', theme: 'default', look: 'classic'` で 11 の見た目に寄せる手もあるが、寄せ切れる保証が無いので採らない
- 読み込みは**ダイアログを開いた時の動的 import**（`await import("mermaid")`）。mermaid は大きい（d3・dagre・cytoscape など）ので、開くまで読まない。Web 版の最初の表示を重くしない

### D2. ダイアログの形

- 大きさ: `maxW="90vw"`・`h="85vh"`。今の `2xl` から広げる（`size="full"` は余白が無くなるので使わない）
- 見出し: 今のまま（題・「ダウンロード」・`ExportButtons`・向きのメニュー）
- 本文: **左にコード、右にプレビュー**の 2 列（半々）。各列が**独立して**スクロールする。形（査読 4）:
  - `ModalBody` は `overflow="hidden"`。中に 2 列の grid（`w="full" flex={1} minH={0}`）
  - 各列は `position="relative"` の枠（枠はスクロールしない）と、その中のスクロールする箱（`h="full" overflow="auto"`）
  - コピーのボタンは**コードの列の枠**の右上（今は本文を基準にしているので、そのままだとプレビューの列に乗る）
  - `MermaidHighlight` に高さを渡す prop を足す（既定は今どおり `minHeight` 400px。ダイアログでは列いっぱい）
- 狭い幅（`md` = 768px 以下、スマホの Web 版）では上下に積む（コードが上）。この時は本文全体をスクロールし、各列の高さは中身なり
- 2 つのダイアログで同じ本文の部品を使う: `components/ui/mermaid-code-with-preview.tsx`（`code` を受け、コードの列 = `CopyButton` + `MermaidHighlight`、プレビューの列 = D3 の `MermaidPreview`）

### D3. プレビューの描き方

**境界**（査読 6。failures #14 の罠を避ける）: `components/ui/mermaid-render.ts` の `renderMermaid(id, code): Promise<string>` だけが mermaid に触る。
中で `import("mermaid")`、1 回だけ `initialize`、`render` して SVG の文字列を返す。テストはこの境界を**静的に**模擬する（`__tests__/setup.ts` で全体に。本物の mermaid は jsdom で描けない）。

- `initialize({ startOnLoad: false, securityLevel: "strict", theme: "default", suppressErrorRendering: true })`。`strict` で図の中のクリック・HTML を無効にする
- **id は描くたびに新しく作る**（査読 2）: `mermaid-preview-<連番>`（英字で始め、英数とハイフンだけ）。同じ id を使い回すと、`render` が最初に表示中の SVG を消す。React の `useId`（`:r0:`）は CSS セレクタとして壊れるので使わない
- `components/ui/mermaid-preview.tsx` の `MermaidPreview({ code })` が `renderMermaid` の SVG を右の列に差し込む。SVG は列の幅に合わせて縮む（mermaid が付ける `max-width` に加えて `max-width: 100%`）。背景は白（書き出しの既定と同じ）
- 描くのは `code` の**文字列**が変わった時だけ（effect の依存は `code`。`flowData` の参照が変わっても描き直さない）
- **古い結果を捨てる**（査読 7）: effect の cleanup で「もう要らない」印を立て、アンマウント後（ダイアログを閉じた後）・コードが変わった後に届いた結果は差し込まない。React 18 StrictMode の二度走りも同じ仕組みで捨てる
- 描いている間は「描いています…」。描けない時は、エラーの文を**赤の等幅・折り返しあり**（`white-space: pre-wrap`）で出す。mermaid の文法エラーは複数行（`Parse error on line N` と `^` の位置）。`import("mermaid")` 自体の失敗（チャンクの読み込み失敗）も同じ表示
- **文字の描き方（裁定: 既定のまま）**: mermaid.js の既定はフローチャートのラベルを HTML（`foreignObject`）で描く。書き出し（merman）は `htmlLabels: false` に固定している（spec 01）。
  プレビューは**既定のまま（HTML ラベル）**。「正式な Mermaid としてどう描かれるか」= GitHub などで貼った時の見え方に近い方を取る（対案の `htmlLabels: false` で書き出しに寄せる、は採らない）
- 文字の書体は既定（`"trebuchet ms", verdana, arial, sans-serif` → 日本語は OS の書体）。書き出しは同梱の Noto Sans JP なので、**字形と文字幅は書き出しと一致しない**（折り返し位置・箱の大きさが少し変わりうる）。ダイアログに注記は出さない（LORELEI.md の既知の制約に書く）
- 寸法は mermaid が `document.body` の一時的な div で測る（container は渡さない）。表示先のモーダルと継承する文字の設定が違うとラベルが切れうる — P2 で目視し、切れたら列の中の隠した要素を container に渡す（査読 9）

### D4. プレビューと書き出しの違いを隠さない

プレビューは mermaid.js、SVG / PNG / PDF の書き出しは merman（Rust）で、**描き手が違う**。同じ 11.17.2 系でも配置・字形が完全には一致しない。
プレビューは「Mermaid としてどう描かれるか」の目安で、保存した画像そのものの写しではない。これを LORELEI.md の既知の制約と data_contract.yaml に書く。
書き出しと同じ描き手（Rust の `render`）でプレビューする案は、Web 版で動かない・利用者の指定（JS のライブラリ）と違うので採らない。

## Phase

- **P0（PoC、コードの前）**: mermaid 11.17.2 を入れ、捨てるページで確かめる — (1) `next build`（静的書き出し）が通る (2) 静的書き出しを**今の CSP で**配って、
  フローチャート（日本語のノード ID・ラベル、`A --> B --> C` の連鎖）と ER 図（FK・日本語）が描ける。CSP の違反がコンソールに出ない (3) 描けないコードで爆弾の SVG が出ず throw する。
  CSP で描けなければ、ここで止めて CSP の変更を別の裁定にする（勝手に `'unsafe-eval'` を足さない）
- **P1**: D1〜D3。テスト（Red → Green、`renderMermaid` を模擬）: `MermaidPreview` がコードを渡して SVG を差し込む / 描けない時にエラーの文を出す /
  閉じた後（アンマウント後）に届いた結果を差し込まない / コードが変わった後に古い結果を差し込まない / 描くたびに id が変わり、英字で始まる /
  2 つのダイアログにコードの列とプレビューの列の両方が出て、コピーのボタンがコードの列にある / フローで向きを変えるとプレビューに新しいコードが渡る
  （`direction` を渡さない非制御の形で書く。制御の形で `onDirectionChange` が `vi.fn` だとコードが変わらない）。
  コード生成を開く既存テスト（`download-modal.test.tsx`・`panel-content.test.tsx` など）が通る（コードの表示・コピー・ダウンロードは変えない）
- **コミットの分け方**: フォーク元の改善だけのコミット — (a) `mermaid` の依存・境界・`MermaidPreview` (b) 2 つのダイアログの形（D2）。台帳（spec・LORELEI.md・data_contract・CLAUDE.md・failures）は別のコミット
- **P2**: 実機 — **配布ビルド**（`tauri build --no-bundle` の exe。CSP を確かめるため, 査読 1）でフローチャート・ER 図のダイアログを開き、左右の並び・独立したスクロール・向きの切り替えでプレビューが変わる・
  ラベルの切れやはみ出しが無い（査読 9）。プレビューと PNG の書き出しを見比べ、違いを記録する。Web 版（`next dev` のブラウザ）でも同じく動くか・狭い幅で上下に積まれるか
- VRT（Storybook の `tags: ["vrt"]`、`download-modal` と `er-diagram-mermaid-modal` の基準画像）は形が変わるので基準画像の更新が要る。ただしこの環境では VRT を走らせていない（spec 01 の 9・spec 02 の 3 が未確認）ので、
  基準画像の更新は VRT を回す時にする（査読 10。未了として結果の節に書く）

## P0 結果（2026-09-28）

- `corepack pnpm@9 add mermaid@11.17.2 --save-exact --ignore-scripts`: 依存の変更は**追加だけ**（既存の版は動いていない。pnpm-lock.yaml +698 行）
- `next build`（`TAURI_ENV_PLATFORM` 付き = Tauri 用の `out/`）が通った。PoC のページの初回の読み込みは 87.1 kB（mermaid は動的 import で別のチャンク。既存ページは 545 kB で変わらず）
- `out/` を今の CSP（`ipc:` を除く）と、Tauri と同じく **inline script のハッシュを足した `script-src`** で配り、Chromium（ブラウザの窓。WebView2 と同じ系統）で開いた:
  フローチャート（日本語のノード ID・ラベル、連鎖、`{}` の分岐、`(( ))`）と ER 図（PK・FK・日本語のテーブル名とカラム、リレーションのラベル）が描け、**コンソールは空**（CSP の違反なし）。
  文法の誤り（`A --> --> B`）は爆弾の SVG を出さず `Parse error on line 2: … Expecting …` で throw した → `'unsafe-eval'` は要らない見込み（本物の WebView2 と配布ビルドでは P2 で確かめる）
- 外した段取り: 最初は inline script のハッシュを足さずに配り、Next のアプリ自体が起動しなかった（mermaid とは無関係）。Tauri の CSP を真似る時は自動追記まで真似る（failures #15）

## P1 結果（2026-09-28）

フォーク元の改善のコミットを 2 つに分けた（`lib/desktop/` と台帳を含まない。上流へ PR で返す時に切り出せる）:

| コミット | 中身 | テスト（Red → Green） |
|---|---|---|
| `fa3851a` (a) | `mermaid` 11.17.2（版を固定）・境界 `components/ui/mermaid-render.ts`・`components/ui/mermaid-preview.tsx`・`__tests__/setup.ts` で境界を全体に模擬 | `__tests__/components/ui/mermaid-preview.test.tsx` 8 件（差し込む・描いている間・エラーの文・描くたびに新しい id・コードが変わった後の古い結果・同じ文字列なら描き直さない・StrictMode の二度走り・消えた後） |
| `24434a4` (b) | `components/ui/mermaid-code-with-preview.tsx`・2 つのダイアログの形（`maxW="90vw" h="85vh"`、2 列、狭い幅で上下）・`MermaidHighlight` の `h` | `mermaid-code-with-preview.test.tsx` 1 件（列の並び・コピーはコードの列）、`download-modal.test.tsx` +2 件（プレビューにコードが渡る・向きを変えると新しいコード）、`er-diagram-mermaid-modal.test.tsx` 2 件（新規。列・「ダウンロード」） |

- Red は「部品が無い」「列が無い」「向きを変えても新しいコードが渡らない」の想定どおりの理由で落ちた。1 件はテストの書き方（Prism が字句ごとに要素を分けるので `getByText` で一続きの文字が見つからない）→ 列の `toHaveTextContent` に直した
- 全体: vitest 61 ファイル 606 件すべて緑。exit 1 は既知の `DOMMatrixReadOnly` の未処理エラー（外枠を描くテスト、spec 08 の残り）。型検査通過、lint は変更したファイルで通過
- tsc が `.next/types/app/poc-mermaid` の残骸（P0 のビルドが書いた型）で落ちた → 消した（failures #15）

## P2 結果（2026-09-28）

- **配布ビルド**（`tauri build --no-bundle` の exe）で利用者が確認: フローチャート（既存の「spec 05 P3 受注の流れ」）と ER 図（MCP で送った 顧客・注文・注文明細・商品、PK / UK / FK）の
  「コード生成」で、左にコード・右に図が並ぶ / 左右が別にスクロールする / 向きの切り替えで右の図が描き直される / 日本語のラベル・分岐のラベル・リレーションのラベルが描ける。
  図が描けたことで、CSP を緩めずに描けることも確かめた（P0 では同じ CSP の下でコンソールが空だった）
- 静的書き出し（`out/` = Web 版と同じ中身）をブラウザで: ダイアログを開くまで mermaid のチャンクは読まれず、開いた時に 7 つ（計 約 840 KB）読まれる /
  1280×800 でダイアログ 1152×680（90% × 85%）、2 列とも幅 552 / 375×812 で上にコード・下に図、横スクロールなし。
  `next dev` でのブラウザ確認は、`.next` が壊れていたのでしていない（failures #15）
- 気づいたこと: 「AI が open=true で足した工程」が「工／程」で折り返された。mermaid.js の折り返しで、書き出しの禁則の無さ（LORELEI.md 既知の制約）と同じ種類。直さない
- 配布ビルドの 1 回目は `/_document` の PageNotFoundError で落ち、P0 が残した `out/` を消したら通った（failures #15）

### 受け入れ条件の結果（2026-09-28）

| # | 結果 | 根拠 |
|---|---|---|
| 1 | **通過** | P2 の配布ビルド（利用者）と静的書き出しの寸法。自動テスト（列の並び） |
| 2 | **通過** | P2 の配布ビルド（向きの切り替え）。自動テスト（向きを変えると新しいコード） |
| 3 | **通過**（自動テストと P0） | 自動テスト（エラーの文）。P0 で本物の mermaid が爆弾の SVG を出さず throw することを確認。実機で描けないコードは出していない（ダイアログのコードは生成器が書くので、文法の誤りは出にくい） |
| 4 | **通過** | P2 の配布ビルドで描けた。P0 で同じ CSP の下でコンソールが空 |
| 5 | **通過**（一部未確認） | 見出しのボタン（ダウンロード・`ExportButtons`）の経路は変えていない。自動テスト（コピーのボタン・ER 図の「ダウンロード」）。**実機での書き出しとプレビューの見比べはしていない** |
| 6 | **通過** | 静的書き出しで、開くまで mermaid を読まない。vitest で落ちるのは既知の未処理エラーだけ（failures #3 の時間切れは今回は出なかった） |
| 7 | **通過** | LORELEI.md の既知の制約に書いた。data_contract.yaml の `MermaidPreview` |

- **未了**: VRT の基準画像（`download-modal` と `er-diagram-mermaid-modal`）の更新は、VRT を回す時にする
- **上流へ返せるコミット**（フォーク元の改善だけ）: `fa3851a`・`24434a4`。PR を出すかは利用者が決める

## 受け入れ条件

1. フローチャート・ER 図とも、「コード生成」のダイアログが今より大きく開き、左にコード・右に図が並ぶ。各列が独立してスクロールする
2. 右の図は mermaid.js 11.17.2 で描かれ、左のコードを変える操作（フローの向き）に追従する
3. 描けないコードでは、爆弾の絵ではなく、エラーの文が右の列に出る。ダイアログは壊れない
4. **配布ビルド**で、CSP を緩めずに描ける（コンソールに CSP の違反が出ない）
5. 左のコードの表示・コピー・「ダウンロード」・SVG / PNG / PDF の書き出しは今どおり動く
6. Web 版でも同じく動く。mermaid はダイアログを開くまで読み込まれない。フォーク元の既存テストで落ちるものが変更前と同じ顔ぶれ（failures #3）
7. プレビューと書き出しの描き手が違うことが LORELEI.md の既知の制約に書いてある

## スコープ外

- ダイアログでコードを編集してプレビューすること（今は読むだけ。編集は「インポート」の役目）
- プレビューの拡大・縮小・パン
- 書き出し（merman）の描き方を mermaid.js に合わせること / mermaid 12 への追従
- インポートのダイアログへのプレビュー（要るなら別 spec）
- 上流への PR を出すこと自体（出せる形にしておくまで）

## 査読の採否（rev1 → rev2）

査読 1 本（エージェント、mermaid 11.17.2 の実体とコードを読んだもの）。設計を変える指摘（2）は `mermaid.core.mjs` の `removeExistingElements` で確かめてから採った。

| 指摘 | 採否 | 反映 |
|---|---|---|
| 1 高: `tauri dev` では CSP を確かめたことにならない（failures #2） | 採る | 現況・P0 は静的書き出しを CSP 付きで配って確かめた（P0 結果）・P2 と受け入れ条件 4 は配布ビルド |
| 2 高: `render` の id を決めていない。使い回すと表示中の SVG を消す / `useId` は CSS セレクタで壊れる | 採る（実体で確認） | D3: 描くたびに `mermaid-preview-<連番>` |
| 3 中: Yamada の `base` は最も広い幅（既定が `down`） | 採る | 現況・D2: 狭い幅は `md` |
| 4 中: 独立スクロールとコピーのボタンの置き場所の指定が足りない | 採る | D2 に本文の形を具体的に書いた・`MermaidHighlight` に高さの prop |
| 5 中: 既存テストの影響範囲の取り違え（`er-diagram-panel.test.tsx` は開かない、`panel-content.test.tsx` は本物を開く） | 採る | P1: 「コード生成を開く既存テスト」・境界を `setup.ts` で全体に模擬 |
| 6 中: `mermaid` の動的 import の模擬は failures #14 を踏む | 採る | D3: 境界 `renderMermaid` を静的に模擬 |
| 7 中: 閉じた時・StrictMode の二度走りが古い結果の判定に無い。依存は `code` の文字列だけに | 採る | D3。本物の `render` は直列なので「遅い 1 回目・速い 2 回目」は模擬の中だけで起きる — テストは「コードが変わった後」「閉じた後」に言い換えた |
| 8 低: エラーの文は複数行。import の失敗も同じ表示に | 採る | D3 |
| 9 低: 寸法は body の一時的な div で測る。ラベルが切れうる | 採る | D3・P2 の目視 |
| 10 低: VRT の基準画像が変わる | 採る（形を変えて） | Phase: この環境では VRT を回していないので、回す時に更新する（未了として残す） |
| 11 低: CSP の引用に `connect-src` が抜け / 向きのテストは非制御で | 採る | 現況・P1 |
