# Lorelei

**AI が書いた Mermaid を、そのまま使える図にする。**

[English](README.md) | 日本語

[![Release](https://img.shields.io/github/v/release/betyourluck/Lorelei)](https://github.com/betyourluck/Lorelei/releases)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Web%20%E7%89%88-blue)](https://betyourluck.github.io/lorelei-web/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Lorelei は **MCP サーバー**を内蔵したデスクトップアプリ（Rust + Tauri 2）です。Claude Code などの AI から Mermaid を受け取り、

- **検査**します（文法と、エディタで開くと何が残り何が省かれるか）
- **SVG / PNG / PDF に書き出し**ます。日本語は同梱フォント（Noto Sans JP）で描くので、端末のフォントに左右されません
- **GUI エディタで開き**、人が配置やラベルを手で直せます
- 人が直した図を、AI が**読み戻し**・**書き換え**できます

図の素材（ソースコード・DB のスキーマ）を読むのは AI の側です。Lorelei は DB にもリポジトリにも繋がず、秘密を置く欄も持ちません。

```text
Claude Code ──MCP (HTTP、127.0.0.1:39642、Bearer トークン)──▶ Lorelei（デスクトップアプリ）
                                                              ├─ 検査・書き出し（SVG / PNG / PDF）
                                                              └─ GUI エディタ（フローチャート・ER 図）⇄ read_diagram / update_diagram
```

## ブラウザで試す

**[ライブデモ → betyourluck.github.io/lorelei-web](https://betyourluck.github.io/lorelei-web/)**

デモはエディタだけです。「インポート」に Mermaid を貼って取り込み、フローチャート（サブグラフの枠を含む）と ER 図を編集し、「コード生成」で結果をコピーできます。
保存はされません。MCP サーバー・図の一覧・SVG / PNG / PDF の書き出しはデスクトップ版だけの機能です。

## インストール

[Releases](https://github.com/betyourluck/Lorelei/releases) からインストーラーを取ってください。

| OS | ファイル | 補足 |
|---|---|---|
| Windows | `*_x64-setup.exe` か `*_x64_en-US.msi` | コード署名をしていないので、初回の起動で SmartScreen の確認が出ます（「詳細情報」→「実行」） |
| macOS（Apple シリコン） | `*.dmg` | 署名・公証済み |
| Linux | `*.AppImage` / `*.deb` / `*.rpm` | |

**手元で確かめている OS は Windows だけです。** macOS・Linux の版は GitHub Actions で作れることまでを確かめたもので、実機では動かしていません。動いた・動かなかったの報告を歓迎します。

## Claude Code から使う

MCP サーバーは **Lorelei の窓の中**で動き、`127.0.0.1:39642` だけで待ち受けます。Lorelei を開いている間だけ使えます。

1. Lorelei を起動する。タイトルバーの「MCP」の点が緑なら待ち受け中です
2. 「MCP」を押して設定を開き、「登録コマンドをコピー」を押す
3. Claude Code を使うフォルダで、コピーしたコマンドを実行する:
   ```bash
   claude mcp add --transport http lorelei http://127.0.0.1:39642/mcp --header "Authorization: Bearer <トークン>"
   ```
   どのフォルダからでも使うなら `--scope user` を足します
4. Claude Code を起動し直すか、`/mcp` でつなぎ直す

### ツール

| ツール | すること |
|---|---|
| `validate` | 文法を検査する。GUI エディタで開けるか、開くと何が省かれるかも返す |
| `render` | SVG / PNG / PDF に描画する（ファイルは `output_path` へ）。縮小した PNG のプレビューも返す |
| `open_in_editor` | フローチャートか ER 図をエディタで開く。図の一覧に新しい 1 件として足す |
| `list_diagrams` | エディタの図の一覧を返す |
| `read_diagram` | 人が手で直した分も含めて、図を Mermaid で読む |
| `update_diagram` | 図の中身を差し替える。AI が読んだ後に人が直していれば、書かずに断る |

頼み方の例:

- 「この DB のスキーマから ER 図を Mermaid で書いて、Lorelei で検査してから `D:/out/schema.pdf` に書き出して」
- 「`src/order.rs` の処理の流れをフローチャートにして、Lorelei のエディタで開いて」
- 「Lorelei で直した図を読んで、`src/order.rs` の処理をその流れに合わせて」

## 制約

- GUI エディタで開けるのは**フローチャートと ER 図**だけです。`style`・`classDef` などはエディタでは省かれます（描画・書き出しでは省きません）
- **WSL 上の Claude Code** からはファイルに書き出せません（`/home/...` のようなパスは Windows では絶対パスになりません）
- エディタのプレビューは mermaid.js、書き出しは [merman](https://github.com/Latias94/merman)（Rust）で描きます。どちらも Mermaid 11.17.2 に合わせていますが、配置や字形は少し違うことがあります

ツールの詳しい動き・図の一覧の使い方・既知の制約の全部は [LORELEI.md](LORELEI.md) にあります。

## ソースからビルドする

必要なもの: Rust 1.95 以上、Node.js（corepack で pnpm 9 を使う）

```bash
corepack pnpm@9 install --ignore-scripts
```

```bash
corepack pnpm@9 exec tauri build --no-bundle
```

`src-tauri/target/release/lorelei.exe`（Windows）ができます。決定事項は [specs/](specs/)、型とツールの入出力は [data_contract.yaml](data_contract.yaml) にあります。

## クレジットとライセンス

Lorelei は **[illionillion/mermaid-editor](https://github.com/illionillion/mermaid-editor)**（MIT）のフォークです。Lorelei の GUI は、この Web の Mermaid フローチャート / ER 図エディタの上に作っています。
デスクトップに依らない直しは、上流へ返せるようにコミットを分けています。

- Lorelei / mermaid-editor — MIT（[LICENSE](LICENSE)）
- [merman](https://github.com/Latias94/merman) — MIT OR Apache-2.0
- [mermaid.js](https://github.com/mermaid-js/mermaid) — MIT
- Noto Sans JP — SIL Open Font License 1.1（[OFL.txt](crates/lorelei_core/fonts/OFL.txt)）

不具合の報告・質問は [Issues](https://github.com/betyourluck/Lorelei/issues) へ。
