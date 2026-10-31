# Spec: 画面の言語 — デスクトップの外枠と Rust の言葉

**ID**: 34
**Date**: 2026-10-31
**Status**: **Draft** — rev0（[spec 31](31_ui-language.md) rev1 で分けた。D1〜D7 の裁定待ち。spec 31 の後に進める）
**Branch**: 切らない（Phase 単位で main へ直接コミット）。デスクトップ専用（`lib/desktop/`・`src-tauri/`・`crates/`）。ER 図の初期図（D6）だけフォーク元のファイルを触る

## Goal

spec 31 で作った仕組みに、デスクトップの外枠（タイトルバー・ツールバー・図の一覧・設定画面・ダイアログ）と、Rust が画面に出す言葉を載せる。
spec 31 の Goal（利用者の言「UI 言語の切り替え。英語と中国語と韓国語と日本語」「定番のライブラリで管理」）のデスクトップの分。

## 現況（2026-10-31、spec 31 の査読で確かめた）

- **`lib/desktop/` の言葉**: 日本語の直書きは `settings-dialog.tsx`（約 30 行）が最も多い。トーストの題（「確定できませんでした」など）・確認の文・`title` の案内（「最後の確定から変わっていません」など）
- **Rust が画面に出す言葉**（`src-tauri/src/`、テスト以外）:
  - `documents.rs` のエラー（「図を読めません」「保存できません」「ごみ箱へ移せません」など）。頭に `INITIAL_FIGURE_REJECTED`・`STALE_BASE`・`DOCUMENT_GONE` を付けた文字列を、フロントは `String(e).startsWith(…)` で見分ける（`lib/desktop/doc-session.ts:166-179`）
  - `lib.rs` の「図の一覧に足せませんでした」「この図の種類は GUI エディタで開けません」
  - **`mcp_host.rs`**（68・77・93・194・203・215 行）: 設定ファイルを読めない・トークンを保存できない・待ち受けられない・ポートの範囲。`McpStatus.detail` として設定画面とタイトルバーのツールチップに、`set_mcp_port` のエラーは設定画面のトーストに出る
  - **`crates/lorelei_core`** の `render.rs`・`validate.rs`・`editor.rs` の文: GUI の書き出し（`export_to` → `export-buttons.tsx`）と開けない図の知らせ（`use-desktop-open.ts`）に出る。MCP と同じ口
  - 保存ダイアログの題（`desktop.rs` の「{SVG} として保存」）・About（「Lorelei について」と説明・ライセンスの一覧）。rfd のネイティブのダイアログ（ボタンは OS の言語）
  - 新しい図の題（`documents.rs` の `default_title`: 「無題のフローチャート」「無題の ER 図」「AI の図 HH:MM:SS」「インポート HH:MM:SS」）。作った時に `Document.title` に書かれ、ファイルに残る
- **エラーを画面に出す所は `String(e)`**: `use-doc-session.ts`（195・230・363・388・494・577）・`export-buttons.tsx:46`・`mmd-download.ts:50`・`import-dialog.tsx:62`・`settings-dialog.tsx:61`。Tauri は `Err` が object なら object のまま JS へ渡すので、型を変えると `[object Object]` になる
- **エラーの経路は MCP と共有**: `incoming()`・`request_from_source()`（`lib.rs`）は GUI と MCP の `deliver` が使い、`request.error` は AI への `reason` になる。Store のエラーは `readback::list`・`read` を通って MCP にも出る
- **新しい図の題を渡せる口**: `create_document` はすでに `title` を受ける（`lib/desktop/documents.ts:35-36`）。`import_source` は受けない。AI が題を付けずに届けた図は Rust が付ける
- **ER 図の初期図**: テーブル名「ユーザー」（`er-diagram-editor.tsx:66`）。Rust の `initial_source` がこれを生成器にかけた出力と文字で一致することを vitest で突き合わせ、
  `first_fill`（ファイルの source が空）の時だけ、AI・インポートの図を初期図で潰す書き込みを断る（`documents.rs:286-293`、spec 04 D4-2・spec 08 D1）
- **窓を出す所**: `desktop-shell.tsx:47-50` の子の部品の effect（`windowAction("show")`）。spec 31 D5 の「マウントの後に言語を当てる」より先に走りうる

- **今のデスクトップは日本語に留めている**（spec 31 P1 `13f59e1`）: `DesktopShell` が Tauri の時に `i18n.changeLanguage("ja")`。外枠の言葉と切り替えを入れる時に外す（D2 の「言語を当ててから窓を出す」と置き換える）

## 決めること

### D1. デスクトップの訳のファイルと型

- **推奨**: `lib/desktop/locales/{lng}.json`（名前空間 `desktop`）を `lib/desktop` から `addResourceBundle` で足す。キーの型は、フォーク元の宣言（spec 31 D2）に `desktop` を足す `i18next.d.ts` をルートに 1 つ置く案と、`lib/desktop` が自前の型付きの `t` を包む案がある — P0 でフォーク元のコミットに `lib/desktop` の名が出ない方を選ぶ
- 言語を足す時は、フォーク元の訳・デスクトップの訳・言語の一覧の 3 か所（spec 31 の Goal の「1 つ」から増える）

### D2. 切り替えの置き場所と窓

- **推奨**: タイトルバーの画面の色のメニュー（`color-mode-menu.tsx`）の隣に地球のアイコンのメニュー
- 言語を当ててから窓を出す（外枠の部品が言語を当てた後に `show`。spec 05 D5 の「最初の描画を見せない」と同じ形）。組み立ての言語（日本語）が一瞬見えないことを `tauri dev` で確かめる
- macOS の WKWebView は、`Info.plist` に `CFBundleLocalizations` が無いと `navigator.language` が `en` を返すことがある（推測）。P0 で調べ、要れば OS の言語を Rust から取る（`sys-locale` など）

### D3. Rust のエラー

- **推奨**: Rust に `{ code, detail }` を持つエラーの型を作る。`Display` は今の日本語の文のまま（MCP とログで使う。AI 向けは訳さない）。**Tauri のコマンドだけ直列化した形で返し**、フロントは `describeError(e)` 1 か所で受けて訳す（今の文字列も読む）。
  `isStaleBase` などは `code` で見分ける。コードの一覧は data_contract に置き、全部のコードに訳があることをテストする（Rust がコードを fixture に書き、vitest が読む。`er_names.json` と同じ流儀）
- 対象に `mcp_host.rs`（`McpStatus.detail` も `code` を持つ）を入れる
- `lorelei_core` の書き出し・検査の文（GUI の書き出しと開けない図に出る）は、**訳さない例外にする**か、コードを持たせるか — 推奨は例外（MCP と共有の文で、構文エラーは merman の英語が混ざる）。画面では「書き出せませんでした」などの題だけ訳し、詳しい文はそのまま出す
- テストの偽のバックエンド（`__tests__/lib/desktop/fake-backend.ts`）と、文字の頭で拒むテストも同じ形に変える

### D4. 保存ダイアログの題と About

- **推奨**: フロントが訳した文を Rust に渡す（今は Rust が日本語で持つ）

### D5. 新しい図の題

- **推奨**: 人が作る図（新規・インポート）は**フロントが訳した題を渡す**（`import_source` に `title` を足す）。AI が題を付けずに届けた図だけ Rust が付けるので、フロントが言語を切り替えた時に**題のひな形**（例 `AI diagram {time}`）を Rust に知らせ（`set_ui_locale`）、`{app_data_dir}/ui_locale.json` に覚える
  （MCP は GUI の画面より先に待ち受けるので、ファイルに残す）。一度も知らされていなければ今の日本語のひな形。Rust に言語の表は持たない
- 既にある図の題は変えない（利用者の持ち物）

### D6. ER 図の初期図

- **推奨**: 初期図は言語で変えない（保険の判定のため）。テーブル名を、どの言語でも読める `User` に変える。前の形（「ユーザー」）は残さなくてよい — 保険は `first_fill` の時だけで、比べる相手は今動いているフロントが書く初期図なので
  - 副作用: `erDiagram User {…}` は AI が実際に送りうる 1 テーブルの図で、誤って断る確率が「ユーザー」より上がる（推測、低い）。日本語の画面の ER 図の初期図が変わる
  - 直す所: `er-diagram-editor.tsx:66`・`src-tauri/src/documents.rs` の `initial_source` とテスト・`data_contract.yaml` の `Document.initial_sources`・`__tests__/lib/desktop/doc-session.test.ts`・`er-diagram-editor-delete.test.tsx`・`er-diagram-editor-direction.test.tsx`・`editor-undo.test.tsx`。
    フォーク元のファイルとデスクトップのテストにまたがるので、同じ Phase で続けてコミットする（間で赤にしない）
- 案: 初期図を今のまま「ユーザー」にする — 英語・中国語・韓国語の利用者にも日本語の初期図が見える

### D7. 言語の順

- **推奨**: spec 31 と同じく日本語と英語。中国語・韓国語は spec 35

## 受け入れ条件（rev0）

1. デスクトップで日本語と英語に切り替えられ、開き直さずに外枠・設定画面・ダイアログ・トースト・Rust のエラー（D3 の例外を除く）・保存ダイアログの題・About が変わる。開き直しても残る
2. 窓が組み立ての言語のまま見えない
3. MCP の返事（AI が読むエラーの文）は前と同じ
4. 全部のエラーのコードに訳がある（テスト）。`String(e)` で `[object Object]` が出ない
5. 新しい図の題が選んだ言語で付く（新規・インポート・AI）。既にある図の題は変わらない
6. 初期図の保険が前と同じに効く（Rust・vitest）
7. デスクトップの直書きが、認めた例外を除いて 0（spec 31 D10 のテストの範囲を `lib/desktop/` に広げる）
8. 配布ビルドで利用者が確かめる（macOS の言語の判定は Actions の版で）

## Phase

- **P0**: 型の置き方（D1）・macOS の `navigator.language`（D2）・エラーのコードの一覧。data_contract を凍結（エラーのコード・`set_ui_locale`・`ui_locale.json`・`Document.initial_sources`）
- **P1**: Rust（エラーの型・`set_ui_locale`・題のひな形・`import_source` の題・初期図）
- **P2**: `lib/desktop`（訳のファイル・`describeError`・タイトルバーの切り替え・窓を出す順）→ `tauri dev`
- **P3**: 配布ビルドで利用者が確かめる

## スコープ外

- 中国語・韓国語の訳 → [spec 35](35_zh-ko-translations.md)
- MCP のツールの説明・AI への返事の訳
- `lorelei_core` の書き出し・検査の文の訳（D3 の推奨では例外）
