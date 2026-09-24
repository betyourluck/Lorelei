# Spec: MCP を GUI の中の HTTP へ移す — ローカル接続だけで待ち受ける

**ID**: 03
**Date**: 2026-09-25
**Status**: In Progress（rev1 承認 2026-09-25。P0 から）
**Branch**: なし（Phase 単位で main へ直接コミット）

## Goal

MCP サーバーを、Claude Code が起動する別プロセス（`lorelei --mcp`、stdio）から、**動いている GUI の中で 127.0.0.1 だけに待ち受ける HTTP**
（MCP の Streamable HTTP）へ移す。

利用者の判断（2026-09-25）:

> MCP は Fuseforks のようにネットワーク経由で行うべきかなと思っている。そんなにリアルタイム性が求められる通信でもない。
> ローカル接続の HTTP だけでよいです。

**なぜ移すか**（Neo の整理。利用者の挙げた「stdio より一般的」は根拠にしていない — ローカルの道具は MCP でも stdio が基本で、
HTTP は共有・遠隔の経路。移す理由は「状態が GUI にある」こと）:

1. **読み戻し（spec 04）の土台**: 「人が GUI で直した今の図を AI が読む」ツールは GUI の状態を読む。stdio のままだと MCP のプロセスから GUI への経路を別に作ることになる
2. **`open_in_editor` がじかに届く**: inbox のファイル・exe の起動・single-instance での引き渡しが要らなくなる。spec 02 P4 で直した起動時の競合（failures #6）の経路ごと消える
3. **exe を掴まれない**: 今は Claude Code のセッションごとに `lorelei --mcp` が exe を握り、ビルドのたびにタスクキルが要る（2026-09-25 実測: MCP のプロセスが 2 つ）

**spec 01 の判断を覆す**: spec 01 は「Fuseforks と違い、HTTP の口は開けない。Lorelei の検査・描画は状態を持たない純関数なので stdio で足りる。
その結果、トークン・ポート・Origin 検査・bind 先の議論がまるごと不要になる」とした。読み戻し（spec 04）でこの前提が成り立たなくなる —
GUI で直した今の図は GUI にしか無い。spec 01 が不要にした議論（トークン・ポート・Origin・bind 先）は、この spec の D2・D3 で引き受ける。

**代わりに負うもの**:

- **GUI を閉じていると MCP が使えない**。`validate` / `render` も GUI を開いておく必要がある（利用者が HTTP だけを選んだ。stdio は残さない）。
  Claude Code は最初の接続を 3 回、途中で切れたら 5 回まで再試行する。つながらなければ `/mcp` からつなぎ直す
- **待ち受けの口ができる**。`render` は任意の絶対パスへ書くので、トークン・Host・Origin の 3 つの検査が要る（D3）

## 現況（実測 2026-09-25）

### 1. Fuseforks の作り（同じ rmcp 2.2。そのまま移せる）

`D:\Github\Fuseforks\apps\gui-tauri\src-tauri\src\mcp_server.rs`:

- GUI プロセスの中で `StreamableHttpService` を axum 0.8 に載せ、`127.0.0.1:{port}/mcp` で待ち受ける（既定 39641）
- `Authorization: Bearer <token>` を axum のミドルウェアで定数時間比較。トークンは `Uuid::new_v4().simple()`（32 桁の 16 進）
- Host は rmcp の既定（`allowed_hosts` = loopback 3 種、DNS rebinding 対策）、Origin は明示で loopback だけ（空のままだと Origin 検査が無効 = rmcp の既定）
- 設定は `{app_data_dir}/mcp_server.json`（`enabled` / `port` / `token`）。**読めなかったら書き込みを拒む**（既定値で書き戻すと手で直した鍵を消す。Fuseforks failures #70）
- 既定は OFF、トークンは ON にした時に 1 回だけ作る（毎回作り直すとクライアントの設定が毎回無効になる）
- 待ち受けを止めるのは `CancellationToken`（セッションも一緒に畳まれる）

### 2. Claude Code の HTTP の MCP（公式ドキュメント https://code.claude.com/docs/en/mcp.md、2026-09-25 に調べた）

- `.mcp.json` は `{ "type": "http", "url": …, "headers": { "Authorization": "Bearer …" } }`。`url` と `headers` は `${VAR}` / `${VAR:-default}` を展開する
- `claude mcp add --transport http <name> <url> --header "Authorization: Bearer …"`。既定のスコープは local（`~/.claude.json` のそのプロジェクトの欄。リポジトリに入らない）
- つながらない時: 最初の接続は 5xx・接続拒否・時間切れで 3 回まで再試行、認証失敗・404 は再試行しない。途中で切れたら指数的に 5 回まで

### 3. 今の Lorelei の MCP

- `crates/lorelei_mcp`: `LoreleiServer`（ツール 3 本）+ `run_stdio`。`open_in_editor` は `GuiLauncher { exe }` で GUI を `--open <inbox の .json>` で起動する
- `src-tauri/src/main.rs`: `--mcp` なら `run_mcp()`（Tauri を作らない）、それ以外は GUI
- `src-tauri/src/lib.rs`: single-instance が 2 つ目の起動の argv を 1 つ目へ渡す → `accept_argv` → inbox を読む → `incoming` → `push_open`
- `.mcp.json`（リポジトリに入っている）: `./src-tauri/target/release/lorelei.exe --mcp`
- 単体 bin `lorelei-mcp`（開発・スモークテスト用）と `crates/lorelei_mcp/tests/smoke.rs`（stdio で initialize → tools/list → tools/call）

## 決めること

### D1. MCP サーバーは GUI の中。stdio の入口は撤去する

`lorelei_mcp` は「ツールと HTTP の待ち受け」を持つライブラリにし、GUI（`src-tauri`）がそれを起動する。
`lorelei --mcp` / `run_mcp` / `run_stdio` / `GuiLauncher` / `spawn_gui` は撤去する。**撤去したら名前で全台帳を grep する**。

`open_in_editor` がエディタへ届く口は trait で渡す（`lorelei_mcp` を Tauri に依存させない）:

```rust
pub trait EditorPort: Send + Sync + 'static {
    /// 図を GUI の一覧に新しい 1 件として足し、開く。GUI の窓を前に出す
    fn open(&self, source: String, title: Option<String>) -> OpenOutcome;
}
```

GUI の実装は、今の `incoming` → `push_open` をそのまま呼ぶ（届いた図が新しい 1 件になる・原文が残る・通知の経路は spec 02 のまま）。

### D2. 待ち受け（利用者裁定 2026-09-25: 既定で ON）

- `127.0.0.1:{port}/mcp` 固定（`0.0.0.0` にしない）。既定のポートは **39642**（Fuseforks の 39641 と並べて使えるように）
- GUI の起動時に待ち受ける。設定で OFF にできる。**ポートが使われていて bind できない時は、GUI は普通に起動し、待ち受けだけ失敗として表示する**
- 設定は `{app_data_dir}/mcp_server.json`（`enabled`（既定 true）/ `port` / `token`）。読めなかったら待ち受けず、設定の保存も拒む（Fuseforks #70）
- トークンは初めて待ち受ける時に 1 回だけ作る。設定画面で作り直せる（作り直すと古い鍵の要求は次から弾く）

### D3. 検査の 3 つ

1. `Authorization: Bearer <token>` を定数時間で比べる。無い・違う → 401（再試行させない）
2. Host は rmcp の既定（loopback 3 種）
3. Origin は `http://127.0.0.1:{port}` と `http://localhost:{port}` だけ。**Origin の無い要求（CLI のクライアント）は通す**

トークンはログに出さない。設定ファイルが読めなかった時のエラーにも中身を載せない（Concordia の API キーの件と同じ規律）。

### D4. 設定画面と Claude Code への登録（利用者裁定 2026-09-25: Fuseforks のように設定画面で設定する / GUI が登録コマンドを出す）

タイトルバーの歯車から開く**設定画面**に「MCP サーバー」の節を置く。項目は Fuseforks の「外部連携 > MCP サーバー」に揃える:

| 項目 | 中身 |
|---|---|
| 有効にする | 切り替え。既定 ON（D2）。切ると待ち受けを止める（`CancellationToken`） |
| ポート | 数値。変えたら待ち受けをやり直す。注記「待ち受けは 127.0.0.1 のみ（他の端末からは接続できません）」 |
| トークン | 伏せ字で表示・コピー・作り直し（確認つき「今の値を設定したクライアントはつながらなくなります」） |
| 待ち受けの状態 | 「待ち受け中: 127.0.0.1:{port}」/「止めています」/「待ち受けられません: {理由}」 |
| クライアント側の設定 | 登録コマンドをコピーできる形で出す: `claude mcp add --transport http lorelei http://127.0.0.1:{port}/mcp --header "Authorization: Bearer <トークン>"`（local スコープ = `~/.claude.json`。リポジトリに入らない）。注記「トークンを作り直したら、登録し直してください」「Lorelei を使うプロジェクトのフォルダで実行してください（登録はフォルダごと。どこからでも使うなら `--scope user`）」（P0 で判明） |

- 設定画面は `lib/desktop/` の Tauri 専用 UI（Web 版には出ない）。今後の設定もここへ足す
- 設定の読み書きは Rust（`mcp_server.json`）。JS からはファイルに触らない（spec 01 D8 の方針）
- リポジトリの `.mcp.json` は消す（stdio 用で、HTTP にするとトークンが要る）
- LORELEI.md の「使い方」を書き直す（GUI を起動 → 設定から登録コマンドをコピー → 実行）

### D5. inbox と `--open` は撤去する

`open_in_editor` がじかに届くので、inbox（`{app_data_dir}/inbox/`・`InboxItem`・`read_inbox`・`sweep_inbox`）と
single-instance の argv の引き渡し（`accept_argv` / `open_arg`）は要らなくなる。**spec 02 P4 で作った inbox の JSON 化は、ここで捨てる**。

- single-instance 自体は残す（2 つ目の GUI が同じポートを取りに行かないように。2 つ目は 1 つ目を前に出して終わる）
- 既に `inbox/` に残っているファイルは、撤去後は誰も読まない。起動時に `inbox/` ごと消す処理を 1 版だけ残すか、放置するかは P3 で決める（放置しても害は無い）

### D6. 待ち受けの状態を見せる

タイトルバーに小さな印（待ち受け中 / 止めている / 失敗）。押すと設定が開く。Fuseforks のステータスバーの表示と同じ役目。

## Phase

- **P0（PoC、使い捨て）**: (1) Tauri の非同期ランタイムの中で `StreamableHttpService` を立て、`claude mcp add --transport http` で Claude Code からつながるか
  (2) GUI を後から起動した時に、Claude Code が再試行か `/mcp` でつなぎ直せるか (3) ツールの結果に画像（`render` の preview）を載せても HTTP で通るか
- **P1**: `lorelei_mcp` を HTTP のライブラリにする（`EditorPort`・トークンのミドルウェア・Origin）。テストは HTTP で initialize → tools/list → tools/call（スモークテストを書き直す）と、
  トークンなし・違うトークン・外の Origin が弾かれること
- **P2**: GUI に載せる（`mcp_server.json`・起動時に待ち受け・`EditorPort` の実装）。設定の画面とタイトルバーの印（D4・D6）
- **P3**: 撤去（D1・D5）— `--mcp`・stdio・`GuiLauncher`・inbox・`--open`・`.mcp.json`・`lorelei-mcp` の stdio。名前で全台帳を grep（data_contract の `McpServer` / `EditorInbox`、LORELEI.md、CLAUDE.md、spec 01・02）
- **P4**: 実機 — 配布ビルドを起動 → 設定の登録コマンドで Claude Code に登録 → 3 本のツールと `title` 付きの `open_in_editor`

## P0 結果（2026-09-25。使い捨ての `src-tauri/src/poc_http.rs` で確認し、コードは戻した）

`tauri dev` の GUI の `setup` で、今の `LoreleiServer`（stdio 用のツール実装そのまま）を `StreamableHttpService` に載せ、
axum 0.8 で `127.0.0.1:39642/mcp` に立てた。トークンは固定値（`Authorization: Bearer` をミドルウェアで比較）、Origin は loopback の 2 つだけ。
依存は `rmcp`（features `server` / `transport-streamable-http-server`）・`axum`（`http1` / `tokio`、default-features なし）・`tokio` の `net`。

| # | 結果 | 観測 |
|---|---|---|
| 1 | **通過** | curl: トークンなし → **401**、`Origin: http://evil.example` → **403**、initialize → `mcp-session-id` が返る、tools/list で 3 本。Claude Code: `claude mcp add --transport http … --header` の後、`/mcp` で `✔ connected · 3 tools`、このセッションから `render` / `validate` を呼べた |
| 2 | **通過** | GUI を落として（利用者がタスクキル）、自動の再接続の窓（約 30 秒）を過ぎてから起動し直した。`/mcp` で手でつなぎ直さずに `validate` を呼ぶと成功した（呼んだ直後に「切断 → 再接続中」の通知が出たので、Claude Code がセッションを張り直している） |
| 3 | **通過** | `render`（svg）の応答に text（9,976 字）と image（`image/png`、base64 5,544 字）の 2 つが入り、このセッションに画像として届いて見えた |

- **予定外に確かめられたこと**: Fuseforks の村の個体（ザリ）が別のクライアントとして同じ待ち受けにつながり、`title` 付きで `open_in_editor` を呼べた。
  結果が `opened: false`（「GUI の実行ファイルが見つかりません」）だったのは PoC の作り（`GuiLauncher` を空で渡した）のためで、D1 の `EditorPort` で解決する
- **stdio の登録は、Claude Code を開いたフォルダで壊れる**: 利用者が `src-tauri` で開いたセッションでは、リポジトリ直下の `.mcp.json`（`./src-tauri/target/release/lorelei.exe --mcp`）が
  相対パスで解決できず `✘ failed` だった（表示上は `src-tauri\.mcp.json` と出るが、そのファイルは無い）。HTTP にすると URL なので起きない
- **Claude Code の MCP の登録はプロジェクト（開いたフォルダ）ごと**: local スコープの登録は `~/.claude.json` のそのフォルダの欄に入る。
  `src-tauri` で登録したものは `D:\Github\Lorelei` のセッションからは見えなかった（登録し直して見えた）。**D4 の登録コマンドの注記に「使うプロジェクトのフォルダで実行する」と足す**。
  どのフォルダからも使いたいなら `--scope user` を案内する
- curl の `-d` に日本語を書くと Git Bash で化けて「invalid unicode code point」になった。サーバーの問題ではない（UTF-8 のファイルを `--data-binary @` で送ると通った）
- 使った登録（`lorelei-poc`、固定トークン）は、利用者が `claude mcp remove lorelei-poc` で外す

## P1 結果（2026-09-25）

- 着地: `crates/lorelei_mcp/src/http.rs`（`start_http(port, token, editor) -> RunningHttp`、`addr()` / `stop()`）、`EditorPort`（`open(source, title) -> Result<(), String>`）。
  `LoreleiServer` は `Arc<dyn EditorPort>` を持ち、`open_in_editor` は図の種類を確かめてから口へ渡す（GUI で開けない種類は届ける前に断る）。
  stdio の `GuiLauncher` も `EditorPort` の実装の 1 つにして残した（P3 で撤去するまで `lorelei --mcp` を動かしておくため。`inbox` の場所を持つ形にした）
- 依存: `rmcp` に `transport-streamable-http-server`、`axum 0.8`（`http1` / `tokio`）、`tokio-util`（`CancellationToken`）、`tokio` の `net`。テストだけ `reqwest 0.12`
- data_contract の `McpServer` を先に凍結（`transport: streamable_http`・`http:`（bind / path / default_port / auth / host_check / origin_check / editor_port）・`stdio_legacy:`）
- テスト（Red → Green）: `crates/lorelei_mcp/tests/http.rs` 6 件 — 127.0.0.1 だけで待ち受ける / トークンなし・違うトークンは 401 /
  外の Origin・外の Host は 403、Origin 無しと loopback の Origin は通る / tools/list で 3 本・validate・`title` 付きの open_in_editor が口へ届く /
  口が断った時と開けない種類は `opened: false`（開けない種類は口へ届かない）/ `stop` で閉じる。ほかに定数時間比較の単体 1 件
- Rust はワークスペース・src-tauri とも全件緑、clippy 警告 0

## P2 結果（2026-09-25）

- 着地: `src-tauri/src/mcp_host.rs`（`ConfigStore`（`mcp_server.json`、読めなければ待ち受けず書き込みも拒む・エラーに中身を載せない）/
  `McpHost`（`apply` / `set_enabled` / `set_port` / `regenerate_token` / `status`））、GUI の `EditorPort`（`GuiEditor` → `deliver`: 一覧に 1 件足して預かりに積み、窓を前に出す）、
  command 4 本（`mcp_status` / `set_mcp_enabled` / `set_mcp_port` / `regenerate_mcp_token`）とイベント `lorelei://mcp-status`、起動時の待ち受け（`setup` で `apply`）。
  フロントは `lib/desktop/mcp.ts`（`useMcpStatus`・登録コマンド）、`settings-dialog.tsx`（D4 の 5 項目）、タイトルバーの「● MCP」と歯車（D6）
- data_contract を先に凍結（`McpServerConfig` / `McpStatus` / `GuiCommands.mcp_*`）
- **テストで見つけて直したもの**: トークンの作り直し・ポートの変更は「止めて、すぐ同じポートで待ち受け直す」が、`stop` は合図を出すだけでポートが空くのを待たず、
  待ち受け直しが「使われている」で失敗した（`regenerating_changes_and_persists_the_token` が `failed` で Red）。
  `lorelei_mcp::RunningHttp::shutdown`（合図 → 待ち受けのタスクの終わりを待つ。開いたままのセッションで終わらなければ 3 秒で打ち切る）を足し、`McpHost::apply` はそれを待つ
- テスト（Red → Green）: Rust `mcp_host` 7 件（既定値 / トークンは 1 回だけ作って残る / ポートが使われていても落ちない / 切ると止まる / 作り直しが残る / ポートの範囲 / 壊れたファイル）、
  `deliver` 1 件（一覧に足して預かりに積む・変換できない図は足さない）、`lorelei_mcp` の `shutdown` 1 件、フロント `mcp-settings.test.tsx` 7 件
  （印を押すと開く / トークンの本文を画面に出さない / 登録コマンドのコピー / 切る / 作り直しの確認 / ポートの適用 / 失敗の理由）
- 全体: Rust は GUI 32 件・ワークスペースとも緑、clippy 警告 0。フロントは 524 件中 1 件（ArrowTypeSelector の時間切れ、failures #3 の顔ぶれ）
- 実機（`tauri dev`）: 起動すると 39642 で待ち受け、`mcp_server.json` に 32 桁のトークンが作られた。curl でトークンなし 401、`open_in_editor` → `opened: true` →
  一覧に入り中身と位置が保存された（inbox は 0 件）。生成器の出す空のエンティティ（`窓口 {\n  }`）も `validate` で `ok: true`（開き直せる）。
  **利用者が確認**: 「● MCP」と歯車のどちらからも設定画面が開く / 登録コマンドのコピー / 切ると止まる
- 途中で `next dev` が 3001 で立ち上がり画面が読み込まれないことが 1 回あった。前に止めた dev 版の Next の残りが 3000 を握っていた（コードの問題ではない）

## 受け入れ条件

1. GUI を起動すると `127.0.0.1:39642/mcp` で待ち受け、Claude Code から `validate` / `render` / `open_in_editor` が使える
2. トークンなし・違うトークン・`Origin: http://evil.example` の要求は弾かれる（自動テスト）。`0.0.0.0` では待ち受けない
3. `open_in_editor` で届いた図が、spec 02 と同じく新しい 1 件として一覧に入り、窓が前に出る
4. GUI を閉じてから起動し直すと、Claude Code から（再試行または `/mcp` のつなぎ直しで）また使える
5. ポートを別のプロセスが使っていても GUI は起動し、待ち受けの失敗が見える。設定画面でポートを変えると待ち受けられる
5b. 設定画面で有効を切ると待ち受けが止まり、トークンを作り直すと古いトークンの要求が弾かれる
6. `mcp_server.json` が壊れている時は待ち受けず、設定も上書きしない
7. ビルドの時に exe を掴んでいるプロセスが無い（Claude Code を開いたままビルドできる）
8. 撤去した名前（`--mcp` / `run_stdio` / `GuiLauncher` / `inbox` / `--open` / `InboxItem`）が台帳とコードに残っていない（履歴の記述を除く）

## スコープ外

- 読み戻し（人が直した図を AI に渡す）— spec 04
- LAN・遠隔からの接続、TLS
- 複数の GUI を同時に動かす
- GUI を閉じている時に `validate` / `render` を使う経路（利用者が HTTP だけを選んだ）

## 未検証のまま置いているもの

- （P0 の 3 項目は通過。「P0 結果」節）
- 同じ待ち受けに複数のクライアント（Claude Code と Fuseforks）が同時につないだ時の振る舞い（P0 では順につないだだけ）
