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
| `open_in_editor` | 開いている Lorelei のエディタで開く（flowchart と erDiagram。ノードの無い図は開けない）。届いた図は左の図の一覧に新しい 1 件として足され、開いている図は上書きしない（既存の図を書き換えるのは `update_diagram`）。`title` で一覧での名前を付けられる（省略すると「AI の図 HH:MM:SS」）。作った図の `document_id` と `updated_at` を返す |
| `list_diagrams`  | 図の一覧を返す（並びは GUI の一覧と同じ）。`open` が今開いている図、`unsaved` が最後の「保存」の後に変更がある図 |
| `read_diagram`   | 人が GUI で直した今の図を Mermaid で読む。`id`（`list_diagrams` の id か `open_in_editor` の `document_id`）を省くと今開いている図。AI・インポートが最後に届けた原文は `include_original: true` で読める |
| `update_diagram` | 既存の図（`id`）の中身を、渡した Mermaid で丸ごと差し替える。名前・一覧の並び・同じ ID のノードの位置は保たれ、図の種類は変えられない。`expected_updated_at`（`read_diagram` 等が返した `updated_at`）は必須で、その後に人が直していれば書かずにエラーになる（読み直してから直す）。開いている図なら GUI の中身が載せ替わる。開いていない図はファイルだけ書き、`open: true` の時だけ開いて前に出す |

### GUI の図の一覧

- 左の一覧の 1 件が 1 枚の図です。「新規作成」でフローチャートか ER 図を足します。名前はダブルクリックで変えます。
  ごみ箱のボタンは `%APPDATA%\jp.outcasts.lorelei\trash\` へ移すだけで、消しはしません
- 編集は裏で自動保存されます（落ちても失いません）。一覧の並びは **「保存」（Ctrl+S）を押した時刻**で決まり、
  見たり編集したりしても動きません。最後の「保存」より後に変更がある図には ● が付きます
- AI から届いた図とインポートした図は、最後に届いた原文をそのまま残しています（エディタで表現できない要素が省かれても、原文は失いません）。
  AI が `update_diagram` で書き換える前の中身は `%APPDATA%\jp.outcasts.lorelei\history\` に 1 世代だけ残ります（GUI から戻す手段はありません。手で開いて使ってください）

頼み方の例:

- 「この DB のスキーマから ER 図を Mermaid で書いて、Lorelei で検査してから `D:/out/schema.pdf` に書き出して」
- 「`src/order.rs` の処理の流れをフローチャートにして、Lorelei のエディタで開いて」
- 「Lorelei で直した図を読んで、`src/order.rs` の処理をその流れに合わせて」（今開いている図を `read_diagram` で読む）
- 「Lorelei で開いている図に『検品』の工程を足して、同じ図に書き戻して」（`read_diagram` で読み、直して `update_diagram` で書き戻す）

### 読み戻しの注意

- 読むのは保存されたファイルです。GUI での編集は約 1 秒後に保存されるので、直した直後に頼むと最後の編集が入らないことがあります
- `read_diagram` の Mermaid はエディタが書き出したものです。エディタで表現できない要素（style・classDef など）は落ちています（図の向き・FK・フローチャートのサブグラフの枠と、枠を指す線・枠の中の `direction` は残ります）。
  AI が送った原文は `include_original: true` で読めます
- AI から届いてまだエディタに載っていない図は、`source` が空で返ります（GUI でその図を開くと埋まります）

### 書き換え（`update_diagram`）の注意

- 書き換えは丸ごと差し替えです。`read_diagram` で読んだ Mermaid を直して全体を渡してください（差分ではありません）
- `expected_updated_at` は必須です。`read_diagram` / `list_diagrams` / `open_in_editor` / 前の `update_diagram` が返した `updated_at` をそのまま渡します。
  その後に人が GUI で直していれば（ノードを動かしただけでも）書かずにエラーになるので、読み直してから直してください。AI が知らずに人の編集を消さないための仕組みです
- 止められないのは、書き換えの直前と直後の約 1 秒の編集です（自動保存の待ち時間。書き換え前の中身は `history/` に残ります）
- 開いていない図を書き換えると、GUI でその図を開くまで `read_diagram` は渡した Mermaid をそのまま返します（エディタで省かれる要素も残ったまま）

## 既知の制約

- **WSL 上の Claude Code からは使えません**（`/home/...` のようなパスは Windows では絶対パスにならず、書き出しを拒否します）
- GUI エディタで開けるのは flowchart と erDiagram だけです。classDef・style などエディタで表現できない要素は省かれ、
  MCP の戻り値と GUI の通知でその件数を知らせます（描画・書き出しは省かずに行います）
- フローチャートのサブグラフはエディタで枠になります（入れ子も。枠を指す線と、枠の中の `direction` も残ります）。ただし**枠とその中のノード・枠を結ぶ線**は省かれます
  （Mermaid の描画では長さ 0 の線になって見えず、それでいて枠の中の向きを変えるため）。
  中に何も無い枠は、Mermaid の描画（プレビュー・書き出し）では枠ではなく題を書いた四角いノードになります（mermaid.js と同じ。エディタとコード生成のダイアログで知らせます）。
  ER 図のサブグラフは今までどおり省かれます
- 枠の中の `direction` は、Mermaid の描画で**いつも効くわけではありません**。中のノードが枠の外と線でつながっている枠では書いた向きが使われず、
  外とつながらない、向きを書いていない枠は図と逆向き（`TD` の図なら横）に並びます（mermaid.js も書き出しの merman も同じ）。
  エディタは書いた向き（無ければ外側の向き）で並べ、描画と違う枠は見出しで知らせます
- 書き出し（merman）では、外とつながる枠を外のノードから指す線が、枠の縁まで届かず短く描かれることがあります（「コード生成」のプレビューの mermaid.js では届きます。条件は絞り切れていません）
- 長いラベルの折り返しで、行頭に「、」が来ることがあります（禁則処理がありません）
- Mermaid の描画には [merman](https://github.com/Latias94/merman) を使っています。日本語などのノード ID を受け付けるよう修正した版を
  同梱しています（[vendor/merman-core/LORELEI_PATCH.md](vendor/merman-core/LORELEI_PATCH.md)。修正は上流にマージ済み: Latias94/merman#146。
  crates.io に新しい版が出たら同梱をやめます）
- 「コード生成」のダイアログの右のプレビューは [mermaid.js](https://github.com/mermaid-js/mermaid) 11.17.2 で描いています。
  SVG / PNG / PDF の書き出しは merman（Rust）で描くので、**描き手が違います**。同じ 11.17.2 系ですが、配置・字形（プレビューは OS の書体、
  書き出しは同梱の Noto Sans JP）・ラベルの描き方（プレビューは mermaid.js の既定の HTML ラベル、書き出しは `htmlLabels: false`）が
  完全には一致しません。プレビューは「Mermaid としてどう描かれるか」の目安で、保存した画像そのものの写しではありません
- インポートは、貼った Mermaid に**1 行でも文法の誤りがあると全体を取り込みません**（誤りの行を示します。エディタの赤線とプレビューで取り込む前に分かります）。
  エディタで表現できない要素（style・枠とその中を結ぶ線など）は、エディタの下の「取り込むと消えるもの」と、行の黄色の印で取り込む前に知らせます
- ER 図の**列名・型**に空白や記号など Mermaid に書けない形があると、その列はコード生成のコードに書き出されません（入力欄が赤枠になり、コード生成のダイアログに一覧が出ます）。
  デスクトップでは保存する図からも落ちるので、その図を一覧から開き直すと、その列は消えています。テーブル名は空白や記号を含められます（`"…"` で囲んで書きます）。空のテーブル名は確定できません
- ラベルの `<b>` のような HTML は、Mermaid がそのまま HTML として扱います（`<br>` で改行できる代わりに、インポートで `<b></b>` のように整えられることがあります）

## ライセンス

- Lorelei / mermaid-editor — MIT（[LICENSE](LICENSE)）
- merman — MIT OR Apache-2.0
- Noto Sans JP — SIL Open Font License 1.1（[crates/lorelei_core/fonts/OFL.txt](crates/lorelei_core/fonts/OFL.txt)）
