# CLAUDE — Lorelei

Mermaid の図を **AI が MCP 経由で生成・検査・書き出し**し、人が GUI で手直しするデスクトップアプリ。
[illionillion/mermaid-editor](https://github.com/illionillion/mermaid-editor)（MIT）のフォークに
Rust + Tauri 2 の殻を被せる。

## 北極星

**「AI が書いた Mermaid を、そのまま使える図にする」。** 図の素材（DB のスキーマ・コード）を読むのは
AI 側であり、Lorelei は受け取った Mermaid の**検査・描画・書き出し・GUI での手直し**だけを受け持つ。
Lorelei は DB にもリポジトリにも繋がない（秘密を置く欄を構造上持たない）。

## アーキテクチャ（spec 01 → spec 03 で MCP を GUI の中の HTTP へ移した）

```text
Claude Code 等 ──HTTP(MCP, 127.0.0.1:39642/mcp, Bearer)──▶ 動いている GUI（Tauri、single-instance）
                                                          ├─ lorelei_mcp（待ち受け・ツール 6 本）─ lorelei_core（検査・描画・書き出し。純 Rust）
                                                          └─ open_in_editor ─ EditorPort ─▶ 図の一覧に 1 件 ─▶ フォーク元の React エディタ（lib/desktop が受け口）
```

- **`crates/lorelei_core`**: merman で Mermaid → SVG。PNG / PDF への変換は自前（usvg + resvg / krilla-svg に
  **同梱フォント**を渡す — merman-export はフォント DB を差し替えられず、日本語が太字へ落ちるため）
- **`crates/lorelei_mcp`**: MCP サーバー（rmcp 2.2 の Streamable HTTP + axum）のライブラリ。ツールは 6 本（検査・描画の 3 本、spec 04 の読み戻しの `list_diagrams` / `read_diagram`、spec 08 の書き換えの `update_diagram`）。
  `start_http` で `127.0.0.1` だけに待ち受け、トークン・Host・Origin を検査する。GUI の図の一覧へは `EditorPort`（開く・一覧・読む・書き換える）でつなぐ（Tauri に依存しない）。
  **GUI を閉じていると MCP は使えない**（stdio の `lorelei --mcp` は spec 03 P3 で撤去）
- **`src-tauri/`**: GUI。workspace の外に置く（AppPromoVideo / Kataribe と同じ流儀）。起動時に MCP を待ち受ける（既定で ON、
  設定は `{app_data_dir}/mcp_server.json`、設定画面から切り替え）。保存ダイアログと About は rfd（JS に権限を足さない）。
  CSP は style-src の自動ハッシュ追記を止めている
- **`lib/desktop/`**: フロント側の Tauri 依存はここだけ（Web 版では何もしない）。フォーク元への差し込みは spec 01 の 4 ファイル・8 行 + spec 02 の 5 ファイル・12 行（`app/layout.tsx` の外枠、エディタ 2 つの高さ、パネル 2 つの `useDesktopActions`。重なりを除いて計 7 ファイル）+ spec 04 P0 でエディタ 2 つの初期図を export（`initialFlowNodes` / `initialERNodes`。初期図の突き合わせ用。ファイルは既存の 7 つに含まれる）+ spec 07 P2 でパネル 2 つの `useDesktopActions` に向き（`direction` / `setDirection`）を足した（同じ 2 ファイル）+ spec 15 P3 でフローチャートのパネルの `useDesktopActions` に `addFrame` を足した（同じファイル）
  + spec 24 P2 でパネル 2 つの `useDesktopActions` に `theme` を足した（同じ 2 ファイル）+ spec 32 P2 でエディタ 2 つの `handleImportMermaid` に省略できる `adjust` を足し（フォーク元の改善）、パネル 2 つの `useDesktopActions` に `importMermaid` を足した（同じ 2 ファイル）+ spec 30 P2 でパネル 2 つの `useDesktopActions` に `history` を足した（同じ 2 ファイル。エディタ側の履歴の口 `HistoryGateContext` は `lib/desktop` を参照しないフォーク元の改善で、外枠が Provider で包む）+ spec 25 P1 でコード生成のダイアログ 2 つ（`download-modal.tsx`・`er-diagram-mermaid-modal.tsx`。spec 01 から `ExportButtons` を差し込んである）の「ダウンロード」を `useMmdDownload` に通した（各 2 行 + import）
- **フロント（`app/` `features/` `components/`）**: フォーク元のコード。直してよい（下の掟の「フォーク元は必要なら直してよい」）。
  **フォーク元の改善**（上流へ返せる。`lib/desktop/` と台帳を含まないコミット）は spec 06（削除の確認・ER 図のテーブル削除）と spec 07（FK・図の向き）の「P1 結果」「P2 結果」、spec 09（コード生成のプレビュー）の「P1 結果」、spec 10（CodeMirror のエディタ）の「P1〜P3 結果」、spec 11（mermaid.js での取り込み）の「P1〜P3 結果」、spec 12（古いパーサーの撤去）の「P1・P2 結果」、spec 13（ER 図の名前）の「P1 結果」「P2 結果」「P4 結果」、spec 15（フローチャートのサブグラフ）の「P1 結果」「P3 結果」、spec 16（枠を指す線・枠の中の向き）の「P1 結果」〜「P3 結果」「P5 結果」、spec 23（線のラベル）の「P1 結果」、spec 24（テーマ）の「P1 結果」、spec 26（ミニマップの出し入れ）の「P2 結果」、spec 27（画面のダークテーマの色の名）の「P1 結果」、spec 28（選んだノードの印）の「P1 結果」、spec 31（画面の言語）の「P1 結果」、spec 34（server component のページが i18n の入口を読んで開発サーバーで落ちた直し `ca41741`）の「P3 結果」に一覧がある。PR を出すかは利用者が決める。
  **フォーク元へ出した PR**: [illionillion/mermaid-editor#74](https://github.com/illionillion/mermaid-editor/pull/74)（spec 13 の生成器の直しだけを移植。Lorelei のコミットはデスクトップの差し込みの上で作ったので cherry-pick では載らない — spec 13「フォーク元への PR」）。
  **デスクトップではフォーク元のパネル（インポートを含む）を隠し、ツールバーから `lib/desktop/` のダイアログを開く** — フォーク元の部品を直したら、デスクトップのどの操作がどの部品を開くかを確かめる（failures #17）

## 掟（Mandate）

- **フォーク元は必要なら直してよい**（2026-09-25 利用者裁定で改訂。旧: デザイン調整と接続修正だけ）:
  フォーク元は 11 か月更新が止まっていて（2026-09 時点の利用者の言）、中途半端な所も多い。新しくできるものは取り入れる。ただし
  - **Web 版（GitHub Pages）はなるべく壊さない**。Tauri 専用の UI は実行時に出し分ける（`lib/desktop/`）。壊す必要がある時は理由を spec に書く
  - **上流へ返せる修正**（バグ修正・デスクトップに依らない改善）は、デスクトップ専用の変更とコミットを分け、PR で返せる形にしておく
    （フォークした側の礼儀。返すかどうかは利用者が決める）
  - デスクトップ専用の新しいコードは、これまでどおり `crates/` `src-tauri/` `lib/desktop/` に置く
- **データ・ファースト**: コードの前に [data_contract.yaml](data_contract.yaml) の名詞を凍結する
- **PoC 必須**: バグ修正・新機能は Red→Green をテストで実証してから完了
- **リサーチ先行**: 実装前に三点測量（コード grep / 仕様・ライブラリのソース / 記憶）
- **撤去・改名したら grep**: 機構・enum 値・フィールドを変えたら、その名前で全台帳を grep して
  追従漏れを回収するまで完了にしない。機能の着地時は「どの台帳へ書いたか」を数える
- **GUI は実行して生成物を見るまで完了にしない**（テスト緑 ≠ 実機で動く）

## どこに何が書いてあるか

| 知りたいこと                                                               | 読む場所                                                                                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 使う人向けの入口（英語・日本語）                                           | [README.md](README.md)（英語）/ [README.ja.md](README.ja.md)（日本語）。ライブデモ（Web 版）は https://betyourluck.github.io/lorelei-web/ |
| 不具合の報告・PR の出し方（英語・日本語）                                  | [CONTRIBUTING.md](CONTRIBUTING.md)、`.github/ISSUE_TEMPLATE/`                                                                             |
| 使う人向けの説明の全部（ビルド・Claude Code への登録・ツール・既知の制約） | [LORELEI.md](LORELEI.md)                                                                                                                  |
| 名詞・型・MCP ツールの入出力                                               | [data_contract.yaml](data_contract.yaml)                                                                                                  |
| 決定事項と Phase 計画                                                      | `specs/NN_*.md`（起票 → 査読 → rev 改訂 → Phase 単位で main へ直接コミット）                                                              |
| 踏んだ罠（症状 → 真因 → 処方 → 一般化）                                    | [failures.md](failures.md)                                                                                                                |
| 上流 crate に当てている修正（merman-core）                                 | [vendor/merman-core/LORELEI_PATCH.md](vendor/merman-core/LORELEI_PATCH.md)                                                                |
| フォーク元の開発手順・テスト・VRT                                          | [DEVELOPMENT.md](DEVELOPMENT.md) / [TESTING.md](TESTING.md)                                                                               |

## 現状

- 2026-10-31: [spec 34](specs/34_desktop-ui-language.md) **Done**（P5: 配布ビルド `4343892` で利用者が英語の画面・題・初期図 `User`・保存ダイアログと About・AI の図の題・エラーの文・日本語へ戻すを確かめ「問題なし」）。
  **受け入れ条件 10 の macOS・Linux の言語の判定は未確認**（次のタグの Actions の版で。合わなければ Rust の `sys-locale` を優先）。
  同じビルドで [spec 29](specs/29_node-shape-icon.md) の札を**左上の変数名の青い札の左へ移した**直し（フォーク元 `5b9e6f9`。利用者の言「右上につけるとちょっと浮いてしまう」。札は青い札と同じ高さ 17px・幅 21px、青い札は 23px 右へずれ右端は前と同じ）も「問題なし」。
  残りは spec 31 P3（ライブデモ）・spec 35 の裁定・push・README の「エディタの操作」（形の札・Undo/Redo・言語）
- 2026-10-31: [spec 34](specs/34_desktop-ui-language.md) **P4 着地**（`7084939`、TS・Rust・fixture を 1 つのコミット）: ER 図の初期図のテーブルの名を言語ごとに（`initialERNodes(lng?)`、日本語「ユーザー」・英語「User」）、
  Rust の保険は `initial_sources(editor)` の全部の言語の初期図と比べる。**TS と Rust の初期図は fixture `src-tauri/tests/fixtures/initial_sources.json` で結んだ**（`doc-session.test.ts` が `LORELEI_UPDATE_FIXTURES=1` で書き、Rust のテストが比べる。片側だけ変えるとそれぞれ 2 件落ちる）。
  Web 版を英語で直に開くと、最初の描画が日本語なので初期図は「ユーザー」のまま（裁定の範囲、data_contract に書いた）。残りは P5（配布ビルドで利用者が確かめる。macOS・Linux の言語の判定は Actions の版で）
- 2026-10-31: [spec 34](specs/34_desktop-ui-language.md) **P3 着地**（フォーク元 `ca41741`・デスクトップ `9fe2930`）: 保存ダイアログの題（`export_diagram` の `dialogTitle`）と About の訳す部品（`show_about` の `labels`、ライセンスの行は Rust が組み立てる）を画面が訳して渡す。
  新規・インポートの図の題は画面が言語で付けて渡し、AI が題を付けずに届けた図は画面が `set_ui_locale` で知らせたひな形（`state.json` の `aiTitleTemplate`、素の `{time}`）で Rust が付ける（`lib/desktop/default-titles.ts`）。
  `tauri dev` で state.json にひな形が書かれ、MCP で題なしの図が「AI の図 HH:MM:SS」になるのを見た（英語の題・ネイティブのダイアログは P5 で）。
  **`tauri dev` が「createContext is not a function」で出なかった**: server component のページが i18n の入口から読み、開発サーバーだけ react-i18next を RSC で評価して落ちる（spec 31 P1 から。本番の組み立てでは出ない, failures #58）。
  起動の時に 2 つの invoke が同時に動的 import すると、テストでは 2 本目が本物の `@tauri-apps/api/core` を掴む（failures #14 の形。`mcp-settings.test.tsx` も `invoke` を静的に模擬した）。次は P4（ER 図の初期図）
- 2026-10-31: [spec 34](specs/34_desktop-ui-language.md) **P2 着地**（読み手 `2825824` → Rust と偽のバックエンド `43ad84e`）: Rust のエラーは `src-tauri/src/error.rs` の `DesktopError { code, params, detail }` で画面へ（`Display` は前の日本語の文のまま、MCP はそれを使う）。
  画面は `lib/desktop/errors.ts` の `describeError`（新しい形と前の文字列の両方を読む）で訳し、state にはエラーの値を持つ。全部の code は `src-tauri/tests/fixtures/desktop_error_codes.json`（Rust のテストが書き、vitest が訳を確かめる）。
  AI が読む文を固定したテスト（P0）は緑のまま。実物のアプリでエラーを起こして見るのは P5 の配布ビルドで。次は P3（保存ダイアログの題と About・新しい図の題）
- 2026-10-31: [spec 34](specs/34_desktop-ui-language.md) **裁定（推奨どおり）・P0・P1 着地**。P0: キーの型は `components/i18n/resources.ts` の `I18nResources` を `lib/desktop` から `declare module` で広げる（パスの別名でも併合が効く）・
  `changeLanguage` は同期・MCP に流れる文を全文で固定するテスト（`src-tauri/src/lib.rs`）・data_contract に `DesktopError`・`DesktopMessages` ほか。
  P1（フォーク元 `28e6412`・デスクトップ `ff5bc20`）: 名前空間 `desktop`（`lib/desktop/locales/`、`useDesktopTranslation`・`desktopT`）、タイトルバーに言語のメニュー、**日本語に留める処理を外した**（窓を出す時には覚えた言語になっている、テストで固定）、
  **ツールバーは入り切らない時だけアイコンだけに**（英語は幅 1100 でも、日本語も 1000 で文字が切れていた）。`tauri dev` の窓は画面を操る許可が下りず、偽の Tauri の口で外枠を裏の Edge に描いて確かめた。
  vitest の全部は重い時に 2 件ずつ時間切れになる回がある（単独では前と同じ速さ）。`eslint --fix` が JSX の抑止のコメントを消して `{ }` を残す（failures #57）。次は P2（エラーのコード）
- 2026-10-31: [spec 34](specs/34_desktop-ui-language.md) **rev1**（査読 1 本・34 点を採った）。要の改め: Rust のエラーは `{code, params?, detail?}` で `Display` は今の文のまま（MCP は変えない）、直列化は Tauri の境界（`Err`・`OpenRequest.error`・`McpStatus.detail`）だけ、
  Phase は読み手（`describeError`）を先に入れて Rust と偽のバックエンドを一続きで変える（間の main で STALE_BASE の見分けが外れないように）。**TS と Rust の初期図を結ぶテストが無い**（片側だけ変えると緑のまま保険が外れる）ので fixture を先に、
  ER 図の初期図は言語ごとに訳して Rust は全部の言語の集合と比べる案に推奨を改めた（日本語の画面と Web 版は今のまま）。窓を出す順は日本語に留める 1 行を消すだけで足りる見込み。D1〜D7 の裁定待ち
- 2026-10-31: [spec 31](specs/31_ui-language.md) **P2 着地**（フォーク元 `68ff699`）: 2 つのパネルの見出しに画面の言語のメニュー（`LanguageMenu`、Web 版）。利用者の裁定で、日本語の画面で前から英語だった所（`Zoom In`・`Delete edge`・`Copied!` など）を日本語にした。
  英語の画面は 15 場面を撮ってはみ出し・重なりなし、日本語の画面は P1 から言語のメニューの所だけが変わった（計算されたスタイルの違い 0）。メニューで切り替えると開き直さずに変わり、開き直しても残る。
  **テストの setup は `@/components/i18n/i18n` から読む**（入口から読むと全部のファイルで部品まで読み、setup が 18 倍になった, failures #56）。残りは P3（ライブデモを作り直すか、利用者が決める）。次は spec 34（デスクトップ）か spec 35（中国語・韓国語）
- 2026-10-31: [spec 31](specs/31_ui-language.md) **裁定（推奨どおり）・P0・P1 着地**。P0: 版（`i18next` 26.4.7・`react-i18next` 17.0.21・`eslint-plugin-i18next` 6.1.5）・
  本番の組み立てで水和のエラー 0（わざと描画中に言語を決めると #425・#418 が出ることも確かめた）・言語を覚えるキーは `mermaid-editor.locale.v1`（フォーク元の流儀）。
  P1（フォーク元 `0842ff4`・デスクトップ `13f59e1`）: `components/i18n/` と `locales/{ja,en}/common.json`（268 キー、英語も P1 で入れた）、フォーク元の 47 ファイルの言葉を移した。
  **部品は `useTranslation` を `@/components/i18n` から読み、部品の外の関数は呼ばれた時に `i18n.t`**（読み込み時に訳さない）。テストは日本語で走る（`__tests__/setup.ts`）。
  直書きの日本語は `__tests__/i18n/hardcoded-text.test.ts`、英語は eslint の `i18next/no-literal-string` が止める（例外は行に `i18n-allow` / `eslint-disable-next-line` と理由）。
  日本語の画面は前と同じ（11 場面の計算されたスタイル・5 画面の属性と文字で違い 0）。**デスクトップは spec 34 まで日本語に留める**。
  画面の切り替えのメニューはまだ無い（P2）。日本語の画面で前から英語の所（`Zoom In`・`Delete edge` など）は日本語の訳も英語のまま — P2 で決める
- 2026-10-31: [spec 31](specs/31_ui-language.md) **rev1**（査読 1 本を採った）・[spec 34](specs/34_desktop-ui-language.md)・[spec 35](specs/35_zh-ko-translations.md) **起票**（rev0）。画面の言語を 3 本に分けた:
  31 = 仕組み（i18next 26.4.7・react-i18next 17.0.21 を推す）・フォーク元の言葉・日本語と英語・Web 版の切り替え・テストの基盤 / 34 = デスクトップの言葉・Rust のエラーをコードで返す（MCP の文はそのまま）・新しい図の題・ER 図の初期図を `User` に / 35 = 中国語・韓国語の訳・4 つの言語の見た目・書き出しのフォント。
  査読で、英語の直書き・xyflow と CodeMirror の言葉・新しい要素の既定の名前・server component の `metadata`・水和（組み立ての言語は日本語を推す）・既存のテストは日本語で走らせる、を足した。
  **書き出しの同梱フォント（Noto Sans JP）にハングルが 0 字・簡体字の一部が無い**ので、韓国語・中国語のラベルの図は PNG・PDF で字が欠けるはず（未確かめ、spec 35 D4）。31 は D1〜D10 の裁定待ち
- 2026-10-31: [spec 32](specs/32_revert-to-confirmed.md) **Done**・[spec 33](specs/33_normalize-race.md) **Done**（同じ配布ビルド `5ce0d90`）。spec 32 P3: 利用者が確定 → 編集で ● → 確定へ戻す → Ctrl+Z・開くだけでは ● が付かない・前の版で確定した図の移行を確かめた（「問題なし」）。
  spec 33 P2: MCP の HTTP の口を直接叩き、書き換えの直後の揃え書きが `updated_at` を進めない（印が Rust まで届く）・その版で次の書き換えが通る・人がノードを足した後の古い版の書き換えは「図が変わっています」で断られる、を見た
  （書き換えから 1 秒以内に人が編集する間合いは実物では作れず、テストでだけ見た）。図の一覧に確かめ用の図「spec 33 の確かめ」が 3 つ残る。生成器の往復を fixture の全部の図で確かめる（spec 32 P0）はしていない
- 2026-10-31: [spec 32](specs/32_revert-to-confirmed.md) **P1・P2 着地**: 確定は `confirm_document`（`mark_document_saved` を置き換え。自動保存と 1 つの鍵の中で書き `Document.confirmed` を残す）・
  ● は確定した中身との違い（位置は 1e-6 まで許す。MCP の `unsaved` も同じ）・前の版で確定した図は読む時に移行・確定は自動保存の列に並べ、図の準備ができている時だけ（Ctrl+S も）・
  ツールバーの「確定へ戻す」（その場で取り込みと位置を 1 回で当て、Undo の 1 手）。生成器の往復の確かめ（P0）はしていない。残りは P3（配布ビルド、spec 33 P2 と一緒に）
- 2026-10-31: [spec 33](specs/33_normalize-race.md) **P1 着地**（裁定「推奨どおり」。spec 32 も裁定「推奨どおり」で、spec 33 の後に進める）: 揃え書きの不具合を偽のバックエンドで再現（間合いで出たり出なかったりする）→
  Rust の `save` に揃え書きの印（印の無い保存は `normalize_pending` でも中身が違えば `updated_at` を進める）・準備ができてから最初の保存だけを即時に印付きで書く（`Autosaver.saveNow`）・`Autosaver` は保存を 1 つずつ順に送る。
  途中で、**位置を当てる指示の直後に当たる前のノードの変化が 1 回届き、それで準備済み（保存・Undo の起点）になっていた**のを見つけて直した（failures #53、1 秒の待ちに隠れていた）。外枠が消える時に自動保存の待ちを捨てる（#54）。残りは P2（配布ビルド）
- 2026-10-31: [spec 32](specs/32_revert-to-confirmed.md) **rev1**（査読 1 本を採った）・[spec 33](specs/33_normalize-race.md) **起票**（rev0）。spec 32 は「確定へ戻す」と ● を中身で決める（位置は許容誤差）に絞り、
  確定は `confirm_document` で自動保存と 1 つの鍵の中で書く・確定を自動保存の列に並べる・戻すは門を開けたままその場で 1 回で当てる（取り込みに省略できる `adjust`）。「AI の書き換えを 1 手にする」は後の候補へ外した。
  査読で、**AI の書き換えの直後 1 秒の人の編集が揃え書きに混ざり `updated_at` を進めずに書かれ、AI が人の編集を知らずに上書きできる**（spec 08 からある不具合、コードで確かめた。実物の再現は spec 33 P0）を見つけ、spec 33 に分けて先に直す
- 2026-10-31: [spec 29](specs/29_node-shape-icon.md) **Done**・[spec 30](specs/30_undo-redo.md) **Done**（配布ビルド `fa62afc` で利用者が両方を「問題なし」。spec 30 は macOS の ⌘Z が未確認）。
  README・README.ja の「エディタの操作」の節（形の札・Undo/Redo）は次の版を出す時に足す。次は [spec 32](specs/32_revert-to-confirmed.md)（確定へ戻す、rev0 の裁定待ち）か [spec 31](specs/31_ui-language.md)（画面の言語、rev0）
- 2026-10-31: [spec 30](specs/30_undo-redo.md) **P1 着地**（裁定「推奨どおり」→ P0 → P1。フォーク元の改善のコミットに分けた）: `components/editor-history/`（中身の鍵が変わった時に 1 手・ドラッグとダイアログの間は保留・
  `HistoryGateContext` で起点と止め方を受ける）、2 つのパネルに ↶ ↷、Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z、削除の確認の文から「元に戻せません。」を外した。Web 版でドラッグ・矢印キー・枠の大きさ・確認を挟む付け替え・枠の削除・ER 図のセルと FK を確かめた。
  **未解明**: 起点で毎回描き直すと、デスクトップで ER 図を開いた時に自動保存が始まらないことがあった（同じファイルの前のテストの後だけ。spec 30「P1 結果」）。
  **P2 着地**（コードとテスト。`tauri dev` は入れた版の Lorelei が動いていて立てられず未確認）: 外枠が `HistoryGateContext` で包み（図の準備ができた時を起点、隠すたびに捨てる）、ツールバーに ↶ ↷。
  口を渡さない形（P1 だけ）では開いた直後の Ctrl+Z で開いた時に当てた位置が戻って保存されることを、テストで確かめた。残りは P3（配布ビルドで利用者）
- 2026-10-31: [spec 30](specs/30_undo-redo.md) **rev1**（査読 1 本を採った）・[spec 32](specs/32_revert-to-confirmed.md) **起票**（rev0）。spec 30 から「確定へ戻す」を spec 32 へ分けた（Rust の `Document`・● の意味・MCP の契約に及ぶため）。
  spec 30 rev1: 1 手は「中身の鍵」が変わった時（差分）・デスクトップは図の準備ができた時を起点にし、図の id が替わったら・AI の載せ替えで履歴を捨てる・準備の途中とモーダルの間は効かない・
  `nodes`/`edges` の参照を持つ案に決めた。査読で、**デスクトップで開いた直後の Ctrl+Z が初期図に戻して保存する**・**同じエディタのまま図が替わる経路（AI の `open_in_editor`・インポート）で前の図の手が残る**・
  **載せ替えを 1 手にすると揃え書きと競合し、AI が人の戻しを知らずに上書きできる**・● は時刻で決まる、をコードで確かめた
- 2026-10-31: [spec 29](specs/29_node-shape-icon.md) **P1 着地**（rev1 → 裁定「推奨どおり」→ P0 → P1。フォーク元の改善のコミットに分けた）: フローチャートのノードの右上に形の札（6 つの形の自前の SVG、押すと形のメニュー、ノードの外側の縁に載せて ⋮⋮ と重ならない）、
  左上の変数名の札に省略。押した時に `Menu` を差し込む仕組みを `components/ui/use-deferred-menu.ts` に切り出し、線の矢印の切り替え（spec 23）も使う。
  Web 版を本番と同じ組み立てで前後 2 つ作り、裏の Edge で寸法・見た目・計算されたスタイル・重さを比べた（重さの測りの 1 回目は対象を押せておらず無効だった, failures #52）。残りは P2（配布ビルドで利用者）
- 2026-10-30: [spec 29](specs/29_node-shape-icon.md)・[spec 30](specs/30_undo-redo.md)・[spec 31](specs/31_ui-language.md) **起票**（rev0、裁定待ち。spec 29 は査読 1 本を採って rev1: 札の下端をノードの縁にそろえ ⋮⋮ を避ける・メニューは Portal・札は線に避けさせない・押した時に `Menu` を差し込む。利用者の 3 点「ノード形状のアイコン」「確定の前に戻せる Undo/Redo」「UI 言語の切り替え（英・中・韓・日、定番のライブラリで）」）。
  下調べ: ノードは形にかかわらず同じ四角で、形は左上の札の括弧（`{A}`）でしか分からない / エディタに元に戻す仕組みは無く（CodeMirror の中だけ）、「確定」は `saved_at` を書くだけで中身を残さない、ノードと線の `data` に関数が入っている /
  画面の言葉はフロントの 56 ファイル・362 行と Rust（エラー・保存ダイアログの題・About・新しい図の題）に直に書いてあり、**ER 図の初期図の「ユーザー」は Rust の初期図の保険が文字で突き合わせている**（言語で変えると保険が外れる）。
  推す形: 29 は右上の縁の上の札（押すと形のメニュー）、30 は Undo/Redo（フォーク元・Web 版も）と `Document.confirmed` に残して「確定へ戻す」（デスクトップ）、31 は `i18next` + `react-i18next`・言語ごとの JSON・Rust はエラーをコードで返す。進める順は 29 → 30 → 31
- 2026-10-29: **v0.1.4 を publish した**（Latest。タグ `v0.1.4` = `ef035a4` は利用者が push。spec 26〜28: 設定画面の MCP の JSON のタブ・ミニマップの出し入れ・画面のダークテーマ・選んだノードの印）。
  Build（spec 20）の 1 回目は **macOS だけ** spec 26 のテスト（`mcp-settings.test.tsx`、設定のダイアログを開いた直後の `toBeVisible()`）がダイアログの不透明度 0 を見て落ちた（failures #51）。
  タグは動かさず、落ちた段だけ走らせ直して通した（`gh run rerun --failed`）。テストの直しは `30233db`（タグには入っていない）。Assets は v0.1.3 と同じ 7 つ。
  リリースノートは英語と日本語（v0.1.3 と同じ形）を利用者の指示で `gh release edit --draft=false --latest` で入れ、本文のリンクは publish の後に全部開くことを確かめた。
  README・README.ja には publish の後に、MCP の設定の JSON のタブと「エディタの操作」の節（画面の色・複数を選ぶと青い輪・ミニマップ）を足した。ライブデモ（Web 版）は v0.1.3 の時のまま更新していない
- 2026-10-29: [spec 28](specs/28_selected-node-mark.md) **Done**（フォーク元 `76a58fc`。利用者の言「Shift キーを押したまま node クリックで複数選択できるようにして欲しい」→ 下調べで、Ctrl+クリックの複数選択とまとめての移動は今もあり、
  **選んだノードに印が出ないので気付きにくい**と分かった → 裁定「Shift ではなく Ctrl のままでよい。選択されたとわかりやすく」）。選んだノード・テーブル・枠の外側に青い輪（色の名 `selectionRing`、`components/layout/selection-ring.ts`）。
  選んでいない時の見た目は前と同じ（spec 27 の台本）。jsdom は `outline` の一括指定を分けない（failures #50）。P2（配布ビルドで利用者が「問題なし」）
- 2026-10-29: [spec 26](specs/26_mcp-json-and-minimap.md) **Done**・[spec 27](specs/27_dark-theme.md) **Done**（利用者の 3 点「設定画面の MCP のクライアント側の設定に JSON の登録文も」「右下のミニマップの表示を切り替えたい」「UI のダークテーマ」）。
  spec 26 は rev1（裁定は推奨どおり）→ P1 → P2 → P3（配布ビルドで利用者が「問題なし」）。**P1**（`0c0903e`）: 設定画面の「クライアント側の設定」を「コマンド（Claude Code）」「JSON」のタブにし、JSON は Fuseforks と Claude Code の `.mcp.json` と同じ形（`mcpServers` の `type: "http"`・`url`・`headers`）。
  **`.mcp.json` は Git に入れて共有する前提のファイル**なので注意書きを出す。`tauri dev` で写した JSON を `.mcp.json` に置くと `claude mcp get` が読み、その url・headers で `list_diagrams` が通った（Claude Code が承認の後につなぐ所は P3 で利用者が確かめた）。
  computer-use で開発版を写すには `request_access` に `"lorelei.exe"`（failures #45）。**README・README.ja の案内は次の版を出す時に足す**。
  **P2**（フォーク元 `affecfe`）: 左下の Controls に `ControlButton`（地図のアイコン）を足し、ミニマップの出し入れを localStorage の `mermaid-editor.minimap.v1` に 2 つのエディタで共通に覚える（Web 版にも出る・上流へ返せる）。
  覚えた値はマウントの後に読む（静的書き出しでサーバー側でも描かれるため）。xyflow は Controls の svg を `fill: currentColor` で塗るので、線のアイコンは `fill: none`。
  テストで `vi.restoreAllMocks()` を使うと setup の `ResizeObserver` の模擬まで消える（failures #46）。Browser pane の ref の押し位置がずれた（#47）。
  spec 27 は rev1（裁定は推奨どおり。Web 版に切り替えは出さない）・**P1 着地**（フォーク元 `5c20d15`）: `components/providers/theme.ts` に `[ライト, dark]` を持つ色の名 23（ライトの値は置き換える前の値そのもの）を足し、
  フォーク元の直に書いた色 48 か所と線のラベルの CSS（`var(--ui-colors-…)`）を置き換え、2 つの `<ReactFlow>` に色モードと線の色を渡した（`useCanvasColors`）。
  Web 版で、ライトは計算されたスタイル 24 万 5 千項目が前と同じ、dark は 12 場面で文字のコントラストを満たす。**`AppProviders` は client component**（server のまま `extendTheme` を呼ぶと vitest は緑で画面とビルドが落ちる, failures #48）。
  見た目の記録と比べは `scripts/ui-style-snapshot.mjs`（偽の `__TAURI_INTERNALS__` でデスクトップの外枠も描く、`--dark`）・`ui-style-compare.mjs`（`style` / `contrast`）。要素の名で script を数えるとずれた（#49）。
  **P2 着地**（`faf1d07`）: タイトルバーの「?」の左に画面の色の切り替え（`lib/desktop/color-mode-menu.tsx`、ライト・ダーク・OS に合わせる。yamada-ui が `ui-color-mode` に覚える）、外枠の直の色 27 か所を色の名に。
  `tauri dev` でダーク・開き直しても残る・OS に合わせる（今の OS はダーク）を確かめた。窓を出す時に色の class が付いていること（D7）はテストで（目では見ていない）。
  **P3**（配布ビルドで利用者が「問題なし」）。OS の色を切り替えた時の追従は任意の手順にしたので未確認。**README・README.ja の案内（spec 26 の JSON のタブと画面の色）は次の版を出す時に足す**
- 2026-10-14: **v0.1.3 を publish した**（Latest。タグ `v0.1.3` = `23f44ea` は利用者が push。spec 22〜25: 大きな図のドラッグ・線のラベルの描き直し・出力のテーマ・`themeVariables` の色・`.mmd` の保存ダイアログ）。
  Build（spec 20）は 31 分で通り、Assets は v0.1.2 と同じ 7 つ。リリースノートは英語と日本語（v0.1.2 と同じ形）を利用者の指示で `gh release edit --draft=false --latest` で入れた。本文のリンクは publish の後に全部開くことを確かめた
- 2026-10-14: [spec 25](specs/25_mmd-save-dialog.md) **Done**（rev3。起票 → P0（コードと文書を読む下調べ）→ 査読 3 本（1 本はこちらから、2 本は利用者が貼った）→ 裁定（推奨どおり）→ P1（`9f9879c`）→ P2（配布ビルドで利用者が「不具合はありません」。保存した `.mmd` は図の中身とバイト単位で同じ）。spec 24 P3 の利用者の言「ダウンロード押した後に保存されたという通知がないから、なにが起こったかわからない」）。
  コード生成のダイアログの「ダウンロード」（`.mmd`）はフォーク元の `<a download>` のままで、Windows は WebView2 が保存先を尋ねずに「ダウンロード」フォルダへ保存し、**macOS は wry がハンドラの無いダウンロードを取り消すので押しても何も起きないはず**。
  **WebView2 のイベントの中で同期のモーダルを出すのは再入で対応していない**（Microsoft の Threading model の文書。wry のダウンロードのハンドラは同期で deferral を使わない）ので、`on_download` の中で保存ダイアログを出す形は使えない。
  P1 で入れた形（裁定は推奨どおり）: `lib/desktop` の `useMmdDownload(fileStem, webDownload): { download, busy }` をフォーク元の 2 つのダイアログの「ダウンロード」から呼び（Web 版は今の Blob の処理をそのまま呼ぶ、デスクトップでは呼ばない）、
  `export_diagram` が `ExportKind { Render(RenderFormat), Mmd }` で振り分ける形（`RenderFormat` は MCP の enum なので変えず、`export_to` も変えず、`.mmd` は `save_mmd`、`write_output` の中身を拡張子で受ける `write_file` に分ける）。
  保存ダイアログは窓に 1 つだけ（4 つのボタンで共有）。`OutputPathPolicy` は「共通・MCP だけ・GUI だけ」に分けて書き直した（上書きの規則が MCP と GUI で違う）。テストは Rust 3 件・vitest 8 件（要の分岐を 4 つ壊してそれぞれ落ちる）
- 2026-10-14: [spec 24](specs/24_mermaid-theme-output.md) **Done**（rev1。起票 → P0 → 裁定 → P1（フォーク元 `d94a161`: 生成器・Web の取り込み・コード生成のダイアログのテーマのメニューとプレビューの背景）→ P2（`17889ab`: デスクトップ・Rust）→
  P3（配布ビルドで利用者が「確認しました。完璧です」）。GitHub・Zenn が frontmatter を読むかは未確認。利用者の言「Mermaid のテーマを切り替えられるようにしたい。編集画面に被せるより、出力ファイルに反映されるように」）。
  下調べ（直す前）: 書き出しの口（`RenderOptions.theme`）を使うのは MCP の `render` だけで GUI の書き出しは default に固定、生成器はテーマを書かず、取り込み（Web・デスクトップ・MCP）はテーマを黙って落とし、
  `themeVariables` は merman の既定の守りの写しで書き出しに効かなかった（mermaid.js のプレビューでは効く）。背景はどのテーマでも白（dark は見づらい）。
  P0: 5 つのテーマ × 2 種類の図で、**merman（書き出し）と mermaid.js（プレビュー）の配色は部品ごとに一致**（違いは背景を塗るかと、`htmlLabels: false` の線のラベルの描き方）。dark は背景を #333 にすると読める。
  裁定: テーマは図の先頭の frontmatter で持ち回る・4 つのテーマ・コード生成のダイアログで選ぶ・dark の背景 #333・**書き出しの守りから `themeVariables` を外す**（取り込みの読みは今の守りのまま）。
  P2: 自動保存（`toSource`）はパネルが `useDesktopActions` で渡すテーマで書く（直す前は開いた直後の自動保存でテーマが消えた）。`to_editor` は merman の `ParseMetadata.config` からテーマを読み、
  TS と同じ `config:<名前>`・`theme:<名前>` を dropped に出す（mermaid.js が図の設定から消す `securityLevel` などは数えない。TS ↔ Rust の fixture `themes.json` 21 通りで突き合わせ）。
  守りは `engine.rs` の `Guard`（書き出し = render・validate は `themeVariables` を通す、取り込み = to_editor は守る）。色として読めない値は merman が**解析の段階**でエラーにし、validate も ok=false。
  dark で背景の指定が無ければ書き出しの背景は #333（効いているテーマは図の中が勝つ）。GUI の書き出しは引数を足さず、ダイアログのコードの先頭のテーマで決まる。
  `tauri dev` で MCP の HTTP の口を直接叩いて往復を確かめた（GUI の画面は computer-use の許可が下りず押していない, spec 24「P2 結果」）。図の一覧に確かめ用の図が 4 つ残る（P2・P3 の各 2 つ）。
  P3 で見つけた次の候補（→ spec 25）: **コード生成のダイアログの「ダウンロード」（`.mmd`）は、デスクトップでは確認も知らせも無く「ダウンロード」フォルダへ保存される**
  （フォーク元の `<a download>` のまま。Lorelei は Tauri の `on_download` を設定しておらず、WebView2 の既定で黙って保存され、押すたびに `(1)`・`(2)` … と増える。SVG・PNG・PDF は rfd の保存ダイアログ, spec 24「P3 結果」）
- 2026-10-14: [spec 23](specs/23_edge-label-render.md) **Done**（rev2。起票 → 査読 3 本 → P0 → 裁定 → P1 → P2（配布ビルドで利用者が「すべて問題ありません」）。spec 22 の次の候補「ドラッグ中の描き直しを軽くする」）。
  下調べ: 自動スクロールを起こさない測り（failures #40）では、引っかかるのは経路の計算が走るフレームで、中身は**経路が変わった線（1 回に 18 本前後）のラベルの描き直し**（yamada-ui の部品、1 本 2〜2.5ms）。
  P0 で形を絞り、裁定は推奨どおり（memo は採らない、パネルは触らない）、**アイコンは `lucide-react` を直接の依存に足して描く**（`@yamada-ui/lucide` が固定で入れている 0.475.0。`@yamada-ui/lucide` は yamada-ui の `Icon`（Emotion）で包むので重さの一部だった）。
  P1（フォーク元 `0d80888`）: **閉じたラベルを素の要素 + CSS Modules（`edge-label.module.css`、リポジトリで最初の自前の CSS）で描き、矢印のメニューは押した時だけ yamada-ui の `Menu` を差し込む**。
  直す前と交互に測った 24 場面で、95 パーセンタイルの中央値 83.5 → 21.4ms、長いフレームの和 1,531 → 107 個、24 / 24 場面で下がった。見た目は計算されたスタイル 21,600 項目と画素で前と同じ（開いたメニューの影の縁だけ 1/255）。
  メニューは**閉じた状態で差し込み、次の描画で押した事件を本物の `MenuButton` へ渡す**（Space は `code` も渡す）と、11 の手順で開き方・フォーカスの行き先が前と同じ（素直に開くとフォーカスと role が違う, failures #42）。
  **閉じた yamada-ui の `Menu` は項目の文字を DOM に持つが `role="menuitem"` は付かない**ので、「閉じた時に描かない」テストは文字で見る（role で見ると最初から緑, failures #22 の形）。
  **速さの測りは裏の Edge で回す**（Browser pane は途中で隠れて描画が止まった, failures #41。利用者の裁定。Playwright の `channel: "msedge"`・headless・使い捨てのプロファイル。測りごとに水準が揺れるので、比べは同じ測りの中の交互だけ）。
  次の候補（spec 23「P2 結果」）: 枠のドラッグで残る重さ（直した後も 95 パーセンタイル 63〜104ms）/ 経路の計算を減らす・主スレッドの外へ / ER 図の線のラベル。spec 21 からの ⑦ の前半・⑥・ボタンの実寸・両端を貫く逆向きの線、spec 16・17 の ②〜④ も残る
- 2026-10-13: **リポジトリの About を英語に、homepage をライブデモに、Topics を 13 個**（利用者を増やす方面。`gh repo edit -R betyourluck/Lorelei`）。
  **この作業場所の `gh` は `-R` なしだとフォーク元（`upstream`）を読み書きする**（failures #37。同日 `gh repo set-default betyourluck/Lorelei` 済み）
- 2026-10-14: [spec 22](specs/22_drag-reroute-scope.md) **Done**（rev3。spec 19・21 の候補「大きな図のドラッグを軽くする」。起票 → 査読 2 本 → P0 → 裁定 → P1 → 受け入れ条件 1 の改め → P2）。
  下調べ: ドラッグ中の時間の 85〜90% は A\* の探索で、n57 の線は 5 本なのに 1 回ごとに約 27 本を探し直していた（回り道の線の外接矩形が図の大部分を覆う。「線の多いノード」は当たっていなかった）。
  P0（本番と同じ組み立てで 4 案を 128 回）: **探索の割り当てと格子の作り方だけを変える案 B で足り、出す道は前と同じ**。使い回しの判定を細かくする案 A は重ねても目に見える差が無く採らなかった。
  **手を離してもノードの `dragging` が残り、「手を離したら全部を探し直す」（spec 17 D4）が実物で一度も走っていなかった**（failures #38）。
  P1（フォーク元 `afd495b`: 探索を速くする。前の実装の写しと乱数の格子 1000 通り・大きな図の golden で一致を確かめる / `d91f5ec`: `onNodeDragStop` を `setNodes` に関数で渡す）。
  直す前と交互に測り、手を離した時の全部の探し直しは 0 / 24 回 → 24 / 24 回、ドラッグ中の 1 回は 24 場面の中央値 23.5 → 13.8ms。
  受け入れ条件 1 は rev3 で「vitest の決まった歩幅で図ごとの全部の歩の中央値 16ms 以下（枠なし 12.6〜13.4ms・枠あり 14.8〜15.8ms、枠ありは際）＋ブラウザで直す前より軽い」に改めた
  （ブラウザの絶対の ms は日によって 2 倍近く揺れる。この日は 8 / 24 場面が 16ms を超えた）。P2（配布ビルドで利用者がドラッグ・手を離した時の線・枠の操作を確かめた、「問題なし」）。
  P0 の「重さの大半は描き直し（経路の計算を止めても 83ms）」は、窓の外のノードを動かして自動スクロールが走った測りの誤りだった（failures #40）→ spec 23。
  測りは `next dev` では使えず（フレームの間隔 125〜230ms）、本番と同じ組み立て（`build-web-demo.mjs` の書き出し）で、対象を窓の真ん中・倍率 0.5 にして測る。`--base-path /…` を Git Bash から渡す時は `MSYS_NO_PATHCONV=1`（failures #39）。
  探索の道の選び方を変えたら `LORELEI_UPDATE_FIXTURES=1` で `__tests__/utils/edge-route-search.test.ts` の golden を書き直し、`search-reference.ts`（前の実装の写し）も同じに変える
- 2026-10-09: **README に操作の GIF・CONTRIBUTING を Lorelei 向けに・Issues を有効に**（v0.1.2 の後）。GIF は `assets/readme/lorelei-demo.gif`（960×625、21 秒）:
  配布ビルドの窓を ffmpeg の gdigrab で録り（窓の見えている範囲は DwmGetWindowAttribute で測る）、MCP は HTTP の口を直接叩き、GUI は computer-use で操作、字幕は Pillow で作って ffmpeg で重ねた
  （ffmpeg の drawtext はこの環境で fontconfig が無く落ちる）。CONTRIBUTING は英語と日本語。リポジトリの Issues は無効だったのを利用者が有効にした（README・リリースノート・デモの報告先が開けなかった）
- 2026-10-09: **v0.1.2 を publish した**（タグ `v0.1.2` = `8abad2c`。spec 21 の線のボタンのずらし・README の書き直し・ライブデモ。リリースノートは英語と日本語）
- 2026-10-09: **README を Lorelei の入口に書き換え、ライブデモを Lorelei の Web 版にした**（利用者の言「僕以外のユーザーを増やしたい」）。
  README.md は英語、README.ja.md は日本語（互いにリンク。フォーク元の README の中身は撤去し、クレジットに残した）。
  ライブデモは `node scripts/build-web-demo.mjs ../betyourluck.github.io/docs/lorelei-web` で作って写す（`out-web-demo/` へ書き出し、basePath は `/lorelei-web`。
  写し先が空か、前に写した印 `.lorelei-web-demo` がある時だけ中身を入れ替える）。betyourluck.github.io の `docs/.nojekyll` が無いと Jekyll が `_next/` を配らない。
  フォーク元の直し: `next.config.mjs` の basePath・書き出し先を `PAGES_BASE_PATH`・`PAGES_DIST_DIR` で、GitHub メニューのリポジトリを `NEXT_PUBLIC_REPOSITORY_URL` で、
  ページの題を `NEXT_PUBLIC_SITE_TITLE` で差し替えられるようにした（既定はフォーク元のまま）
- 2026-09-24: [spec 01](specs/01_tauri-mcp-foundation.md) rev3。**spec 01 Done**（P0〜P5。未確認・未達は spec 01「受け入れ条件の結果」）。
- 2026-10-09: [spec 21](specs/21_unrouted-label-overlap.md) **Done**（rev2。査読 3 本を反映し、P0 の後に D1〜D6 を裁定。spec 19 の候補 ⑦: 回さない線どうしのボタンが重なる（枠の無い大きな図で 11 組）。ボタンは矢印の切り替えと削除も持つので、違う線を押しうる）。
  推奨: 回さない線を定義の順に 1 本ずつ確定させ、前の線の確定した位置と重なる線だけを、自分の曲線の上で中点に近い順（道のり 8px 刻み）に、ほかの全部のボタン（後ろの線は今の位置）・ノード・枠の見出しと重ならない所へ滑らせる。
  回した線のボタンはその後に今の `placeButton` で置く（置けない時の中点は spec 17 のまま）。自己ループは動かさず避ける。`routeEdges` が求めて返す。
  現況で、同じ向きの平行な線は曲線もボタンも重なり、逆向きの組に混じると `adjustEdgeLabelPosition` が出口と入口で線を探すので同じずれを受けることを確かめた。
  P0 着地: spec の図 29 枚の重なり（取り込み直後 20 組・保存された位置 17 組）は推奨の案で全部解け、解けないのは曲線が両端のノードを貫く逆向きの線だけ。ずらしの増分はドラッグ中の中央値 0.3〜0.6ms。
  ボタンの大きさの見積もりは実物より最大 3.5px 小さい（隙間 4px を推す）。枠の無い大きな図の n57 は今のコードでもドラッグ中の中央値が 33ms を超える（受け入れ条件 4 を増分の基準に改めるのを推す）。
  Browser pane が隠れているとインポートが止まる（failures #36）。裁定: 推奨どおり。D3-1 は入れない、D3-2 は置く時だけ 4px（きっかけは隙間 0。再測で動く線は同じ）、受け入れ条件 4 は今のコードからの増分 3ms 以下。
  P1 着地（フォーク元 `0f02287`: `edge-route.ts` の `placeCurveButtons`・`slideOnCurve`、滑らせた線は `points: []` の `EdgeRoute`。Web 版で重なり 0・速さは HEAD と揺れの中）。P2（配布ビルドで利用者が 5 つの図を確かめた）着地、受け入れ条件 1〜6 通過。
  次の候補: ⑦ の前半（回さない曲線が端の祖先の枠の見出しを通る）/ ⑥ 回した線の通り道を手で動かす / 大きな図の線の多いノードのドラッグを軽くする / ボタンの大きさを実物で測る / 両端のノードを貫く逆向きの線。spec 16・17 からの ②〜④ も残る
- 2026-10-04: [spec 20](specs/20_release-build-actions.md) **Done**（rev2。Fuseforks・Lorekeel と同じく、`v*.*` のタグの push で GitHub Actions が 3 OS をテスト → ビルドし、インストーラーを下書きの Release に置く）。
  `.github/workflows/build.yml`・`verify-notary.yml` を足し、フォーク元の `ci.yml`・`deploy.yml` は手動だけにした（裁定 2。main への push で `docs/` をボットがコミットしないように）。
  `v0.1.1` で 3 OS が通り、macOS は署名と公証（`Accepted`）まで、Windows の NSIS で入れた版で MCP と図の一覧を確かめた。`v0.1.0` はテストで止まった（failures #34: 遅いランナーで `waitFor` の 1 秒が足りない →
  `__tests__/setup.ts` で 10 秒、#35: macOS で `generate_context!` の複数の展開が `_EMBED_INFO_PLIST` を重ねる → `src-tauri/src/lib.rs` の `context()` 1 か所に）。
  秘密 5 つ（`APPLE_*`）は origin に登録済み。`.p12` は `~/.apple-signing/`（Fuseforks の時に Windows で作った）。**`v0.1.1` を利用者が publish した（最初の公開版）**。次の版も、Release は人が Assets を見てから publish する
- 2026-10-04: [spec 19](specs/19_route-frameless-back-edges.md) **Done**（rev3。spec 18 P2 で見つけた候補 ⑧: 枠の無い図の戻る線がノードの後ろに隠れ、ボタンが重なる・隠れて押せない。**spec 17 の裁定 1 を改めた**）。
  裁定: 1 = 案 A（ノードは高さを問わず回す対象）、2 = 案 C（曲線がノードを貫くか、ボタンが縦横とも 12px 以上かかる時に回す）、
  D3 = 回した線のボタンは回さない線のボタン（曲線の中点 + `adjustEdgeLabelPosition` のずれ）も避ける、D4 = ドラッグ中の中央値 33ms・全部 100ms。
  P0 で、案 B は段を飛ばす線を線ごと・ボタンごと隠したまま残すと確かめた。P1（フォーク元 `60e2d98`）: `needsRoute` の判定・D3・線分の上に置けないボタンを線分と直交する向きにずらす 2 段目・`RouteBox.z` の撤去。
  P2（配布ビルドで利用者が全部の図を確かめた）着地、受け入れ条件 1〜6 通過（4 は際: 枠の無い大きな図の線の多いノードのドラッグは中央値 27〜36ms）。
  隠れた窓で読み込み直したページは計算の予約が止まる（failures #32）。TD の図を回したテストは寸法が実物と変わる（failures #33）。
  次の候補: ⑦ 回さない線どうしのボタンの重なり / ⑥ 回した線の通り道を手で動かす / 大きな図の線の多いノードのドラッグを軽くする。spec 16・17 からの ②〜④ も残る
- 2026-10-04: [spec 18](specs/18_cycle-layout.md) **Done**（rev3。spec 17 の候補 ⑤: 閉じた輪の図が取り込みで 1 段に横並びになる。裁定 1・2 済み）。
  取り込み時の段の数え方を、**Mermaid と同じ順で輪をほどき（dfsFAS）、戻る線を除く線が全部下へ向くように上からの最長路で段を振る**形にした（`nested-layout.ts` の `levelsOf`・`mermaidStartOrder`。枠の無い図の `layoutNodes` と枠の向きの並べ直しも同じ関数）。
  P0 で、mermaid.js / merman は**外とつながらない枠を定義の逆順で先に、続いてノードを最初に出てきた順**にグラフへ入れ、graphlib のキーの順で**整数に見える ID が数の順で先頭**に来ると確かめた（格子 20 通り・69 本の線の上下が下書きと一致）。
  枠のある輪では最後に定義した枠が一番上（人の直感と違うが、プレビュー・書き出しと揃う, 裁定 1）。今の段が段の条件を満たす輪の無い図は配置が変わらない。P1（フォーク元 `9a61e63`）・P2（配布ビルドで利用者が確かめた）着地、受け入れ条件 1〜6 通過。
  P2 で、**枠の無い図の戻る線はノードの後ろに隠れ、ボタンが別の線のボタンと重なる・ノードに隠れて押せない**ことを見つけた（spec 17 裁定 1 で回さない線）→ spec 19 で見直す（候補 ⑧）
- 2026-10-04: デスクトップの UI（利用者 FB、spec 02 D12 の追記）: ツールバーの「保存」を**「確定」**に改名（ファイルへの書き出しと思われたため。Ctrl+S・振る舞い・データの名詞 `saved_at` / `unsaved` / `mark_document_saved` は同じ。spec 32 で `mark_document_saved` は `confirm_document` に置き換えた）。
  タイトルバーの歯車を外した（設定の入口は「● MCP」だけ）
- 2026-10-04: [spec 17](specs/17_edge-routing-around-frames.md) **Done**（rev3。spec 16 のスコープ外の持ち越し: 枠をまたいで戻る線・段を飛ばす線が途中の枠と中のノードを貫く。裁定 1〜3 済み）。
  エディタの表示だけを変える（保存・コード生成・`read_diagram` には何も足さない）。今の曲線か中点のボタンが、どちらの端も中にいない枠・線より低いノード・端である枠の内側と交わる線だけを、縦と横の線分の道で回す
  （`features/flowchart/utils/edge-route.ts` の `routeEdges`、配るのは `hooks/use-edge-routes.ts`。枠の無い図は今の曲線のまま — spec 19 で改め、ノードを貫く線は枠の無い図でも回す）。P0（Web 版の 28 通り・Mermaid の描画・既製の部品・重なりの順・速さ）・
  P1（フォーク元 `bebed21`。Web 版の画面で 24 通りが枠を横切らないことを確かめた）・P2（配布ビルドで利用者が確かめた）着地、受け入れ条件 1〜6 通過。
  P2 で、枠を動かした後だけ枠の中のノードへ回した線が見出しを貫く不具合を見つけて直した（`9f985ad`。別々に求めた「同じ縁」の座標の誤差, failures #31。内外の判定は縁から 1e-6 より内側だけ）。
  **xyflow はノードを測った後に中身を書き換えて `set({})` で知らせる**ので、ストアの購読を参照で絞らない（failures #29）。速さは本番の段組みを通した図で測る（failures #30）。
  次の spec の候補（spec 17「スコープ外」）: ⑤ **閉じた輪の図は取り込みで全部が 1 段に横並びになる**（`levelsOf` が入る線の無いものを根にする。P0 で見つけた）/
  ⑥ 回した線の通り道を手で動かす（P2 の後の利用者の言）/ ⑦ 回さない曲線が端の祖先の枠の見出しを通る形と、曲線どうしのボタンの重なり（P2 の画面）。spec 16 からの ②〜④ も残る
- 2026-10-02: [spec 16](specs/16_subgraph-edges-and-direction.md) **Done**（rev3。P0〜P4 の後、裁定 4 で P5 を足した。spec 15 P5 の持ち越し: サブグラフを指す線と枠の中の `direction` をエディタで扱う。裁定 1〜3 済み）。
  P0 で mermaid.js と merman に 173 通りを通し、**描画で枠の中が並ぶ向きの規則**（中のノードが外とつながる枠は書いた向きが効かず、外とつながらない向きの無い枠は図と逆向き）を描画 520 点で確定した。
  エディタは書いた向きで並べ、描画と違う枠は見出しで知らせる（裁定 1 の案 B。計算は `features/flowchart/utils/frame-direction.ts`）。枠と自分の中を結ぶ線は描画で見えないので落とす（裁定 2、`edge_into_own_subgraph`）。枠の中の `TD` は `TB` にそろえる（裁定 3）。
  P1（フォーク元: 往復と表示。Web 版の画面で確認）・P2（Rust の `to_editor`・fixture・MCP の説明・LORELEI.md。`tauri dev` で MCP の往復を確認）・P3（GUI の編集: 見出しの向きのメニュー・枠と子孫の線を繋がせない・付け替えで生じる線の確認・枠の自己ループを枠の外へ。Web 版の画面で実物のマウスで確認）・P4（配布ビルドで利用者が操作、`read_diagram` と保存ファイルで確認）。受け入れ条件 1〜6 通過（未確認は spec 16「P4 結果」）。**Browser pane は窓が後ろにあると描画されず、xyflow の線も出ない**（failures #26）。
  P2 の画面で、**同じ ID のノード・線を持つ別の図を開くと前の図のラベルが表示に残る**フォーク元の不具合を見つけて直した（failures #27。props を `useState` の初期値にする部品は、編集していない間は props に合わせる）。
  P3 の画面で、**枠（親ノード）の面の上では離した先の要素が pane に見え、枠の中から浮き出すメニューは中のノードに隠れる**ことを見つけた（failures #28。浮き出す部品は Portal、離した先は xyflow の接続の状態で判定）
  P4 の画面で、枠の向きを変えても中のノードが元の並びのまま接続点だけ動いて線が崩れることを利用者が見つけ、**裁定 4 で P5 を足した: 見出しで枠の向きを変えたら、その枠の中だけ取り込み時と同じ段組みで並べ直す**（`frame-edit.ts` の `relayoutFrame`。図全体の向きの変更は並べ直さない）。2026-10-02 に Web 版の画面で LR・BT・RL・指定なしを確かめ、配布ビルドで利用者が確かめた
- 2026-09-30: [spec 15](specs/15_flowchart-subgraph.md) **Done** — rev2（フローチャートの subgraph をエディタの枠（xyflow の親ノード）にし、保存・読み戻し・コード生成で落とさない。裁定 1〜5 済み）。
  P0（mermaid.js と merman に 87 通り）・P1（フォーク元: 取り込み・入れ子の段組み・枠の表示・生成器。Web 版の画面で確認）・
  P2（Rust の `to_editor` が枠を返す・`Document.layout` は絶対座標で枠は大きさも持つ。`tauri dev` で MCP の往復と開き直しを確認）・
  P3（GUI の編集: 枠を追加・ドロップで出し入れ・題と ID・大きさ・中身を残す削除。計算は `features/flowchart/utils/frame-edit.ts`。Web 版の画面で確認）着地。
  P0 で、ラベルの `direction LR` を mermaid.js が囲みの中でも行ごと食ってノードが消える今の生成器の穴を見つけて直した（failures #21）。P4（配布ビルドで MCP で開く → 利用者が枠を追加・出し入れ・題と ID・× で削除・大きさ → `read_diagram` と保存ファイルで確認）着地、受け入れ条件 1〜7 通過（未確認は spec 15「P4 結果」）。
  P3 の後に `tauri dev` で利用者が、枠の × で選んでいた中のノードまで消す扱いを見つけて直した（failures #24）。P4 の後に配布ビルドで、枠の中の線のボタンが押せない不具合を見つけて直した
  （failures #25。**枠の本体は押す操作を受けず、枠を選ぶ・動かすのは見出しから**）。P5（枠を指す線・枠の中の向き）は次の spec の候補に回した（利用者裁定）。
  **xyflow は親を消すと子も消す**ので、枠の削除は `onBeforeDelete` で子を消す一覧から外して先に付け替えている（`planFrameDelete`）
- 2026-09-29: [spec 14](specs/14_merman-er-word-boundary.md) **Done** — rev1（上流 PR [Latias94/merman#153](https://github.com/Latias94/merman/pull/153) は 2026-09-29 にマージ済み。merman の ER 図の字句解析が `many` / `one` / `to` を境界なしで取り、
  AI が書いた ER 図の `tokens` などのテーブル名を誤りにしていた（`A one to onerous : x` は名前が `rous` に化けた）。写しを mermaid.js の `\b` と同じ境界にした）
- 2026-09-29: [spec 13](specs/13_er-names.md) **Done** — rev2（ER 図の生成器が空白を含むテーブル名をそのまま書き、デスクトップで開き直せない・テーブルが割れる。
  テーブル名・関係のラベルを要る時だけ囲み、書けない列は書き出さない（`quoteErName` / `columnIssue`）。P0 で mermaid.js と merman に名前の格子を通して規則を決めた。
  関係のラベルは spec 11 D5 の取りこぼし（キーワードのラベル・Rust の取り込みが `#quot;` を戻さない, failures #19）。P2 で入力欄の印・コード生成のダイアログの一覧・テーブル名の確定。P3 で Rust の取り込みも名前とラベルを戻す（TS の生成器の出力を fixture にして Rust に通す）。P4 の配布ビルドで、`"` を含むテーブル名の図を開くと落ちる不具合を見つけて直した（xyflow の `useUpdateNodeInternals` が ID をセレクタにエスケープせずに埋める, failures #20））
- 2026-09-29: [spec 12](specs/12_remove-legacy-parser.md) **Done** — rev0（フォーク元の正規表現のパーサー `parseMermaidCode` / `convertMermaidToERData` を撤去。
  取り込みは spec 11 の mermaid.js の経路だけ。古いパーサーを使っていたテスト（往復・デスクトップの `convert_source` の模擬）は mermaid.js の経路へ移した）
- 2026-09-29: [spec 11](specs/11_import-via-mermaid.md) **Done** — rev1（インポートの取り込みを**フォーク元の正規表現のパーサーから mermaid.js 11.17.2 の解析**
  （`getDiagramFromText` の db の写し）に替え、Rust の `to_editor` と同じ対応表で取り込む。取り込むと消えるものを要約と行の黄色の印で知らせる。生成器のラベルの囲み（往復が mermaid.js で戻る））。
  D7 で**デスクトップのツールバーのインポートも同じ本文**にした（取り込みは Rust のまま）。Rust の `to_editor` の穴 2 つ（ER 図の subgraph で止まる・線の ID の衝突）も直した。
  spec 10 のインポートの変更がデスクトップに届いていなかった件の訂正は failures #17
- 2026-09-29: [spec 10](specs/10_codemirror-editor.md) **Done** — rev1（インポートとコード生成のエディタを **CodeMirror 6**（Kataribe と同じ設定の React の薄い包み）にし、
  Mermaid の補完と文法の赤線（mermaid.parse）を入れ、インポートも 90%×85% で右にプレビュー）。エディタは `lazy-code-editor` を通してダイアログを開く時に読む。
  古い色付けの部品と依存 5 つを撤去。P0〜P4 着地（P4 は配布ビルド）。PowerShell からの pnpm・git の罠は failures #16
- 2026-09-28: [spec 09](specs/09_code-preview.md) **Done** — rev2（「コード生成」のダイアログを 90%×85% に広げ、左にコード・右に mermaid.js で描いたプレビュー。
  mermaid は **11.17.2 に固定**（書き出しの merman と同じ版。12 は既定の配置が ELK・配色が neo に変わる）、ダイアログを開くまで読み込まない。プレビューと書き出しは描き手が違い一致しない — LORELEI.md 既知の制約）。
  P0〜P2 着地（P2 は配布ビルド）。`tauri dev` を動かしたまま build すると dev が壊れた件（failures #15）は、2026-09-29 に真因（Next が `output: "export"` の時 `distDir` を書き出し先と読み替え、
  作業場所を `.next` に固定する）を突き止め、**Tauri の dev は `output` を外して `.next-tauri-dev` を使う**ようにした（`next.config.mjs`）
- 2026-09-28: [spec 08](specs/08_update-diagram.md) **Done** — rev2（AI が既存の図を書き換える `update_diagram`。AI は `expected_updated_at`、GUI の自動保存は `base_updated_at` の楽観ロック、
  開いている図は載せ替え、揃え書きは `normalize_pending` で `updated_at` を進めない、初期図の保険は `first_fill` の時だけ、書き換え前は `history/` に 1 世代）。P0〜P3 着地（P3 は `tauri dev`。配布ビルドでの往復と起動直後の画面の目視は未確認のまま閉じた — spec 08「P3 結果」）。
  P3 で起動直後の載せ替えが捨てられる不具合（failures #13。spec 04 現況 4 の 2 件目と同じ顔）を直した。テストの罠は failures #14
- 2026-09-27: [spec 07](specs/07_direction-and-fk.md) **Done** — rev1（図の向き TD/LR/RL/BT と ER 図の FK をエディタで扱い、MCP の取り込み・保存・読み戻しで落とさない）。
  フォーク元の改善のコミットは spec 07「P1 結果」。古い向きでの書き戻しが 2 回あり、原因は未解明（spec 07「P3 結果」）
- 2026-09-26: [spec 06](specs/06_confirm-delete.md) **Done** — rev1（ER 図のテーブルを「⋮⋮」メニューから消せるようにし、テーブル・ノードの削除（ボタンも Backspace も）に確認を入れる）。
  **フォーク元の改善**で、上流へ返せるコミットは spec 06「P2 結果」に一覧（PR を出すかは利用者が決める）
- 2026-09-26: [spec 05](specs/05_pane-width-and-loading.md) **Done** — rev1（左ペインの幅を変えるつまみと幅・開閉の記憶、図を開く間はエディタを隠して初期図を見せない、
  窓を隠したまま起動して Web 版の画面を見せない）。P1〜P4 着地。隠し方は `opacity`（xyflow がノードに `visibility: visible` を付けるので `visibility` では隠れない, failures #10）
- 2026-09-25: [spec 04](specs/04_readback.md) **Done** — rev1（人が GUI で直した図を AI が読み戻す: `list_diagrams` / `read_diagram`、`open_in_editor` の `document_id`）。P0〜P3 着地。
  P0 で図が初期図・別のエディタのノードで潰れる不具合を直した（failures #7・#8）。GUI の一覧の ● が 1 件落ちた件は未解明（spec 04「未検証」）
- 2026-09-25: [spec 03](specs/03_http-mcp-in-gui.md) **Done** — rev1（MCP を GUI の中の HTTP へ移す）。P0〜P4 着地。配布ビルドに設定画面の登録コマンドで
  Claude Code から 3 本を確認。stdio の `lorelei --mcp` と inbox は撤去。次は読み戻し（spec 04）
- 2026-09-25: [spec 02](specs/02_desktop-shell.md) **Done** — rev4（デスクトップの外枠 = 自作タイトルバー・ツールバー・図の一覧・「保存」）。P0〜P4 着地。
  受け入れ条件 1（配布ビルドのタイトルバー）と 3（VRT）は未確認のまま閉じた。図の一覧は `{app_data_dir}/documents/` を Rust だけが読み書きする
- 開発コマンド: フロントの依存は `corepack pnpm@9 install --ignore-scripts`（pnpm が無い環境でも corepack で足りる。
  lefthook の hooks は入れていない。**scripts 付きの install は `prepare` で hooks を入れ、コミットのたびに prettier・eslint --fix がファイルごとかかる**（2026-10-14 に入って spec 23 rev1 のコミットを整形した。
  外すのは `corepack pnpm@9 exec lefthook uninstall`）。**別の版の pnpm（同じ日に pnpm 12 が入れた）の node_modules だと、pnpm 9 は入れ直しを尋ねて進まない**ので、
  `--config.confirmModulesPurge=false` を足す（failures #43）。GUI は `corepack pnpm@9 exec tauri dev` / `... tauri build --no-bundle`。
  インストーラーは `v*.*` のタグの push で GitHub Actions が作り、下書きの Release に置く（`.github/workflows/build.yml`、spec 20。Release は人が Assets を見てから publish する）。
  Web 版の画面の確かめは `.claude/launch.json` の `web-dev`（`next dev -p 3015`。Browser pane の preview_start で立てる。`.claude/` は git の対象外）。
  配布版を起動する前に `tauri dev` と開発版の `lorelei.exe`・Next の開発サーバーを止める（single-instance。動いている exe は上書きできずビルドも失敗する）。
  Rust は `cargo test --workspace`（core / mcp）と `cd src-tauri && cargo test`（GUI の殻、独立 project）。
  静的書き出しが通るかの確かめは `TAURI_ENV_PLATFORM` を付けた `next build`（→ `out/`）。**素の `next build` は git の中の `docs/`（GitHub Pages）を上書きする**（failures #18）。
  ER 図の生成器を変えたら `LORELEI_UPDATE_FIXTURES=1` で vitest の `__tests__/lorelei/er-names-fixture.test.ts` を回して `crates/lorelei_core/tests/fixtures/er_names.json` を書き直し、
  Rust のテストも回す（TS の生成器の出力を Rust の取り込みに通す, spec 13 P3）。フローチャートの生成器の枠を変えた時も同じく `flow-subgraphs-fixture.test.ts` → `flow_subgraphs.json`（spec 15 P2）。
  整形は HEAD で整形済みのファイルと新しいファイルにだけかける（HEAD は Rust も TS も全体が整形済みではない, failures #23）。ノードの接続点の測り直しは xyflow の `useUpdateNodeInternals` ではなく
  `features/flowchart/hooks/use-update-node-internals.ts` を使う（xyflow のものは ID を CSS セレクタにエスケープせず埋め、`"` を含む ID で落ちる, failures #20）
- **`src-tauri/Cargo.toml` にもルートと同じ `[patch.crates-io]` がある**（独立 project なのでルートの patch が効かない）。
  merman-core の patch を外す時は両方消す
- **merman-core は `vendor/` の修正版を使っている**。修正は 2 つ: ① 日本語のノード ID を受け付ける（上流に **マージ済み**、
  [Latias94/merman#146](https://github.com/Latias94/merman/pull/146)、2026-09-24。写しはマージ版の意味 = mermaid.js の `UNICODE_TEXT` 範囲表、キーワード境界は ASCII）
  ② ER 図の `many` / `one` / `to` を語の境界で取る（`tokens` などの名前を通す。spec 14。上流に **マージ済み**、[Latias94/merman#153](https://github.com/Latias94/merman/pull/153)、2026-09-29）。
  2026-09-30 時点で crates.io の最新は `0.8.0-alpha.6` で、どちらも入っていない。**両方を含む版が出たら `merman` の版を上げて写しと patch を消す**。
  写しの中では merman-core のテストをコンパイルできない（上流の `fixtures/` を読む）— 上流側のテストは上流の作業場所で回す。経緯は `vendor/merman-core/LORELEI_PATCH.md`
- 同梱フォントのライセンス文は `crates/lorelei_core/fonts/OFL.txt`（google/fonts の ofl/notosansjp から取得）。
  配布物の `licenses/` に同梱し、About（タイトルバーの「?」。spec 02 でネイティブのメニューを撤去）に一覧を出す
- vitest は 2026-09-29 から **「全件緑かつ exit 0（未処理のエラー 0）」を基準にできる**。この環境では全件を並列に走らせると 5 秒の際のテストが順に時間切れになるので、
  既定の上限を 15 秒にしてある（failures #3）。デスクトップのテストは境界 `@/lib/desktop/tauri` を静的に模擬する（`@tauri-apps/api/*` だけの模擬は未処理のエラーを出す, failures #14）
- 同梱フォントは `scripts/build-fonts.py` で Noto Sans JP の可変フォントから切り出す（手順と理由はスクリプト冒頭）
