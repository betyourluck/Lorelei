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
                                                          ├─ lorelei_mcp（待ち受け・ツール 3 本）─ lorelei_core（検査・描画・書き出し。純 Rust）
                                                          └─ open_in_editor ─ EditorPort ─▶ 図の一覧に 1 件 ─▶ フォーク元の React エディタ（lib/desktop が受け口）
```

- **`crates/lorelei_core`**: merman で Mermaid → SVG。PNG / PDF への変換は自前（usvg + resvg / krilla-svg に
  **同梱フォント**を渡す — merman-export はフォント DB を差し替えられず、日本語が太字へ落ちるため）
- **`crates/lorelei_mcp`**: MCP サーバー（rmcp 2.2 の Streamable HTTP + axum）のライブラリ。ツールは 3 本。
  `start_http` で `127.0.0.1` だけに待ち受け、トークン・Host・Origin を検査する。GUI へは `EditorPort` で届ける（Tauri に依存しない）。
  **GUI を閉じていると MCP は使えない**（stdio の `lorelei --mcp` は spec 03 P3 で撤去）
- **`src-tauri/`**: GUI。workspace の外に置く（AppPromoVideo / Kataribe と同じ流儀）。起動時に MCP を待ち受ける（既定で ON、
  設定は `{app_data_dir}/mcp_server.json`、設定画面から切り替え）。保存ダイアログと About は rfd（JS に権限を足さない）。
  CSP は style-src の自動ハッシュ追記を止めている
- **`lib/desktop/`**: フロント側の Tauri 依存はここだけ（Web 版では何もしない）。フォーク元への差し込みは spec 01 の 4 ファイル・8 行 + spec 02 の 5 ファイル・12 行（`app/layout.tsx` の外枠、エディタ 2 つの高さ、パネル 2 つの `useDesktopActions`。重なりを除いて計 7 ファイル）
- **フロント（`app/` `features/` `components/`）**: フォーク元のコード。直してよい（下の掟の「フォーク元は必要なら直してよい」）

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

| 知りたいこと | 読む場所 |
|---|---|
| 使う人向けの説明（ビルド・Claude Code への登録・ツール・既知の制約） | [LORELEI.md](LORELEI.md)（README からは 1 行で案内） |
| 名詞・型・MCP ツールの入出力 | [data_contract.yaml](data_contract.yaml) |
| 決定事項と Phase 計画 | `specs/NN_*.md`（起票 → 査読 → rev 改訂 → Phase 単位で main へ直接コミット） |
| 踏んだ罠（症状 → 真因 → 処方 → 一般化） | [failures.md](failures.md) |
| 上流 crate に当てている修正（merman-core） | [vendor/merman-core/LORELEI_PATCH.md](vendor/merman-core/LORELEI_PATCH.md) |
| フォーク元の開発手順・テスト・VRT | [DEVELOPMENT.md](DEVELOPMENT.md) / [TESTING.md](TESTING.md) |

## 現状

- 2026-09-24: [spec 01](specs/01_tauri-mcp-foundation.md) rev3。**spec 01 Done**（P0〜P5。未確認・未達は spec 01「受け入れ条件の結果」）。
- 2026-09-25: [spec 03](specs/03_http-mcp-in-gui.md) rev1 承認（MCP を GUI の中の HTTP へ移す）。P0 から。読み戻しは spec 04 へ
- 2026-09-25: [spec 02](specs/02_desktop-shell.md) **Done** — rev4（デスクトップの外枠 = 自作タイトルバー・ツールバー・図の一覧・「保存」）。P0〜P4 着地。
  受け入れ条件 1（配布ビルドのタイトルバー）と 3（VRT）は未確認のまま閉じた。図の一覧は `{app_data_dir}/documents/` を Rust だけが読み書きする
- 開発コマンド: フロントの依存は `corepack pnpm@9 install --ignore-scripts`（pnpm が無い環境でも corepack で足りる。
  lefthook の hooks は入れていない）。GUI は `corepack pnpm@9 exec tauri dev` / `... tauri build --no-bundle`。
  Rust は `cargo test --workspace`（core / mcp）と `cd src-tauri && cargo test`（GUI の殻、独立 project）
- **`src-tauri/Cargo.toml` にもルートと同じ `[patch.crates-io]` がある**（独立 project なのでルートの patch が効かない）。
  merman-core の patch を外す時は両方消す
- **merman-core は `vendor/` の修正版を使っている**（日本語のノード ID を受け付けるため）。
  上流が同等の修正を出したら消す。経緯は `vendor/merman-core/LORELEI_PATCH.md`、上流 PR は [Latias94/merman#146](https://github.com/Latias94/merman/pull/146)
- 同梱フォントのライセンス文は `crates/lorelei_core/fonts/OFL.txt`（google/fonts の ofl/notosansjp から取得）。
  配布物の `licenses/` に同梱し、About（タイトルバーの「?」。spec 02 でネイティブのメニューを撤去）に一覧を出す
- フォーク元の vitest は、この環境では変更と無関係に 2〜3 件が時間切れで落ちる（failures #3）。
  「全件緑」を完了の条件にせず、落ちたテストが変更前と同じ顔ぶれかで判断する
- 同梱フォントは `scripts/build-fonts.py` で Noto Sans JP の可変フォントから切り出す（手順と理由はスクリプト冒頭）
