# Spec: 画面の言語 — デスクトップの外枠と Rust の言葉

**ID**: 34
**Date**: 2026-10-31
**Status**: **Active** — rev1（[spec 31](31_ui-language.md) rev1 で分けた → 査読 1 本（「査読の採否」）→ rev1 → 裁定（「裁定」、推奨どおり）→ P0〜P4 着地（「P0 結果」〜「P4 結果」）。次は P5（配布ビルドで利用者が確かめる））
**Branch**: 切らない（Phase 単位で main へ直接コミット）。デスクトップ専用（`lib/desktop/`・`src-tauri/`・`crates/`）。フォーク元のファイルを触るのは、型の口（D1）・直書きのテストの走査の関数（D1）・言語のメニューの `buttonProps`（D2）・ER 図の初期図（D6）

## Goal

spec 31 で作った仕組みに、デスクトップの外枠（タイトルバー・ツールバー・図の一覧・設定画面・ダイアログ）と、Rust が画面に出す言葉を載せる。
spec 31 の Goal（利用者の言「UI 言語の切り替え。英語と中国語と韓国語と日本語」「定番のライブラリで管理」）のデスクトップの分。

## 裁定（2026-10-31、利用者）

利用者の言: 「推奨どおりで進める」 — D1〜D7 を推奨どおりに決めた（D5 の覚える所は案 A の `state.json`、D6 は案 B の言語ごとの初期図と集合での比べ）

## P4 結果（2026-10-31）

- **コミット**: `7084939` 1 つ（TS・Rust・fixture・data_contract・テスト。D6 のとおり片側だけのコミットを作らない。フォーク元の改善の一覧には入れない）
- **入れたもの**:
  - TS: `initialERNodes(lng?)`（関数にした。テーブルの名は common の `defaults.initialTable`、日本語「ユーザー」・英語「User」、省くと今の言語）。エディタはマウントした時に 1 回作る（`useState(() => initialERNodes())`）。
    フローチャートの初期図（`startNode[Start]`）は言語に依らない
  - Rust: `initial_source(editor) -> &str` を `initial_sources(editor) -> &[&str]` にし、保険（`save` の first_fill・origin が ai / import）はどれかと同じなら拒む
  - fixture `src-tauri/tests/fixtures/initial_sources.json`（`{ erDiagram: [日本語, 英語], flowchart: [1 つ] }`）: `__tests__/lib/desktop/doc-session.test.ts` が `LOCALES` の全部の言語の初期図を生成器にかけ、
    重複を除いて `LORELEI_UPDATE_FIXTURES=1` で書く。Rust の `initial_sources_match_the_fixture_written_by_vitest` が比べる。
    置き場所は data_contract の rev1 の `crates/lorelei_core/tests/fixtures/` から、Rust の側（`src-tauri`）へ移した（P2 のエラーのコードの fixture と同じ）
- **テスト**: Rust は保険のテストに英語の初期図を足した・fixture と比べる 1 件（`src-tauri` 60 件が緑）。vitest は fixture（日本語・英語の初期図）と、
  エディタを英語で作ると `User`・その後に日本語へ切り替えても名は変わらない・日本語は前と同じ「ユーザー」（`features/er-diagram/__tests__/er-diagram-editor-initial.test.tsx`）
- **片側だけ変えると落ちるか**: Rust から英語の初期図を外す → Rust の 2 件（fixture・保険）が落ちた。英語の訳だけ変える（`User` → `Users`）→ vitest の 2 件が落ちた（fixture・英語の初期図）
- vitest の全部（119 ファイル 1292 件）で 1 件が時間切れ（`direction-save`、単独では通る。P1 から続く重い時だけのもの）。`tsc`・eslint 0 件
- **画面（開発サーバーの Web 版、Browser pane）**: 日本語は「ユーザー」のまま。言語のメニューで英語にしてから ER 図のページへ移ると `User`。
  **英語を覚えたまま ER 図のページを直に開き直すと「ユーザー」**: 最初の描画は組み立ての言語（日本語）で、言語を当てるのは描画の後なので、エディタはもう日本語で作られている。
  裁定の「Web 版の初期図は今のまま」の範囲として残した（data_contract `Document.initial_sources.ts` に書いた）。
  デスクトップは外枠がエディタを作り直し、新しい図も作り直してから始まるので、その時は覚えた言語（推論。配布ビルドで P5 に確かめる）

## P3 結果（2026-10-31）

- **コミット**: フォーク元の直し `ca41741`（下の「開発サーバーで落ちていた」）→ デスクトップ `9fe2930`
- **D4 保存ダイアログの題と About**: `export_diagram` に `dialogTitle`（画面が `desktop.save.dialogTitle` で「{拡張子の大文字} として保存」を訳す）、
  `show_about` に `labels: AboutLabels { title, description, forkedFrom, licenses, mermanPatched, fullText }`（`desktop.about.*`）。
  ライセンスの行（固有名・URL・版）は Rust の `about_text(version, &labels)` が組み立てる（`about_names_every_bundled_license` は日本語と英語の両方の部品で見る）。
  渡されなければ前の日本語（`AboutLabels::default()`・`save_dialog_title`）。訳を足すのは `lib/desktop/tauri.ts` の `exportDiagram`・`showAbout` の 2 か所で、呼び手は変えていない
- **D5 新しい図の題**: `lib/desktop/default-titles.ts`。新規（`use-doc-session.ts` の `create`。新規作成・種類の切り替え・初めての起動の全部が通る）は `createDocument(editor, newDocumentTitle(editor))`、
  インポートは `importSource(source, importTitle())`（時刻は画面が Rust と同じ `HH:MM:SS` で入れる）。
  AI の図は外枠の `Shell` の effect が最初の描画と `i18n.language` が変わるたびに `set_ui_locale({ aiTitle })` を送り、Rust は `state.json` の `aiTitleTemplate` に覚えて `{time}` に時刻を入れる。
  ひな形は `desktop.defaultTitle.ai`（「AI の図 {time}」「AI diagram {time}」）で、i18next の補間（`{{…}}`）はかからない。空白だけのひな形は覚えない（日本語に戻す）・200 字で切る。
  `state.json` は読んで書く（`last_opened` と互いに消さない。鍵 `STATE_LOCK`）。MCP の `open_in_editor` の `title` の説明・LORELEI.md を「GUI の画面の言語の既定の名」に
- **テスト**: Rust 1 件（ひな形で付く・知らされる前は日本語・`last_opened` とひな形が互いに残る・名前を付けた図と新規は使わない・空白は覚えない）と About の 1 件の拡張。
  vitest: `default-titles.test.ts`（時刻の形・言語ごとの題・全部の言語のひな形が素の `{time}` を 1 つ・保存ダイアログの題・About の部品）、外枠（About の部品・`set_ui_locale` を最初と切り替えで送る）、
  一覧（日本語の題を渡す・英語の画面で「Untitled ER diagram」・既にある図の題は変えない）、ツールバー（インポートの題）
- **壊して落ちるか**: 画面側 4 つ（`set_ui_locale` を送らない・インポートの題を固定・保存ダイアログの題を渡さない・新規の題を渡さない）で 6 件、Rust 2 つ（`set_last_opened` がひな形を消す・ひな形を使わない）でそれぞれ落ちた
- **途中で見つけたこと**:
  - **起動の時に `set_ui_locale` と `mcp_status` が同時に `@tauri-apps/api/core` を動的 import し、テストでは 2 本目が本物を掴んで `mcp_status` が落ちた**（MCP の印が出ず、`mcp-settings.test.tsx` の 11 件が落ちた）。
    failures #14 と同じ形で、テストの模擬だけの問題（本物の Tauri では両方とも同じモジュール）。`mcp-settings.test.tsx` も `invoke` を境界で静的に模擬した。`@/lib/desktop/tauri` を模擬して `invoke` を静的に模擬していないテストは 7 つ残る（全部で緑）
  - **開発サーバーで落ちていた**（failures #58）: `tauri dev` の窓が「createContext is not a function」で出ず、利用者が画面の写しで知らせた。server component のページが i18n の入口を読み、入口が react-i18next まで読む。
    spec 31 P1 からで、本番の組み立てでは出ない。ページは `@/components/i18n/document-title` を直に読むようにした（フォーク元の改善のコミット）
- **確かめたこと**:
  - Rust: `src-tauri` 59 件・`cargo test --workspace` が緑。vitest の全部（118 ファイル 1290 件）は上の 11 件と、前から続く重い時だけの時間切れ 1 件（`update-diagram`、単独では通る）。直した後の 2 ファイルは緑。`tsc`・eslint 0 件
  - **`tauri dev`**（ページを直した後）: 開発サーバーの 2 つのページが 200、画面が言語を当てて **`state.json` に `"aiTitleTemplate": "AI の図 {time}"` が書かれた**（画面 → Rust の経路が本物で通った）。
    MCP の HTTP の口で `open_in_editor` を題なしで呼ぶと、作られた図の題は「AI の図 20:12:37」。図の一覧に確かめ用の図「spec 34 P3 の確かめ」が 1 つ残る
  - **まだ見ていないこと**: 英語に切り替えた時の AI の図の題・保存ダイアログの題・About の見た目（rfd のネイティブのダイアログは偽の Tauri の口では描けず、画面を操る許可は下りていない）。P5 の配布ビルドで利用者に頼む

## P2 結果（2026-10-31）

- **コミットの順**: 読み手 `2825824`（`lib/desktop/errors.ts` の `readError`・`errorCode`・`describeError`。新しい形と前の版の頭に印の付いた文字列の両方を読む）→ Rust と偽のバックエンド `43ad84e`。
  読み手を先に入れたので、間の版でも STALE_BASE などの見分けは外れない
- **入れたもの**:
  - `src-tauri/src/error.rs` の `DesktopError { code, params, detail }`。**`Display` は前の版の日本語の文のまま**（`message` は直列化しない）。`From<String>` は `OTHER`
  - `documents.rs`（`Store` の全部）・`lib.rs`（`store()`・取り込み・コマンド）・`desktop.rs`（書き出し・保存ダイアログ）・`mcp_host.rs`（設定ファイル・トークン・待ち受け・ポートの範囲）が返す。
    `OpenRequest.error`・`McpStatus.detail` も `DesktopError`。MCP へ渡す所（`readback`・`EditorPort`・`deliver`）は `to_string()` で前の文に
  - `STALE_BASE` の今の版は `params.currentUpdatedAt`（文の後ろから正規表現で取り出すのをやめた）。`MCP_LISTEN_FAILED` の port・`MCP_PORT_RANGE` の min と max・`UNSUPPORTED_FORMAT` の形式・`INVALID_ID` の id も `params`
  - `lorelei_core`（merman・書き出し）の文は訳さず `detail` に。画面は「題（訳した code）: detail」
  - 書き換え前の控えの失敗（`BACKUP_FAILED` を予定した）は MCP の `update_diagram` にしか出ないので code を持たせなかった（data_contract から外した）
  - 画面: state にはエラーの値を持ち（`saveError`）、描く時に `describeError` で訳す。`String(e)` の 9 か所と `r.error ?? ""` の 2 か所・`McpStatus.detail` の 2 か所を `describeError` に。`desktop` の訳に `error.*` の 22 の code
  - テスト: `error.rs` の 2 件（Display は前の文・直列化の形 / code の fixture `src-tauri/tests/fixtures/desktop_error_codes.json`）、`errors.test.ts`（両方の形の読み・見分け・訳・code の無いもの・全部の code に訳があり余分な訳が無い）。
    Rust のテストは文の頭ではなく `code` で見分ける形に（STALE_BASE は文の後ろの版と `params` の両方を見る）。設定ファイルが壊れた時のトークンの守りは、画面へ渡す形（直列化した全部）でも確かめる
  - 偽のバックエンドは同じ形（`desktopError(code, params?, detail?)`）を返す
- **確かめたこと**:
  - **AI が読む文は前と同じ**: P0 で全文を固定したテスト 2 件（取り込めない種類・Mermaid の誤り・readback の図が無い・開いている図が無い・壊れたファイル（readback と update））が型を変えた後も緑。`src-tauri` の 58 件が緑
  - **壊して落ちるか**: 読み手が新しい形を読めないようにすると、STALE_BASE を見分けるテスト 2 件（`update-diagram`・`revert-confirmed`）が落ちた
  - vitest の全部（117 ファイル 1282 件）で 1 件が時間切れ（`update-diagram` の 1 件、単独では通る。P1 から続く重い時の時間切れ）。`tsc` 0 件、eslint 0 件
  - **実物のアプリでエラーを起こして見るのは、まだしていない**（画面を操る許可が下りていない）。P5 の配布ビルドで利用者に頼む

## P1 結果（2026-10-31）

- **コミット**: フォーク元 `28e6412`（`LanguageMenu` の `buttonProps`・直書きを見つける道具を `__tests__/i18n/hardcoded-text.ts` に切り出した）、デスクトップ `ff5bc20`
- **入れたもの**:
  - 名前空間 `desktop`（`lib/desktop/locales/{ja,en}.json` の 95 キー、`lib/desktop/i18n.ts` の `useDesktopTranslation`・`desktopT`）。`lib/desktop` の 13 ファイルの言葉を移した。
    部品の外（`mcp.ts` の `stateLabel`・`use-doc-session.ts` と `use-desktop-open.ts` の知らせ）は呼ばれた時に `desktopT`。閉じる時の失敗は文ではなく真偽を state に持ち、描く時に訳す。
    Rust の文（`saveError`・`McpStatus.detail`・トーストの `description`）はそのまま出る（P2 で `code` に）
  - インポートの placeholder の例は、フォーク元の例と同じ訳（`importModal.flowExample.*`）でラベルだけ訳す
  - **日本語に留める処理を外した**（`desktop-shell.tsx`）。テスト「窓を出す時には、覚えた言語 (無ければ OS の言語) が当たっている」を先に書き、留める形で `ja` が出る赤を見てから外して緑（`LocaleSync` が外枠より前の兄弟の effect で先に当て、`changeLanguage` は同期）
  - タイトルバーの画面の色のメニューの左に言語のメニュー（`LanguageMenu` に `BAR_BUTTON` の見た目）
  - **ツールバーは入り切らない時だけアイコンだけにする**（`toolbar.tsx` の `useCompact`・`ToolButton`）: 全部のボタンを縮めず（`flexShrink: 0`）、中身の幅が見えている幅より広い時に縮め、縮めた時に要った幅まで窓が広がったら戻す。
    **英語は窓の幅 1100 でも、日本語も 1000 で 7 つのボタンの文字が切れていた**（前からの不具合。窓の最小幅は 900）
  - テスト: 窓を出す時の言語・`lib/desktop` の直書き 0・`desktop` の日本語と英語のキーと差し込みの一致（`__tests__/lib/desktop/hardcoded-text.test.ts`）・ツールバーの幅（`toolbar-compact.test.tsx`、幅を模擬）。eslint の `i18next/no-literal-string` を `lib/desktop/**/*.tsx` にも。
    例外はアプリの名 `Lorelei`・未確定の印 `●`（理由を書いた `eslint-disable-next-line`）
- **確かめたこと**:
  - `tsc` 0 件、eslint 0 件。vitest は全部（116 ファイル 1276 件）を 3 回: 1 回目（ツールバーを直す前）は緑で終了コード 0、2・3 回目は 2 件ずつ時間切れ（`direction-save`・`update-diagram`・`revert-confirmed` のうち 2 つ、回すたびに違う）。
    落ちたファイルは単独では前と同じか速い時間で通る（`revert-confirmed` 26.4 秒・`update-diagram` 13.6 秒。spec 31 の時は 27.2・18.4 秒）。spec 31 の時から、重い時に時間切れになる組（この PC は何も回していなくても CPU が 5 割ほど使われている）
  - **`tauri dev` の窓は画面を操る許可が下りず見ていない**。代わりに本番と同じ組み立ての Web 版に spec 27 の台本の偽の Tauri の口を差し込み、裏の Edge（英語のブラウザ）でデスクトップの外枠を描いた:
    英語で始まり（`<html lang>` が `en`、「About Lorelei」「Confirm」）、言語のメニューで日本語に替わり（「Lorelei について」「確定」「図の一覧」）、設定画面も英語で出た
  - ツールバー: 日本語と英語の幅 900・1100・1280・1600 で、文字が切れるボタン 0。同じページで幅を 1600 → 900 → 1300 → 1600 → 1000 → 1600 と変えると縮めた形と元の形を行き来し、言語を切り替えた時も測り直した
  - **日本語の外枠は前（HEAD `7ab709d`）と同じ**: spec 27 の台本の外枠の 6 場面で、画素の違いはどれも 294〜304 でタイトルバーに足した言語のボタンの所だけ。計算されたスタイルの違いはタイトルバーの空きが言語のボタンの分だけ狭まったのと、要素の並びの番号がずれた分（ツールバーの見た目は変わらない）
- **途中で踏んだこと**: `eslint --fix` が JSX の中の `{/* eslint-disable-next-line … */}` を消して `{ }` を残した（failures #57）。要らなくなった抑止のコメントも消して空行を残した

## P0 結果（2026-10-31）

- **キーの型（D1）**: フォーク元に `components/i18n/resources.ts` の `export interface I18nResources { common }` を置き、`i18next.d.ts` は `resources: I18nResources` にした。
  `lib/desktop/i18n.ts` から `declare module "@/components/i18n/resources" { interface I18nResources { desktop: typeof ja } }` で足すと、パスの別名のモジュールでも併合が効き、`desktop` のキーが型で確かめられた
  （無いキーは `@ts-expect-error` が効く = 型で落ちる。足す宣言を外すと `"desktop"` が名前空間として型で拒まれる）。フォーク元のファイルに `lib/desktop` の名は出ない
- **名前空間の準備（D1）**: `addResourceBundle` で足した `desktop` は、`useTranslation("desktop", { i18n })` の最初の描画から `ready: true` で訳が出た。部品の外は `getFixedT(null, "desktop")`（今の言語に付いてくる）
- **言語の切り替えは同期（D2）**: `i18n.changeLanguage("en")` を await せずに呼んだ直後に `i18n.language` も両方の名前空間の訳も英語。窓を出す順は、日本語に留める 1 行を消すだけで足りる見込み（P1 でテストに固定する）
- **macOS・Linux の `navigator.languages`（D2）**: 手元（Windows）では確かめられない。P5 の Actions の版で確かめ、合わなければ D2 の既定（Rust の `sys-locale` を優先）を入れる
- **Rust の画面に出うる文**: `documents.rs` 17・`lib.rs` 4・`desktop.rs` 4（保存ダイアログの題・About を含む）・`mcp_host.rs` 6・`readback.rs` 2（MCP だけ）。コードの一覧は data_contract `DesktopError.codes`
- **MCP の文の固定（D3 の Red 側）**: `src-tauri/src/lib.rs` のテスト 2 件で、AI が読む文を全文で固定した — 取り込めない種類（「この図の種類は GUI エディタで開けません」）・Mermaid の誤り（merman の英語の文）・
  readback の図が無い・開いている図が無い・壊れた図のファイル（readback と update の両方、「図のファイルが壊れています: …」）。今の文で緑。型を変えた後もこのまま緑であることが受け入れ条件 3
- data_contract を凍結: `DesktopError`（code・params・detail と codes の一覧）・`DesktopMessages`・`GuiCommands.open_request.error`・`import_source` の題・`set_ui_locale`・`McpStatus.detail`・`Document.default_titles`・`Document.initial_sources`（言語ごとの集合と fixture）・`DocumentState.ai_title_template`

## 現況（2026-10-31、spec 31 の査読と spec 34 の査読で確かめた。行は `43a1b8c`）

- **今のデスクトップは日本語に留めている**（spec 31 P1 `13f59e1`）: `desktop-shell.tsx:41` が Tauri の時に `i18n.changeLanguage("ja")`。テストは `__tests__/lib/desktop/desktop-shell.test.tsx:52-71`
- **`lib/desktop/` の言葉**: コメントを除いて日本語の行がある 13 ファイル・約 116 行。最多は `settings-dialog.tsx`（約 30 行）。トーストの題・確認の文・`title` の案内のほか、
  `import-dialog.tsx:80` の placeholder（Mermaid の例 `A[開始] --> B{判定}`）・`mcp.ts:51-62` の `stateLabel`（部品の外の関数）・`toolbar.tsx:81` の `?? "追加"`・
  `title-bar.tsx:53,111` と `pane-splitter.tsx:49` の文字列の連結・`desktop-shell.tsx:113-135` の「確定へ戻す」の `title` と確認の文・`:247` の「読み込み中…」・
  閉じる時の確認（自作のタイトルバー `title-bar.tsx:101-104`。OS のダイアログではない）
- **Rust が画面に出す言葉**（`src-tauri/src/`、テスト以外）:
  - `documents.rs` のエラー（「図を読めません」「保存できません」「ごみ箱へ移せません」「確定する中身がありません」（:260）など）。頭に `INITIAL_FIGURE_REJECTED`・`STALE_BASE`・`DOCUMENT_GONE` を付けた文字列を、
    フロントは `String(e).startsWith(…)` で見分ける（`lib/desktop/doc-session.ts:166-179`）。**`STALE_BASE` は後ろに今の `updated_at` を載せ、`staleBaseCurrent` が正規表現で取り出す**（データを文に載せている）
  - `lib.rs` の「図の一覧に足せませんでした」（:121）・「この図の種類は GUI エディタで開けません」・`store()` の「アプリのデータフォルダを決められません」（:128。全部のコマンドが `?` で返す）
  - `desktop.rs` の「未対応の形式です」（:79）・JoinError の文（:46,55）
  - **`mcp_host.rs`**（68・77・93・194・203・215 行）: 設定ファイルを読めない・トークンを保存できない・待ち受けられない・ポートの範囲。`McpStatus.detail` として設定画面とタイトルバーのツールチップに、`set_mcp_port` のエラーは設定画面のトーストに出る
  - **`crates/lorelei_core`** の `render.rs`・`validate.rs`・`editor.rs`・`output.rs`（:14-25 「書き込みに失敗しました」「出力先のフォルダがありません」）の文: GUI の書き出し（`desktop.rs:62,68` → `export-buttons.tsx`）と開けない図の知らせに出る。MCP と同じ口
  - 保存ダイアログの題（`desktop.rs:40` の「{SVG} として保存」）・About（`desktop.rs:88`、「Lorelei について」と説明・ライセンスの一覧。Rust のテスト `about_names_every_bundled_license`（`lib.rs:729`）がライセンスの名と URL を見る）。rfd のネイティブのダイアログ（ボタンは OS の言語）
  - 新しい図の題（`documents.rs:463` の `default_title`: 「無題のフローチャート」「無題の ER 図」「AI の図 HH:MM:SS」「インポート HH:MM:SS」）。作った時に `Document.title` に書かれ、ファイルに残る。
    この既定の題は `crates/lorelei_mcp/src/lib.rs:241`（AI 向けのツールの説明）・`data_contract.yaml`・`LORELEI.md:66` にも書いてある
- **画面がエラーを受ける形は 2 つ**:
  - `Err`（コマンドの失敗）: `String(e)` で出す所が `use-doc-session.ts`（195・230・363・388・494・577）・`export-buttons.tsx:46`・`mmd-download.ts:50`・`import-dialog.tsx:62`・`settings-dialog.tsx:61`
  - **`Ok` の中身の文字列**: `OpenRequest.error`（`lib.rs:32`。`take_pending_open`・`convert_source` で届く）を `use-desktop-open.ts:134`・`use-doc-session.ts:264` が `r.error ?? ""` で出す。`McpStatus.detail`（`Ok` と event で届く）
  - Tauri は `Err` が object なら object のまま JS へ渡すので、型を変えると `String(e)` は `[object Object]`、React の子に置く所は「Objects are not valid as a React child」で落ちる
- **エラーの経路は MCP と共有**: `incoming()`・`request_from_source()`（`lib.rs:106-125, 400-413`）は GUI と MCP の `deliver`（:283-297）が使い、`request.error` は AI への `reason` になる。
  Store のエラーは `readback::list`・`read` と `UpdateError::Other`（`documents.rs:325,338,343`）を通って MCP にも出る。**今のテストは文の頭（`starts_with`）しか見ていない**（`readback.rs:153,163`、`documents.rs:534`）
- **エラーを訳した文字列のまま state に残す所**: `use-doc-session.ts:195` の `setSaveError(String(e))`（→ `desktop-shell.tsx:148-152` の警告）・`desktop-shell.tsx:93` の `closeError`・`McpStatus.detail`（→ `title-bar.tsx:111`・`settings-dialog.tsx:103`）
- **偽のバックエンド**（`__tests__/lib/desktop/fake-backend.ts:124,126,141,163`）は文字列を throw し `error: "fake"` を返す。Rust の形を変えても偽が古い形のままならテストは緑のまま
- **新しい図の題を渡せる口**: `create_document` はすでに `title` を受ける（`lib/desktop/documents.ts:35-36`）が、新規作成の 3 か所（一覧の操作・`switchKind`（`use-doc-session.ts:301`）・初めて起動した時（:571））が通る `create`（:287-293）は渡していない。`import_source`（`lib.rs:200-205`）は受けない
- **ER 図の初期図**: テーブル名「ユーザー」（`er-diagram-editor.tsx:66`）。保険（`documents.rs:286-293`、spec 04 D4-2・spec 08 D1）は `first_fill`（ファイルの source が空）かつ `origin != New` の時だけ、
  AI・インポートの図を Rust の `initial_source`（:455-459）で潰す書き込みを断る。**TS と Rust の初期図を結ぶテストは無い**: vitest（`doc-session.test.ts:250-253`）は生成器の出力を TS に写した文字列と比べるだけで、
  Rust は自前の定数。片側だけ変えると、テストは緑のまま保険が黙って外れる。フローチャートの初期図はすでに英語（`Start`）
- **窓を出す所**: `desktop-shell.tsx:55-58` の `Shell` の effect（`windowAction("show")`、:57）。`LocaleSync` は `AppProviders` の中で外枠より前の兄弟（`app-providers.tsx:21`）なので、その effect が先に走る。
  ほかに Rust が 3 秒で必ず出す `SHOW_WINDOW_FALLBACK`（`lib.rs:314`）と、起動の途中に AI の図が届くと出す `bring_to_front`（:304）がある
- **macOS・Linux**: `src-tauri/` に `Info.plist` は無く、`tauri.conf.json` に macOS の plist の指定も無い。配布は Windows・macOS・Linux（`.github/workflows/build.yml:40`）
- **窓の最小幅は 900**（`tauri.conf.json`）。英語は「確定」「確定へ戻す」などが長くなる
- **言語を切り替えると、パネルが外枠に操作を登録し直す**: `useDesktopActions` の effect は `label`（`t("flowPanel.addNode")`）に依る（`desktop-actions.tsx:95-112`）。`register(null)` → `register(new)` が走り、外枠は `editorMounted` を呼ぶ（`desktop-shell.tsx:84-90`。`awaitMountRef` で弾かれる見込み）

## 決めること

### D1. デスクトップの訳のファイルと型

- **推奨**: `lib/desktop/locales/{lng}.json`（名前空間 `desktop`）を `lib/desktop/i18n.ts` で `addResourceBundle` し、同じファイルに `useDesktopTranslation`（`desktop` に結んだ包み）を置く。訳を使う `lib/desktop` の全部のファイルがそこを読む（部品だけを描くテストでも訳がある）
- **キーの型**: フォーク元の `components/i18n/i18next.d.ts` に `export interface I18nResources { common: typeof ja }` を置いて `resources: I18nResources` とし、`lib/desktop` が `declare module` で `I18nResources` に `desktop` を足す
  （interface の併合で足す。フォーク元に `lib/desktop` の名が出ず、`desktop` のキーも型で確かめられる）。パスの別名のモジュールを拡張できるかは P0 の `tsc` で確かめ、できなければ `lib/desktop` が自前の型付きの `t` を包む
- **テスト**: `desktop` の名前空間も日本語と英語のキーの組・差し込みの一致を見る。直書きのテストは走査の関数を export し（フォーク元の改善）、`__tests__/lib/desktop/hardcoded-text.test.ts` で `lib/desktop` を見る。eslint の `i18next/no-literal-string` の範囲にも `lib/desktop/**/*.tsx` を足す
- 言語を足す時は、フォーク元の訳・デスクトップの訳・言語の一覧の 3 か所（spec 31 の Goal の「1 つ」から増える）
- react-i18next が同梱の資源の名前空間を準備済みと見るかは P0 で確かめる

### D2. 切り替えの置き場所と窓

- **推奨**: タイトルバーの画面の色のメニュー（`color-mode-menu.tsx`）の隣に言語のメニュー。`LanguageMenu` に `buttonProps` を足し（フォーク元の改善）、`ColorModeMenu` と同じ見た目で使う
- **窓を出す順**: 新しい門は作らず、`desktop-shell.tsx:41`（日本語に留める）を消すだけにする。`LocaleSync` の effect が先に言語を当て、`Shell` の最初の描画はその言語で描かれ、その後の effect で show する見込み。
  前提は `i18n.changeLanguage` が同期で終わること（資源を同梱・`initAsync: false`）。P0 で確かめ、「show が呼ばれた時の `i18n.language` が当てた言語」を Red→Green のテストで固定する（`desktop-shell.test.tsx:52-71` を置き換える）
- **OS の言語**: P0 で macOS の WKWebView と Linux の WebKitGTK の `navigator.languages` を調べる（Actions の版で）。合わない時の既定は **Rust の `sys-locale` で OS の言語を取り、`LocaleSync` より優先して当てる**（`CFBundleLocalizations` を足す案も並べる）。
  外すと、覚えた言語が無い利用者の言語が更新の後に変わりうる（今は全員日本語）

### D3. Rust のエラー

- **推奨**: Rust に `{ code, params?, detail? }` を持つエラーの型を作る。`code` は見分ける名、`params` は訳と見分けに使う値（`STALE_BASE` の `current_updated_at`・ポートの範囲など）、`detail` は訳さない詳しい文（io・merman の文）。
  **`Display` は今の日本語の文のまま**で、MCP とログはこれを使う（AI 向けは訳さない）
- **直列化するのは Tauri の境界だけ**: コマンドの `Err`・`OpenRequest.error`・`McpStatus.detail`。`deliver`（MCP）は `Display` で文字列にする
- フロントは `describeError(e)` 1 か所で受けて訳す（object も今の文字列も読む。`code` の無い文字列 — Tauri の引数の逆直列化の失敗など — は題だけ訳し、文はそのまま）。`isStaleBase` などは `code` で見分け、`staleBaseCurrent` は `params` から取る
- **state にはエラーの値（`code` と `params`）を持ち、描く時に訳す**（`saveError`・`closeError`・`McpStatus`）。もう出たトーストは出た時の言語のまま（受け入れ条件の例外）
- 対象: `documents.rs`・`lib.rs`（`store()` を含む）・`desktop.rs`・`mcp_host.rs`。`lorelei_core`（`render`・`validate`・`editor`・`output`）の文は**訳さない例外**（MCP と共有。構文エラーは merman の英語が混ざる）で、`detail` に入れ、画面では題だけ訳す。`From<String>` は `code: "other"`
- コードの一覧は data_contract に置き、Rust が fixture に全部のコードを書き、vitest が全部のコードに訳があることを確かめる（`er_names.json` と同じ流儀）
- **型を変える前に**、MCP の `reason` と readback のエラーの全文を固定するテストを足す（受け入れ条件 3 の Red 側）
- 偽のバックエンドは、Rust が書く fixture の形でエラーを返すようにする（同じコミットで）

### D4. 保存ダイアログの題と About

- **推奨**: 保存ダイアログの題は、フロントが拡張子を補間して訳した文を Rust に渡す。**About は訳す部品だけを渡し**（題・説明の 1 行・「ライセンス」・「全文は…」・「(merman-core は修正版を同梱)」）、ライセンスの行（固有名・URL）の組み立ては Rust に残す（`about_names_every_bundled_license` を空振りさせない）

### D5. 新しい図の題

- **推奨**: 人が作る図は**フロントが訳した題を渡す**（`create` の中で訳して `createDocument` に、`import_source` に `title` を足す）。AI が題を付けずに届けた図だけ Rust が付けるので、
  フロントが**最初に言語を当てた時と切り替えた時の両方**に、題のひな形（例 `AI diagram {time}`）を Rust に知らせる（`set_ui_locale`）。
  ひな形は i18next の補間をかけずに素の `{time}` で持ち、時刻の書式は Rust の `%H:%M:%S` に固定する
- **覚える所**: 案 A（推奨）は今の `state.json`（`last_opened`、`documents.rs:365-378`）に足す。案 B は新しい `ui_locale.json`。覚えるのは、起動してから画面が知らせるまでの間に届く AI の図のため（MCP は画面より先に待ち受ける）。
  一度も知らされていなければ今の日本語のひな形。Rust に言語の表は持たない
- 既にある図の題は変えない（利用者の持ち物）。既定の題を書いた文書（MCP のツールの説明・data_contract・LORELEI.md）は「GUI の言語の既定の名（日本語なら…）」に直す

### D6. ER 図の初期図

- **前提として先に入れる**: TS と Rust の初期図を結ぶ fixture（vitest が `LORELEI_UPDATE_FIXTURES=1` で `crates/lorelei_core/tests/fixtures/initial_sources.json` を書き、Rust のテストが `initial_source()` と比べる。`er_names.json` と同じ流儀）。どちらの案でも要る
- **推奨: 案 B — 初期図も言語ごとに訳し、Rust は全部の言語の初期図の集合と比べる**（spec 31 D8 の「新しい要素の名は作った時の言語」と揃う）。
  vitest が `LOCALES` の分を fixture に書き、Rust は fixture と同じ集合を持つ（`initial_sources(editor) -> &[&str]`）。日本語の画面と Web 版の初期図は今のまま（「ユーザー」）、英語は `User`。言語を足す時は fixture を書き直す（1 つのコマンド）
- 案 A — 初期図を `User` に固定する: 日本語の画面と Web 版の初期図が変わる。Rust の比べる相手は 1 つのまま
- 副作用（両案）: `erDiagram User {…}` は AI が実際に送りうる 1 テーブルの図で、`first_fill` の時に誤って断る確率が上がる（推測、低い）
- **コミット**: TS・Rust・fixture・data_contract（`Document.initial_sources`）・テスト（`doc-session.test.ts`・`er-diagram-editor-delete.test.tsx`・`er-diagram-editor-direction.test.tsx`・`editor-undo.test.tsx`）を 1 つのコミットで変える
  （片側だけ変えると赤になるか、緑のまま保険が外れる）。保険のための変更で上流へ返す価値は薄いので、フォーク元の改善の一覧には入れない

### D7. 言語の順

- **推奨**: spec 31 と同じく日本語と英語。中国語・韓国語は spec 35

## 受け入れ条件（rev1）

1. デスクトップで日本語と英語に切り替えられ、開き直さずに外枠・設定画面・ダイアログ・Rust のエラー（D3 の例外を除く）・保存ダイアログの題・About・タイトルバーのツールチップが変わる。開き直しても残る。
   例外: もう出ているトースト（出た時の言語のまま）・`lorelei_core` の詳しい文・rfd のボタン（OS の言語）
2. 窓が組み立ての言語のまま見えない（例外: Rust の 3 秒の保険と `bring_to_front` で外枠が描ける前に出た時）。show の時に当てた言語になっていることをテストで
3. MCP の返事（AI が読むエラーの文と readback のエラー）は前と同じ（型を変える前に全文を固定したテストが緑のまま）
4. 全部のエラーのコードに訳がある（Rust の fixture と vitest）。`[object Object]` も「Objects are not valid as a React child」も出ない（`Err`・`OpenRequest.error`・`McpStatus.detail` の全部の呼び手）
5. 新しい図の題が選んだ言語で付く（新規・インポート・AI。起動してから画面が知らせるまでの間に届いた AI の図は、前に覚えたひな形）。既にある図の題は変わらない
6. 初期図の保険が前と同じに効く（TS と Rust を fixture で結んだテスト、全部の言語の初期図で）
7. `lib/desktop` の直書きが、認めた例外を除いて 0（`__tests__/lib/desktop/hardcoded-text.test.ts` と eslint）。`desktop` の名前空間も日本語と英語のキーの組が一致
8. 英語で、窓の幅 900 でもタイトルバーとツールバーがはみ出さない
9. 言語を切り替えても、●・保存・Undo の履歴が動かない
10. 覚えた言語が無い時、OS の言語どおりに始まる（Windows・macOS・Linux。macOS・Linux は Actions の版で）
11. 配布ビルドで利用者が確かめる

## Phase

- **P0**: 型の置き方（D1）・同梱の名前空間の準備・`changeLanguage` が同期か（D2）・macOS と Linux の `navigator.languages`（D2）・エラーのコードの一覧。
  data_contract を凍結（エラーの型とコード・`OpenRequest`・`McpStatus`・`set_ui_locale` と覚える所・`Document.initial_sources`）。MCP の返事の全文を固定するテスト（D3 の Red 側）
- **P1**: `lib/desktop` の言葉（訳のファイル・`useDesktopTranslation`・直書きのテスト）・タイトルバーの言語のメニュー・窓を出す順（日本語に留めるのを外す）。Rust は触らず、Rust の文はそのまま出る → `tauri dev`
- **P2**: エラーのコード（D3）。**読み手を先に**（`describeError`・`isXxx` が object も文字列も読む）入れ、続けて Rust の形と偽のバックエンドと fixture を一続きで変える（間の main で STALE_BASE などの見分けが外れないように）
- **P3**: 保存ダイアログの題と About（D4）・新しい図の題（D5）
- **P4**: ER 図の初期図（D6、1 つのコミット）
- **P5**: 配布ビルドで利用者が確かめる（macOS・Linux の言語の判定は Actions の版で）

## スコープ外

- 中国語・韓国語の訳 → [spec 35](35_zh-ko-translations.md)
- MCP のツールの説明・AI への返事の訳
- `lorelei_core` の書き出し・検査の文の訳（D3 の推奨では例外）
- OS の窓の題（`tauri.conf.json` の `Lorelei`、固有名）

## 査読の採否（rev1、2026-10-31）

査読 1 本（こちらから依頼、spec とコードの場所だけを渡した）。根拠の行（日本語に留める :41 と show の :57・TS と Rust の初期図を結ぶ fixture が無いこと・`OpenRequest.error` が `Ok` の中身の文字列であることと 2 つの呼び手・`LocaleSync` が外枠より前の兄弟・3 秒の保険と `bring_to_front`・`about_names_every_bundled_license`）はコードで確かめてから採った。

| # | 指摘 | 採否 |
| - | ---- | ---- |
| 1 | 窓を出す所の行番号 | **採る** — 現況 |
| 2 | TS と Rust の初期図を結ぶテストが無い（要修正） | **採る** — 現況・D6 の前提・受け入れ条件 6 |
| 3 | `OpenRequest.error` が D3 から漏れる（要修正） | **採る** — 現況・D3（Tauri の境界）・受け入れ条件 4 |
| 4 | Rust の取りこぼし（`store()`・`desktop.rs`・`output.rs` ほか） | **採る** — 現況・D3 |
| 5 | エラーを文字列のまま state に残す | **採る** — D3・受け入れ条件 1 の例外 |
| 6 | `lib/desktop` の直書きの取りこぼし | **採る** — 現況（placeholder の扱いは P0 の例外の一覧で） |
| 7 | 閉じる時の確認は自作のタイトルバー | **採る** — 現況 |
| 8 | 留めるテストの置き換え・偽のバックエンド | **採る** — D2・D3 |
| 9 | キーの型の第 3 案（interface の併合） | **採る** — D1 の推奨 |
| 10 | `addResourceBundle` の時機・キーの一致のテスト | **採る** — D1 |
| 11 | 直書きのテストの範囲の広げ方 | **採る** — D1・受け入れ条件 7 |
| 12 | 窓を出す順は留める処理を消すだけで足りる見込み | **採る** — D2（P0 で同期を確かめる） |
| 13 | 受け入れ条件 2 の例外 | **採る** — 受け入れ条件 2 |
| 14 | macOS・Linux の言語の判定と既定 | **採る** — D2・受け入れ条件 10 |
| 15 | 言語のメニューの `buttonProps`・幅 900 | **採る** — D2・受け入れ条件 8 |
| 16 | 切り替えで操作を登録し直す | **採る** — 現況・受け入れ条件 9 |
| 17 | P1 と P2 の間で main が壊れる（要修正） | **採る** — Phase（読み手を先に、一続きで） |
| 18 | `STALE_BASE` は文にデータを載せている | **採る** — D3（`params`） |
| 19 | MCP の文を型を変える前に固定する | **採る** — D3・受け入れ条件 3・P0 |
| 20 | `code` の無いエラー | **採る** — D3 |
| 21 | `McpStatus.detail` の形 | **採る** — D3・P0 の凍結 |
| 22 | About は訳す部品だけを渡す | **採る** — D4 |
| 23 | `set_ui_locale` は最初に当てた時も送る | **採る** — D5 |
| 24 | ひな形を `state.json` に置く案 | **採る** — D5（案 A に推す） |
| 25 | 補間の記号の衝突 | **採る** — D5 |
| 26 | 既定の題を書いた文書が古くなる | **採る** — D5 |
| 27 | 新規の経路は `create` で足りる | 問題なし（D5 に反映） |
| 28 | 初期図の fixture（要修正） | **採る** — 2 と同じ |
| 29 | D6 のコミットの順の矛盾（要修正） | **採る** — D6（1 つのコミット）・Phase P4 |
| 30 | 既存の図と前の形 | 問題なし |
| 31 | 初期図を言語ごとにして集合と比べる案 | **採る** — D6 の推奨を案 B に改めた（日本語の画面と Web 版を変えず、spec 31 D8 と揃う） |
| 32 | Phase の組み直し | **採る** — Phase |
| 33 | 受け入れ条件の抜け | **採る** — 受け入れ条件 1・4・8〜10 |
| 34 | D7 | 問題なし |
