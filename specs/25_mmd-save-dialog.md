# Spec: コード生成の「ダウンロード」（.mmd）で保存先を尋ね、保存したことを知らせる

**ID**: 25
**Date**: 2026-10-14
**Status**: Draft（rev1。起票 → P0（コードと文書を読む下調べ。「P0 結果」）→ 査読 1 本を反映（「査読」）。D1〜D5 の裁定待ち）
**Branch**: 切らない（Phase 単位で main へ直接コミット）。この spec の変更はデスクトップ専用（`lib/desktop/`・`src-tauri/`・`crates/lorelei_core` の出力）と、フォーク元のファイルへのデスクトップの差し込みだけで、上流へ返す分は無い見込み

## Goal

spec 24 P3（配布ビルド）での利用者の言（2026-10-14）: 「コード生成ダイアログのダウンロードボタンです。こちらは今はイベントがあるのでしょうか？」
「ああ、ダウンロード押した後に保存されたという通知がないから、なにが起こったかわからないのかな」。

デスクトップのコード生成のダイアログの「ダウンロード」（`.mmd`）を、同じダイアログの SVG・PNG・PDF のボタンと同じく、**保存先を尋ね、保存したら知らせる**ようにする。Web 版（GitHub Pages）は今のまま。

## 現況（2026-10-14、コードを読んで確かめた。行番号は査読でも確かめた）

- **`.mmd` を落とすのは 2 か所だけ**（`app/`・`features/`・`components/`・`lib/` を `.download =`・`createObjectURL` で探した。テストを除く）:
  - フローチャート: `features/flowchart/components/mermaid/download-modal.tsx:61-69` の `downloadMermaidCode`。Blob の URL を `<a download="flowchart.mmd">` に入れ、`document.body` に付けて `click()` し、外す（URL は revoke しない）
  - ER 図: `features/er-diagram/components/panel/er-diagram-panel.tsx:56-64` の `handleDownload`（ダイアログ `er-diagram-mermaid-modal.tsx:51-59` の `onDownload` で呼ぶ）。`<a download="er-diagram.mmd">` を **DOM に付けずに** `click()` し、すぐ `URL.revokeObjectURL`
- **デスクトップでは WebView2・WKWebView の既定の振る舞いになっている**:
  - Lorelei は Tauri の `on_download` を設定していない（`src-tauri/` を探した）。主の窓は `tauri.conf.json` の `app.windows` から作られる（`label: main`・`visible: false`。コードでは作っていない）
  - **Windows**: wry 0.55.1 は `download_started_handler` も `download_completed_handler` も無い時、WebView2 の `DownloadStarting` に何も登録しない（`wry/src/webview2/mod.rs` の「Download handler」の節）。
    保存先を尋ねずに「ダウンロード」フォルダへ保存される。spec 24 P3 の間に `flowchart (17).mmd`〜`(20).mmd`・`er-diagram.mmd`〜`(3).mmd` のように押した回数だけ増え、`.mmd` は 25 個たまっていた（中身はコード生成のコードと同じ）。
    利用者は保存したことに気付かなかった（WebView2 の文書では、`DownloadStarting` を扱わなければ既定のダウンロードの吹き出しが出るとあるが、利用者の目には「何が起こったか分からない」だった）
  - **macOS**: wry はハンドラが無い時、ダウンロードを取り消す（`wry/src/wkwebview/navigation.rs` の 68〜73 行のあたり: `has_download_handler` が無ければ `WKNavigationActionPolicy::Cancel`）。**今の macOS では押しても何も起きないはず**（実物では確かめていない）
  - Linux（WebKitGTK）は確かめていない
- **SVG・PNG・PDF のボタン**（`lib/desktop/export-buttons.tsx`、デスクトップだけ出る）: `exportDiagram(code, format, fileStem)`（`lib/desktop/tauri.ts:20-27`）→ Rust の `export_diagram`（`src-tauri/src/desktop.rs:11-35`）。
  rfd の保存ダイアログを別スレッド（`spawn_blocking`）で、親を窓にして出す（題「SVG として保存」、既定の名前 `{fileStem}.{ext}`、種類の絞り込み）→ 取り消しは `null` → 描いて `write_output`（絶対パス・拡張子の一致・一時ファイルからの置き換え）。
  フロントは保存したら「保存しました」とパス（`success`）、失敗は閉じるまで残る `error` の知らせ、取り消しは何も出さない。押している間は 3 つとも押せない。
  保存ダイアログを rfd にしているのは、Tauri の plugin-dialog を足して JS に権限を増やさないため（`desktop.rs:1-2`、CLAUDE.md のアーキテクチャ）
- **`write_output`**（`crates/lorelei_core/src/output.rs:30-`）は拡張子を `RenderFormat`（svg / png / pdf）で確かめる。`RenderFormat` は MCP の `render` の入出力の enum でもある（`render.rs:15`・`lorelei_mcp/src/lib.rs:196`・data_contract `RenderFormat`・`OutputPathPolicy`）
- **Web 版**: ブラウザがダウンロードを扱う（保存先の確認や知らせはブラウザの設定しだい）

## 言葉の定義

```text
ダウンロードのボタン = コード生成のダイアログの「ダウンロード」(青)。.mmd (Mermaid のテキスト) を落とす。フォーク元の部品
書き出しのボタン     = 同じダイアログの SVG / PNG / PDF (lib/desktop の ExportButtons)。デスクトップだけ
保存ダイアログ       = OS の「名前を付けて保存」(rfd)。書き出しのボタンが今出すもの
知らせ               = yamada-ui の notice (画面の隅に出る「保存しました」)
```

## 決めること

### D1. 直し方

- **案 A: Rust で `on_download` を設定し、その中で保存ダイアログを出す** — **使えない**。
  WebView2 は「イベントの中で同期でモーダルの UI を出すのは再入で、対応していない」と明記している（「P0 結果」の 2）。wry のダウンロードのハンドラは `DownloadStarting` の中で同期に呼ばれ、deferral を使わない。
  別スレッドで保存ダイアログを出してハンドラの中で待つ形も、同じ文書の「Block the UI thread」（UI のスレッドのメッセージポンプを止めると WebView2 のイベントが回らない）で使えない
- **案 A'（フォーク元を変えない）: ダウンロードを Rust で受けてから、イベントの後に保存ダイアログを出す** — WebView2 の規則は守れる。形は 2 つ:
  ① `on_download` で一時フォルダへ保存させ、終わった後に別スレッドで保存ダイアログを出して移す（主の窓を `tauri.conf.json` ではなくコードで作り直す: `create: false` + `WebviewWindowBuilder::from_config(…).on_download(…)`）。
  ② 窓は作り直さず、`setup` で `with_webview` から WebView2 の `DownloadStarting` を `GetDeferral` 付きで自前で登録する（Windows だけの unsafe な COM）。
  どちらも、保存したことをフロントへ知らせるイベント（`lib/desktop` で受ける）が要り、**OS ごとに扱いが要る**（macOS の WKWebView は wry がハンドラの有無で取り消すかを決めるので、別の手当て）。①は一時ファイルの後始末（取り消し・失敗・アプリを閉じる時）も持つ
- **案 B（推奨）: `lib/desktop` に `.mmd` を保存する口を足し、フォーク元の 2 つのダイアログのボタンがデスクトップの時だけ呼ぶ** — 書き出しのボタンと同じ保存ダイアログ・書き込みの規則・知らせを使い、**3 つの OS を同じ経路で直せる**（Tauri のコマンドで rfd を出す今の経路は OS に依らない）。
  呼ぶ所は 2 つのダイアログ（`download-modal.tsx`・`er-diagram-mermaid-modal.tsx`。どちらも既に `ExportButtons` を `@/lib/desktop` から差し込んでいる = 差し込みのファイルは増えない）。
  Web 版では今の Blob のダウンロードに戻る（下の D4 の「口の約束」）
- 案 C: Blob のダウンロードを JS で横取りする — フォーク元を変えずに済む形として、外枠が文書のクリックを拾う形は使えない（ER 図の `<a>` は DOM に付けずに `click()` するので文書まで事件が届かない）。
  `HTMLAnchorElement.prototype.click` を差し替え、`URL.createObjectURL` で Blob を控えれば、DOM に付けない `<a>` も revoke の後も取れるが、**ブラウザの大域の部品を差し替える**脆さ（ほかのライブラリ・将来のフォーク元の変更への影響が読めない）を持つので採らない
- Tauri の plugin-dialog を足す形は、上の方針（JS に権限を増やさない）で除く

推す理由: 案 B は今動いている書き出しの経路（spec 24 P3 で利用者が使った）をそのまま使い、新しい仕組みが要らず、macOS で今何も起きない穴も同じ直しで塞がる。
案 A' はフォーク元を 1 行も変えない代わりに、ダウンロードの受け方・イベント・OS ごとの手当てを新しく持つ。

### D2. Rust の口（案 B の時）

- **案 B-1（推奨）: `export_diagram` の `format` に `mmd` を足す** — 描かずに `source` をそのまま UTF-8 で書く（今の Blob と同じく検査しない = 描けないコードでも保存できる）。
  保存ダイアログ・題（「MMD として保存」）・既定の名前・種類の絞り込み・上書きの確認（OS のダイアログ）・一時ファイルからの置き換えを 1 本の経路にする。
  **`write_output` は `RenderFormat`（MCP の `render` の enum）に結び付いているので、`RenderFormat` に `Mmd` は足さない**（足すと MCP の `render` の入力と data_contract `RenderFormat` に及ぶ）。
  `write_output` の拡張子の確かめを「期待する拡張子」で受ける形に分け、`RenderFormat` の版はそれを呼ぶ（P1）。data_contract `OutputPathPolicy`（今は「MCP 経由」「.svg / .png / .pdf」）も、GUI の書き出しの `.mmd` を含む形に書き直す
- 案 B-2: 新しいコマンド（`save_mermaid` など）— 書き出しと保存の規則が 2 本になる

### D3. 既定のファイル名

- **案 A（推奨）: 今と同じ `flowchart.mmd`・`er-diagram.mmd`**（書き出しのボタンの `fileStem` と同じ）
- 案 B: 図の一覧の題名（「spec24 P3 ER 図」など）— ファイル名に使えない文字の扱いが要る。書き出しのボタンも同じ形にするなら別の spec（スコープ外）

### D4. 知らせと口の約束

- **知らせは書き出しのボタンと同じ（推奨）** — 保存したら「保存しました」とパス、失敗は閉じるまで残るエラー、取り消しは何も出さない
- **口の約束（推奨）**: `lib/desktop/index.ts` から保存の口（フック）を export する。フックは「`.mmd` を保存する関数」を返し、その関数は**押した時に** `isTauri()` を見て、デスクトップなら保存ダイアログ（`exportDiagram(code, "mmd", fileStem)`）と知らせ、Web 版なら今の Blob のダウンロード（呼ぶ側が渡す）に戻る。
  描く物は変えないので、判定はマウントの後でなく押した時でよい（`ExportButtons` がマウントの後に判定するのは、ボタンを出すかどうかを出し分けて静的書き出しの HTML と食い違わないようにするため）。
  `useDesktopActions` は Context で外枠の中かを見るが、こちらは外枠の外（Web 版）でも Blob に戻る点が違う
- **二度押し**: 保存ダイアログを出している間（取り消し・保存まで）は、もう一度押しても何もしない（推奨）。保存ダイアログは窓を親にしたモーダルなので、出た後は窓を押せない。出るまでの間の二度押しだけを止める。
  書き出しのボタンと一緒に止めるか（ダウンロードを押している間は SVG なども押せない）は P1 で決める（ER 図のダイアログは props を足すことになる）

### D5. ボタンの名前と並び

- **推奨: 変えない**（「ダウンロード」のまま、今の位置）。Web 版と同じ部品で、押した時の振る舞いだけがデスクトップで変わる
- 案: デスクトップでは名前を「MMD」にして書き出しのボタンと並べる — フォーク元の見た目をデスクトップで出し分けることになる

## Phase

- **P0（リサーチ。着地, 「P0 結果」）**: コードは変えない。D1〜D5 を確定させる材料を集め、推奨を出す
- **P1（デスクトップ。案 B・B-1 の時）**:
  - data_contract（`GuiCommands.export_diagram` の `format` に `mmd`、`OutputPathPolicy`、`lib/desktop` の保存の口）を先に直す
  - Rust: `write_output` の拡張子の確かめを「期待する拡張子」で受ける形に分け、`export_to` が `mmd` を描かずに書く。`parse_format` に `mmd`。
    テスト（Red → Green）: 中身がバイト単位で同じ・描けないコードでも保存できる・拡張子の違うパスは拒む・上書きは今と同じ。既存のテスト（`crates/lorelei_core/tests/core.rs` の出力の 2 件・`src-tauri/src/lib.rs` の `export_writes_each_format_and_overwrites_the_chosen_file`）は今のまま通る
  - `lib/desktop`: 保存の口。テスト（Red → Green）は `@/lib/desktop/tauri` を静的に模擬する（failures #14）。
    デスクトップでは `export_diagram` が `format: "mmd"`・既定の名前・コードそのもので呼ばれ、保存したら知らせ、失敗したらエラーの知らせ、取り消しは何も出さず、Blob のダウンロード（`URL.createObjectURL`）は起きない。二度押しは 1 回だけ呼ぶ。
    Web 版（`isTauri()` が偽）は今の Blob のダウンロード
  - フォーク元の 2 つのダイアログから呼ぶ。既存のテストの形に注意: `download-modal.test.tsx` は `URL` を丸ごと差し替えている（Web の経路のまま通る）、`er-diagram-mermaid-modal.test.tsx` の「ダウンロードは今どおり onDownload を呼ぶ」は Web の経路のまま通るはず。`ExportButtons` には今テストが無い
  - CLAUDE.md の差し込みの台帳を更新（ファイルは増えない）。LORELEI.md の既知の制約（spec 24 P3 で足した「確認も知らせも無く保存」）を外し、「GUI の図の一覧」の節の書き出しの説明に `.mmd` を足す
  - `tauri dev` で保存ダイアログが出るかは、画面を押せる時だけ（computer-use の許可が下りなければ P2）
- **P2（配布ビルド）**: 利用者がフローチャートと ER 図で「ダウンロード」を押し、保存ダイアログ・取り消し・上書きの確認・知らせ・中身を確かめる

## 受け入れ条件

1. デスクトップで「ダウンロード」を押すと保存ダイアログが出る（既定の名前 `flowchart.mmd` / `er-diagram.mmd`、種類 MMD）。保存すると「保存しました」とパスが出て、中身はコード生成のコードと一字一句同じ（テーマの frontmatter も）
2. 保存ダイアログで取り消すと、何も保存せず、知らせも出ない
3. 押す前と後で、「ダウンロード」フォルダの `.mmd` の数が変わらない（黙って保存されない）
4. 既にあるファイルを選ぶと OS の上書きの確認が出る（今の書き出しのボタンと同じ）。保存に失敗した時はエラーの知らせ（単体テスト）
5. 描けない（文法の誤りのある）コードでも保存できる（今の Blob と同じ。単体テスト）
6. Web 版（GitHub Pages）は今のまま（ブラウザのダウンロード）。vitest で Web の経路（`isTauri()` が偽）を通して確かめる
7. SVG・PNG・PDF のボタンは今のまま
8. 確かめるのは Windows の配布ビルド。macOS・Linux は同じ経路（Tauri のコマンドで rfd）だが実物では確かめない

## スコープ外

- 図の一覧の題名をファイル名にすること（書き出しのボタンも含めて、D3 の案 B）
- 「ダウンロード」フォルダにもうたまった `.mmd` の片付け（利用者のファイル）
- コピーのボタンの知らせ（今のままで、別の話）
- Web 版のダウンロードの振る舞い

## P0 結果（2026-10-14）

**コードは変えていない**。確かめた道具: フォーク元と `lib/desktop`・`src-tauri` の grep、wry 0.55.1・tauri 2.11.6・tauri-utils のソース（cargo の registry）、Microsoft の WebView2 の文書、spec 24 P3 で「ダウンロード」フォルダにたまったファイル。

| 調べたこと | 分かったこと |
|---|---|
| 1. `.mmd` を落とす所 | フォーク元の 2 か所だけ（現況）。ほかに Blob のダウンロードは無い |
| 2. WebView2 のイベントの中でモーダルを出せるか | **出せない**。「Threading model for WebView2 apps」の Reentrancy: WebView2 のイベントの中で同期で入れ子のメッセージループかモーダルの UI を作ると再入になり、対応しておらず、ハンドラが積まれたまま残る。後回しにする（イベントが終わった後に出す）か deferral を使う。同じ文書の「Block the UI thread」で、ハンドラの中で別スレッドを待つ形も使えない |
| 3. wry のダウンロードのハンドラ | Windows: `DownloadStarting` の中で同期に `download_started_handler(uri, &mut path)` を呼び、戻り値で `SetResultFilePath`・`SetHandled` か `SetCancel` をする。deferral は使わない。wry は `NewWindowRequested` では同じ文書を挙げて deferral で後回しにしている（`webview2/mod.rs` の 762 行のあたり）→ 案 A は使えない。macOS: ハンドラが無ければダウンロードを取り消す（`wkwebview/navigation.rs`） |
| 4. `on_download` を付けるには | `WebviewBuilder::on_download` は窓を作る時の設定。主の窓は `tauri.conf.json` から作られているので、`create: false` にして `setup` で `WebviewWindowBuilder::from_config(…)` から作り直す形になる（tauri-utils の `WindowConfig.create` の説明の例）。窓を作り直さずに `with_webview` から WebView2 に直接登録する形もある（Windows だけ）→ 案 A' の重さ |
| 5. 今の振る舞い | Windows: 保存先を尋ねずに「ダウンロード」フォルダへ保存され、同じ名前があれば ` (n)` が付く（spec 24 P3 の 25 個）。macOS: 押しても何も起きないはず（ソースから。実物は未確認） |
| 6. 書き出しのボタンの経路 | 保存ダイアログは Tauri のコマンドの中で別スレッドに出しているので、WebView2 のイベントの外。spec 24 P3 で利用者が SVG・PNG・PDF を保存して開けた |
| 7. 案 C（JS の横取り） | 文書のクリックを拾う形は、ER 図の `<a>` が DOM に付かないので届かない。`HTMLAnchorElement.prototype.click` と `URL.createObjectURL` を差し替えれば取れるが、大域の差し替え |
| 8. `write_output` | 拡張子の確かめが `RenderFormat`（MCP の `render` の enum）に結び付いている → 案 B-1 は確かめを「期待する拡張子」で受ける形に分ける（`RenderFormat` は変えない） |

## 査読（2026-10-14、1 本。rev0 → rev1）

指摘を確かめてから反映した（macOS の振る舞いは wry のソースで、テストの形はファイルで確かめた）。

- **採った**: `write_output` が `RenderFormat` に結び付いている（D2・P1 に直し方と `OutputPathPolicy`・既存のテストを足した）/ macOS では wry がダウンロードを取り消す（現況・推す理由・受け入れ条件 8）/
  案 C の退け方の理由（「中身も読めない」は誤りで、大域の差し替えの脆さが理由）/ 案 A' は窓を作り直さない形もある（決め手を OS ごとの手当てとイベントに直した）/ plugin-dialog を方針で除いていること /
  口の約束（Web 版では Blob に戻る、判定は押した時、`index.ts` から export、二度押し）/ 呼ぶ所を 2 つのダイアログにする（対称になり、差し込みのファイルも増えない）/
  テストの形（`@/lib/desktop/tauri` の静的な模擬、`URL` の差し替え、`onDownload` のテスト）/ 「知らせも出ない」は利用者の観察として書く / 受け入れ条件 3〜8 を確かめられる形に
- **案 A を退けた理由**（WebView2 の再入）は妥当と確かめられた。「別スレッドを待つ形も使えない」を足した
- 「現況」「P0 結果」の rev0 の事実と行番号は、査読でも全部合っていた

### 推奨（P0・査読の後）

- **D1: 案 B**（`lib/desktop` の保存の口を、フォーク元の 2 つのダイアログのボタンから呼ぶ）
- **D2: 案 B-1**（`export_diagram` の `format` に `mmd`。`RenderFormat` は変えず、`write_output` の拡張子の確かめを分ける）
- **D3: 案 A**（`flowchart.mmd`・`er-diagram.mmd`）
- **D4: 書き出しのボタンと同じ知らせ**。口は押した時に判定し、Web 版は Blob に戻る。保存ダイアログが出るまでの二度押しは止める
- **D5: ボタンの名前と並びは変えない**
