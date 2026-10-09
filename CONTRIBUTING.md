# Contributing to Lorelei

English | [日本語](#日本語)

Thank you for helping. Lorelei is a small project maintained by one person, so replies may take a few days. You can write in English or Japanese.

## Reporting a bug

Open an [Issue](https://github.com/betyourluck/Lorelei/issues) with the 「バグ報告」 (bug report) template, and include:

- **The Lorelei version and your OS.** The version is shown in About (the "?" button in the title bar).
- **Where it happened**: the desktop app or the [web demo](https://betyourluck.github.io/lorelei-web/).
- **For MCP problems**: the client (for example, the Claude Code version), the tool that was called, and the error it returned.
- **The Mermaid source**, as small as you can make it, plus the steps, what you expected, what happened, and a screenshot if the problem is visual.

**Never paste your MCP token** — the `Authorization: Bearer …` header or the contents of `mcp_server.json`. If it leaked, press 「トークンを作り直す」 (regenerate token) in the MCP settings and register Lorelei with your client again.

Lorelei is a fork of [illionillion/mermaid-editor](https://github.com/illionillion/mermaid-editor). If the bug also happens in the original web editor, please still report it here: fixes that do not depend on the desktop app are kept in separate commits so they can be sent back upstream.

## Suggesting a feature

Open an Issue with the 「新規機能追加」 (feature request) template. Start with the problem — what you were trying to do with the diagrams your AI writes — rather than the solution.

Lorelei checks, renders, exports and edits Mermaid. By design it does not connect to databases or repositories: the AI reads those and hands Lorelei the Mermaid.

## Pull requests

For anything larger than a small fix, please open an Issue first. Larger changes are designed in [specs/](specs/) before any code is written (the decisions are recorded there, in Japanese).

### Set up

Requirements: Rust 1.95+ and Node.js (pnpm 9 via corepack). Windows is the platform tested by hand.

```bash
corepack pnpm@9 install --ignore-scripts
```

```bash
corepack pnpm@9 exec tauri dev
```

That starts the desktop app. `corepack pnpm@9 dev` starts the web editor alone at http://localhost:3000.

### Check before you open the PR

No CI runs on pull requests, so please run the checks locally:

```bash
corepack pnpm@9 exec vitest run
```

```bash
corepack pnpm@9 exec tsc --noEmit
```

```bash
cargo test --workspace
```

```bash
cd src-tauri && cargo test
```

Also run ESLint on the files you changed (`corepack pnpm@9 exec eslint <files>`).

- **Bug fixes and features come with a test** that fails before the change and passes after it.
- **UI changes: try them in the running app** and attach a screenshot. Unit tests cannot see overlaps, hidden buttons or what a click actually hits.
- **Do not run a plain `next build`**: it overwrites `docs/`, which is the original project's GitHub Pages. To check the static export, set `TAURI_ENV_PLATFORM` (for example `TAURI_ENV_PLATFORM=windows corepack pnpm@9 exec next build`, which writes `out/`).
- **Format only what you change.** Many files are not Prettier-clean yet, and reformatting a whole file buries the real change in the diff.

### Where code goes

- `app/`, `features/`, `components/` — the web editor from the original project. Fixing it is welcome, but keep the web version working (it is also the live demo).
- `crates/` (the Rust core and the MCP server), `src-tauri/` (the desktop shell), `lib/desktop/` (the only place where the frontend talks to Tauri) — code for the desktop app only.
- `data_contract.yaml` — types and tool inputs/outputs. Update it when you change them.
- `vendor/merman-core/` — a patched copy of merman-core; see `LORELEI_PATCH.md` there.

Keep commits that change the original web editor separate from commits that touch `lib/desktop/`, `src-tauri/`, `crates/` or the docs, so that the former can be sent upstream as they are.

### Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), for example `feat(flowchart): …`, `fix(desktop): …`, `docs: …`. English or Japanese.

## Be kind

Be respectful and constructive. Harassment, discrimination and spam are not welcome.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).

---

## 日本語

手伝ってくださってありがとうございます。Lorelei は 1 人で保守している小さなプロジェクトなので、返事に数日かかることがあります。英語でも日本語でも構いません。

### 不具合を報告する

[Issue](https://github.com/betyourluck/Lorelei/issues) を「バグ報告」のテンプレートで作り、次を書いてください。

- **Lorelei の版と OS**。版は About（タイトルバーの「?」）に出ます
- **どこで起きたか**: デスクトップ版か、[Web 版のデモ](https://betyourluck.github.io/lorelei-web/)か
- **MCP の問題なら**: クライアント（Claude Code の版など）、呼んだツール、返ってきたエラー
- **Mermaid の本文**（できるだけ小さくしたもの）と、手順・期待した動き・実際の動き・見た目の問題なら画面

**MCP のトークンは貼らないでください**（`Authorization: Bearer …` のヘッダーや `mcp_server.json` の中身）。漏れた時は、MCP の設定の「トークンを作り直す」を押し、クライアントに登録し直してください。

Lorelei は [illionillion/mermaid-editor](https://github.com/illionillion/mermaid-editor) のフォークです。フォーク元の Web のエディタでも起きる不具合も、ここに報告してください。デスクトップに依らない直しは、上流へ返せるようにコミットを分けています。

### 機能を提案する

Issue を「新規機能追加」のテンプレートで作ってください。解決策より先に、困っていること（AI が書いた図で何をしようとしていたか）を書いてもらえると助かります。

Lorelei が受け持つのは、Mermaid の検査・描画・書き出し・編集です。DB やリポジトリには、作りとして繋ぎません（それを読むのは AI の側で、Lorelei は Mermaid を受け取ります）。

### プルリクエスト

小さな直しより大きなものは、先に Issue で相談してください。大きな変更は、コードの前に [specs/](specs/) で設計を決めて記録しています。

#### 準備

必要なもの: Rust 1.95 以上、Node.js（corepack で pnpm 9）。手元で確かめているのは Windows です。

```bash
corepack pnpm@9 install --ignore-scripts
```

```bash
corepack pnpm@9 exec tauri dev
```

これでデスクトップ版が起動します。`corepack pnpm@9 dev` なら Web のエディタだけが http://localhost:3000 で起動します。

#### PR を出す前の確かめ

プルリクエストでは CI が走らないので、手元で回してください。

```bash
corepack pnpm@9 exec vitest run
```

```bash
corepack pnpm@9 exec tsc --noEmit
```

```bash
cargo test --workspace
```

```bash
cd src-tauri && cargo test
```

変えたファイルには ESLint もかけてください（`corepack pnpm@9 exec eslint <ファイル>`）。

- **不具合の直しと機能には、テストを付けてください**。直す前に落ち、直した後に通るもの
- **UI の変更は、動いているアプリで試してください**。画面も添えてください。単体テストには、重なり・隠れたボタン・クリックが実際に何に当たるかが見えません
- **素の `next build` は回さないでください**。フォーク元の GitHub Pages である `docs/` を上書きします。静的書き出しを確かめる時は `TAURI_ENV_PLATFORM` を付けます（例: `TAURI_ENV_PLATFORM=windows corepack pnpm@9 exec next build`。`out/` に書き出します）
- **整形は変えた所だけにしてください**。Prettier で整形済みでないファイルが多く、ファイル全体を整形すると本当の変更が差分に埋もれます

#### コードの置き場所

- `app/`・`features/`・`components/` — フォーク元の Web のエディタ。直してかまいませんが、Web 版（ライブデモでもあります）を壊さないでください
- `crates/`（Rust の中核と MCP サーバー）・`src-tauri/`（デスクトップの殻）・`lib/desktop/`（フロントが Tauri に触れる唯一の所）— デスクトップ版だけのコード
- `data_contract.yaml` — 型とツールの入出力。変えたら更新してください
- `vendor/merman-core/` — 直しを当てた merman-core の写し。中の `LORELEI_PATCH.md` を見てください

フォーク元の Web のエディタを変えるコミットは、`lib/desktop/`・`src-tauri/`・`crates/`・ドキュメントを含むコミットと分けてください。前者をそのまま上流へ返せるようにするためです。

#### コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/) の形です（例: `feat(flowchart): …`、`fix(desktop): …`、`docs: …`）。英語でも日本語でも構いません。

### 振る舞い

敬意を持って、建設的に。嫌がらせ・差別・スパムはお断りします。

### ライセンス

コントリビュートしたものは [MIT License](LICENSE) で公開されることに同意したものとします。
