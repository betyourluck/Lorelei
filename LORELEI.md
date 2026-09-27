# Lorelei — AI が書いた Mermaid を、そのまま使える図にする

Lorelei は [illionillion/mermaid-editor](https://github.com/illionillion/mermaid-editor)（MIT）のフォークに、
Rust + Tauri 2 のデスクトップアプリと **MCP サーバー**を足したものです。

- Claude Code などの AI から MCP で Mermaid を渡すと、**検査**し、**SVG / PNG / PDF に書き出し**、**GUI エディタで開いて**人が手直しできます
- 日本語は同梱フォント（Noto Sans JP）で描くので、端末のフォントに左右されません
- Lorelei は DB やリポジトリには繋がりません。図の素材（DB のスキーマ・コード）は AI 側が読み、Mermaid にして渡します

設計と決定事項は [specs/](specs/)（01: Tauri 化と MCP、02: デスクトップの外枠と図の一覧、03: MCP を GUI の中の HTTP へ）、型とツールの入出力は [data_contract.yaml](data_contract.yaml) にあります。

## ビルド（Windows で確認）

必要なもの: Rust（1.95 以上）、Node.js（corepack で pnpm 9 を使う）

```bash
corepack pnpm@9 install --ignore-scripts
```

```bash
corepack pnpm@9 exec tauri build --no-bundle
```

`src-tauri/target/release/lorelei.exe` ができます。

## Claude Code から使う

MCP サーバーは **Lorelei の窓の中**で動きます（`127.0.0.1:39642/mcp` だけで待ち受け、他の端末からはつながりません）。
**Lorelei を開いている間だけ使えます。**

1. `lorelei.exe` を起動する（MCP の待ち受けは既定で ON。タイトルバーの「● MCP」が緑なら待ち受け中）
2. タイトルバーの歯車（または「● MCP」）から設定を開き、「登録コマンドをコピー」を押す
3. **Lorelei を使うプロジェクトのフォルダで**、コピーしたコマンドを実行する:
   ```bash
   claude mcp add --transport http lorelei http://127.0.0.1:39642/mcp --header "Authorization: Bearer <トークン>"
   ```
   登録は Claude Code を開くフォルダごとです（`~/.claude.json` のそのフォルダの欄に入り、リポジトリには入りません）。
   どのフォルダからでも使うなら `--scope user` を足します
4. Claude Code を起動し直すか、`/mcp` でつなぎ直す

トークンを作り直したら、登録し直してください。Lorelei を後から起動した時は、Claude Code が自動でつなぎ直します
（つながらない時は `/mcp` から）。設定は `%APPDATA%\jp.outcasts.lorelei\mcp_server.json` にあります。

### ツール

| ツール           | すること                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `validate`       | 文法を検査する。GUI エディタで開けるか、開くと何が省かれるかも返す                                                        |
| `render`         | SVG / PNG / PDF に描画する。png / pdf は `output_path`（絶対パス）に書き出す。描画結果の縮小 PNG も毎回画像で返す（不要なら `preview: false`） |
| `open_in_editor` | 開いている Lorelei のエディタで開く（flowchart と erDiagram）。届いた図は左の図の一覧に新しい 1 件として足され、開いている図は上書きしない。`title` で一覧での名前を付けられる（省略すると「AI の図 HH:MM:SS」）。作った図の `document_id` を返す |
| `list_diagrams`  | 図の一覧を返す（並びは GUI の一覧と同じ）。`open` が今開いている図、`unsaved` が最後の「保存」の後に変更がある図 |
| `read_diagram`   | 人が GUI で直した今の図を Mermaid で読む。`id`（`list_diagrams` の id か `open_in_editor` の `document_id`）を省くと今開いている図。届いた時の原文は `include_original: true` で読める |

### GUI の図の一覧

- 左の一覧の 1 件が 1 枚の図です。「新規作成」でフローチャートか ER 図を足します。名前はダブルクリックで変えます。
  ごみ箱のボタンは `%APPDATA%\jp.outcasts.lorelei\trash\` へ移すだけで、消しはしません
- 編集は裏で自動保存されます（落ちても失いません）。一覧の並びは **「保存」（Ctrl+S）を押した時刻**で決まり、
  見たり編集したりしても動きません。最後の「保存」より後に変更がある図には ● が付きます
- AI から届いた図とインポートした図は、届いた原文をそのまま残しています（エディタで表現できない要素が省かれても、原文は失いません）

頼み方の例:

- 「この DB のスキーマから ER 図を Mermaid で書いて、Lorelei で検査してから `D:/out/schema.pdf` に書き出して」
- 「`src/order.rs` の処理の流れをフローチャートにして、Lorelei のエディタで開いて」
- 「Lorelei で直した図を読んで、`src/order.rs` の処理をその流れに合わせて」（今開いている図を `read_diagram` で読む）

### 読み戻しの注意

- 読むのは保存されたファイルです。GUI での編集は約 1 秒後に保存されるので、直した直後に頼むと最後の編集が入らないことがあります
- `read_diagram` の Mermaid はエディタが書き出したものです。エディタで表現できない要素（subgraph・style・classDef など）は落ちています（図の向きと FK は残ります）。
  AI が送った原文は `include_original: true` で読めます
- AI から届いてまだエディタに載っていない図は、`source` が空で返ります（GUI でその図を開くと埋まります）

## 既知の制約

- **WSL 上の Claude Code からは使えません**（`/home/...` のようなパスは Windows では絶対パスにならず、書き出しを拒否します）
- GUI エディタで開けるのは flowchart と erDiagram だけです。subgraph・classDef・style などエディタで表現できない要素は省かれ、
  MCP の戻り値と GUI の通知でその件数を知らせます（描画・書き出しは省かずに行います）
- 長いラベルの折り返しで、行頭に「、」が来ることがあります（禁則処理がありません）
- Mermaid の描画には [merman](https://github.com/Latias94/merman) を使っています。日本語などのノード ID を受け付けるよう修正した版を
  同梱しています（[vendor/merman-core/LORELEI_PATCH.md](vendor/merman-core/LORELEI_PATCH.md)。修正は上流にマージ済み: Latias94/merman#146。
  crates.io に新しい版が出たら同梱をやめます）

## ライセンス

- Lorelei / mermaid-editor — MIT（[LICENSE](LICENSE)）
- merman — MIT OR Apache-2.0
- Noto Sans JP — SIL Open Font License 1.1（[crates/lorelei_core/fonts/OFL.txt](crates/lorelei_core/fonts/OFL.txt)）
