# Lorelei

**Turn the Mermaid your AI writes into diagrams you can actually use.**

English | [日本語](README.ja.md)

[![Release](https://img.shields.io/github/v/release/betyourluck/Lorelei)](https://github.com/betyourluck/Lorelei/releases)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Web%20editor-blue)](https://betyourluck.github.io/lorelei-web/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Lorelei is a desktop app (Rust + Tauri 2) with a built-in **MCP server**. Claude Code and other MCP clients hand it Mermaid; Lorelei

- **checks** it (syntax, and what the editor can and cannot keep),
- **renders** it to **SVG / PNG / PDF** with a bundled font (Noto Sans JP), so Japanese text looks the same on every machine,
- **opens** it in a GUI editor, where you fix the layout and labels by hand,
- and lets the AI **read back** and **update** the diagram you edited.

The AI reads your source code or database schema and writes the Mermaid. Lorelei never connects to your database or repository, and has no place to put secrets.

```text
Claude Code ──MCP over HTTP (127.0.0.1:39642, Bearer token)──▶ Lorelei (desktop app)
                                                               ├─ validate / render (SVG, PNG, PDF)
                                                               └─ GUI editor (flowchart, ER diagram) ⇄ read_diagram / update_diagram
```

## Try it in your browser

**[Live demo → betyourluck.github.io/lorelei-web](https://betyourluck.github.io/lorelei-web/)**

The demo is the editor alone: paste Mermaid with 「インポート」 (Import), edit flowcharts (with subgraphs) and ER diagrams, and copy the result from 「コード生成」 (Generate code). The UI is in Japanese.
Nothing is saved, and the MCP server, the diagram list, and SVG / PNG / PDF export are available only in the desktop app.

## Install

Download an installer from [Releases](https://github.com/betyourluck/Lorelei/releases).

| OS | File | Notes |
|---|---|---|
| Windows | `*_x64-setup.exe` or `*_x64_en-US.msi` | Not code-signed: SmartScreen asks on first launch ("More info" → "Run anyway") |
| macOS (Apple silicon) | `*.dmg` | Signed and notarized |
| Linux | `*.AppImage` / `*.deb` / `*.rpm` | |

**Only Windows is tested by hand.** The macOS and Linux builds are produced by CI but have not been tried on a real machine yet — reports are welcome.

## Use it from Claude Code

The MCP server runs **inside the Lorelei window** and listens on `127.0.0.1:39642` only. It works while Lorelei is open.
(The app's UI is in Japanese for now; the button names below are given with translations.)

1. Start Lorelei. The dot next to "MCP" in the title bar turns green when the server is listening.
2. Click "MCP" to open the settings, then press 「登録コマンドをコピー」 (copy the registration command).
3. Run the copied command in the folder where you use Claude Code:
   ```bash
   claude mcp add --transport http lorelei http://127.0.0.1:39642/mcp --header "Authorization: Bearer <token>"
   ```
   Add `--scope user` to use it from every folder.
4. Restart Claude Code, or reconnect with `/mcp`.

### Tools

| Tool | What it does |
|---|---|
| `validate` | Checks the syntax, and tells whether the GUI editor can open the diagram and what it would drop |
| `render` | Renders to SVG / PNG / PDF (`output_path` for files). Also returns a small PNG preview |
| `open_in_editor` | Opens a flowchart or ER diagram in the editor as a new item in the diagram list |
| `list_diagrams` | Lists the diagrams in the editor |
| `read_diagram` | Reads a diagram as Mermaid, including the edits you made by hand |
| `update_diagram` | Replaces a diagram's content. Refuses if you edited it after the AI last read it |

Things to ask:

- "Draw an ER diagram of this database schema in Mermaid, check it with Lorelei, and export it to `D:/out/schema.pdf`."
- "Turn the flow in `src/order.rs` into a flowchart and open it in Lorelei."
- "Read the diagram I fixed in Lorelei and make `src/order.rs` follow that flow."

## Limitations

- The GUI editor opens **flowcharts and ER diagrams** only. Styling (`style`, `classDef`, …) is dropped in the editor; rendering and export keep it.
- Claude Code running **inside WSL** cannot export files (its `/home/...` paths are not absolute paths on Windows).
- The preview in the editor is drawn by mermaid.js, while export uses [merman](https://github.com/Latias94/merman) (Rust). Both follow Mermaid 11.17.2, but layout and fonts can differ slightly.

The full documentation — every tool's details, the diagram list, the known limitations — is in Japanese: [LORELEI.md](LORELEI.md).

## Build from source

Requirements: Rust 1.95+, Node.js (pnpm 9 via corepack).

```bash
corepack pnpm@9 install --ignore-scripts
```

```bash
corepack pnpm@9 exec tauri build --no-bundle
```

This produces `src-tauri/target/release/lorelei.exe` (Windows). Design decisions are recorded in [specs/](specs/), and types and tool I/O in [data_contract.yaml](data_contract.yaml) (both in Japanese).

## Credits and license

Lorelei is a fork of **[illionillion/mermaid-editor](https://github.com/illionillion/mermaid-editor)** (MIT), the web-based Mermaid flowchart / ER diagram editor that Lorelei's GUI is built on. Fixes that do not depend on the desktop app are kept in separate commits so they can be sent back upstream.

- Lorelei / mermaid-editor — MIT ([LICENSE](LICENSE))
- [merman](https://github.com/Latias94/merman) — MIT OR Apache-2.0
- [mermaid.js](https://github.com/mermaid-js/mermaid) — MIT
- Noto Sans JP — SIL Open Font License 1.1 ([OFL.txt](crates/lorelei_core/fonts/OFL.txt))

Bug reports and questions: [Issues](https://github.com/betyourluck/Lorelei/issues).
