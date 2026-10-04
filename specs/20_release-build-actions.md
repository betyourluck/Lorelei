# Spec: GitHub Actions でビルドし、インストーラーを Release に置く

**ID**: 20
**Date**: 2026-10-04
**Status**: Draft（rev1。裁定 1・2 と D3 を推奨どおりに確定。P0・P1 済み、P2（利用者が Actions を有効にしてタグを push）の前）
**Branch**: 切らない（Phase 単位で main へ直接コミット）。ワークフローはデスクトップ専用の変更（フォーク元へ返さない）

## Goal

Fuseforks（`D:\github\fuseforks`）・Lorekeel（`D:\github\kataribe`）と同じく、**タグを push したら GitHub Actions が配布ビルドを作り、インストーラーを GitHub Release に添付する**。
今は配布ビルドを手元の `tauri build --no-bundle` で作っていて、インストーラーは無い（exe を直接起動している）。

変えるのは `.github/workflows/` と台帳だけ。アプリのコード・データの名詞は変えない。

## 裁定（2026-10-04、利用者「推奨通りで進めてください」）

- **裁定 1（D1）: 案 A** — 兄弟と同じ 3 OS（Windows・macOS・Linux）。macOS・Linux は作れることまでを確かめる版
- **裁定 2（D2）: 案 A** — フォーク元から来た `ci.yml`・`deploy.yml` は手動（`workflow_dispatch`）だけで走るようにする（消さない）
- **D3: 案 A** — 3 OS とも、ビルドの前にルートの `cargo test --workspace`・`src-tauri` の `cargo test`・vitest を走らせる
- macOS の公証用の App 固有パスワードは利用者が作った（2026-10-04）。秘密 5 つの登録は利用者がする（値は Claude に渡さない）

## 現況（2026-10-04、両方のリポジトリと Lorelei を読んで確かめた）

### 兄弟の 2 つ（ほぼ同じ形）

- `build.yml`: `v*.*` のタグの push だけで走る。matrix は `ubuntu-latest`・`windows-latest`・`macos-latest`（`fail-fast: false`）
  - タグから版を取り（`v0.1` → `0.1.0`）、CI の中だけ `tauri.conf.json` の `version` を書き換える（コミットしない）
  - Rust のテスト → フロントの依存 → （Fuseforks はフロントのテスト）→ `tauri-apps/tauri-action@v0` でビルドし、タグの Release に添付する
  - **Release は下書き（`releaseDraft: true`）**: 3 OS が独立に添付するので、false だと 1 OS 通っただけで公開される（Fuseforks が 2 回踏んだ）。人が Assets を見てから publish する
  - **macOS の署名と公証は、秘密 5 つ（`APPLE_CERTIFICATE`・`APPLE_CERTIFICATE_PASSWORD`・`APPLE_ID`・`APPLE_PASSWORD`・`APPLE_TEAM_ID`）が全部ある時だけ**環境変数に出す。
    空文字を渡すと Tauri が「証明書が指定された」と読んで macOS だけ落ちる。無い時は「署名していない」をログに出して進む
  - artifact: Lorekeel は `bundle/` を 7 日だけ上げる。Fuseforks は上げない（private リポの Actions のストレージ 500 MB を超えて落ちた。Release の Assets で足りる）
- `verify-notary.yml`: 手動だけで走り、`notarytool history` で公証の資格情報が通るかを 1 分で確かめる（macOS のビルドは 20 分かかるため）

### Lorelei

- **GitHub 上でフォーク**（`betyourluck/Lorelei`、親は `illionillion/mermaid-editor`、public）。origin では **Actions が一度も走っていない**（`gh run list -R betyourluck/Lorelei` が空）。
  フォークは Actions の画面で一度有効にするまでワークフローが走らない。秘密は 1 つも無い
- **フォーク元から来たワークフローが 2 つある**（`.github/workflows/`）。Actions を有効にすると、main への push のたびに走る:
  - `ci.yml`（Quality）: ESLint・Prettier（`prettier --check .`）・型検査・vitest・Playwright の E2E・VRT（`ghcr.io/illionillion/mermaid-editor-vrt` を pull、無ければ build して **push**）・Next と Storybook のビルド。
    **Prettier は落ちる**（HEAD は全体が整形済みではない, failures #23）。VRT の push はフォーク元の ghcr への書き込みで、権限が無く落ちる
  - `deploy.yml`（Deploy to GitHub Pages）: main への push で `pnpm build` と Storybook を作り、**`docs/` をボットが main へコミットする**。origin は Pages を有効にしていない（`has_pages: false`）。
    走ると、利用者の手元の main と origin がボットのコミットで分かれる
- Cargo の project が 2 つ: ルートの workspace（`crates/lorelei_core`・`crates/lorelei_mcp`）と、独立した `src-tauri/`（Lorekeel と同じ形）。**どちらにも `[patch.crates-io]` で `vendor/merman-core`**
- フロントは pnpm 9（`pnpm-lock.yaml`、`.github/actions/install` が `pnpm/action-setup@v4` + Node 20 + `pnpm install --frozen-lockfile`）。`@tauri-apps/cli` は devDependencies
- `tauri.conf.json`: `version` 0.1.0、`beforeBuildCommand` は `npm run build`（中身は `next build`。tauri の CLI が `TAURI_ENV_PLATFORM` を付けるので `out/` へ書き出し、`docs/` は触らない, failures #18）、
  `bundle.targets` は `all`、`resources` に LICENSE・同梱フォントの OFL・merman の LICENSE（About に一覧を出す, spec 01・02）。同梱フォントは git にある
- `src-tauri/build.rs`: Windows の MSVC だけ、テスト用の exe にも manifest を埋め込む（`cargo test` が落ちないように）
- 確かめた OS は Windows だけ。macOS・Linux でビルドしたことも、動かしたことも無い（自作タイトルバー `decorations: false`、rfd の保存ダイアログ、同梱フォントでの書き出し、single-instance、MCP の待ち受け）
- タグは 1 つも無い（origin・手元とも）

## 決めること

### D1. どの OS を作るか（**裁定 1 = 案 A**）

- **案 A（採用）: 兄弟と同じ 3 OS**（Windows・macOS・Linux）。`fail-fast: false` と下書きの Release なので、macOS・Linux が落ちても Windows は揃う。
  ただし macOS・Linux は**作れることだけを確かめ、動くかは確かめていない版**になる（Release の本文にそう書く）。初めのタグで落ちた OS は、直すか matrix から外すかをその時に決める
- 案 B: Windows だけ。確かめた OS だけを出す。macOS・Linux は動かす手段ができてから足す
- 案 C: Windows と macOS

推奨の理由: 依頼が「兄弟と同じように」で、matrix を 1 行足すだけなら、どこで落ちるかを先に知れる。Release は下書きなので、確かめていない OS の Assets を公開前に外すこともできる。

### D2. フォーク元から来たワークフロー（**裁定 2 = 案 A**）

Actions を有効にした時に `ci.yml`・`deploy.yml` が main への push のたびに走らないようにする。

- **案 A（採用）: 2 つとも `workflow_dispatch`（手動）だけにする**。消さないので、フォーク元と同じ中身を手元で残せる（上流への PR の差分にも出ない形を保つなら、トリガーの行だけ変える）。
  `deploy.yml` は Pages を使わないので実害（ボットのコミット）だけを止める
- 案 B: 2 つとも消す
- 案 C: `ci.yml` は Lorelei 向けに作り直す（Prettier を外す・VRT を外す・Rust のテストを足す）。`deploy.yml` は手動にする。作り直しは別の spec にする

### D3. ビルドの前のテスト（**案 A**）

- **案 A（採用）**: 各 OS で、ルートの `cargo test --workspace`・`src-tauri` の `cargo test`・vitest（`pnpm test:run`）を、`tauri-action` の前に走らせる（兄弟と同じく、壊れていれば重いビルドに進まない）。
  vitest は手元で 2 分前後。3 OS とも走らせる（OS で落ちる差を知るため）
- 案 B: テストは Windows だけで走らせる

### D4. 形の細部（兄弟に合わせる）

- トリガーは `v*.*` のタグの push だけ。版はタグから取り、CI の中だけ `src-tauri/tauri.conf.json` の `version` を書き換える（`package.json`・`Cargo.toml` の版は変えない。インストーラーの版は `tauri.conf.json` から取られる）
- Release は下書き（`releaseDraft: true`）。題は「Outcasts Lorelei vX.Y.Z」（識別子 `jp.outcasts.lorelei` と兄弟の題に合わせる）。本文に「macOS・Linux の版は動作を確かめていない」（裁定 1 が案 A の時）と、Windows の未署名で SmartScreen が出ることを書く
- macOS の署名と公証は兄弟と同じ形（秘密 5 つが揃った時だけ。無ければ「署名していない」をログに出す）。`verify-notary.yml` も写す。秘密を足すかは利用者が決める（足すまでは未署名の .app）
- Windows のコード署名はしない（兄弟と同じ）
- artifact は上げない（Fuseforks と同じ。Release の Assets で足りる。public リポだがストレージを食うだけ）
- Rust のキャッシュはルートと `src-tauri` の 2 つ（`swatinem/rust-cache@v2` の `workspaces: ". -> target"`・`"src-tauri -> target"`、Lorekeel と同じ）。pnpm は `.github/actions/install` を使う
- Linux の依存は兄弟と同じ apt の一覧（WebKitGTK 4.1 など）

## Phase

- **P0（リサーチ）**: `tauri-action` が pnpm のリポで `pnpm tauri build` を呼ぶか、`beforeBuildCommand` の `npm run build` が pnpm で入れた依存で通るか（Windows の手元で `npm run build` を `TAURI_ENV_PLATFORM` 付きで 1 回）。
  `bundle.targets: all` で Windows に msi と NSIS の両方ができるか（手元で `tauri build` を bundle 付きで 1 回。WiX の取得・時間）。
  フォークの Actions を有効にする操作と、有効にした時に既存のワークフローが走る条件（利用者の画面）
- **P1**: 裁定 2 の変更（既存のワークフローのトリガー）→ `build.yml`・`verify-notary.yml` を足す。台帳（LORELEI.md の「ビルド」にインストーラーの取り方、CLAUDE.md の開発コマンド）
- **P2**: 利用者が Actions を有効にし、試しのタグ（例 `v0.1.0`）を push → 3 OS（裁定 1）の結果を見る → 下書きの Release の Assets から Windows のインストーラーを入れて起動し、MCP が繋がること・図の一覧が前のまま読めることを確かめる。
  落ちた OS は直すか外すかを決める。試しのタグの Release は publish しない（消すかは利用者が決める）

## 受け入れ条件

1. `v*.*` のタグの push で、裁定 1 の OS のビルドが走り、タグの下書きの Release にインストーラーが付く
2. Windows のインストーラーで入れた Lorelei が起動し、MCP が繋がり、前の図の一覧（`{app_data_dir}`）が読める
3. main への普通の push では、ビルドも、フォーク元から来たワークフロー（裁定 2）も走らない
4. macOS の秘密が無い時は、macOS のビルドが「署名していない」をログに出して進む（落ちない）
5. インストーラーの版がタグの版になる

## スコープ外

- Windows のコード署名（SmartScreen）
- 自動更新（Tauri の updater）
- macOS・Linux で動くことの確かめ（裁定 1 が案 A でも、作れることまで）
- フォーク元の `ci.yml` の作り直し（裁定 2 が案 C なら別の spec）
- crates.io の merman の新版への切り替え（今の `vendor/` の patch のままビルドする）

## P0 結果（2026-10-04）

| 確かめたこと | 結果 |
|---|---|
| `tauri-action` が pnpm のリポで何を呼ぶか | README（`tauri-apps/tauri-action`、最新は `action-v1.0.0`、兄弟は `@v0`）: `tauriScript` を省くと、ロックファイルから `npm\|pnpm\|yarn\|bun tauri` を選ぶ。`projectPath` を省くとリポの根（`package.json` と `src-tauri/` がある）。pnpm は `.github/actions/install` が入れる。兄弟と同じ `@v0` にした |
| `beforeBuildCommand` の `npm run build` が pnpm で入れた依存で通るか | 通る（`npm run` は `node_modules/.bin` の `next` を呼ぶだけ。spec 19 P2 の `tauri build --no-bundle` と、下の bundle 付きのビルドで実行した）。`TAURI_ENV_PLATFORM` が付くので `out/` へ書き出し、`docs/` は書き換わらない |
| `bundle.targets: all` で Windows に何ができるか | 手元で `tauri build`（bundle 付き、作業場所を分けて最初から 614 秒）: `Lorelei_0.1.0_x64_en-US.msi`（21.7 MB、WiX）と `Lorelei_0.1.0_x64-setup.exe`（15.9 MB、NSIS）の 2 つ。WiX と NSIS は Tauri の CLI が取ってくる |
| フォークの Actions | origin は一度も走っていない。API は `enabled: true` だが、フォークは Actions の画面で「ワークフローを有効にする」を押すまで走らない（P2 で利用者が押す） |

## P1 結果（2026-10-04）

- `.github/workflows/build.yml`（新規）: 兄弟の形に、Lorelei の違いを入れた — pnpm は `.github/actions/install`、Rust のキャッシュは `.`・`src-tauri` の 2 つ、
  テストはルートの `cargo test --workspace`・`src-tauri` の `cargo test`・`pnpm test:run`（3 OS とも）、版は `src-tauri/tauri.conf.json` だけ書き換える、
  Release は下書きで題「Outcasts Lorelei vX.Y.Z」、本文に Windows の SmartScreen と「macOS・Linux は動作を確かめていない」を書く、artifact は上げない
- `.github/workflows/verify-notary.yml`（新規）: Fuseforks のものをそのまま写した（Lorekeel と同じ中身）
- `ci.yml`・`deploy.yml`: トリガーを `workflow_dispatch` だけにし、フォーク元の元の形をコメントに残した（裁定 2）
- 4 つとも YAML として読め、トリガーは `build.yml` がタグの push だけ、ほかの 3 つが手動だけ（PyYAML で確かめた）。Actions の上での実行は P2
- LORELEI.md に「インストール」の節（Releases の Assets、OS ごとのファイル、Windows の SmartScreen、確かめている OS は Windows だけ）

### P2 の前に利用者がすること

1. main を origin へ push する（ワークフローを origin に載せる）
2. origin（betyourluck/Lorelei）の Actions の画面で、ワークフローを有効にする
3. macOS の署名と公証を使うなら、Settings → Secrets and variables → Actions に 5 つを登録する（兄弟のリポジトリと同じ値）:
   `APPLE_CERTIFICATE`（.p12 を `openssl base64 -A` した改行なしの base64）・`APPLE_CERTIFICATE_PASSWORD`・`APPLE_ID`・`APPLE_PASSWORD`（App 固有パスワード、ハイフン込み 19 文字）・`APPLE_TEAM_ID`。
   登録したら「Verify notary credentials」を手動で走らせて、公証の資格情報が通るかを 1 分で確かめる
4. 試しのタグを push する（例: `v0.1.0`）

## P2 結果（途中、2026-10-04）

- 利用者が Actions を有効にし、秘密 5 つを登録した。`APPLE_ID`・`APPLE_TEAM_ID` が一度空の値で登録されていた（`gh secret set` の入力が渡らなかった）のを、
  「Verify notary credentials」の「Check secrets are present」で見つけて登録し直した。2 回目の実行（run 37193720441）で `notarytool history` が通った（ID・App 固有パスワード・Team ID の組が正しい）。
  `.p12` は Fuseforks の時に Windows で作ったもの（`~/.apple-signing/`）を使った
- **1 回目: `v0.1.0`（run 37194306370）— 3 OS ともビルドの前のテストで止まった**（Release はできていない）:
  - Windows（vitest 10 件）・Ubuntu（vitest 3 件）: 取り込みのテストの `waitFor` が既定の 1 秒で時間切れ（failures #34）。`9191949` で既定を 10 秒にした
  - macOS（`src-tauri` の `cargo test`）: `generate_context!` の複数の展開で `_EMBED_INFO_PLIST` が重複（failures #35）。`363594f` で 1 か所にまとめた（Windows で 47 件が通ることは確かめた。macOS は次のタグで確かめる）
  - ルートの `cargo test --workspace` と、Windows・Ubuntu の `src-tauri` の `cargo test` は 3 OS とも通った
- 次: 直しを push して、新しいタグ（`v0.1.1`）でもう一度ビルドする。`v0.1.0` のタグは残す（兄弟と同じく、タグは push した時点で残る。Release は無い）
