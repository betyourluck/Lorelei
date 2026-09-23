# CLAUDE — Lorelei

Mermaid の図を **AI が MCP 経由で生成・検査・書き出し**し、人が GUI で手直しするデスクトップアプリ。
[illionillion/mermaid-editor](https://github.com/illionillion/mermaid-editor)（MIT）のフォークに
Rust + Tauri 2 の殻を被せる。

## 北極星

**「AI が書いた Mermaid を、そのまま使える図にする」。** 図の素材（DB のスキーマ・コード）を読むのは
AI 側であり、Lorelei は受け取った Mermaid の**検査・描画・書き出し・GUI での手直し**だけを受け持つ。
Lorelei は DB にもリポジトリにも繋がない（秘密を置く欄を構造上持たない）。

## アーキテクチャ（spec 01 で確定予定）

```text
Claude Code 等 ──stdio(MCP)──▶ lorelei --mcp ─┬─ lorelei_core（検査・描画・書き出し。純 Rust）
                                             └─ open_in_editor ──▶ 動いている GUI（Tauri）
                                                                    └─ フォーク元の React エディタ
```

- **`crates/lorelei_core`**: merman で Mermaid → SVG。PNG / PDF への変換は自前（usvg + resvg / krilla-svg に
  **同梱フォント**を渡す — merman-export はフォント DB を差し替えられず、日本語が太字へ落ちるため）
- **`crates/lorelei_mcp`**: stdio の MCP サーバー（rmcp 2.2）のライブラリ。ツールは 3 本。`src-tauri` の `main()` が
  `tauri::Builder` より前に `--mcp` を判定して呼ぶ（P3）。**stdout は JSON-RPC 専用、ログは stderr**。
  開発・スモークテスト用に単体 bin `lorelei-mcp` もある
- **`src-tauri/`**: GUI。workspace の外に置く（AppPromoVideo / Kataribe と同じ流儀）
- **フロント（`app/` `features/` `components/`）**: フォーク元のまま。変更は下の掟に従う

## 掟（Mandate）

- **フォーク元を崩さない**: 書き換えるのは**デザイン調整と MCP / Tauri 接続の不整合修正だけ**。
  新しいコードは `crates/` `src-tauri/` `lib/desktop/` に置き、既存ファイルへの変更は最小にする。
  GitHub Pages 向けの Web ビルドを壊さない（Tauri 専用の UI は実行時に出し分ける）
- **データ・ファースト**: コードの前に [data_contract.yaml](data_contract.yaml) の名詞を凍結する
- **PoC 必須**: バグ修正・新機能は Red→Green をテストで実証してから完了
- **リサーチ先行**: 実装前に三点測量（コード grep / 仕様・ライブラリのソース / 記憶）
- **撤去・改名したら grep**: 機構・enum 値・フィールドを変えたら、その名前で全台帳を grep して
  追従漏れを回収するまで完了にしない。機能の着地時は「どの台帳へ書いたか」を数える
- **GUI は実行して生成物を見るまで完了にしない**（テスト緑 ≠ 実機で動く）

## どこに何が書いてあるか

| 知りたいこと | 読む場所 |
|---|---|
| 使う人向けの説明（ビルド・.mcp.json・ツール・既知の制約） | [LORELEI.md](LORELEI.md)（README からは 1 行で案内） |
| 名詞・型・MCP ツールの入出力 | [data_contract.yaml](data_contract.yaml) |
| 決定事項と Phase 計画 | `specs/NN_*.md`（起票 → 査読 → rev 改訂 → Phase 単位で main へ直接コミット） |
| 踏んだ罠（症状 → 真因 → 処方 → 一般化） | [failures.md](failures.md) |
| 上流 crate に当てている修正（merman-core） | [vendor/merman-core/LORELEI_PATCH.md](vendor/merman-core/LORELEI_PATCH.md) |
| フォーク元の開発手順・テスト・VRT | [DEVELOPMENT.md](DEVELOPMENT.md) / [TESTING.md](TESTING.md) |

## 現状

- 2026-09-24: [spec 01](specs/01_tauri-mcp-foundation.md) rev3。**P1〜P4 着地**（core / MCP / Tauri の殻 / GUI の受け口と書き出し）。P5 進行中（`.mcp.json` 登録済み・利用者の承認と実運用待ち）
- 開発コマンド: フロントの依存は `corepack pnpm@9 install --ignore-scripts`（pnpm が無い環境でも corepack で足りる。
  lefthook の hooks は入れていない）。GUI は `corepack pnpm@9 exec tauri dev` / `... tauri build --no-bundle`。
  Rust は `cargo test --workspace`（core / mcp）と `cd src-tauri && cargo test`（GUI の殻、独立 project）
- **`src-tauri/Cargo.toml` にもルートと同じ `[patch.crates-io]` がある**（独立 project なのでルートの patch が効かない）。
  merman-core の patch を外す時は両方消す
- **merman-core は `vendor/` の修正版を使っている**（日本語のノード ID を受け付けるため）。
  上流が同等の修正を出したら消す。経緯は `vendor/merman-core/LORELEI_PATCH.md`、上流 PR は [Latias94/merman#146](https://github.com/Latias94/merman/pull/146)
- 同梱フォントのライセンス文は `crates/lorelei_core/fonts/OFL.txt`（google/fonts の ofl/notosansjp から取得）。
  配布物の `licenses/` に同梱し、About（ヘルプ → Lorelei について）に一覧を出す
- フォーク元の vitest は、この環境では変更と無関係に 2〜3 件が時間切れで落ちる（failures #3）。
  「全件緑」を完了の条件にせず、落ちたテストが変更前と同じ顔ぶれかで判断する
- 同梱フォントは `scripts/build-fonts.py` で Noto Sans JP の可変フォントから切り出す（手順と理由はスクリプト冒頭）
