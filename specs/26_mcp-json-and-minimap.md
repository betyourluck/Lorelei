# Spec: 設定画面に MCP の JSON の登録文を足し、ミニマップを出し入れできるようにする

**ID**: 26
**Date**: 2026-10-29
**Status**: **Done** — rev1（起票 → D1〜D6 を裁定（「裁定」、推奨どおり）→ P1 着地（「P1 結果」、`0c0903e`）→ P2 着地（「P2 結果」、フォーク元 `affecfe`）→ P3（「P3 結果」、配布ビルドで利用者が「問題なし」））
**Branch**: 切らない（Phase 単位で main へ直接コミット）。2 つは互いに依らないので Phase を分ける。
P1（MCP の JSON）は `lib/desktop/` だけ（デスクトップ専用）。P2（ミニマップ）はフォーク元の `components/layout/` の改善で、**台帳・デスクトップとコミットを分け**、フォーク元のコミットだけで上流へ PR を出せる形にする（PR を出すかは利用者が決める, CLAUDE.md）

## Goal

利用者の言（2026-10-29）:

1. 「設定ダイアログの MCP のクライアント側の設定について Claude Code のコマンド文だけでなく、タブ切り替えなどで json で mcpserver を登録する形の文もコピペできるようにしたい」
2. 「右下のミニマップを表示と非表示を切り替えられるようにしたい」

（同じ日の 3 つ目「UI のダークテーマ」は色を直に書いた所が多く下調べが要るので [spec 27](27_dark-theme.md) に分けた）

## 裁定（2026-10-29、利用者。rev0 の後）

**推奨どおり**（「推奨どおりで P1」）。査読は挟まない。

- **D1: 案 A** — Fuseforks・Claude Code の `.mcp.json` と同じ形を 1 つ（`mcpServers.lorelei` の `type: "http"`・`url`・`headers.Authorization`、2 字下げ）
- **D2: 案 A** — 本物のトークンを埋める（画面では伏せる）。`.mcp.json` は Git に入れる前提のファイルだという注意書きを添える
- **D3** — 見出しは「クライアント側の設定」、タブは「コマンド（Claude Code）」「JSON」、最初はコマンド、どちらを開いたかは覚えない
- **D4: 案 A** — 左下の Controls に `ControlButton`
- **D5** — localStorage に 2 つのエディタで共通に覚える。既定は出す。キーに Lorelei の名を入れない
- **D6** — `lucide-react` の `Map`

## 現況（2026-10-29、コードと文書を読んで確かめた）

### MCP のクライアント側の設定

- 設定画面 `lib/desktop/settings-dialog.tsx:169-190` の「クライアント側の設定（Claude Code）」は、`registerCommand`（`lib/desktop/mcp.ts:27-29`）の 1 本だけを出す:
  `claude mcp add --transport http lorelei http://127.0.0.1:{port}/mcp --header "Authorization: Bearer {token}"`。
  画面ではトークンを `<トークン>` に伏せ、「登録コマンドをコピー」は本物のトークンを入れる。トークンが無い時はコピーを押せない。
  登録は Claude Code の local スコープ（`~/.claude.json` のそのフォルダの欄。リポジトリに入らない — `mcp.ts:27` のコメント）
- **兄弟プロジェクトの先例**: Fuseforks の設定画面（`Fuseforks/apps/gui-tauri/src/components/SettingsDialog.vue:608-625`）は貼る用の JSON を出している:
  `{"mcpServers": {"fuseforks": {"type": "http", "url": "http://127.0.0.1:{port}/mcp", "headers": {"Authorization": "Bearer {token}"}}}}`（2 字下げ。トークンはそのまま埋める）。設定画面の項目はもともと Fuseforks に揃えている（`settings-dialog.tsx:33`）
- **Claude Code の文書**（https://code.claude.com/docs/en/mcp 、2026-10-29 に読んだ）:
  - `.mcp.json` の HTTP のサーバーは `mcpServers` の下に `type: "http"`・`url`・`headers`（上の Fuseforks の形と同じ）
  - `.mcp.json` は project スコープ（プロジェクトの根）で、**「version control に入れて共有する」ためのファイル**。local・user スコープは `~/.claude.json`
  - `url`・`headers` の値で `${VAR}`・`${VAR:-default}` を環境変数に展開する
  - `claude mcp add-json <name> '<json>'` でも登録できる（この時の JSON は `mcpServers` の中の 1 件の形）
- **ほかのクライアント**（検索の結果。確かめていない）: Cursor は `~/.cursor/mcp.json`・`.cursor/mcp.json` の `mcpServers` の下に `url`・`headers`（環境変数は `${env:NAME}`）。`type` を書いた時に通るかは見ていない。
  VS Code（`servers`）や Claude Desktop（設定ファイルは url の口を持たないと記憶している。未確認）は形が違う → **1 つの JSON で全部のクライアントには合わない**

### ミニマップ

- `components/layout/flow-layout.tsx:14` の `<MiniMap />`（xyflow）を、フローチャート（`features/flowchart/flow-editor.tsx:763`）と ER 図（`features/er-diagram/er-diagram-editor.tsx:339`）が `FlowLayout` で使う。**出し入れの口は無い**（常に右下に出る）
- 左下の `<Controls />`（xyflow の拡大・縮小・全体を見る・固定）は、`ControlButton`（`@xyflow/react` 12.8.2 に有る）でボタンを足せる
- デスクトップではフォーク元のキャンバスの左上・右上のパネルを隠している（`lib/desktop/desktop-shell.tsx:23-24`）が、**左下（Controls）と右下（ミニマップ）は隠していない** = Web 版とデスクトップで同じ所に出る
- 表示の都合の記憶は WebView の localStorage に置く先例がある（`lib/desktop/pane-layout.ts` の `lorelei.layout.v1`。触れると投げる環境でも止めない読み書き）

## 決めること

### D1. JSON の形

- **案 A（推奨）: Fuseforks と同じ `.mcp.json` の形を 1 つ** — `{"mcpServers": {"lorelei": {"type": "http", "url": "http://127.0.0.1:{port}/mcp", "headers": {"Authorization": "Bearer {token}"}}}}`、2 字下げ。
  Claude Code の文書にある形そのままで、Fuseforks と揃う。説明文は「Claude Code の `.mcp.json` など、`mcpServers` を読むクライアントの設定ファイルに貼る」とし、**確かめていないクライアントの名前は書かない**
- 案 B: クライアントごとのタブ（Claude Code・Cursor・VS Code …） — 確かめていない形を出すことになり、クライアントの変更に追従する持ち物が増える。採らない
- 案 C: `claude mcp add-json` のコマンドも足す — コマンドのタブと役目が重なる。採らない

### D2. JSON にトークンをどう入れるか

- **案 A（推奨）: 今のコマンドと同じく、本物のトークンをそのまま埋める**（画面では `<トークン>` に伏せ、コピーで本物を入れる。トークンが無い時はコピーを押せない）。
  **注意書きを 1 行添える**: `.mcp.json` は Git に入れて共有する前提のファイルなので、そこへ貼るとトークンがリポジトリに入る。入れたくない時はコマンド（local スコープ）を使う。
  （このトークンで届くのは、その PC の 127.0.0.1 で待ち受ける Lorelei だけで、Host・Origin も検査している（spec 03）。漏れた時の害は小さいが、ゼロではない）
- 案 B: `"Bearer ${LORELEI_MCP_TOKEN}"` と書き、環境変数は利用者が別に設定する — Git に入れても漏れないが、貼っただけでは動かず手間が 1 つ増える。Cursor は書き方が `${env:NAME}` で違う

### D3. 画面の形

- **推奨**: 見出しを「クライアント側の設定」にし（「（Claude Code）」は外す）、yamada-ui の `Tabs` で「コマンド（Claude Code）」「JSON」の 2 つ。
  タブごとに、今の形（伏せた文 + 「…をコピー」のボタン + 説明文）。コマンドの説明文は今のまま（フォルダごとの登録・`--scope user`・作り直したら登録し直す）、JSON の説明文は D1・D2 の文。
  最初に開くのは「コマンド」（今と同じ見た目で始まる）。どちらのタブを開いたかは覚えない
- コピーの知らせは今の `copy(text, what)` を使う（「JSON をコピーしました」）

### D4. ミニマップの切り替えの置き場所

- **案 A（推奨）: 左下の Controls に `ControlButton` を 1 つ足す**（地図のアイコン、`aria-pressed` と `title`「ミニマップを隠す／出す」）。
  `FlowLayout` の中なので **2 つのエディタ・Web 版・デスクトップの全部に同じ 1 か所の変更で出る**。フォーク元の改善として上流へ返せる
- 案 B: デスクトップのツールバーに切り替え — Web 版に出ない。ツールバーは図の編集の操作の並びで、表示の切り替えは今は無い
- 案 C: 設定画面 — 入口が「● MCP」だけで遠い（spec 02 D12 の追記で歯車を外した）

### D5. 切り替えの覚え方

- **推奨**: localStorage に覚え、**2 つのエディタで共通**、窓を閉じて開いても残す。**既定は出す**（今と同じ見た目で始まる）。
  キーはフォーク元のコードなので Lorelei の名を入れない（例 `mermaid-editor.minimap.v1`。値は `"shown"` / `"hidden"`）。読み書きは `pane-layout.ts` と同じく、localStorage に触れると投げる環境でも止めない。
  図の種類の切り替え（エディタを作り直す, spec 02 D9）でも状態が変わらないこと

### D6. アイコン

- **推奨**: `lucide-react` の `Map`（spec 23 で直接の依存に足した 0.475.0 に有る）。Controls の他のボタンと同じ大きさ（xyflow の `ControlButton` の中の svg の規則に従う）。
  隠している時も同じアイコンで、押した状態（`aria-pressed`）と `title` で分ける

## 受け入れ条件

1. 設定画面の「クライアント側の設定」に「コマンド（Claude Code）」「JSON」の切り替えがある。コマンドのタブは今と同じ文・同じコピー
2. JSON のタブの「JSON をコピー」は、今のポートと本物のトークンを入れた JSON を写す。`JSON.parse` が通り、D1 の形（`mcpServers.lorelei` の `type`・`url`・`headers.Authorization`）と一致する。画面の表示ではトークンを伏せる。トークンが無い時は押せない
3. **実機**: 写した JSON を空のフォルダの `.mcp.json` に貼り、そのフォルダの Claude Code から Lorelei のツール（例 `list_diagrams`）を呼べる
4. ミニマップの切り替えのボタンで、右下のミニマップが出入りする。フローチャートと ER 図で共通に覚え、図の種類を切り替えても・窓を閉じて開いても（デスクトップ）・読み込み直しても（Web 版）残る。既定は出す
5. Web 版（静的書き出し）でも同じボタンが同じ所に出て動く。デスクトップの外枠で隠されない
6. テスト（vitest）: JSON の中身・タブの切り替え・コピーするもの・ミニマップの切り替えと覚え（読めない localStorage を含む）。**要の分岐を 1 つずつ壊して落ちる**ことを確かめる（failures #22 の形）

## Phase

- **P1: MCP の JSON**（`lib/desktop/mcp.ts` に JSON を作る関数、`settings-dialog.tsx` のタブ。デスクトップ専用のコミット）→ `tauri dev` で設定画面を開いて確かめ、受け入れ条件 3 の実機の往復
- **P2: ミニマップの切り替え**（`components/layout/flow-layout.tsx` と記憶のフック。フォーク元の改善のコミット）→ Web 版の画面（`web-dev`）で確かめる
- **P3: 配布ビルドで利用者が確かめる**（両方）

## P1 結果（2026-10-29、`0c0903e`）

- **入れたもの**: `lib/desktop/mcp.ts` の `clientConfigJson(status)`（D1 の形、`JSON.stringify` の 2 字下げ）、`settings-dialog.tsx` の `ClientSetup`（見出し「クライアント側の設定」、yamada-ui の `Tabs` で「コマンド（Claude Code）」「JSON」）と、
  2 つのタブで同じ形の `CopyableSetup`（伏せた文・コピーのボタン・説明文）。コマンドのタブの文・コピー・説明文は前と同じ。data_contract は `McpClientSetup`（`f8d1077`）
- **テスト**（`__tests__/lib/desktop/mcp-settings.test.tsx` に 3 件。先に書いて 3 件とも落ちるのを見てから実装）: 最初はコマンドのタブ / JSON のタブは伏せた JSON と注意書きを出し、コピーは本物のトークンとポートを入れた D1 の文字列そのもの・知らせ「JSON をコピーしました」/ トークンが無い時は 2 つとも押せない。
  **要の分岐を 1 つずつ壊すと、5 つとも落ちた**（コピーに伏せた文を入れる・JSON のコピーをトークンに依らず押せる・`type` を落とす・注意書きを落とす・最初を JSON にする）。
  デスクトップのテスト 13 ファイル 105 件が緑、`tsc --noEmit` 0 件、eslint 0。prettier の差は HEAD から未整形の行だけ（failures #23。足した行には無い）
- **実物**（`tauri dev`、computer-use で開発版の窓を操作。許可の付け方は failures #45）:
  設定画面にタブが出て最初はコマンド、JSON のタブは伏せた JSON と注意書きを出す（画面を見た）。「JSON をコピー」で写したものは、下の `.mcp.json` と**バイト単位で同じ**（207 字。トークンは表に出さずに比べた）
- **受け入れ条件 3（`.mcp.json` だけで Claude Code から呼べる）は半分まで**:
  - 空のフォルダに同じ JSON を `.mcp.json` として置くと、`claude mcp get lorelei` は `Scope: Project config (shared via .mcp.json)`・`Type: http`・URL・`Authorization` のヘッダーと読んだ（`Status: ⏸ Pending approval` — project スコープは最初に承認が要る）
  - その `.mcp.json` の `url`・`headers` だけを使い、Streamable HTTP で `initialize` → `tools/call list_diagrams` が通った（サーバーは `Lorelei`）。違う鍵では 401
  - **Claude Code が承認の後に実際につなぐ所は見ていない**: 使い捨てのフォルダに `enableAllProjectMcpServers` を置いても `claude mcp get` は承認待ちのままで、`claude -p` は CLI のログインが切れていて（`OAuth session expired`）使えなかった。P3 で利用者に頼む
  - 観察: rmcp の SSE は最初に中身の無い `data:` の行を送る（確かめの台本で、中身のある `data:` を拾うように直した。Lorelei の不具合ではない）
- **README には書いていない**: README・README.ja は公開版（v0.1.3）を使う人への案内なので、JSON のタブは次の版を出す時に足す。LORELEI.md には書いた

## P2 結果（2026-10-29、フォーク元 `affecfe`）

- **入れたもの**（フォーク元の改善。`lib/desktop/` と台帳を含まないコミット = 上流へ返せる）:
  `components/layout/use-minimap-visible.ts` の `useMinimapVisible()`（キー `mermaid-editor.minimap.v1`、値 `shown` / `hidden`、読めない・知らない値は出す、書けなくても切り替えは効く）と、
  `FlowLayout` の `Controls` の中の `ControlButton`（`lucide-react` の `Map`、`aria-label`「ミニマップ」・`aria-pressed`・`title`「ミニマップを隠す／出す」）。隠している間は `<MiniMap />` を描かない。
  data_contract は `EditorMinimap`
  - **覚えた値はマウントの後に読む**: エディタは `"use client"` でも静的書き出しでサーバー側で描かれるので、最初の描画は既定（出す）にして HTML と食い違わないようにした。隠した状態で開くと、最初の 1 回だけミニマップが出てから消えうる
  - xyflow は Controls の中の svg を `fill: currentColor` で塗る（`@xyflow/react/dist/style.css`）ので、線で描く lucide のアイコンはそのままだと塗りつぶされる。アイコンに `fill: none` を付けた
- **テスト**: `__tests__/components/layout/minimap-toggle.test.tsx` に 6 件（本物の xyflow の中に置く。既定で出す / 押すと隠れ、もう一度で出る / 隠したことを覚え、作り直したエディタでも隠れたまま始まる / 出したことも覚える / 知らない値は出す / 読めない・書けない localStorage でも止まらない）。
  先にフックだけを書いて 6 件とも落ちるのを見てから `FlowLayout` を変えた。**要の分岐を 1 つずつ壊すと 6 つとも落ちた**（知らない値を隠す・覚えない・マウントの後に読まない・読みの try を外す・常に描く・`aria-pressed` を逆）。
  既存の `flow-layout.test.tsx` は xyflow を模擬していて `ControlButton` が無く `Controls` が子を描かないので、模擬に足した。vitest の全部（99 ファイル 1173 件）が緑で終了コード 0、`tsc` 0 件、eslint 0、足したファイルは prettier 済み
  - テストの罠: `afterEach` で `vi.restoreAllMocks()` を呼ぶと、`__tests__/setup.ts` の `ResizeObserver` の模擬（`vi.fn().mockImplementation`）まで消え、2 件目から xyflow が `resizeObserver.observe is not a function` で落ちた。その場の spy だけを `mockRestore` する形にした（failures #46）
- **実物**（Web 版、`web-dev`、Browser pane）: ボタンは左下の Controls の一番下に出て、押すとミニマップが消え `hidden` を覚えた。ER 図のページへ移ると隠れたまま始まり、そこで押すと出て `shown`、読み込み直しても出たまま。アイコンの計算された `fill` は `none`、コンソールのエラーは 0。
  デスクトップの外枠の CSS（`HIDE_FORK_PANELS`）を同じページに当てても、ボタンとミニマップは隠れない（Controls は `bottom left` のパネル。隠すのは `top left`・`top right` だけ）。
  Browser pane で ref を使って押すと、ページ（1024×768）とスクリーンショットの枠（800×600）の換算がずれて、ボタンでない所を押した。座標で押し直した（failures #47）
- **デスクトップの実物は P3 で見る**（配布ビルド）

## P3 結果（2026-10-29、配布ビルド）

- `tauri build`（`src-tauri\target\release\lorelei.exe`、`7b3d611` の作業場所。`docs/` は書き換わらず、`out/` の chunk に JSON のタブとミニマップのボタンの文字列が入っていることを確かめた）を、利用者が次の手順で確かめ、**「問題なし」**:
  - A. 設定画面: 「● MCP」→「クライアント側の設定」に 2 つのタブ・最初はコマンド・JSON のタブは伏せた JSON と注意書き・「JSON をコピー」の知らせ → 写した JSON を空のフォルダの `.mcp.json` に置き、そのフォルダの Claude Code で project のサーバーを承認して `/mcp` でつながること・`list_diagrams` を呼べること
  - B. ミニマップ: 左下のボタンで出入りする・隠したまま ER 図へ切り替えても隠れたまま・窓を閉じて開き直しても隠れたまま・最後に出す状態へ戻す
- これで受け入れ条件 1〜6 を通過とした。**受け入れ条件 3（P1 で半分まで）の残り — Claude Code が承認の後につなぐ所 — は、利用者の「問題なし」をもって通過とした**（どのフォルダで試したかは聞いていない。こちらで用意した空のフォルダは空のままだった）
- 開き直した直後にミニマップが一瞬見えるか（「P2 結果」の「マウントの後に読む」）は、利用者からの指摘は無かった
- README・README.ja の JSON のタブの案内は、次の版を出す時に足す（「P1 結果」）

## スコープ外

- ダークテーマ（[spec 27](27_dark-theme.md)）
- Cursor・VS Code・Claude Desktop など、Claude Code の外のクライアントの形を確かめて出し分けること（D1 案 B）
- ミニマップの位置や大きさを変えること、Controls のほかのボタン
