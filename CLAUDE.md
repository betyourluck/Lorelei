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
- **`crates/lorelei_mcp`**: stdio の MCP サーバー（rmcp）のライブラリ。ツールは 3 本。`src-tauri` の `main()` が
  `tauri::Builder` より前に `--mcp` を判定して呼ぶ。**stdout は JSON-RPC 専用、ログは stderr**
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
| 名詞・型・MCP ツールの入出力 | [data_contract.yaml](data_contract.yaml) |
| 決定事項と Phase 計画 | `specs/NN_*.md`（起票 → 査読 → rev 改訂 → Phase 単位で main へ直接コミット） |
| 踏んだ罠（症状 → 真因 → 処方 → 一般化） | [failures.md](failures.md) |
| フォーク元の開発手順・テスト・VRT | [DEVELOPMENT.md](DEVELOPMENT.md) / [TESTING.md](TESTING.md) |

## 現状

- 2026-09-24: [spec 01](specs/01_tauri-mcp-foundation.md) rev2 承認済み。次は P0 実測。コードはフォーク元のまま
- merman 0.8.0-alpha.6 で日本語のフローチャートと ER 図を SVG / PNG / PDF に出力できることを確認済み
  （scratchpad の使い捨て PoC。日本語が BIZ UDGothic Bold へ代替される問題あり → spec 01 D3）
