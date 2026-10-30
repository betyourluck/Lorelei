# Spec: 画面の言語を切り替える — 仕組みと日本語・英語（フォーク元・Web 版）

**ID**: 31
**Date**: 2026-10-30
**Status**: **Draft** — rev1（rev0 を起票 → 査読 1 本（「査読の採否」）→ rev1 で 3 本に分けた。D1〜D10 の裁定待ち）
**Branch**: 切らない（Phase 単位で main へ直接コミット）。**この spec はフォーク元の改善だけ**（`app/`・`features/`・`components/`・`locales/`・テストの基盤）で、上流へ PR を出せる形にする（PR を出すかは利用者が決める, CLAUDE.md）

## Goal

利用者の言（2026-10-30）:

- 「UI 言語の切り替え。英語と中国語と韓国語と日本語。あまりに日本ユーザーだけだと需要が少ない」
- 「UI の切り替えは要望があれば言語を増やしていきたいので、なにか定番のライブラリを使って管理するのが良い」

画面の言葉を定番のライブラリで管理し、利用者が切り替えられるようにする。rev1 で 3 本に分けた（査読 27。性質の違う作業 — フォーク元の言葉の抜き出し・Rust と MCP の契約・訳と見た目の確かめ — が 1 本に入っていたため）:

| spec | 中身 |
| ---- | ---- |
| **31（これ）** | 仕組み（i18next）・フォーク元の言葉を訳のファイルへ・日本語と英語・Web 版の切り替え・テストの基盤 |
| [34](34_desktop-ui-language.md) | デスクトップ（`lib/desktop/`）の言葉・タイトルバーの切り替え・Rust のエラーのコード・保存ダイアログと About・新しい図の題・ER 図の初期図 |
| [35](35_zh-ko-translations.md) | 中国語（簡体字）・韓国語の訳・4 つの言語で見た目を確かめる・README・書き出しのフォント |

この spec が終わると、Web 版は日本語と英語で切り替えられ、デスクトップは日本語のまま（外枠の切り替えは spec 34）。**言語を足す時は、フォーク元の訳のファイル（D2）と言語の一覧の 1 行を足す**（デスクトップの訳は spec 34 で別のファイルに持つ）。

## 現況（2026-10-30 にコードを読み、2026-10-31 に査読で補った）

- **画面の言葉は日本語が直に書いてある**: フロント（`app/`・`features/`・`components/`・`lib/`、テスト・stories を除く）で、コメントを除いて日本語を含む行は **約 57 ファイル・360 行**（数え方で ±数行）。
  多いのは `components/ui/mermaid-completion.ts`・`lib/desktop/settings-dialog.tsx`・`components/ui/editor-phrases.ts`・`components/ui/mermaid-dropped.ts`・`features/flowchart/components/mermaid/import-modal.tsx`。
  文字の内容のほかに `aria-label`・`title`・`placeholder` にもある。i18n の仕組みは無く、`app/layout.tsx` は `<html lang="ja">` に固定
- **英語の直書きもある**（日本語を数えても見つからない, 査読 2）: `aria-label="Delete edge"`（`editable-edge.tsx:146`・`er-editable-edge.tsx:90`）・`"Select arrow type"`（`arrow-type-selector.tsx:35,51`）・`label="Copied!"`（`copy-button.tsx:23`）
- **部品が持つ言葉**（査読 3）: xyflow の Controls のボタン（Zoom In など、ツールチップで見える）・ミニマップ・ノードと線の説明は `@xyflow/system` の既定の英語。`@xyflow/react` 12.8.2 の `<ReactFlow>` は `ariaLabelConfig` を受けるが、今は渡していない。yamada-ui の部品も英語の aria（`Close modal` など）を持つ
- **CodeMirror の訳は開いた時に固定**（査読 4）: `code-editor.tsx:212` の `EditorState.phrases.of(EDITOR_PHRASES_JA)`。Compartment に入っていない
- **図の中身に入る既定の名前**（査読 5）: 新しいテーブル `` `テーブル${nodeId}` ``（`er-diagram-helpers.ts:26`）・新しい枠の題 `` `グループ${n}` ``（`frame-edit.ts:473`）・新しいノード `` `Node ${nodeId}` ``（`flow-helpers.ts:46`、英語）。Mermaid に書き出される
- **例のコードのラベル**（査読 6）: インポートの例と placeholder（`import-modal.tsx:84-87` など、`A[開始] --> B{判定}`）は日本語のラベル
- **server component と `metadata`**（査読 7）: `app/layout.tsx` の題と説明・`app/not-found.tsx`（`metadata` と本文、hook を使えない）・`app/er-diagram/page.tsx` の題。組み立ての時に固定される
- **読み込み時に評価される表と、state に入れた文字**（査読 8）: 向きの名・落とした要素の名・補完の説明などの表（`features/flowchart/types/types.ts:44-49`・`frame-direction.ts:121-124`・`mermaid-dropped.ts:14-27`・`drop-warnings.ts` 2 つ・`mermaid-completion.ts`・`navigation-menu.tsx:8-9`・`confirm-delete.tsx:11`）は読み込み時に文字になる。
  インポートの `setError("Mermaidコードを入力してください")`・`useDroppedSummary` は文字を state に持つ。どちらも切り替えに付いてこない
- **名詞を差し込む文の組み立て**（査読 9）: `` `選択した ${n} 個の${KIND_LABEL[kind]}を削除しますか？` ``（`confirm-delete.tsx:18-20`）・`` `${label}が空` ``（`er-names.ts:90-96`）など。英語の複数形・韓国語の助詞（名詞の終わりの音で `을/를` が変わる）に合わない
- **日付と時刻は画面に出ていない**（査読 11）。`Intl`・`toLocale*` の使い所は 0（時刻は Rust の新しい図の題の `HH:MM:SS` だけ — spec 34）
- **テストは日本語の文字で要素を探す**（査読 20）: `__tests__` で日本語を含むファイルは約 110（かなを含むもの 48）、日本語で探す Testing Library の呼び出しは約 530 か所。jsdom の `navigator.language` は `en-US`。
  ほかに `tests/e2e/navigation-menu.spec.ts`・`scripts/ui-style-snapshot.mjs`（spec 27 の見た目の台本）・`.storybook/preview.tsx`
- **ライブラリ**（2026-10-31 に npm で確かめた）: `i18next` 最新 26.5.12（10-30）、出てから 2 週間以上たつのは 26.4.7（10-16）まで。`react-i18next` 最新 17.1.9（10-25）、2 週間以上は 17.0.21（10-17）まで（17.0.21 の peer は `react >= 16.8.0`・`i18next >= 26.2.0`）。
  `next-intl` 4.14.9（peer に `next ^14`）
- 画面の色の切り替え（spec 27）は yamada-ui が localStorage の `ui-color-mode` に覚え、Web 版には出していない。spec 26・27 で「覚えた値はマウントの後に読む（静的書き出しでサーバー側でも描かれる）」「`AppProviders` は client component（failures #48）」を踏んでいる

## 決めること

### D1. ライブラリと版

- **推奨: `i18next` + `react-i18next`** — React の i18n で最も広く使われる組。ブラウザの中だけで動くので静的な書き出し（`output: "export"`）と合う。複数形（`count`）・差し込み・言語が無い時の代わりの言語を持ち、TypeScript でキーを型にできる（無いキーは `tsc` で落ちる）
- 案: `next-intl`（言語ごとの URL かサーバー側の設定が前提で、Web 版の URL が変わる）・Lingui（コンパイルの段が要る）・FormatJS（広さで劣る）— 採らない
- **版**: 出てから 2 週間以上のものに固定し、`^` を付けない。今日なら `i18next` 26.4.7・`react-i18next` 17.0.21（P0 で組み合わせて動くことを確かめる）

### D2. 訳のファイルと名前空間

- **推奨**: フォーク元の訳は `locales/{lng}/common.json`（必要なら `flowchart.json`・`er.json` に分ける）。キーは場所ごとの入れ子（`toolbar.addNode`・`node.shape.diamond`）。全部の言語を組み立てに同梱する（言葉は数十 KB）
- **デスクトップの訳はこのファイルに入れない**（査読 15。同じファイルをフォーク元とデスクトップのコミットが触ると、上流への PR を切り出せない）。spec 34 で `lib/desktop/locales/{lng}.json` を `addResourceBundle` で足す（デスクトップがフォーク元を参照する向きなので掟に合う）
- キーの型（`CustomTypeOptions.resources`）は 1 か所でしか宣言できない。この spec ではフォーク元の名前空間だけで宣言し、デスクトップの名前空間の型は spec 34 で決める
- 言語の一覧（コード・その言語での名）はフォーク元の 1 か所に置く。この spec の一覧は `ja`・`en`（D3）

### D3. この spec で揃える言語

- **推奨: 日本語と英語**（英語は言語が無い時の代わり）。中国語（簡体字）・韓国語は spec 35 で、訳が揃った時に一覧へ足す（査読 25。訳の無い言語を選べないように）

### D4. 最初の言語と覚え方

- **推奨**: 選んだ言語を覚えていればそれ → 無ければブラウザの言語（`navigator.languages` を上から見て、一覧にある言語に近いもの）→ 合わなければ英語
- 近いものの表（spec 35 で中国語・韓国語を足した時の分も先に決める, 査読 21）: `ja*` → `ja`、`en*` → `en`、`zh-CN`・`zh-SG`・`zh-Hans*`・ただの `zh` → `zh-Hans`、`zh-TW`・`zh-HK`・`zh-MO`・`zh-Hant*` → **英語**（繁体字の利用者に簡体字を出さない。繁体字は要望があれば足す）、`ko*` → `ko`
- 覚える場所は localStorage の `lorelei.locale.v1`。読み書きは try/catch で包む（使えない時は覚えないだけ）
- 切り替えたら開き直さずにすぐ全部の言葉が変わり、`document.documentElement.lang` も変わる

### D5. 組み立ての言語と水和（hydration）（rev1 で足した, 査読 13）

静的書き出しは組み立ての時に Node の上で一度描き、ブラウザはその HTML に水和する。最初の描画の言語が組み立ての時と違うと、React 18 は水和のエラー（#418・#425）を出す。

- **推奨: 組み立ての言語は日本語**。i18next は資源を同梱して同期で初期化し（`initAsync: false`、`react: { useSuspense: false }`）、最初の描画は必ず日本語。**マウントの後に**覚えた言語・ブラウザの言語を読み `changeLanguage` する（spec 26・27 と同じ形）。
  `navigator`・`localStorage` には描画中に触らない。`<html lang="ja">` は静的なまま、切り替えで `document.documentElement.lang` を書く
  - 日本語の利用者には今と同じ画面が最初から出て、上流のフォーク元の既定とも同じ（受け入れ条件 2）
  - **Web 版で日本語以外の利用者には、読み込みの直後に日本語が一瞬見える**。これを受け入れる
- 案: 組み立ての言語を英語にする — 日本語の利用者に英語が一瞬見え、今の見た目の記録（spec 27 の台本）も変わる
- 案: 言語が決まるまで画面を隠す — 最初の描画が遅れ、隠し方を誤ると何も出ない。採らない
- デスクトップは窓を隠したまま起動するので、一瞬の日本語は見えないようにできる（spec 34）

### D6. 言葉の書き方の規約（rev1 で足した, 査読 8・9）

- **表と state にはキー（か、キーと値）を持たせ、描く時に訳す**。読み込み時に `t()` を呼ばない。エラーの文を state に入れる所は、キーと差し込む値を持つ
- **純粋な関数**（`frame-direction`・`drop-warnings`・`er-names`・`describeDropped` など）が文を返す所は、**呼ばれた時にグローバルの `i18n.t` で訳して返す**（今の戻り値の形と、テストの日本語の比べがそのまま通る, 査読 20）。React の部品の中は `useTranslation` の `t`
- **文は文ごとのキーにする**。名詞を差し込んで文を組み立てない（`選択した {{count}} 個のノードを削除しますか？` をノード・線・テーブル…ごとに持つ）。数は `count` で、英語は `_one`・`_other` を持つ
- 名前（利用者が付けた名・ID）を差し込む文は、韓国語の助詞が名前で変わるので、spec 35 で `을(를)` の形にする（キーは名前を差し込む形のままでよい）

### D7. 訳す範囲と例外（rev1 で足した, 査読 2〜7・11・26）

- **訳す**: 日本語の直書き全部・英語の直書き（`Delete edge`・`Select arrow type`・`Copied!`）・xyflow の言葉（2 つの `<ReactFlow>` に `ariaLabelConfig`）・CodeMirror の訳（言語ごとの表にし、Compartment で差し替える。`editor-phrases.test.ts` のキーの照合も言語ごと）・
  `metadata` の題（組み立ての時は日本語のまま、切り替えたら client 側で `document.title` を書く）・404 の本文（client の子に切り出す）・Mermaid の補完の説明・例のコードのラベル（記法はそのまま、ラベルだけキーで差し込む）
- **訳さない（例外）**: Mermaid の記法（キーワード・例の構造）・mermaid.js と merman の構文エラーの文（英語のまま）・yamada-ui の部品の組み込みの aria・出し終えたトースト（切り替えた時に出ていたもの）・コメント・ログ
- 日付と時刻はこの spec では出ていないので扱わない

### D8. 新しい要素の既定の名前（rev1 で足した, 査読 5）

新しいテーブルの名・新しい枠の題・新しいノードのラベルは、作った時に図の中身（Mermaid）に書かれる。初期図と違って保険（spec 04・08）には関わらない。

- **推奨: テーブルと枠は作った時の言語で付ける**（`テーブル3` / `Table3`、`グループ1` / `Group1`）。**ノードはどの言語でも今のまま `Node {id}`**。既にある図の名は変えない
  - ノードを変えないのは、今も英語で、日本語の画面を前と同じに保てるため（受け入れ条件 2）
- 案: 全部を英語に固定する — 日本語の利用者の画面で、新しいテーブルが `Table3` になる（今と変わる）

### D9. Web 版の切り替え

- **推奨: Web 版（ライブデモ）にも出す**。利用者を増やす目的では最初に触るのがライブデモなので。置き場所はフォーク元の見出しの並び（`flow-panel.tsx:83`・`er-diagram-panel.tsx:85` の `NavigationMenu`。デスクトップでは隠れるので二重にならない）に地球のアイコン（`languages`）のメニュー。
  言語の名はその言語で書く（日本語・English）。URL は変えない

### D10. テストの基盤（rev1 で足した, 査読 14・16・20）

- **既存のテストは日本語で走らせる**: `__tests__/setup.ts` で日本語の資源を同期で初期化し、`beforeEach` で `changeLanguage("ja")` と `lorelei.locale.v1` の削除（failures #46 の `restoreAllMocks` に注意）。言語ごとのテストは少数足す（切り替え・覚える・ブラウザの言語・水和）
- **キーの組のテスト**: 一覧にある全部の言語が日本語と同じキーの組を持つ。複数形の接尾辞（`_one`・`_other`）は外してから比べる
- **直書きを見つけるテスト**: `typescript` のコンパイラ API で StringLiteral・テンプレート・JsxText だけを見て、かなと CJK の漢字を含むものを数える（全角の記号は数えない — `mermaid.ts:265` の `～` など）。例外は行に印のコメント。この spec の範囲（`lib/desktop/` 以外）で 0
- **英語の直書き**は上のテストで捕まらないので、`eslint-plugin-i18next` の `no-literal-string`（JSX の文字と `aria-label`・`title`・`placeholder`・`label`）を範囲に掛ける（P0 で設定の細部と誤検知を確かめ、使えなければ同じコンパイラ API のテストで属性を見る）
- テストの外: `tests/e2e/navigation-menu.spec.ts`・`scripts/ui-style-snapshot.mjs` は言語を日本語に固定する（Playwright の `locale: "ja-JP"` と localStorage）。Storybook の `.storybook/preview.tsx` に i18n の decorator

## 受け入れ条件（rev1）

1. Web 版で日本語と英語に切り替えられ、開き直さずに画面の言葉が変わる（2 つのエディタ・パネル・ダイアログ・コード生成・インポート・補完・CodeMirror の検索の窓・xyflow の Controls のツールチップ・404・タブの題）。D7 の例外を除く
2. **日本語の画面は前と同じ**: 言葉を移しただけの段（P1）で、spec 27 の台本のライトの計算されたスタイルと文字が前の記録と一致する。メニューを足した段（P2）は、差分が言語のメニューの場所だけであることを見る
3. 選んだ言語は開き直しても残る。覚えていない時はブラウザの言語（D4 の表）、合わなければ英語。`<html lang>` が選んだ言語になる
4. Web 版の本番の組み立て（`build-web-demo.mjs`）で、どの言語で開いても水和のエラーがコンソールに 0
5. キーの組のテスト・直書きのテスト（日本語と英語）が緑。英語の直書きの 5 か所も訳されている
6. 既存の vitest が全件緑で終了コード 0。テストの基盤（D10）を入れた後、既存のテストの書き換えは日本語の文字を変えない
7. 新しいテーブル・枠の名が D8 どおり。既にある図の名は変わらない
8. フォーク元の改善のコミットだけで、`lib/desktop/`・`src-tauri/`・台帳を含まない

## Phase

- **P0**: 言葉を全部数える（例外の一覧・キーの名の付け方）、版を組み合わせて動かす（静的書き出しで水和のエラーが出ないか、最初の小さな部品 1 つで）、`no-literal-string` の当たり。data_contract の名詞を凍結（`UiLocale`・`UiMessages`（名前空間）・`lorelei.locale.v1`）
- **P1**: 仕組み（i18next の初期化・言語の判定・覚える・`lang`・キーの型・テストの基盤 D10）とフォーク元の言葉を日本語の JSON へ移す（D6・D7・D8 の規約で）→ 受け入れ条件 2 の前半（前の記録と一致）
- **P2**: 英語の訳・Web 版の切り替え（D9）→ 本番の組み立てで英語の画面を台本の場面ごとに撮り、はみ出し・重なりを直す。水和のエラーを見る
- **P3**: ライブデモを作り直すかは利用者が決める（spec 34・35 の後にまとめてもよい）

## スコープ外

- デスクトップ（`lib/desktop/`・`src-tauri/`）の言葉・タイトルバーの切り替え・Rust のエラー・新しい図の題・ER 図の初期図 → [spec 34](34_desktop-ui-language.md)
- 中国語・韓国語の訳・README・書き出しのフォント → [spec 35](35_zh-ko-translations.md)
- 繁体字ほかの言語（D2 の手順で足せる）・右から左へ書く言語
- MCP のツールの説明・AI への返事の訳（読むのは AI）
- README・LORELEI.md・CONTRIBUTING の中国語・韓国語の版

## 査読の採否（rev1、2026-10-31）

査読 1 本（こちらから依頼、spec とコードだけを渡した）。根拠の行（英語の直書き 5 か所・`ariaLabelConfig` の有無・`EDITOR_PHRASES_JA` の固定・既定の名前 3 か所・`not-found.tsx` の `metadata`・`mcp_host.rs` の文・`String(e)` 9 か所・文字の頭での見分け・同梱フォントのハングル 0 字・`first_fill` の時だけの保険・窓を出す effect）と版の日付はコードと npm で確かめてから採った。

| # | 指摘 | 採否 |
| - | ---- | ---- |
| 1 | 数は合う | 問題なし |
| 2 | 英語の直書き | **採る** — 現況・D7・D10・受け入れ条件 5 |
| 3 | xyflow の言葉（`ariaLabelConfig`）・yamada-ui の aria | **採る** — D7（yamada-ui は例外） |
| 4 | CodeMirror の訳が固定 | **採る** — D7 |
| 5 | 新しい要素の既定の名前 | **採る** — D8 |
| 6 | 例のコードのラベル | **採る** — D7（ラベルだけ訳す） |
| 7 | server component と `metadata` | **採る** — D7 |
| 8 | 読み込み時の表・state の文字 | **採る** — D6 |
| 9 | 文の組み立て | **採る** — D6（韓国語の助詞は spec 35） |
| 10 | Rust の取りこぼし（`mcp_host.rs`・`lorelei_core`） | **採る** — spec 34 |
| 11 | 図の一覧に時刻は無い | **採る** — 現況・D7 |
| 12 | 同梱フォントに韓国語・簡体字が無い | **採る** — spec 35 |
| 13 | 水和と最初の言語 | **採る** — D5（組み立ては日本語を推す）。窓を出す順は spec 34 |
| 14 | 複数形のキーの比べ | **採る** — D10 |
| 15 | 1 つのファイルではコミットを分けられない・型の宣言 | **採る** — D2 |
| 16 | 直書きのテストの作り方 | **採る** — D10 |
| 17 | Rust のエラーをコードで返す時の波及 | **採る** — spec 34 |
| 18 | 新しい図の題と `set_ui_locale` | **採る** — spec 34 |
| 19 | 初期図を `User` にする時の影響（前の形は要らない） | **採る** — spec 34 |
| 20 | 既存のテストの言語 | **採る** — D10・D6（純粋な関数はグローバルの `t`） |
| 21 | 言語の対応表・macOS の `navigator.language` | **採る** — D4、macOS は spec 34 |
| 22 | 版（2 週間以上は 26.4.7・17.0.21 まで） | **採る** — D1 |
| 23 | D3・D5・D6・D9 | 問題なし |
| 24 | 受け入れ条件 2 がメニュー・初期図と衝突 | **採る** — 受け入れ条件 2 を段で分けた。初期図は spec 34 |
| 25 | Phase の順（訳の無い言語を選べる） | **採る** — D3 |
| 26 | 受け入れ条件の例外と足りない条件 | **採る** — 受け入れ条件 1・3・4・5・7。デスクトップの分は spec 34 |
| 27 | 3 本に分ける | **採る** — 31・34・35 |
