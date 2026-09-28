# Spec: デスクトップの外枠 — 自作タイトルバー・ツールバー・図の一覧

**ID**: 02
**Date**: 2026-09-24
**Status**: **Done**（2026-09-25。rev4 → P0〜P4 着地。受け入れ条件 1 の配布ビルドでの確認と 3 の VRT は残したまま閉じる（利用者裁定）— 「受け入れ条件の結果」節。rev4: 「保存」の手順 (D12)、rev3: 種類の切り替え (D11)。査読 2 件の採否は末尾）
**Branch**: なし（Phase 単位で main へ直接コミット）

> **後継**: MCP を GUI の中の HTTP へ移す [spec 03](03_http-mcp-in-gui.md) の P3 で、この spec の D8 の inbox（`{uuid}.json`・`--open`）は撤去した。

## Goal

フォーク元の画面のままでは、デスクトップアプリにした意味が薄い。Tauri で動いている時だけ、
フォーク元のエディタを**デスクトップの外枠**で包む。

利用者の要望（2026-09-24）:

> ウィンドウタイトルバーは Kataribe や Fuseforks のように自作し、その下にノード追加、コード生成、
> インポートのツールバーを作りたい。左ペインを開くこともでき、過去の履歴を保存できる。

「履歴」の意味は利用者に確認済み（2026-09-24）:

> 履歴と言うかファイルの code の新規ファイルみたいなもの。ユーザーが新しく Mermaid プロジェクトを
> 追加するときに新規作成ボタンを押す感じ。

つまり左ペインは**履歴ではなく図の一覧**（VS Code のエクスプローラーに近い）。1 件 = 1 枚の図で、
新規作成ボタンで増やし、編集すると自動で保存される。

**spec 番号の繰り下げ**: 旧 spec 02 の候補（人が直した図を AI への指示として読み戻す）は **spec 03** に繰り下げる（2026-09-25 にさらに **spec 04** へ。spec 03 は MCP の HTTP 化）。
この spec の「図の一覧」は、読み戻し（spec 04）で比べる元になる「届いた元の図」の置き場も兼ねる（D6）。

## 現況（実測 2026-09-24）

### 1. フォーク元に共通のヘッダーは無い

`app/layout.tsx` は Server Component で、`html > body > AppProviders > children` だけ。タイトル・エディタの切り替え
（`NavigationMenu`）・3 つのボタンは、**各エディタのキャンバス内の左上パネル**（xyflow の `<Panel position="top-left">`）にある。
右上には上流の GitHub へのリンクメニュー（`ContributionPanel`、`top-right`）がある。

| エディタ | パネル | ボタン → 処理 |
|---|---|---|
| フローチャート | `features/flowchart/components/panel/flow-panel.tsx` | ノード追加 → `addNode`（editor）/ コード生成 → `DownloadModal` / インポート → `ImportModal` |
| ER 図 | `features/er-diagram/components/panel/er-diagram-panel.tsx` | テーブル追加 → `handleAddTable` / mermaidコード出力 → `ERDiagramMermaidModal` / mermaidインポート → `ImportModal` |

- **モーダルの開閉状態はパネルの中にあり、モーダルもパネルの子として書かれている**（`useDisclosure` / `useBoolean`）
- xyflow の `Panel` は `position` を `-` で割ってクラスにする（`react-flow__panel top left`。`@xyflow/react` の dist 124〜125 行）
- Yamada UI の `Modal` は開いている間 `Portal` の中に描く（`@yamada-ui/modal` 1.4.14 の dist、`jsx(Portal, …)`）。
  **親を `display: none` にしてもモーダルは body 側に出るはず**。静的に読んだだけなので、実機の確認は P0

### 2. 状態は何も残らない

図の状態は各エディタの `useNodesState` / `useEdgesState` だけ（どちらも `AppProviders` の `ReactFlowProvider` の中）。
`localStorage` 等の永続化は 0 件。エディタを切り替えると、ページごとに作り直されて初期図に戻る。

### 3. インポートはノードの位置を捨て、ID は Mermaid 上の名前になる

- `handleImportMermaid`（flow-editor.tsx:325〜）は、入力を受けるたびにノードの位置を階層から自動で計算し直す。
  **Mermaid のテキストに位置は無い**ので、テキストだけを保存すると、手で並べた配置は開き直すたびに失われる
- 取り込んだノードの `id` は Mermaid 上のノード ID。一方、生成器（`hooks/mermaid.ts:239`）は `id` ではなく
  `getSafeVariableName(data.variableName)` を書き出す。**GUI で足したノード（`id` は連番）は、保存して開き直すと
  `id` が変わる**。位置を `id` で覚えると当たらない

### 4. フォーク元のインポートは元のテキストを外へ渡さない

`ImportModal` はモーダルの中で `parseMermaidCode` し、`onImport(parsedData)` だけを呼ぶ（import-modal.tsx:46〜55）。
入力された原文は捨てられる。しかもこのパーサーは、AI が普通に書く構文で**図を壊す**（spec 01 現況 6・P0-5）。

### 5. エディタの高さは `100vh` 固定

`flow-editor.tsx:447` と `er-diagram-editor.tsx:302` が `<Box h="100vh">`。タイトルバーの下に置くと、
その分だけ画面からはみ出す。Web 版は `html` / `body` に高さを付けていないので、`100%` に変えると Web 版が潰れる。

### 6. 前例: Kataribe / Fuseforks のタイトルバー（どちらも Vue、同じ作り）

- `decorations: false`。影とリサイズ用の縁は Windows の既定のまま残る（前例の記述。Lorelei では P0 で確認）
- 移動は `data-tauri-drag-region`（ルート・ブランド名・余白に付け、**ボタンには付けない**）。ダブルクリックで最大化もこれで付く
- 最小化 / 最大化 / 閉じるは `getCurrentWindow()` を **クリック時に動的 import** して呼ぶ（静的書き出しとブラウザで壊れない）
- 権限: `core:window:allow-minimize` / `allow-toggle-maximize` / `allow-close` / `allow-destroy` / `allow-start-dragging`
- 高さ 32px（Kataribe）/ 38px（Fuseforks）。アイコンはインライン SVG。閉じるはホバーで `#e53935`
- **踏んだ罠**（Kataribe failures #90）: `onCloseRequested` を 1 つでも登録すると `close()` はイベントを出すだけになり、
  続く `destroy()` は `allow-destroy` が無いと**黙って拒否**され、閉じるボタンが効かなくなる
- **ネイティブのメニューは持たない**。ツールバー行も無く、アプリのボタンはタイトルバーに並べている

### 7. `onCloseRequested` は非同期の保存を待てる

`@tauri-apps/api/window.js:1632〜` は `await handler(evt)` の後で `isPreventDefault()` を見て、立っていなければ `destroy()` する。
**ハンドラの中で保存を await し、失敗した時だけ `preventDefault()` すれば閉じるのを止められる**（呼ぶ時点が await の前でも後でもよい）。

### 8. Lorelei には今ネイティブのメニューがある

`src-tauri/src/desktop.rs` の `menu()` が「ヘルプ → Lorelei について」を作っている。**`decorations: false` にすると Windows ではメニューバーごと消える**。
About（同梱フォント・merman のライセンス一覧）への入口を移す必要がある。
custom command は `capabilities` に書かずに呼べている（`export_diagram` は `core:default` / `core:event:default` だけで動く）。

### 9. Web 版に `open_in_editor` の経路は無い

`open_in_editor` は MCP → inbox → GUI の exe の経路だけ。フロントの受け口 `useDesktopOpen` は `isTauri()` が false なら何もしない。

## 設計の核

**外枠は `lib/desktop/` に置き、Tauri で動いている時だけ出す。** Web 版（GitHub Pages）は今と同じ見た目・同じ DOM のまま。
フォーク元のテスト・VRT はブラウザ（`isTauri() = false`）で走るので、そのまま通る。
**この spec で足す振る舞いは、すべてデスクトップ版だけのもの**（Web 版には一覧も inbox も無い。現況 9）。

```text
┌ TitleBar (32px) ─ ≡ │ Lorelei ─ 図の名前 ─────────── ? │ _ □ × ┐   ≡ = 一覧の開閉、? = About
├ Toolbar (40px) ─ [フローチャート|ER図] │ ＋ノード追加 │ コード生成 │ インポート ┤
├ 一覧 (240px, 開閉) ┬ エディタ (フォーク元のまま) ──────────────────────┤
│ ＋ 新規作成 ▾      │                                                     │
│ ● 注文フロー       │   ReactFlow キャンバス                               │
│ ○ 会員 ER          │   (左上のパネルと右上の GitHub メニューは隠す)        │
└────────────────────┴─────────────────────────────────────────────────────┘
```

## 決めること

### D1. 外枠の差し込み口は `app/layout.tsx` の 1 か所。状態は Client Component が持つ

`<AppProviders><DesktopShell>{children}</DesktopShell></AppProviders>`。`app/layout.tsx` は Server Component のまま。
`DesktopShell`（`"use client"`、`lib/desktop/`）はマウント後に `isTauri()` を見て、false なら `children` をそのまま返す
（今の `ExportButtons` と同じ判定。静的 HTML とハイドレーションが一致する）。

- 開いている図の id・一覧・保存の状態は `DesktopShell` が持ち、`DesktopDocsContext` で配る
- `DesktopShell` は `ReactFlowProvider` の内側にあるので、`useReactFlow()` / `useStore()` でキャンバスの nodes / edges を読み書きできる（D7・D9 の前提。P0 で確認）
- **既知の欠点**: 初回の描画はブラウザと同じ見た目で、一瞬だけ外枠の無い画面が出る。
  消すには Rust 側の `initialization_script` で `document.documentElement.dataset.desktop` を先に立て、
  CSS で外枠の場所を空けておく。P1 で実際にちらつくかを見てから決める

### D2. フォーク元のパネルは CSS で隠す（利用者承認 2026-09-24）

外枠のルートに `data-lorelei-desktop` を付け、その中の `.react-flow__panel.top.left` と `.react-flow__panel.top.right` を
`display: none` にする（クラスの実体は現況 1）。**パネルは残して見えなくするだけ**なので、モーダルと開閉状態はフォーク元のまま使える。

- 前提: モーダルが Portal で body 側に出ること（現況 1、P0 で実機確認）
- **前提が外れた時の退路**: パネルの外枠だけを `visibility: hidden; pointer-events: none` にし、モーダルの親には効かせない。
  それでも消えるなら、パネル側で `isTauri()` の時にボタン群だけを描かない分岐を入れる（差し込みが 2 行増える）
- GitHub メニューが持っていた上流への謝辞は About に移す

### D3. ツールバーからパネルの操作を呼ぶ — パネルが操作を登録する

ツールバーはエディタの外にあるので、パネルの関数を直接は呼べない。パネル側で 1 行、
`useDesktopActions({ add: { label: "ノード追加", run: onAddNode }, code: onOpenDownload })` を呼んで
外枠の登録簿に渡す（Web 版では何もしない）。ER 図のパネルは `label: "テーブル追加"` を渡す。

- 却下した案: 隠したボタンを DOM から探してクリックする。文言や構造が変わると黙って壊れる
- **インポートは登録しない**（D10）。フォーク元のインポートは原文を捨て、図を壊すため
- **ツールバーに並べるのは 4 つ**（利用者指示 2026-09-24「ノード追加や ER 切り替え、コード生成、インポートもツールバーに。パネルは隠れっぱなしでもいい」）:
  `[フローチャート|ER図]`（D11）/ 追加 / コード生成 / インポート（D10）
- 新規作成で種類を選ぶ口（一覧の「＋ 新規作成 ▾」）も残す

### D4. エディタの高さは CSS 変数で逃がす

`h="100vh"` → `h="var(--lorelei-editor-h, 100vh)"`（2 ファイル・各 1 行）。Web 版は変数が無いので `100vh` のまま（現況 5）。

外枠は `height: 100vh; display: flex; flex-direction: column` にし、エディタが入る行を `flex: 1; min-height: 0`、
その中で `--lorelei-editor-h: 100%` を入れる。**高さの引き算はどこにも書かない**
（タイトルバーやツールバーの高さを変えても、エディタの高さを直さなくてよい）。

### D5. About はタイトルバーの「?」から

ネイティブのメニュー（`desktop::menu` / `MENU_ABOUT` / `on_menu_event`）は撤去し、既存の `show_about` を
custom command `show_about` として呼ぶ（capabilities への追記は不要。現況 8）。rfd のダイアログはそのまま（JS に権限を足さない方針を守る）。
**撤去したら `menu` / `MENU_ABOUT` / `on_menu_event` / 「ヘルプ → 」で全台帳を grep する**
（data_contract の `GuiCommands.about`、CLAUDE.md、LORELEI.md、spec 01、`src-tauri/tauri.conf.json`）。

### D6. 図の一覧 — 何を保存するか

data_contract に凍結する案（書き方は既存の data_contract に合わせる）:

```yaml
Document:
  fields:
    id: uuid
    title: string                       # 一覧でダブルクリックして名前を変える
    editor: { enum: [flowchart, erDiagram] }
    source: string                      # 今の図の Mermaid (フォーク元の生成器の出力)
    layout: { type: "map<string, {x, y}>" }  # キー = Mermaid 上のノード ID (flowchart は安全化した変数名、ER はエンティティ名)。無いノードは自動配置
    origin: { enum: [new, ai, import] }
    original_source: { type: string, nullable: true }  # ai / import で届いた原文。以後書き換えない。new は null （spec 08 で改定: update_diagram で置き換わる「最後に届けた原文」に。正は data_contract）
    created_at: RFC 3339
    updated_at: RFC 3339
DocumentSummary:                        # 一覧用。source / layout / original_source を持たない
  fields: [id, title, editor, origin, updated_at]
```

- **`source` と `original_source` の関係**: 届いた時点で `original_source = 原文`、`source = 原文を lorelei_core で変換 → エディタに読み込み → 生成器が書き出したもの`。
  エディタが扱えない構文（subgraph、ER の FK 等）は**届いた時点で `source` から落ちている**。落ちた分は `original_source` にだけ残る
- **`original_source` を残す理由**: (1) 何を失ったかを後から確かめられる (2) 読み戻し（spec 04）で「届いた元の図」と「人が直した図」を比べる基準になる
- **`layout` のキーを Mermaid 上の ID にする理由**: 現況 3。エディタ内の `id` は保存して開き直すと変わる
- **置き場**: `{app_data_dir}/documents/{id}.json`、1 件 1 ファイル。**一覧は `documents/` 直下の `*.json` だけを読む**（再帰しない）。
  読み書きは Rust（inbox と同じく JS に plugin-fs を入れない）。`localStorage` にしない理由 — dev（`localhost:3000`）と
  配布ビルドで origin が違い、保存先が分かれる。WebView のデータを消すと消える
- **書き込み**: 一時ファイル → rename（`OutputPathPolicy` と同じ）。`id` は uuid の形だけ受け付ける（パスを外へ出さない）
- **削除**: 物理削除せず `{app_data_dir}/trash/{id}.json` へ移す（`documents/` の外なので一覧に出ない）。ごみ箱を空にする操作は作らない
- **新規作成の中身**: フォーク元の各エディタの初期図（flow-editor.tsx:29〜45、er-diagram-editor.tsx:64〜80）をそのまま使う。
  タイトルは「無題のフローチャート」「無題の ER 図」（同名は許す。区別は id）

Tauri の custom command（data_contract の `GuiCommands` に足す）:

| command | 入出力 |
|---|---|
| `list_documents` | `() → DocumentSummary[]`（**rev4**: `saved_at`、無ければ `created_at` の新しい順。D12） |
| `create_document` | `(editor, title?) → Document`（初期図で作る） |
| `load_document` | `(id) → Document` |
| `save_document` | `(id, source, layout) → DocumentSummary`（自動保存。`title` / `origin` / `original_source` / `saved_at` は書き換えさせない） |
| `mark_document_saved` | **rev4**: `(id) → DocumentSummary`（利用者の「保存」。D12） |
| `rename_document` | `(id, title) → ()` |
| `trash_document` | `(id) → ()` |
| ~~`import_document`~~ | P3 の設計の補足 3 で撤回。`import_source` が Document を作る |
| `last_opened` / `set_last_opened` | 起動時に開く図の id（`{app_data_dir}/state.json`）。D9 |

**正は data_contract の `GuiCommands` / `Document`**（この表は設計時の写し）。

### D7. いつ保存するか — 保存は外枠が行う

- 外枠が `useStore()` でキャンバスの nodes / edges を見て、変化から 1 秒たったら、図の種類に合った生成器
  （`generateMermaidCode` / `generateERDiagramMermaidCode`）で `source` を、ノードの位置から `layout` を作って `save_document` する。
  **エディタに保存用の口を足さない**（生成器は `lib/desktop` から import して呼ぶ）
- 図を切り替える前と、ウィンドウを閉じる前には、待ち時間を飛ばしてすぐ保存する（flush）
- **閉じる時**: `onCloseRequested` のハンドラで flush を await する。成功したら何もしない（`@tauri-apps/api` が `destroy()` する。現況 7）。
  **失敗したら `preventDefault()` して閉じない**。タイトルバーにエラーを出し、利用者が「保存せずに閉じる」を選んだ時だけ `destroy()` する
- タイトルバーの × は `close()` を呼ぶだけ。`destroy()` を呼ぶのは上の 2 か所だけ。`core:window:allow-destroy` を足す（現況 6 の罠）
- 閉じる時以外の保存に失敗したら、一覧のその図に印を付けて通知する。黙って捨てない

### D8. AI から届いた図は新しい 1 件になる（デスクトップ版だけの振る舞い）

`open_in_editor` で届いた図は、一覧に `origin: ai` の新しい図として足し、開く。今開いている図は上書きしない。
Web 版にはこの経路自体が無い（現況 9）。

- MCP の `open_in_editor` に任意の `title` を足す（無ければ「AI の図 HH:MM:SS」）。入力が増えるだけなので、今の呼び方はそのまま通る
- **inbox の形式を変える**: `{uuid}.mmd`（本文だけ）→ `{uuid}.json`（`{ "source": string, "title": string | null }`）。
  `read_inbox_file` は `.json` だけを受け付け、`OpenRequest` に `title` を足す。移行期の `.mmd` は起動時の掃除（24 時間）で消えるので読まない
- 直す台帳: data_contract（`McpServer.tools.open_in_editor` / `EditorInbox` / `GuiCommands.open_request`）、LORELEI.md

### D9. 図を開く・切り替える

- **起動時**: `last_opened` の図を開く。無い・消えている時は一覧の先頭の図（rev4: 最後に「保存」した図。D12）。1 件も無い時はフローチャートを 1 件作って開く
- **別の種類の図を選んだ時**: そのエディタのページへ移る（今の `routeOf`）
- **同じ種類の図を選んだ時**: ページは移らない。外枠が `children` を `key={開いている図の id}` で包み、エディタを作り直す
  （フォーク元のエディタは作り直されると初期図から始まるので、そこへ図を読み込む）。**フォーク元のファイルは触らない**
- **読み込み**: `load_document` → `source` を lorelei_core で変換（spec 01 の変換器。フォーク元のパーサーは通さない）→
  既存の `useDesktopOpen` の経路でエディタの `handleImportMermaid` へ → **保存した `layout` のキーがストアに全部そろった時に**、外枠が位置を `setNodes` で当てる（取り込み前の初期図とキーが一致して早く当たるのを防ぐ。P0-4）
- 切り替える前に flush する（D7）

### D10. インポートは外枠のモーダルで受け、新しい 1 件にする

ツールバーの「インポート」は、`lib/desktop` の自前のモーダル（テキスト欄 1 つ）を開く。貼られた原文を `import_document` に渡し、
`origin: import`・`original_source = 原文` の新しい図として開く。変換は lorelei_core なので、AI から届いた図と同じ経路・同じ `dropped` の警告になる。

- フォーク元の `ImportModal` は使わない（現況 4: 原文を渡さず、AI が普通に書く構文で図を壊す）。**フォーク元のファイルは触らない**
- 今の図に上書きで取り込む操作は、デスクトップ版には置かない（上書きしたい時は新しい 1 件として開けばよい。元の図は一覧に残る）

### D11. ツールバーの `[フローチャート|ER図]` — 種類を切り替えると、その種類で最後に更新した図を開く（rev3）

rev2 では、図の種類は図ごとに決まっているので切り替えは不要として撤去した（査読 B-7）。利用者の指示で戻す。
押した時の動きは次のとおり（査読 B-7 の「最後に開いていた図に戻るのか」に答える形）:

- 今と同じ種類を押した時は何もしない（今の種類が押された状態で表示される）
- 別の種類を押した時は、その種類の図のうち一覧で一番上のもの（rev4: 最後に「保存」した図。D12）を開く（D9 の「別の種類の図を選んだ時」と同じ経路）
- その種類の図がまだ 1 件も無い時は、新規作成して開く
- 今開いている図の種類を変える（フローチャートを ER 図に変換する）操作ではない

### D12. 「保存」の手順 — 一覧の並びは利用者の「保存」で決める（rev4、利用者 FB 2026-09-24）

P3 の実機確認で利用者から:

> 左ペインがみる度に順番が入れ替わって、どれをみたか忘れてしまう。保存という手順が必要かな。
> ユーザーが保存をおしたときに上にくるというほうが管理しやすい。閲覧で上に来るのは性急すぎる。

原因は rev3 までの作り — 図を開くと準備済みの時点で自動保存が走り、`updated_at` が進んで一覧の先頭へ動いていた。利用者の選択（2026-09-24）:

- **裏の自動保存は残す**（落ちても失わない）。ただし一覧の並びには効かせない
- **並びは「保存」を押した時刻（`saved_at`）で決める**。一度も保存していない図は作った時刻（`created_at`）で並べる
- ツールバーの右端に「保存」、Ctrl+S でも同じ。最後の「保存」より後に変更がある図は、一覧とタイトルに ● を出す
  （`unsaved = updated_at > (saved_at ?? created_at)`）。切り替え・終了の時の「保存しますか」は出さない（中身は自動保存で残っている）
- **見ただけで ● を付けない** — 中身が同じ自動保存は書かない。`source` が空だった図の最初の書き込み（新規作成の初期図・AI / インポートの図がエディタに載った時）は
  `updated_at` を進めない。名前の変更も並びと ● を動かさない

不採用にした案: 「保存」を押すまでディスクに書かない（VS Code の自動保存なし）。切り替え・終了のたびに確認が要り、押し忘れて落ちると失う

## フォーク元への差し込み（予定）

| ファイル | 変更 | 行数 |
|---|---|---|
| `app/layout.tsx` | `DesktopShell` で包む（D1） | +2（import と包み） |
| `features/flowchart/flow-editor.tsx` | 高さの CSS 変数（D4） | 1 行書き換え |
| `features/er-diagram/er-diagram-editor.tsx` | 同上 | 1 行書き換え |
| `features/flowchart/components/panel/flow-panel.tsx` | `useDesktopActions`（D3） | +2 |
| `features/er-diagram/components/panel/er-diagram-panel.tsx` | 同上 | +2 |

**5 ファイル・8 行前後**（spec 01 の 4 ファイル・8 行とは別。flow-editor / er-diagram-editor は spec 01 でも触っている）。
保存（D7）と読み込み（D9）を外枠に寄せたので、エディタ本体に足すフックは無い。**P0-5 で外枠から nodes / edges を読めなかった時だけ**、
エディタに 1 行ずつフックを足す（その時は 5 ファイル・10 行）。P4 で実数を数えて CLAUDE.md を直す。

## Phase

- **P0（PoC、使い捨て）**:
  1. `display: none` の親の中から開いたモーダルが出るか（D2）
  2. `decorations: false` + `data-tauri-drag-region` が Next.js の静的書き出しで効くか。Windows でリサイズの縁と影が残るか
  3. `onCloseRequested` を登録した状態で、× → `close()` → 保存 → `destroy()` まで閉じきるか。保存失敗を模して止まるか
  4. `handleImportMermaid` の後に `setNodes` で `layout` を当てて、位置が戻るか（フローチャート・ER 図とも。GUI で足したノードを含む）
  5. `DesktopShell`（`ReactFlowProvider` の内側・`<ReactFlow>` の外側）から `useStore()` で nodes / edges が読めるか
  6. `key` を変えてエディタを作り直した時、キャンバスの表示位置（viewport）が前の図のまま残らないか
- **P1**: タイトルバー + About の付け替え（D1・D5）+ 高さ（D4。タイトルバーだけでもはみ出すので P2 から前倒し）。
  権限を足す（`allow-destroy` は `onCloseRequested` を入れる P3 で足す）。ネイティブのメニューを撤去して grep
- **P2**: ツールバー + パネルを隠す（D2・D3・D11）
- **P3**: 図の一覧 — data_contract に `Document` / `DocumentSummary` / command を凍結 → Rust の保存・一覧・改名・削除 →
  左ペイン → 自動保存・閉じる時の保存（D6・D7・D9）
- **P4**: インポート（D10）と AI から届いた図を一覧へ（D8。inbox の形式と MCP の `title`）。台帳を数える（data_contract / LORELEI.md / CLAUDE.md / failures）

## P0 結果（2026-09-24。使い捨ての外枠 `lib/desktop/poc-shell.tsx` で確認し、コードは戻した）

P0-1・4・5・6 はブラウザ（`next dev` + `?poc=1` で外枠を強制的に出す）で、P0-2 は `tauri dev` の実ウィンドウで確かめた。

| # | 結果 | 観測 |
|---|---|---|
| 1 | **通過** | パネルを `display: none` にしたまま、隠れたボタンを押してモーダルを開いた。フローチャートのコード生成・ER 図の mermaidコード出力とも、ダイアログはパネルの外（body 側）に出て、見えている（幅 > 0） |
| 2 | **一部だけ確認** | `decorations: false` で自作のタイトルバーとツールバーが出て、外枠の高さ配分（D4）も崩れない（利用者のスクリーンショット）。**「ヘルプ」のメニューバーは消えた**（現況 8 の主張を確認。ネイティブのメニューは残したまま）。ドラッグでの移動・ダブルクリックでの最大化・3 つのボタン・端でのリサイズ・影は**未確認** → P1 の受け入れで確かめる |
| 3 | **未確認** | 本物の閉じる処理（保存してから閉じる）は P3 で入るので、その時に確かめる（受け入れ条件 9） |
| 4 | **通過（ただし当てる合図は変える）** | フローチャート・ER 図とも、手で動かしたノードの位置が「保存 → `key` で作り直し → 取り込み → `setNodes`」の後に戻った（フローチャートは 3 回続けて同じ結果）。**ただし合図は取り込みより前に出ていた** — 作り直した直後のエディタは初期図（`startNode` 1 つ）を持ち、その名前が保存した layout のキーと一致したため。位置が正しく当たったのは、`setNodes` に渡した関数が取り込みの反映後（ノード 3 つ）に評価されたから。React と xyflow の反映の順番に頼った成功なので、**本実装では「保存した layout のキーがストアに全部そろった時に当てる」を合図にする** |
| 5 | **通過** | `ReactFlowProvider` の内側・`<ReactFlow>` の外側から `useStore()` / `useReactFlow()` で nodes / edges を読み書きできた。エディタにフックを足す必要は無い（差し込みは 5 ファイル・8 行のまま） |
| 6 | **通過** | `key` で作り直すと、表示位置は全体表示にやり直される（前の図の `scale(2)` が残らない） |

- **原因を特定していないこと**: ER 図の確認中、保存ボタンを押しても保存が走らないことが 1 回あった（ログに「保存」の行が出ず、古い位置を読み込んだ）。同じ条件でやり直した 2 回は走った。PoC のボタンを JS から押した時の問題と見ているが、本実装は自動保存なので、P3 で「編集 → 1 秒後に保存される」ことを必ず確かめる
- **ついでに分かったこと**: ER 図で `mermaidインポート` の後にテーブルを足すと、新しいテーブルの `id` は `"1"` になる（取り込んだテーブルの `id` は名前で、`parseInt` が NaN になり次の番号が 1 に戻るため）。位置はキーを名前にしているので影響しない
- **dev の起動時の `'pnpm' is not recognized`**: pnpm が PATH に無いため（このリポジトリは corepack 経由で使う）。呼び出し元は、`pnpm-lock.yaml` を見た Tauri CLI の版の確認と推定（**未確認**）。起動には影響しない

## P1 結果（2026-09-24）

- 着地: `lib/desktop/desktop-shell.tsx`・`title-bar.tsx`、`show_about` の custom command 化とネイティブのメニューの撤去、
  `decorations: false`、`core:window:*` 4 つ、高さの CSS 変数（D4）。フォーク元への差し込みは `app/layout.tsx` +2 行・エディタ 2 ファイル各 1 行
- テスト: `__tests__/lib/desktop/desktop-shell.test.tsx` 4 件（Web 版では外枠を出さない / 高さ 100% / ボタンは drag region にせずウィンドウ操作を呼ぶ / 「?」で `show_about`）と
  About の謝辞（Rust）を Red → Green。フォーク元の vitest は 486 件中 1 件（ArrowTypeSelector、5,232ms）が時間切れ。単独では 9 件とも緑で、failures #3 と同じ型
- Web 版: 同じ dev サーバーをブラウザで開くと外枠は出ず、パネルは残り、エディタの高さは画面全体のまま
- **実機（`tauri dev`）で利用者が確認**: ドラッグで移動・ダブルクリックで最大化・最小化 / 最大化 / 閉じる・端でのリサイズと影・「?」の About。
  P0-2 の残りはこれで確認済み。**配布ビルドでの確認（受け入れ条件 1）は P4 でまとめて行う**

## P2 結果（2026-09-24）

- 着地: `lib/desktop/toolbar.tsx`（`[フローチャート|ER図]` / 追加 / コード生成 / インポート）、`desktop-actions.tsx`（パネルが操作を登録する口, D3）、
  `import-dialog.tsx`（D10）、外枠の `<style>` でパネルを隠す（D2）。Rust は `request_from_source` を切り出し、`import_source` コマンドで
  AI から届いた図と同じ経路（PendingOpens → OPEN_EVENT → `useDesktopOpen`）に載せる
- **暫定の 2 つ**（P3・P4 で差し替える）: 種類の切り替えはページを移るだけ（D11 は図の一覧が要る）/ インポートは今のエディタへ取り込む（新しい 1 件にするのは一覧が要る）
- フォーク元への差し込み: パネル 2 ファイルに各 3 行（import・注記・`useDesktopActions`）
- テスト: `toolbar.test.tsx` 6 件、Rust `request_from_source_*` 2 件を Red → Green。フォーク元の vitest は 492 件中 2 件が時間切れ
  （ArrowTypeSelector 5,2xx ms、PanelContent「インポートできる」5,219ms）。PanelContent は触ったファイルなので、変更の前後で単独 2 回ずつ走らせ、どちらも緑で遅いテストの閾値にも届かないことを確かめた（failures #3 と同じ型）
- Web 版: ER 図のページで外枠は出ず、パネルと GitHub メニューは表示され、「テーブル追加」もパネルにある
- **実機（`tauri dev`）で利用者が確認**: パネルが見えない / 追加・コード生成 / ER 図への切り替えとラベル / インポート（subgraph と LR を省いた警告）/ ER 図のページから flowchart を取り込むとページが移る

## P4 結果（2026-09-25）

- 着地: inbox を `{uuid}.json`（`lorelei_core::paths::InboxItem { source, title }`、MCP と GUI が同じ型）にし、MCP の `open_in_editor` に任意の `title`。
  GUI は `.json` だけを読み、起動時の掃除は古い `.json` と移行期の `.mmd` を捨てる
- テスト（Red → Green）: MCP 1 件（inbox が JSON で title を持つ）、GUI 3 件（title が図の名前になる / `.mmd` と inbox の外は読まない / 掃除）
- **配布ビルドで見つけて直したもの — 起動時の競合**（failures #6）: GUI が起動していない時に ER 図が届くと、題名は ER 図・キャンバスは前回のフローチャートになり、
  どちらの図も保存されなかった（「準備済み」の関門が効いて上書きは起きなかった）。「最初の取り込みが済んだ」の合図を、別のページへ回しただけの時は出さないようにした（Red → Green）。
  加えて、開く途中で届いた図に切り替わったら開くのをやめる・待ち切った時に回した図が残っていれば前回の図を開かない、の 2 つを防御として足した（**この 2 つは Red を再現していない**）。
  直した exe で、inbox に JSON を置いて `--open` で冷えた状態から起動し、題名・キャンバス・保存（`source` と `layout`）がそろうことを確かめた
- 配布ビルドは `CARGO_TARGET_DIR` をスクラッチに向けて作った（`src-tauri/target/release/lorelei.exe` は Claude Code の MCP が握っていて上書きできない）。
  `.mcp.json` が指す exe の入れ替えは利用者が行う。**利用者が入れ替えた exe は競合の修正の前のビルド**なので、もう一度入れ替えが要る
- 利用者裁定（2026-09-25）でフォーク元を直してよいことになった（CLAUDE.md の掟）。この spec の設計（外枠を `lib/desktop/` に置き、フォーク元への差し込みを小さくする）はそのまま

## P3 結果（2026-09-25）

- 着地: Rust `src-tauri/src/documents.rs`（`Store`: 一覧・作成・読み込み・自動保存・「保存」・改名・ごみ箱・前回の図）と
  command 11 本、`incoming`（届いた図 → 新しい 1 件）。フロント `doc-session.ts`（判定の純粋関数と `Autosaver`）、
  `use-doc-session.ts`（開く・切り替え・自動保存・起動時・閉じる前の保存）、`document-list.tsx`、タイトルバーの ≡ と ●、ツールバーの「保存」と Ctrl+S。
  `core:window:allow-destroy` を足した。フォーク元のファイルは P3 では触っていない
- テスト: Rust 23 件（うち P3 で 13 件）。フロントの外枠まわり 38 件。
  - **Red → Green を確かめたもの**: 保存の層（Rust 8 件 + 届いた図 2 件）、判定の純粋関数と `Autosaver`（9 件）、
    実機で見つけた不具合 2 件（failures #4 StrictMode、#5 位置を持たない図）、D12（Rust 3 件・フロント 3 件）
  - **実装を先に書いたもの**: 図の一覧の結合テスト 8 件（新規作成・前回の図・D11・改名・ごみ箱・開閉）。書いた時点で緑なので Red の実証になっていない
  - `document-list.test.tsx` は起動時に最大 1.5 秒待つ設計なので、describe の上限を 15 秒にした（全件並列で既定の 5 秒を超えた。failures #3 と同じ型を自分で増やしかけた）
- フォーク元の vitest（全件 508）: 1 回目 3 件、2 回目 2 件が時間切れ。2 回目は P2 と同じ顔ぶれ（ArrowTypeSelector・PanelContent「インポートできる」）。
  1 回目の 3 件目（PanelContent「不正なMermaidコード」1,987ms）は、同じファイルの直前の時間切れからの連鎖と判断（単独では 2 回とも 13 件緑）
- **実機で見つけて直したもの**（どちらもテストは緑だった。AI の図を MCP で実際に送り、`{app_data_dir}/documents/` のファイルを読んで発見）:
  failures #4（開発モードで届いた図を取りこぼす）、#5（位置を持たない図が保存されない）
- **利用者 FB で設計を変えたもの**: D12（一覧の並びを「保存」の時刻にする）。見ただけでは `updatedAt` / `savedAt` が変わらないことを、起動の前後のファイルの比較で確認
- **実機（`tauri dev`）で利用者が確認**: 新規作成 / 終了して起動し直すと同じ図・中身・位置が戻る（受け入れ条件 5）/ 同じ種類の A → B → A（6）/
  D11 / 改名・ごみ箱（8）/ インポートが新しい 1 件になる（7 の一部）/ ≡ の開閉（ここまで D12 の前）。
  D12 は P3 のコミット（71638d5）の後、2026-09-25 に利用者が「保存と並び順は問題ありませんでした」と確認した
- **未確認**: 受け入れ条件 9（保存できない時に閉じない）。`documents/` を読み取り専用にする準備が要る。P4 で配布ビルドと一緒に確かめる

## P3 の設計の補足（2026-09-24、実装前に書いた）

P3 を詰めて見つかった 2 つの危険と、D6 の command 表からの変更。正は data_contract の `Document` / `GuiCommands`。

1. **P3 だけ入れると、届いた図が今の図を上書きする** — P2 の取り込み先は「今のエディタ」なので、自動保存（D7）が乗った時点で
   AI / インポートの図が開いている図に保存される。**D8・D10 の「新しい 1 件にする」を P3 に前倒しする**。
   Rust の `accept_argv` / `import_source` が Document（`origin: ai / import`、`original_source = 原文`）を作り、`OpenRequest.document` に載せる。
   フロントは取り込む前に今の図を flush し、開いている図をその 1 件へ切り替える。P4 に残すのは inbox の JSON 化と MCP の `title` だけ
2. **読み込みに失敗した図を、初期図で上書きする** — `key` で作り直したエディタはフォーク元の初期図を持っている。読み込みが失敗すると、
   1 秒後の自動保存がその初期図で元の図を上書きする。**「準備済み」の関門を置く**: 開いた図は、取り込んだノードのキーがストアに全部そろい
   （P0-4 の合図）layout を当て終えるまで保存しない。`source` が空の図（新規作成の直後）は、作り直した時点で準備済み。
   変換に失敗した図は準備済みにならず、保存されない（一覧に印を付ける）
3. **command の変更**: `import_document` は作らず、P2 の `import_source` が Document を作る形にした。保存した図を開く時の変換用に
   `convert_source`（溜めない・イベントを出さない）を足した。読み込みは「`convert_source` の結果を `useDesktopOpen` の預かり（stash）に入れてから
   エディタを作り直す」— 作り直した直後の取り込みで拾われる。イベントを出すと、作り直す前の古いエディタが先に拾ってしまう

## 受け入れ条件

1. 配布ビルドで、自作のタイトルバーでウィンドウを移動・最小化・最大化・閉じることができる。ダブルクリックで最大化する
2. ツールバーの「追加」「コード生成」が、両方のエディタで今のパネルのボタンと同じ動きをする。`[フローチャート|ER図]` で D11 のとおりに図が開く
3. Web 版の見た目が変わらない（VRT のスナップショットに差分が無い。Pages 用の出力を目視）
4. フォーク元の vitest で落ちるテストが、変更前と同じ顔ぶれ（failures #3）
5. 新規作成 → 編集（ノードを足して手で動かす）→ アプリを終了 → 起動すると、同じ図が開き、中身と位置が戻っている
6. 同じ種類の図 A → B → A と切り替えて、それぞれの中身と位置が混ざらない
7. AI の `open_in_editor`（`title` あり・なし）とツールバーのインポートで、新しい 1 件が一覧に出て、原文が `original_source` に残っている
8. ごみ箱へ移した図が一覧に出ない。`trash/` にファイルが残っている
9. 保存できない状態（`documents/` を読み取り専用にする）で × を押すと、閉じずにエラーが出る
10. 「?」から About が開き、ライセンス一覧と上流への謝辞が出る

### 受け入れ条件の結果（2026-09-25）

| # | 結果 | 根拠 |
|---|---|---|
| 1 | **一部**（dev は確認、配布ビルドは未確認） | `tauri dev` で利用者が確認（P1 結果）。配布ビルドのウィンドウでの移動・最大化は、利用者の確認をまだ受けていない。「閉じる」は配布ビルドで 9 の確認の中で動いた |
| 2 | **達成** | 利用者の確認（P2・P3 結果） |
| 3 | **一部** | Pages 用のビルド（`pnpm build` → `docs/`）は通った（確認後に `docs/` は git で戻した）。dev サーバーをブラウザで開くと外枠は出ず、パネルは残る（P1・P2 結果）。**VRT は走らせていない**（Docker が要る。spec 01 から持ち越し） |
| 4 | **達成** | 落ちるのは時間切れの ArrowTypeSelector・PanelContent「インポートできる」（failures #3 と同じ型）。単独では緑 |
| 5・6・8 | **達成** | 利用者の確認（P3 結果） |
| 7 | **達成** | `title` あり: 配布ビルドの MCP で「P4 確認 — 商品と在庫の ER 図」が一覧の名前になった。`title` なし・インポート: P3 で確認。原文は `originalSource` に残る（ファイルを読んで確認） |
| 9 | **達成** | 配布ビルドで、開いている図のファイルを読み取り専用にして編集 → タイトルバーと通知に失敗が出る → × で閉じずに「保存せずに閉じる」が出て、それで閉じた（利用者の確認）。ファイルは元の中身のまま、一時ファイルも残らない |
| 10 | **達成（dev）** | P1 で利用者が確認 |

## スコープ外

- 人が直した図を AI に読み戻す（spec 04）
- 最大化ボタンを押した後の「元に戻す」アイコンの出し分け、Windows 11 のスナップの一覧（前例 2 本も持っていない）
- macOS の信号ボタン（実機が無い）
- 図をフォルダで分ける・任意の場所の `.mmd` を開く（一覧は `app_data_dir` の中だけ）
- ごみ箱を空にする・ごみ箱から戻す
- 今の図への上書きインポート（D10）
- ダークモード（フォーク元に色の切り替えが無い。外枠だけ暗くすると浮く）

## 未検証のまま置いているもの

- 初回描画のちらつきがどの程度か（D1）
- P0-2 の残り（移動・最大化・3 つのボタン・リサイズ・影）は P1 の実機確認で、P0-3（閉じる時の保存）は P3 で確かめる

## 査読への応答（2026-09-24、rev1 → rev2）

査読 A・B の 2 件。事実の主張はコードで確かめてから採否を決めた。

| # | 指摘 | 採否 | 理由・反映先 |
|---|---|---|---|
| A-1 | D8 が Web 版の `open_in_editor` の挙動を変える | **不採用（1 行だけ明記）** | Web 版にこの経路は無い（現況 9）。分岐は要らない。誤読を防ぐため「デスクトップ版だけ」と設計の核と D8 に書いた |
| A-2 | `calc(100vh - 72px)` がレイアウトと二重に引かれる | **採用（形を変えて）** | 二重には引かれないが、高さの引き算が 2 か所に分かれるのは脆い。ただし提案の `h="100%"` は Web 版を潰す（現況 5）。変数は残し、外枠が `100%` を入れる形にした（D4） |
| A-3 / B-4 | 閉じる時の保存失敗を通知できない | **採用** | 失敗時は `preventDefault()` して閉じない（D7）。B の「`preventDefault()` は await の前に同期で呼ぶ必要がある」は `@tauri-apps/api` の実装と合わない（現況 7）ので不採用 |
| A-4 | `.trash/` が一覧に混ざる | **採用** | 置き場を `documents/` の外（`trash/`）へ。一覧は直下の `*.json` だけ（D6）。受け入れ条件 8 |
| A-5 | パネルのクラス名の確認・Portal が外れた時の退路 | **採用** | クラスは `react-flow__panel top left` で rev1 のセレクタのまま正しい（現況 1）。退路を D2 に書いた |
| A-S1 | `source` の初期値が曖昧 | **採用** | D6 に `source` と `original_source` の関係を書いた |
| A-S2 | `original_source?: string` の書き方 | **不採用** | data_contract の既存の書き方（`{ type, nullable }`）に合わせる |
| A-S3 | `layout` のキーが開き直すと当たらない | **採用** | 実際に当たらない（現況 3）。キーを Mermaid 上の ID にした（D6） |
| A-S4 / B-5 | 開いている図の id の持ち主・同じ種類の切り替え | **採用** | `DesktopShell`（Client）と Context（D1）。同じ種類は `key` で作り直す（D9） |
| A-S5 | 「AI の図 HH:MM」が同名になる | **採用** | `HH:MM:SS`（D8）。同名自体は許す（区別は id） |
| A-P0 | P0 に 4 項目を足す | **採用** | P0-1〜3 に吸収 |
| A-N1 | `show_about` を capabilities に登録する | **不採用** | custom command は capabilities なしで呼べている（現況 8）。grep の対象に `tauri.conf.json` は足した（D5） |
| A-N2 | ごみ箱の受け入れ条件 | **採用** | 受け入れ条件 8 |
| A-N3 | 新規作成の初期図 | **採用** | フォーク元の初期図を使う（D6） |
| B-1 | inbox で `title` を渡す形式が無い | **採用** | inbox を JSON に（D8） |
| B-2 | フォーク元のインポートは原文を渡さない | **採用（案 A・B とも取らない）** | 案 A はフォーク元を触る。案 B は原文を失う。そもそもフォーク元のパーサーは図を壊すので、デスクトップ版のインポートを外枠のモーダル + lorelei_core に替えた（D10）。フォーク元のファイルは触らない |
| B-3 | 保存に使う生成器を呼ぶ口がエディタに無い | **採用** | 外枠が `useStore()` で読み、生成器を `lib/desktop` から呼ぶ（D7）。読めなければエディタにフックを足す（P0-5） |
| B-6 | 起動時にどの図を開くか | **採用** | D9 |
| B-7 | `[フローチャート\|ER図]` の切り替えの挙動 | **採用（rev2 で撤去 → rev3 で戻した）** | rev2 は撤去。rev3 で利用者の指示により戻し、押した時の動きを D11 に決めた |
| B-8 | Rust の command の型・一覧用の軽い型 | **採用** | D6 の command 表と `DocumentSummary` |
| B-9 | 差し込みのファイル数が 5 と 6 で食い違う | **採用** | rev1 の数え間違い。rev2 は 5 ファイル・8 行前後（表に行数を書いた） |
| B-P0-1 | Portal は確認済み | **一部採用** | コードの上では Portal を使っている（現況 1）。実機の確認は P0-1 に残す |
