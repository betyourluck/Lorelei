# CLAUDE — Lorelei

Mermaid の図を **AI が MCP 経由で生成・検査・書き出し**し、人が GUI で手直しするデスクトップアプリ。
[illionillion/mermaid-editor](https://github.com/illionillion/mermaid-editor)（MIT）のフォークに
Rust + Tauri 2 の殻を被せる。

## 北極星

**「AI が書いた Mermaid を、そのまま使える図にする」。** 図の素材（DB のスキーマ・コード）を読むのは
AI 側であり、Lorelei は受け取った Mermaid の**検査・描画・書き出し・GUI での手直し**だけを受け持つ。
Lorelei は DB にもリポジトリにも繋がない（秘密を置く欄を構造上持たない）。

## アーキテクチャ（spec 01 → spec 03 で MCP を GUI の中の HTTP へ移した）

```text
Claude Code 等 ──HTTP(MCP, 127.0.0.1:39642/mcp, Bearer)──▶ 動いている GUI（Tauri、single-instance）
                                                          ├─ lorelei_mcp（待ち受け・ツール 6 本）─ lorelei_core（検査・描画・書き出し。純 Rust）
                                                          └─ open_in_editor ─ EditorPort ─▶ 図の一覧に 1 件 ─▶ フォーク元の React エディタ（lib/desktop が受け口）
```

- **`crates/lorelei_core`**: merman で Mermaid → SVG。PNG / PDF への変換は自前（usvg + resvg / krilla-svg に
  **同梱フォント**を渡す — merman-export はフォント DB を差し替えられず、日本語が太字へ落ちるため）
- **`crates/lorelei_mcp`**: MCP サーバー（rmcp 2.2 の Streamable HTTP + axum）のライブラリ。ツールは 6 本（検査・描画の 3 本、spec 04 の読み戻しの `list_diagrams` / `read_diagram`、spec 08 の書き換えの `update_diagram`）。
  `start_http` で `127.0.0.1` だけに待ち受け、トークン・Host・Origin を検査する。GUI の図の一覧へは `EditorPort`（開く・一覧・読む・書き換える）でつなぐ（Tauri に依存しない）。
  **GUI を閉じていると MCP は使えない**（stdio の `lorelei --mcp` は spec 03 P3 で撤去）
- **`src-tauri/`**: GUI。workspace の外に置く（AppPromoVideo / Kataribe と同じ流儀）。起動時に MCP を待ち受ける（既定で ON、
  設定は `{app_data_dir}/mcp_server.json`、設定画面から切り替え）。保存ダイアログと About は rfd（JS に権限を足さない）。
  CSP は style-src の自動ハッシュ追記を止めている
- **`lib/desktop/`**: フロント側の Tauri 依存はここだけ（Web 版では何もしない）。フォーク元への差し込みは spec 01 の 4 ファイル・8 行 + spec 02 の 5 ファイル・12 行（`app/layout.tsx` の外枠、エディタ 2 つの高さ、パネル 2 つの `useDesktopActions`。重なりを除いて計 7 ファイル）+ spec 04 P0 でエディタ 2 つの初期図を export（`initialFlowNodes` / `initialERNodes`。初期図の突き合わせ用。ファイルは既存の 7 つに含まれる）+ spec 07 P2 でパネル 2 つの `useDesktopActions` に向き（`direction` / `setDirection`）を足した（同じ 2 ファイル）+ spec 15 P3 でフローチャートのパネルの `useDesktopActions` に `addFrame` を足した（同じファイル）
- **フロント（`app/` `features/` `components/`）**: フォーク元のコード。直してよい（下の掟の「フォーク元は必要なら直してよい」）。
  **フォーク元の改善**（上流へ返せる。`lib/desktop/` と台帳を含まないコミット）は spec 06（削除の確認・ER 図のテーブル削除）と spec 07（FK・図の向き）の「P1 結果」「P2 結果」、spec 09（コード生成のプレビュー）の「P1 結果」、spec 10（CodeMirror のエディタ）の「P1〜P3 結果」、spec 11（mermaid.js での取り込み）の「P1〜P3 結果」、spec 12（古いパーサーの撤去）の「P1・P2 結果」、spec 13（ER 図の名前）の「P1 結果」「P2 結果」「P4 結果」、spec 15（フローチャートのサブグラフ）の「P1 結果」「P3 結果」に一覧がある。PR を出すかは利用者が決める。
  **フォーク元へ出した PR**: [illionillion/mermaid-editor#74](https://github.com/illionillion/mermaid-editor/pull/74)（spec 13 の生成器の直しだけを移植。Lorelei のコミットはデスクトップの差し込みの上で作ったので cherry-pick では載らない — spec 13「フォーク元への PR」）。
  **デスクトップではフォーク元のパネル（インポートを含む）を隠し、ツールバーから `lib/desktop/` のダイアログを開く** — フォーク元の部品を直したら、デスクトップのどの操作がどの部品を開くかを確かめる（failures #17）

## 掟（Mandate）

- **フォーク元は必要なら直してよい**（2026-09-25 利用者裁定で改訂。旧: デザイン調整と接続修正だけ）:
  フォーク元は 11 か月更新が止まっていて（2026-09 時点の利用者の言）、中途半端な所も多い。新しくできるものは取り入れる。ただし
  - **Web 版（GitHub Pages）はなるべく壊さない**。Tauri 専用の UI は実行時に出し分ける（`lib/desktop/`）。壊す必要がある時は理由を spec に書く
  - **上流へ返せる修正**（バグ修正・デスクトップに依らない改善）は、デスクトップ専用の変更とコミットを分け、PR で返せる形にしておく
    （フォークした側の礼儀。返すかどうかは利用者が決める）
  - デスクトップ専用の新しいコードは、これまでどおり `crates/` `src-tauri/` `lib/desktop/` に置く
- **データ・ファースト**: コードの前に [data_contract.yaml](data_contract.yaml) の名詞を凍結する
- **PoC 必須**: バグ修正・新機能は Red→Green をテストで実証してから完了
- **リサーチ先行**: 実装前に三点測量（コード grep / 仕様・ライブラリのソース / 記憶）
- **撤去・改名したら grep**: 機構・enum 値・フィールドを変えたら、その名前で全台帳を grep して
  追従漏れを回収するまで完了にしない。機能の着地時は「どの台帳へ書いたか」を数える
- **GUI は実行して生成物を見るまで完了にしない**（テスト緑 ≠ 実機で動く）

## どこに何が書いてあるか

| 知りたいこと | 読む場所 |
|---|---|
| 使う人向けの説明（ビルド・Claude Code への登録・ツール・既知の制約） | [LORELEI.md](LORELEI.md)（README からは 1 行で案内） |
| 名詞・型・MCP ツールの入出力 | [data_contract.yaml](data_contract.yaml) |
| 決定事項と Phase 計画 | `specs/NN_*.md`（起票 → 査読 → rev 改訂 → Phase 単位で main へ直接コミット） |
| 踏んだ罠（症状 → 真因 → 処方 → 一般化） | [failures.md](failures.md) |
| 上流 crate に当てている修正（merman-core） | [vendor/merman-core/LORELEI_PATCH.md](vendor/merman-core/LORELEI_PATCH.md) |
| フォーク元の開発手順・テスト・VRT | [DEVELOPMENT.md](DEVELOPMENT.md) / [TESTING.md](TESTING.md) |

## 現状

- 2026-09-24: [spec 01](specs/01_tauri-mcp-foundation.md) rev3。**spec 01 Done**（P0〜P5。未確認・未達は spec 01「受け入れ条件の結果」）。
- 2026-09-30: [spec 15](specs/15_flowchart-subgraph.md) **進行中** — rev2（フローチャートの subgraph をエディタの枠（xyflow の親ノード）にし、保存・読み戻し・コード生成で落とさない。裁定 1〜5 済み）。
  P0（mermaid.js と merman に 87 通り）・P1（フォーク元: 取り込み・入れ子の段組み・枠の表示・生成器。Web 版の画面で確認）・
  P2（Rust の `to_editor` が枠を返す・`Document.layout` は絶対座標で枠は大きさも持つ。`tauri dev` で MCP の往復と開き直しを確認）・
  P3（GUI の編集: 枠を追加・ドロップで出し入れ・題と ID・大きさ・中身を残す削除。計算は `features/flowchart/utils/frame-edit.ts`。Web 版の画面で確認）着地。
  P0 で、ラベルの `direction LR` を mermaid.js が囲みの中でも行ごと食ってノードが消える今の生成器の穴を見つけて直した（failures #21）。P4（配布ビルドで MCP で開く → 利用者が枠を追加・出し入れ・題と ID・× で削除・大きさ → `read_diagram` と保存ファイルで確認）着地、受け入れ条件 1〜7 通過（未確認は spec 15「P4 結果」）。
  P3 の後に `tauri dev` で利用者が、枠の × で選んでいた中のノードまで消す扱いを見つけて直した（failures #24）。P5（任意: 枠を指す線・枠の中の向き）は利用者の判断待ち。
  **xyflow は親を消すと子も消す**ので、枠の削除は `onBeforeDelete` で子を消す一覧から外して先に付け替えている（`planFrameDelete`）
- 2026-09-29: [spec 14](specs/14_merman-er-word-boundary.md) **Done** — rev1（上流 PR [Latias94/merman#153](https://github.com/Latias94/merman/pull/153) は 2026-09-29 にマージ済み。merman の ER 図の字句解析が `many` / `one` / `to` を境界なしで取り、
  AI が書いた ER 図の `tokens` などのテーブル名を誤りにしていた（`A one to onerous : x` は名前が `rous` に化けた）。写しを mermaid.js の `\b` と同じ境界にした）
- 2026-09-29: [spec 13](specs/13_er-names.md) **Done** — rev2（ER 図の生成器が空白を含むテーブル名をそのまま書き、デスクトップで開き直せない・テーブルが割れる。
  テーブル名・関係のラベルを要る時だけ囲み、書けない列は書き出さない（`quoteErName` / `columnIssue`）。P0 で mermaid.js と merman に名前の格子を通して規則を決めた。
  関係のラベルは spec 11 D5 の取りこぼし（キーワードのラベル・Rust の取り込みが `#quot;` を戻さない, failures #19）。P2 で入力欄の印・コード生成のダイアログの一覧・テーブル名の確定。P3 で Rust の取り込みも名前とラベルを戻す（TS の生成器の出力を fixture にして Rust に通す）。P4 の配布ビルドで、`"` を含むテーブル名の図を開くと落ちる不具合を見つけて直した（xyflow の `useUpdateNodeInternals` が ID をセレクタにエスケープせずに埋める, failures #20））
- 2026-09-29: [spec 12](specs/12_remove-legacy-parser.md) **Done** — rev0（フォーク元の正規表現のパーサー `parseMermaidCode` / `convertMermaidToERData` を撤去。
  取り込みは spec 11 の mermaid.js の経路だけ。古いパーサーを使っていたテスト（往復・デスクトップの `convert_source` の模擬）は mermaid.js の経路へ移した）
- 2026-09-29: [spec 11](specs/11_import-via-mermaid.md) **Done** — rev1（インポートの取り込みを**フォーク元の正規表現のパーサーから mermaid.js 11.17.2 の解析**
  （`getDiagramFromText` の db の写し）に替え、Rust の `to_editor` と同じ対応表で取り込む。取り込むと消えるものを要約と行の黄色の印で知らせる。生成器のラベルの囲み（往復が mermaid.js で戻る））。
  D7 で**デスクトップのツールバーのインポートも同じ本文**にした（取り込みは Rust のまま）。Rust の `to_editor` の穴 2 つ（ER 図の subgraph で止まる・線の ID の衝突）も直した。
  spec 10 のインポートの変更がデスクトップに届いていなかった件の訂正は failures #17
- 2026-09-29: [spec 10](specs/10_codemirror-editor.md) **Done** — rev1（インポートとコード生成のエディタを **CodeMirror 6**（Kataribe と同じ設定の React の薄い包み）にし、
  Mermaid の補完と文法の赤線（mermaid.parse）を入れ、インポートも 90%×85% で右にプレビュー）。エディタは `lazy-code-editor` を通してダイアログを開く時に読む。
  古い色付けの部品と依存 5 つを撤去。P0〜P4 着地（P4 は配布ビルド）。PowerShell からの pnpm・git の罠は failures #16
- 2026-09-28: [spec 09](specs/09_code-preview.md) **Done** — rev2（「コード生成」のダイアログを 90%×85% に広げ、左にコード・右に mermaid.js で描いたプレビュー。
  mermaid は **11.17.2 に固定**（書き出しの merman と同じ版。12 は既定の配置が ELK・配色が neo に変わる）、ダイアログを開くまで読み込まない。プレビューと書き出しは描き手が違い一致しない — LORELEI.md 既知の制約）。
  P0〜P2 着地（P2 は配布ビルド）。`tauri dev` を動かしたまま build すると dev が壊れた件（failures #15）は、2026-09-29 に真因（Next が `output: "export"` の時 `distDir` を書き出し先と読み替え、
  作業場所を `.next` に固定する）を突き止め、**Tauri の dev は `output` を外して `.next-tauri-dev` を使う**ようにした（`next.config.mjs`）
- 2026-09-28: [spec 08](specs/08_update-diagram.md) **Done** — rev2（AI が既存の図を書き換える `update_diagram`。AI は `expected_updated_at`、GUI の自動保存は `base_updated_at` の楽観ロック、
  開いている図は載せ替え、揃え書きは `normalize_pending` で `updated_at` を進めない、初期図の保険は `first_fill` の時だけ、書き換え前は `history/` に 1 世代）。P0〜P3 着地（P3 は `tauri dev`。配布ビルドでの往復と起動直後の画面の目視は未確認のまま閉じた — spec 08「P3 結果」）。
  P3 で起動直後の載せ替えが捨てられる不具合（failures #13。spec 04 現況 4 の 2 件目と同じ顔）を直した。テストの罠は failures #14
- 2026-09-27: [spec 07](specs/07_direction-and-fk.md) **Done** — rev1（図の向き TD/LR/RL/BT と ER 図の FK をエディタで扱い、MCP の取り込み・保存・読み戻しで落とさない）。
  フォーク元の改善のコミットは spec 07「P1 結果」。古い向きでの書き戻しが 2 回あり、原因は未解明（spec 07「P3 結果」）
- 2026-09-26: [spec 06](specs/06_confirm-delete.md) **Done** — rev1（ER 図のテーブルを「⋮⋮」メニューから消せるようにし、テーブル・ノードの削除（ボタンも Backspace も）に確認を入れる）。
  **フォーク元の改善**で、上流へ返せるコミットは spec 06「P2 結果」に一覧（PR を出すかは利用者が決める）
- 2026-09-26: [spec 05](specs/05_pane-width-and-loading.md) **Done** — rev1（左ペインの幅を変えるつまみと幅・開閉の記憶、図を開く間はエディタを隠して初期図を見せない、
  窓を隠したまま起動して Web 版の画面を見せない）。P1〜P4 着地。隠し方は `opacity`（xyflow がノードに `visibility: visible` を付けるので `visibility` では隠れない, failures #10）
- 2026-09-25: [spec 04](specs/04_readback.md) **Done** — rev1（人が GUI で直した図を AI が読み戻す: `list_diagrams` / `read_diagram`、`open_in_editor` の `document_id`）。P0〜P3 着地。
  P0 で図が初期図・別のエディタのノードで潰れる不具合を直した（failures #7・#8）。GUI の一覧の ● が 1 件落ちた件は未解明（spec 04「未検証」）
- 2026-09-25: [spec 03](specs/03_http-mcp-in-gui.md) **Done** — rev1（MCP を GUI の中の HTTP へ移す）。P0〜P4 着地。配布ビルドに設定画面の登録コマンドで
  Claude Code から 3 本を確認。stdio の `lorelei --mcp` と inbox は撤去。次は読み戻し（spec 04）
- 2026-09-25: [spec 02](specs/02_desktop-shell.md) **Done** — rev4（デスクトップの外枠 = 自作タイトルバー・ツールバー・図の一覧・「保存」）。P0〜P4 着地。
  受け入れ条件 1（配布ビルドのタイトルバー）と 3（VRT）は未確認のまま閉じた。図の一覧は `{app_data_dir}/documents/` を Rust だけが読み書きする
- 開発コマンド: フロントの依存は `corepack pnpm@9 install --ignore-scripts`（pnpm が無い環境でも corepack で足りる。
  lefthook の hooks は入れていない）。GUI は `corepack pnpm@9 exec tauri dev` / `... tauri build --no-bundle`。
  Rust は `cargo test --workspace`（core / mcp）と `cd src-tauri && cargo test`（GUI の殻、独立 project）。
  静的書き出しが通るかの確かめは `TAURI_ENV_PLATFORM` を付けた `next build`（→ `out/`）。**素の `next build` は git の中の `docs/`（GitHub Pages）を上書きする**（failures #18）。
  ER 図の生成器を変えたら `LORELEI_UPDATE_FIXTURES=1` で vitest の `__tests__/lorelei/er-names-fixture.test.ts` を回して `crates/lorelei_core/tests/fixtures/er_names.json` を書き直し、
  Rust のテストも回す（TS の生成器の出力を Rust の取り込みに通す, spec 13 P3）。フローチャートの生成器の枠を変えた時も同じく `flow-subgraphs-fixture.test.ts` → `flow_subgraphs.json`（spec 15 P2）。
  整形は HEAD で整形済みのファイルと新しいファイルにだけかける（HEAD は Rust も TS も全体が整形済みではない, failures #23）。ノードの接続点の測り直しは xyflow の `useUpdateNodeInternals` ではなく
  `features/flowchart/hooks/use-update-node-internals.ts` を使う（xyflow のものは ID を CSS セレクタにエスケープせず埋め、`"` を含む ID で落ちる, failures #20）
- **`src-tauri/Cargo.toml` にもルートと同じ `[patch.crates-io]` がある**（独立 project なのでルートの patch が効かない）。
  merman-core の patch を外す時は両方消す
- **merman-core は `vendor/` の修正版を使っている**。修正は 2 つ: ① 日本語のノード ID を受け付ける（上流に **マージ済み**、
  [Latias94/merman#146](https://github.com/Latias94/merman/pull/146)、2026-09-24。写しはマージ版の意味 = mermaid.js の `UNICODE_TEXT` 範囲表、キーワード境界は ASCII）
  ② ER 図の `many` / `one` / `to` を語の境界で取る（`tokens` などの名前を通す。spec 14。上流に **マージ済み**、[Latias94/merman#153](https://github.com/Latias94/merman/pull/153)、2026-09-29）。
  2026-09-30 時点で crates.io の最新は `0.8.0-alpha.6` で、どちらも入っていない。**両方を含む版が出たら `merman` の版を上げて写しと patch を消す**。
  写しの中では merman-core のテストをコンパイルできない（上流の `fixtures/` を読む）— 上流側のテストは上流の作業場所で回す。経緯は `vendor/merman-core/LORELEI_PATCH.md`
- 同梱フォントのライセンス文は `crates/lorelei_core/fonts/OFL.txt`（google/fonts の ofl/notosansjp から取得）。
  配布物の `licenses/` に同梱し、About（タイトルバーの「?」。spec 02 でネイティブのメニューを撤去）に一覧を出す
- vitest は 2026-09-29 から **「全件緑かつ exit 0（未処理のエラー 0）」を基準にできる**。この環境では全件を並列に走らせると 5 秒の際のテストが順に時間切れになるので、
  既定の上限を 15 秒にしてある（failures #3）。デスクトップのテストは境界 `@/lib/desktop/tauri` を静的に模擬する（`@tauri-apps/api/*` だけの模擬は未処理のエラーを出す, failures #14）
- 同梱フォントは `scripts/build-fonts.py` で Noto Sans JP の可変フォントから切り出す（手順と理由はスクリプト冒頭）
