# Spec: コード生成の「ダウンロード」（.mmd）で保存先を尋ね、保存したことを知らせる

**ID**: 25
**Date**: 2026-10-14
**Status**: Done（rev3。起票 → P0（コードと文書を読む下調べ。「P0 結果」）→ 査読 3 本を反映（「査読」）→ D1〜D6 を裁定（「裁定」）→ P1 着地（「P1 結果」、`9f9879c`）→ P2（配布ビルドで利用者、「P2 結果」）。**Done**）
**Branch**: 切らない（Phase 単位で main へ直接コミット）。変える所は `crates/lorelei_core` の出力（`output.rs`）・`src-tauri/`・`lib/desktop/` と、フォーク元の 2 つのダイアログへのデスクトップの差し込み。
上流へ返す分は無い見込み（フォーク元のファイルの変更は `@/lib/desktop` を呼ぶ差し込みだけ）

## Goal

spec 24 P3（配布ビルド）での利用者の言（2026-10-14）: 「コード生成ダイアログのダウンロードボタンです。こちらは今はイベントがあるのでしょうか？」
「ああ、ダウンロード押した後に保存されたという通知がないから、なにが起こったかわからないのかな」。

デスクトップのコード生成のダイアログの「ダウンロード」（`.mmd`）を、同じダイアログの SVG・PNG・PDF のボタンと同じく、**保存先を尋ね、保存したら知らせる**ようにする。Web 版（GitHub Pages）は今のまま。

## 裁定（2026-10-14、利用者。rev2 の後）

**推奨どおり**（「推奨どおりで、P1 に着手して下さい」）。

- **D1: 案 B** — `lib/desktop` の `useMmdDownload` を、フォーク元の 2 つのダイアログの「ダウンロード」から呼ぶ。デスクトップでは Web の落とし方を呼ばない
- **D2: 案 B-1** — `export_diagram` が `ExportKind` で振り分ける。`export_to` と `RenderFormat` は変えず、`.mmd` は `save_mmd`、`write_output` の中身を `write_file` に分ける
- **D3: 案 A** — `flowchart.mmd`・`er-diagram.mmd`
- **D4** — `useMmdDownload(fileStem, webDownload): { download, busy }`。押した時に判定し、知らせはフックが出す
- **D5** — 保存ダイアログは窓に 1 つだけ（4 つのボタンで共有）
- **D6** — ボタンの名前と並びは変えない

## 現況（2026-10-14、コードを読んで確かめた。行番号は査読でも確かめた）

- **`.mmd` を落とすのは 2 か所だけ**（`app/`・`features/`・`components/`・`lib/` を `.download =`・`createObjectURL` で探した。テストを除く）:
  - フローチャート: `features/flowchart/components/mermaid/download-modal.tsx:61-69` の `downloadMermaidCode`（同じファイルの「ダウンロード」の `onClick`）。Blob の URL を `<a download="flowchart.mmd">` に入れ、`document.body` に付けて `click()` し、外す（URL は revoke しない）
  - ER 図: `features/er-diagram/components/panel/er-diagram-panel.tsx:56-64` の `handleDownload`。ダイアログ `er-diagram-mermaid-modal.tsx:51-59` の「ダウンロード」の `onClick` が props の `onDownload` で呼ぶ。`<a download="er-diagram.mmd">` を **DOM に付けずに** `click()` し、すぐ `URL.revokeObjectURL`
- **デスクトップでは WebView2・WKWebView の既定の振る舞いになっている**:
  - Lorelei は Tauri の `on_download` を設定していない（`src-tauri/` を探した）。主の窓は `tauri.conf.json` の `app.windows` から作られる（`label: main`・`visible: false`。コードでは作っていない）
  - **Windows**: wry 0.55.1 は `download_started_handler` も `download_completed_handler` も無い時、WebView2 の `DownloadStarting` に何も登録しない（`wry/src/webview2/mod.rs` の「Download handler」の節）。
    保存先を尋ねずに「ダウンロード」フォルダへ保存される。spec 24 P3 の間に `flowchart (17).mmd`〜`(20).mmd`・`er-diagram.mmd`〜`(3).mmd` のように押した回数だけ増え、`.mmd` は 25 個たまっていた（中身はコード生成のコードと同じ）。
    利用者は保存したことに気付かなかった（WebView2 の文書では、`DownloadStarting` を扱わなければ既定のダウンロードの吹き出しが出るとあるが、利用者の目には「何が起こったか分からない」だった）
  - **macOS**: wry はハンドラが無い時、ダウンロードを取り消す（`wry/src/wkwebview/navigation.rs` の 68〜73 行のあたり: `has_download_handler` が無ければ `WKNavigationActionPolicy::Cancel`）。**今の macOS では押しても何も起きないはず**（実物では確かめていない）
  - Linux（WebKitGTK）は確かめていない
- **SVG・PNG・PDF のボタン**（`lib/desktop/export-buttons.tsx`、デスクトップだけ出る）: `exportDiagram(code, format, fileStem)`（`lib/desktop/tauri.ts:20-27`。`ExportFormat = "svg" | "png" | "pdf"`）→ Rust の `export_diagram`（`src-tauri/src/desktop.rs:11-35`）。
  `parse_format` が文字列を `RenderFormat` にし、rfd の保存ダイアログを別スレッド（`spawn_blocking`）で、親を窓にして出す（題「SVG として保存」、既定の名前 `{fileStem}.{ext}`、種類の絞り込み）→ 取り消しは `null` →
  `export_to(path, source, RenderFormat)` が描いて `write_output(path, format, bytes, true)`（絶対パス・拡張子の一致・一時ファイルからの置き換え）。
  フロントは保存したら「保存しました」とパス（`success`）、失敗は閉じるまで残る `error` の知らせ、取り消しは何も出さない。押している間は 3 つとも押せない（`busy` は `ExportButtons` の中だけの状態）。
  保存ダイアログを rfd にしているのは、Tauri の plugin-dialog を足して JS に権限を増やさないため（`desktop.rs:1-2`、CLAUDE.md のアーキテクチャ）
- **`write_output`**（`crates/lorelei_core/src/output.rs:30-`）は拡張子を `RenderFormat`（svg / png / pdf）で確かめ、誤りの `ExtensionMismatch { expected: &'static str }` も `RenderFormat::extension()` を載せる。
  `RenderFormat` は MCP の `render` の入出力の enum でもある（`render.rs:15`・`lorelei_mcp/src/lib.rs:196`・data_contract `RenderFormat`）。
  data_contract `OutputPathPolicy` は「MCP 経由のファイル書き出しの規則」で、「既存ファイルは overwrite=true の時だけ上書き」を含むが、GUI の書き出しは OS の保存ダイアログで確かめた後に `overwrite = true` で呼んでいる（契約に GUI の規則が書かれていない）
- 既存のテスト: `src-tauri/src/lib.rs` の `export_writes_each_format_and_overwrites_the_chosen_file`・`export_follows_the_theme_written_at_the_top_of_the_code` が `export_to(…, RenderFormat)` を呼ぶ。
  `crates/lorelei_core/tests/core.rs` の出力の 2 件が `write_output` を呼ぶ。`ExportButtons` にはテストが無い。`features/flowchart/__tests__/components/mermaid/download-modal.test.tsx` は `URL` を丸ごと差し替えている。
  `features/er-diagram/__tests__/er-diagram-mermaid-modal.test.tsx` に「ダウンロードは今どおり onDownload を呼ぶ」がある
- **Web 版**: ブラウザがダウンロードを扱う（保存先の確認や知らせはブラウザの設定しだい）

## 言葉の定義

```text
ダウンロードのボタン = コード生成のダイアログの「ダウンロード」(青)。.mmd (Mermaid のテキスト) を落とす。フォーク元の部品
書き出しのボタン     = 同じダイアログの SVG / PNG / PDF (lib/desktop の ExportButtons)。デスクトップだけ
保存ダイアログ       = OS の「名前を付けて保存」(rfd)。書き出しのボタンが今出すもの
知らせ               = yamada-ui の notice (画面の隅に出る「保存しました」)
Web の落とし方       = フォーク元の今の Blob + <a download> の処理 (downloadMermaidCode / onDownload)
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
- **案 B（推奨）: `lib/desktop` に `.mmd` を保存する口（D4 の `useMmdDownload`）を足し、フォーク元の 2 つのダイアログの「ダウンロード」の `onClick` から呼ぶ** —
  書き出しのボタンと同じ保存ダイアログ・書き込みの規則・知らせを使い、**3 つの OS を同じ経路で直せる**（Tauri のコマンドで rfd を出す今の経路は OS に依らない）。
  呼ぶ所は 2 つのダイアログ（`download-modal.tsx`・`er-diagram-mermaid-modal.tsx`。どちらも既に `ExportButtons` を `@/lib/desktop` から差し込んでいる = 差し込みのファイルは増えない）。
  **デスクトップでは Web の落とし方を呼ばない**（`<a>` を作らず `click()` に届かない = 「ダウンロード」フォルダへ黙って保存されない）。Web 版では Web の落とし方をそのまま呼ぶ
- 案 C: Blob のダウンロードを JS で横取りする — フォーク元を変えずに済む形として、外枠が文書のクリックを拾う形は使えない（ER 図の `<a>` は DOM に付けずに `click()` するので文書まで事件が届かない）。
  `HTMLAnchorElement.prototype.click` を差し替え、`URL.createObjectURL` で Blob を控えれば、DOM に付けない `<a>` も revoke の後も取れるが、**ブラウザの大域の部品を差し替える**脆さ（ほかのライブラリ・将来のフォーク元の変更への影響が読めない）を持つので採らない
- Tauri の plugin-dialog を足す形は、上の方針（JS に権限を増やさない）で除く

推す理由: 案 B は今動いている書き出しの経路（spec 24 P3 で利用者が使った）をそのまま使い、新しい仕組みが要らず、macOS で今何も起きない穴も同じ直しで塞がる。
案 A' はフォーク元を 1 行も変えない代わりに、ダウンロードの受け方・イベント・OS ごとの手当てを新しく持つ。

### D2. Rust の口と型の境界（案 B の時）

- **案 B-1（推奨）: コマンドは `export_diagram` のまま `format` に `"mmd"` を受け、中で描く種類と `.mmd` を振り分ける**。型と関数は次のとおり（**`RenderFormat` には足さない** — MCP の `render` の enum なので）:
  - `src-tauri/src/desktop.rs`: `enum ExportKind { Render(RenderFormat), Mmd }` と `parse_kind(&str) -> Result<ExportKind, String>`（今の `parse_format` を置き換える。`"svg" | "png" | "pdf" | "mmd"`、ほかは今と同じ「未対応の形式です」）。
    拡張子は `ExportKind::extension()`（`Render(f)` は `f.extension()`、`Mmd` は `"mmd"`）。保存ダイアログの題・既定の名前・種類の絞り込みはこの拡張子で作る（「MMD として保存」・`{fileStem}.mmd`・MMD）
  - **`export_to(path, source, RenderFormat)` は今のまま**（描く専用。署名を変えない）。**`.mmd` は新しい `save_mmd(path, source) -> Result<PathBuf, String>`** が、描かず・検査もせずに `source` をそのまま UTF-8（BOM なし）で書く（今の Blob と同じ = 描けないコードでも保存できる）。
    `export_diagram` は `ExportKind` で `export_to` か `save_mmd` を呼ぶ
  - `crates/lorelei_core/src/output.rs`: 今の `write_output` の中身を **`write_file(path, extension: &'static str, bytes, overwrite)`** に移し、`write_output(path, format, bytes, overwrite)` は `write_file(path, format.extension(), …)` を呼ぶだけにする（MCP と既存のテストは変わらない）。
    `save_mmd` は `write_file(path, "mmd", source.as_bytes(), true)`（上書きの確認は OS の保存ダイアログが済ませている。今の `export_to` と同じ）
  - **既存のテストは 1 行も変えずに通る**（`export_to`・`write_output` の署名を変えないので）。`.mmd` の新しいテストは `src-tauri/src/lib.rs` の tests に置き（`save_mmd` と `parse_kind`）、`write_file` の拡張子の確かめは `crates/lorelei_core/tests/core.rs` の出力の節に 1 件足す
- 案 B-2: 新しいコマンド（`save_mermaid` など）— 保存ダイアログを出す処理と、書き出しと保存の規則が 2 本になる

### D3. 既定のファイル名

- **案 A（推奨）: 今と同じ `flowchart.mmd`・`er-diagram.mmd`**（書き出しのボタンの `fileStem` と同じ）
- 案 B: 図の一覧の題名（「spec24 P3 ER 図」など）— ファイル名に使えない文字の扱いが要る。書き出しのボタンも同じ形にするなら別の spec（スコープ外）

### D4. 保存の口（`useMmdDownload`）の約束と知らせ

- **名前と署名（推奨）**: `lib/desktop/mmd-download.ts` に置き、`lib/desktop/index.ts` から export する。

  ```ts
  /** コード生成のダイアログの「ダウンロード」(.mmd) の口 (spec 25)。Web 版では webDownload をそのまま呼ぶ */
  export function useMmdDownload(
    /** 保存ダイアログの既定の名前 (拡張子なし)。flowchart / er-diagram */
    fileStem: string,
    /** Web の落とし方 (フォーク元の今の処理。デスクトップでは呼ばない) */
    webDownload: () => void
  ): {
    /** 「ダウンロード」を押した時に呼ぶ。code はダイアログのコード (テーマの frontmatter を含む) */
    download: (code: string) => void;
    /** 保存ダイアログを出している間 true (どのボタンから出したものでも。D5) */
    busy: boolean;
  };
  ```

- **振る舞い**: `download(code)` は押した時に `isTauri()` を見る（描く物を変えないので、マウントの後に判定しなくてよい。`ExportButtons` がマウントの後に判定するのはボタンを出すかを出し分けて静的書き出しの HTML と食い違わないようにするため）。
  - Web 版（`isTauri()` が偽）: `webDownload()` を呼ぶだけ（今と同じ）
  - デスクトップ: `webDownload` は呼ばない。保存ダイアログを出している間（D5）なら何もしない。そうでなければ `exportDiagram(code, "mmd", fileStem)` → 保存したら「保存しました」とパス（`success`）、取り消し（`null`）は何も出さない、失敗は閉じるまで残る `error`（題「保存できませんでした」）。**知らせはフックが出す**（`ExportButtons` と同じ文言）
- **フォーク元の差し込み**（2 ファイル、各 2 行 + import）:
  - `download-modal.tsx`: `const { download } = useMmdDownload("flowchart", downloadMermaidCode);`、ボタンは `onClick={() => download(currentMermaidCode)}`（`downloadMermaidCode` は変えない）
  - `er-diagram-mermaid-modal.tsx`: `const { download } = useMmdDownload("er-diagram", onDownload);`、ボタンは `onClick={() => download(code)}`（パネルの `handleDownload` と props の `onDownload` は変えない）
  - `busy` はフォーク元のボタンには渡さない（見た目は変えない。押しても `download` が何もしない。D5）
- `useDesktopActions` は Context で外枠の中かを見るが、`useMmdDownload` は Web 版（外枠の外）でも Web の落とし方に戻る点が違う

### D5. 二度押しと、ほかの書き出しのボタンとの連動

- **推奨: 保存ダイアログは窓に 1 つだけ**。`lib/desktop/save-dialog.ts` に「保存ダイアログを出している」を 1 つ持ち（モジュールの状態 + `useSyncExternalStore` で購読）、
  `useMmdDownload` と `ExportButtons` の両方がそれを通して `exportDiagram` を呼ぶ（`runSaveDialog(task)`: 出している間は呼ばずに捨てる）。
  - 出している間（押してから、取り消すか保存し終えるまで）、4 つのボタンのどれを押しても 2 つ目の保存ダイアログは出ない（`export_diagram` は 1 回だけ）
  - 書き出しのボタンは、どれから出した保存ダイアログでも押せなくなる（今は 3 つの中だけ。`.mmd` の保存中も押せなくなるのが変わる所）。押した形式の `loading` は今のまま
  - ダウンロードのボタンは見た目を変えない（フォーク元のボタンに props を足さない）。押しても何もしない
- 根拠: 保存ダイアログは窓を親にしたモーダルなので、出た後は窓を押せない（OS が止める）。止める必要があるのは、押してから保存ダイアログが出るまでの間（`spawn_blocking` が保存ダイアログを出すまで）と、別のボタンからの同時押しだけで、
  それを JS の 1 か所で止めれば、同じ親の窓へ rfd を 2 重に出す経路が残らない。ダウンロードのボタンの見た目まで止めると、フォーク元に props を足すことになる
- 案: 連動させない（今の `ExportButtons` の `busy` のまま、`useMmdDownload` は自分の二度押しだけ止める）— ダウンロードと SVG の同時押しで保存ダイアログが 2 つ出る経路が残る

### D6. ボタンの名前と並び

- **推奨: 変えない**（「ダウンロード」のまま、今の位置）。Web 版と同じ部品で、押した時の振る舞いだけがデスクトップで変わる
- 案: デスクトップでは名前を「MMD」にして書き出しのボタンと並べる — フォーク元の見た目をデスクトップで出し分けることになる

## data_contract に書く形（P1 の最初に、コードより先に書く）

- `GuiCommands.export_diagram`: `(source, format: svg|png|pdf|mmd, fileStem) → 保存したパス | null (取り消し)`。mmd は描かずに source をそのまま UTF-8 (BOM なし) で書く (検査しない)。保存ダイアログは rfd (題「{形式} として保存」・既定の名前 `{fileStem}.{拡張子}`・種類の絞り込み)。上書きの確認は OS のダイアログ。テーマと背景は source の先頭で決まる (spec 24)
- `OutputPathPolicy`（規則を「共通」「MCP だけ」「GUI だけ」に分ける）:

  ```yaml
  OutputPathPolicy:
    description: ファイルの書き出しの規則 (lorelei_core::output の write_file / write_output)。MCP の render と GUI の書き出し (export_diagram) が使う
    common:   # 両方
      - 絶対パスのみ
      - 拡張子は書く種類と一致 (MCP の render は .svg / .png / .pdf、GUI の書き出しはそれに .mmd)。不一致は拒否
      - 親ディレクトリは既存であること (勝手に作らない)
      - 書き込みは同じディレクトリの一時ファイル `.{name}.tmp.{uuid}` → rename (別ボリュームだと rename が失敗するため)
      - rename 失敗時は一時ファイルを消してエラー (途中で切れた壊れファイルを残さない)
    mcp_only:
      - 既存ファイルは overwrite=true の時だけ上書き
      - WSL のパス (/home/...) は Windows では絶対パスにならず拒否される。WSL 上のクライアントは非対応
    gui_only:
      - 保存先は OS の保存ダイアログで選ぶ。既存のファイルを選んだ時の上書きの確認は OS のダイアログが行い、確かめた後は上書きする (overwrite=true で呼ぶ)
  ```

- `DesktopMmdDownload`（新しい名詞）: 上の D4 の署名と振る舞い。`DesktopSaveDialog`（新しい名詞）: D5 の「窓に 1 つだけ」と `runSaveDialog`・購読
- `lib/desktop/tauri.ts` の `ExportFormat` に `"mmd"` を足す（`ExportButtons` の 3 つのボタンは今のまま）

## Phase

- **P0（リサーチ。着地, 「P0 結果」）**: コードは変えない。D1〜D6 を確定させる材料を集め、推奨を出す
- **P1（デスクトップ。案 B・B-1 の時）**:
  - data_contract（上の「data_contract に書く形」）を先に直す
  - Rust（`crates/lorelei_core`・`src-tauri`）: `output.rs` の `write_file` と、`write_output` をそれを呼ぶ形に。`desktop.rs` の `ExportKind`・`parse_kind`・`save_mmd`、`export_diagram` の振り分け。
    テスト（Red → Green）: `save_mmd` — 中身がバイト単位で同じ（テーマの frontmatter と日本語を含む）・描けない（文法の誤りのある）コードでも保存できる・拡張子の違うパス（`.svg` など）は拒む・既にあるファイルを上書きする /
    `parse_kind` — `"mmd"` が `Mmd`、`"svg"` などが今と同じ、知らない形式は誤り / `write_file` — 渡した拡張子で確かめる（core.rs に 1 件）。既存のテストは変えずに通る
  - `lib/desktop`: `tauri.ts` の `ExportFormat` に `"mmd"`。`save-dialog.ts`（D5）・`mmd-download.ts`（D4）を足し、`index.ts` から `useMmdDownload` を export。`ExportButtons` を `runSaveDialog` と購読に載せ替える。
    テスト（Red → Green、`@/lib/desktop/tauri` を静的に模擬する, failures #14）:
    デスクトップでは `export_diagram` が `format: "mmd"`・`fileStem`・コードそのもので 1 回呼ばれ、`webDownload` と `URL.createObjectURL` は呼ばれない / 保存したら「保存しました」とパス、取り消しは知らせ無し、失敗は「保存できませんでした」 /
    保存ダイアログを出している間に「ダウンロード」と SVG をもう一度押しても `export_diagram` は 1 回だけで、SVG・PNG・PDF のボタンは押せない / 終われば押せる / Web 版（`isTauri()` が偽）は `webDownload` を 1 回呼び、`export_diagram` は呼ばない
  - フォーク元の 2 つのダイアログ（D4 の差し込み）。既存のテスト（`download-modal.test.tsx`・`er-diagram-mermaid-modal.test.tsx` の「ダウンロードは今どおり onDownload を呼ぶ」）は Web の経路のまま変えずに通る
  - CLAUDE.md の差し込みの台帳を更新（ファイルは増えない）。LORELEI.md の既知の制約（spec 24 P3 で足した「確認も知らせも無く保存」）を外し、「GUI の図の一覧」の節の書き出しの説明に `.mmd` を足す
  - `tauri dev` で保存ダイアログが出るかは、画面を押せる時だけ（computer-use の許可が下りなければ P2）
- **P2（配布ビルド）**: 利用者がフローチャートと ER 図で「ダウンロード」を押し、保存ダイアログ・取り消し・上書きの確認・知らせ・中身・「ダウンロード」フォルダが増えないことを確かめる

## 受け入れ条件

1. デスクトップで「ダウンロード」を押すと保存ダイアログが出る（既定の名前 `flowchart.mmd` / `er-diagram.mmd`、種類 MMD）。保存すると「保存しました」とパスが出て、中身はコード生成のコードとバイト単位で同じ（テーマの frontmatter も）
2. 保存ダイアログで取り消すと、何も保存せず、知らせも出ない
3. 押す前と後で、「ダウンロード」フォルダの `.mmd` の数が変わらない（デスクトップでは Web の落とし方を呼ばない）
4. 既にあるファイルを選ぶと OS の上書きの確認が出る（今の書き出しのボタンと同じ）。保存に失敗した時はエラーの知らせ（単体テスト）
5. 描けない（文法の誤りのある）コードでも保存できる（今の Blob と同じ。単体テスト）
6. 保存ダイアログを出している間は、4 つのボタンのどれを押しても 2 つ目の保存ダイアログが出ない。書き出しのボタンは押せなくなり、ダウンロードのボタンは見た目を変えず押しても何もしない（単体テスト。D5）
7. Web 版（GitHub Pages）は今のまま（ブラウザのダウンロード）。vitest で Web の経路（`isTauri()` が偽）を通して確かめる
8. SVG・PNG・PDF のボタンは、6 の連動のほかは今のまま。MCP の `render` と `RenderFormat` は変わらない（既存のテストを変えずに通る）
9. 確かめるのは Windows の配布ビルド。macOS・Linux は同じ経路（Tauri のコマンドで rfd）だが実物では確かめない

## スコープ外

- 図の一覧の題名をファイル名にすること（書き出しのボタンも含めて、D3 の案 B）
- 「ダウンロード」フォルダにもうたまった `.mmd` の片付け（利用者のファイル）
- コピーのボタンの知らせ（今のままで、別の話）
- Web 版のダウンロードの振る舞い
- macOS で rfd の保存ダイアログを `spawn_blocking` から出してよいか（SVG・PNG・PDF と同じ経路で、この spec の前からある。確かめていない）

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
| 8. 型の境界 | `parse_format`・`export_to`・`write_output` はどれも `RenderFormat`（MCP の `render` の enum）を受け渡す → `.mmd` は `RenderFormat` に足さず、`desktop.rs` の `ExportKind` で振り分け、`write_output` の中身を拡張子で受ける `write_file` に分ける（D2） |

## 査読（2026-10-14、3 本。rev0 → rev1 → rev2）

どの指摘も、根拠のコード（`desktop.rs`・`output.rs`・`tauri.ts`・`export-buttons.tsx`・2 つのダイアログ・data_contract）と wry のソースで確かめてから反映した。

- **査読 1（rev0、こちらから頼んだ 1 本）**: `write_output` が `RenderFormat` に結び付いている / macOS では wry がダウンロードを取り消す / 案 C の退け方の理由（「中身も読めない」は誤りで、大域の差し替えの脆さが理由）/
  案 A' は窓を作り直さない形もある / plugin-dialog を方針で除いていること / 口は Web 版で Blob に戻る・判定は押した時・`index.ts` から export・二度押し / 呼ぶ所を 2 つのダイアログにする /
  テストの形（静的な模擬・`URL` の差し替え・`onDownload` のテスト）/ 「知らせも出ない」は利用者の観察として書く / 受け入れ条件を確かめられる形に。案 A を退けた理由は妥当で、「別スレッドを待つ形も使えない」を足した → rev1
- **査読 2（rev0、利用者が貼った 1 本）**: ① Branch の行に `crates/lorelei_core` が抜けている（rev1 で足した。rev2 で書き直した）/ ② 「フックは Web 版では何もしない」では Web 版でボタンが死ぬ（rev1 で Web に戻る形にし、rev2 で署名を決めた）/
  ③ `RenderFormat` に `mmd` を足すと描画の型が歪む（rev1 で足さないとし、rev2 で境界を決めた）/ ④ デスクトップでは `<a>` の `click()` に届かせないことを明記する（rev2 の D1・D4・受け入れ条件 3）/ ⑤ 連動の選択肢を整理する（rev2 の D5）
- **査読 3（rev1、利用者が貼った 1 本。「拒否」）**: `export_diagram` に `mmd`・`RenderFormat` は変えない・`export_to` が描かずに書く・既存のテストは今のまま、が両立しない（`parse_format` と `export_to` が `RenderFormat` を受け渡す）→
  rev2 の D2 で `ExportKind` で振り分け、`export_to` は描く専用のまま、`.mmd` は `save_mmd`、`write_output` の中身を `write_file` に分ける形に決め、既存のテストは変えずに通るとした /
  保存の口に名前と署名が無い → D4 の `useMmdDownload(fileStem, webDownload): { download, busy }`、知らせはフックが出す / `OutputPathPolicy` の上書きの規則が MCP と GUI で矛盾する → 「data_contract に書く形」に規則ごとの書き直しを置いた /
  二度押しの連動を P1 へ先送りしている → D5 で「保存ダイアログは窓に 1 つだけ」に決め、受け入れ条件 6 と P1 のテストへ入れた / `ExportFormat` に `"mmd"` を足す作業が無い → P1 と「data_contract に書く形」に明記した

### 推奨（P0・査読の後）

- **D1: 案 B**（`lib/desktop` の `useMmdDownload` を、フォーク元の 2 つのダイアログの「ダウンロード」から呼ぶ。デスクトップでは Web の落とし方を呼ばない）
- **D2: 案 B-1**（`export_diagram` が `ExportKind` で振り分ける。`export_to` と `RenderFormat` は変えず、`.mmd` は `save_mmd`、`write_output` の中身を `write_file` に分ける）
- **D3: 案 A**（`flowchart.mmd`・`er-diagram.mmd`）
- **D4: `useMmdDownload(fileStem, webDownload): { download, busy }`**。押した時に判定し、知らせはフックが出す
- **D5: 保存ダイアログは窓に 1 つだけ**（4 つのボタンで共有。書き出しのボタンは押せなくなり、ダウンロードのボタンは見た目を変えず押しても何もしない）
- **D6: ボタンの名前と並びは変えない**

## P1 結果（2026-10-14）

**`9f9879c`**（`crates/lorelei_core`・`src-tauri`・`lib/desktop` と、フォーク元の 2 つのダイアログへの差し込み）。data_contract は先に `c25a799` で書いた（`GuiCommands.export_diagram`・`OutputPathPolicy`・`DesktopMmdDownload`・`DesktopSaveDialog`）。

- **Rust**: `output.rs` の `write_output` の中身を `write_file(path, extension, bytes, overwrite)` に移し、`write_output` はそれを `RenderFormat` の拡張子で呼ぶだけにした。
  `desktop.rs` に `ExportKind { Render(RenderFormat), Mmd }`・`parse_kind`（今の `parse_format` を置き換え）・`save_mmd`。`export_diagram` は保存ダイアログの題・名前・絞り込みを `ExportKind::extension()` で作り、`export_to` か `save_mmd` を呼ぶ。
  `export_to`・`write_output`・`RenderFormat` の署名は変えていない（既存のテストは 1 行も変えずに通った）
- **lib/desktop**: `tauri.ts` の `ExportFormat` に `"mmd"`。`save-dialog.ts`（`runSaveDialog`・`useSaveDialogBusy`。モジュールの状態 + `useSyncExternalStore`）・`mmd-download.ts`（`useMmdDownload`）を足し、`index.ts` から `useMmdDownload` を export。
  `ExportButtons` は `runSaveDialog` を通して呼び、どれから出した保存ダイアログの間でも押せない（`disabled={busy !== null || dialogBusy}`）
- **フォーク元の差し込み**: `download-modal.tsx`・`er-diagram-mermaid-modal.tsx` の「ダウンロード」の `onClick` を `useMmdDownload` の `download` にした（各 2 行 + import。`downloadMermaidCode`・パネルの `handleDownload` と props の `onDownload` は変えていない）
- 台帳: CLAUDE.md の差し込みの台帳（spec 24 P2 でパネルに `theme` を足した分の書き漏れも足した）・「現状」、LORELEI.md（「GUI の図の一覧」に `.mmd` の保存、spec 24 P3 で足した既知の制約を外した）

### テスト（Red → Green）

- Rust: `core.rs` の `write_file_checks_the_given_extension`（渡した拡張子で確かめる・大文字も通る・違う拡張子は `ExtensionMismatch { expected: "mmd" }`・上書きの規則は同じ）、
  `src-tauri/src/lib.rs` の `mmd_is_saved_as_is_without_rendering`（テーマの frontmatter と日本語を含むコードがバイト単位で同じ・描けないコードも保存できる・既にあるファイルを上書きする・`.svg` のパスは拒んで何も書かない）と
  `export_kinds_are_the_three_render_formats_and_mmd`。直す前はどれも新しい口が無くコンパイルが通らなかった（回して確かめた）。core 20 件・src-tauri 50 件が緑
- vitest: `__tests__/lib/desktop/mmd-download.test.tsx`（8 件。本物の 2 つのダイアログを描き、`@/lib/desktop/tauri` の `isTauri`・`exportDiagram` を静的に模擬する, failures #14）。
  デスクトップ: `export_diagram` が `mmd`・`flowchart` / `er-diagram`・コードそのもの（テーマ込み）で 1 回呼ばれ、`URL.createObjectURL`・`<a>` の `click()`・`onDownload` は呼ばれず、「保存しました」とパスが出る /
  取り消しは知らせ無し / 失敗は「保存できませんでした」と誤りの文 / 保存ダイアログを出している間、SVG・PNG・PDF は押せず、「ダウンロード」は押せるが 2 つ目を出さず、閉じたら押せる / SVG の保存ダイアログの間に「ダウンロード」を押しても 2 つ目を出さない。
  Web 版: フローチャートは Blob と `<a>` の `click()` を 1 回ずつ（書き出しのボタンは出ない）、ER 図は `onDownload` を 1 回、`export_diagram` は呼ばない。
  直す前に回すと、デスクトップの 6 件が落ち、Web の 2 件は通った（今の振る舞いを押さえるもので、前のコードでも通るのが正しい）。直す前は jsdom がデスクトップの経路でも `<a>` の blob: への移動を試みて「Not implemented: navigation」を出していた（今のコードがデスクトップでも Web の落とし方を踏む跡）
- 要の分岐を 1 つずつ壊して落ちることを確かめた: デスクトップでも Web の落とし方を呼ぶ → 5 件 / 書き出しのボタンが共有の状態を見ない → 2 件 / 出している間も 2 つ目を出す → 2 件 / 取り消しでも知らせる → 1 件
- 既存のテスト（`download-modal.test.tsx`・`er-diagram-mermaid-modal.test.tsx` の「ダウンロードは今どおり onDownload を呼ぶ」など）は変えずに通った（jsdom では `isTauri()` が偽 = Web の経路）
- vitest の全件は 2 回とも 98 ファイル・1,164 件が全部緑で exit 0。`cargo test --workspace`・`cd src-tauri && cargo test`・clippy（2 か所）・`tsc --noEmit`・ESLint が通る（`tsc` は `Set` の for-of を `forEach` に直してから）。
  整形は HEAD で整形済みのファイルと新しいファイルにだけかけた（`src-tauri/src/lib.rs` は HEAD で整形されていないのでかけていない）

### 受け入れ条件の見込み

- 4（上書きの確認は OS のダイアログ）・1〜3 の画面と保存ダイアログは、P2 で利用者が押す（computer-use の許可が下りていないので、こちらでは保存ダイアログを押せない）
- 5・6・7・8 は単体テストで通過。9 は確かめる範囲の取り決め

## P2 結果（2026-10-14、配布ビルド。画面は利用者）

- Lorelei（spec 24 P3 で起動した release）を窓を閉じる形で終わらせ、`corepack pnpm@9 exec tauri build --no-bundle`（`0fdf5da` の作業ツリー。`docs/` は書き換わらない）で作った `lorelei.exe` を起動し、
  MCP の `open_in_editor` で 2 つの図を開いた（先頭に forest を書いたフローチャートと、ER 図。どちらも dropped 無し）。始める前の「ダウンロード」フォルダの `.mmd` は 25 個
- 利用者が確かめた: **「確認しました。不具合はありません」**。利用者のスクリーンショットで、ER 図の「ダウンロード」の保存ダイアログが、題「MMD として保存」・既定の名前 `er-diagram.mmd`・種類「MMD (*.mmd)」で出ていた
- 後から確かめたファイル（20:41 の基準の後に書かれたもの）:
  - `Downloads\er-diagram.mmd`（20:47:23、137 バイト。前からあった 264 バイトの同じ名前のファイルを、保存ダイアログで選んで上書きした）・`Downloads\er-diagram_2.mmd`（20:48:46、利用者が名前を付けた）。
    どちらも ER 図の保存された `source` とバイト単位で同じ・BOM 無し
  - `er-diagram.png`・`.pdf`・`.svg`（20:47:51〜20:48:11）— SVG・PNG・PDF も保存できた
  - 「ダウンロード」フォルダの `.mmd` は 26 個（25 + 利用者が名前を付けた `er-diagram_2.mmd`）。WebView2 が黙って保存した時の ` (n)` の付いた名前は増えていない
  - フローチャートの `.mmd` を保存したファイルは見当たらなかった（取り消しだけを確かめたか、ER 図で確かめた）。フローチャートの経路は vitest（P1）で確かめてある
- 画面の操作（computer-use）の許可は下りていないので、こちらで配布ビルドの画面は撮っていない

受け入れ条件 1〜9 は P1・P2 で通過した（1〜4 は P2 で利用者、5〜8 は P1 の単体テスト、9 は確かめる範囲の取り決め）。**spec 25 Done**。
