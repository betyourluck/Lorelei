# Spec: Tauri 化と MCP サーバー — AI が書いた Mermaid を検査・描画・書き出しする

**ID**: 01
**Date**: 2026-09-24
**Status**: **Done**（2026-09-24。rev3 承認 → P0〜P5 着地。受け入れ条件の結果と未確認の点は「受け入れ条件の結果」節。査読 1 の採否は末尾）
**Branch**: なし（Phase 単位で main へ直接コミット）

## Goal

Claude Code などの AI から **MCP で Mermaid を渡し、検査・SVG / PNG / PDF 書き出し・GUI での手直し**
ができるようにする。フォーク元の React エディタは、Rust + Tauri 2 のデスクトップアプリの画面として使う。

利用者の構想（2026-09-23）:

> MCP で繋いで AI で自動生成して Mermaid を作ったり、Mermaid を PDF 化したりする。
> MCP で繋げられるようにすれば、DB につなげて ER 図を作ったり、コードのフローを作ったりできる。

**この Goal の読み方が全部の判断を決める。** DB やコードを読むのは、それ用の MCP やツールを持つ
**AI 側**である。Lorelei は DB にもリポジトリにも繋がない。受け取るのは Mermaid のテキストだけ。

- **向きは「AI → Lorelei」だけ**（2026-09-23 利用者承認）。Lorelei から LLM を呼ぶ経路
  （AppPromoVideo の `claude -p` 型）は作らない
- **DB 接続を持たない帰結**として、Lorelei には接続文字列やパスワードを置く欄が構造上存在しない
- **フォーク元を崩さない**（利用者裁定 2026-09-23）。React のまま。書き換えはデザイン調整と
  MCP / Tauri 接続の不整合修正だけ。※ 2026-09-25 に利用者が改訂 —「必要なら直してよい、Web 版はなるべく壊さない、
  上流へ返せる修正は分けておく」(CLAUDE.md の掟)

## 現況（実測 2026-09-23〜24）

### 1. フォーク元は Mermaid を「描画」していない

`package.json` に `mermaid` が無い。中身は ReactFlow の組み立てエディタで、Mermaid は
自前の生成器（`generateMermaidCode`）とパーサー（`parseMermaidCode` / `convertMermaidToERData`）で
テキストとして出し入れしているだけ。扱えるのは **flowchart と erDiagram の 2 種**。
**描画（SVG / PNG / PDF）は新規に足す部分**である。

### 2. フロントは既に静的書き出し

`next.config.mjs` は `output: "export"`、`images.unoptimized: true`（常時）。本番時だけ
`distDir: "docs"`・`basePath: "/mermaid-editor"`・`assetPrefix: "/mermaid-editor/"`（GitHub Pages 用）が掛かる。
Tauri 用には basePath / assetPrefix 無しの書き出しが要る。

### 3. merman で日本語は描ける — ただし merman-export のフォントは制御できない

scratchpad の使い捨て PoC（merman 0.8.0-alpha.6、features `png,pdf`、Windows）。
**この PoC は merman-export 自体を測るためのもので、採用構成ではない**（採用構成は D3）:

| 項目 | 結果 |
|---|---|
| 日本語ラベルの flowchart / ER → SVG / PNG / PDF | 全部出た。レイアウト崩れ・文字化けなし（PNG を目視） |
| PDF | Type0 + FontFile2 + ToUnicode。サブセット埋め込み |
| 速度 | 初回 2.0 s（システムフォント DB 構築）、以降 100〜150 ms |
| **欠陥** | 日本語グリフが **BIZ-UDGothic-Bold** へ代替され太字化 |

原因は `merman-export` のフォント DB が非公開の `static`（`shared_system_fontdb`）で、
差し替え口が無いこと。`%%{init: {themeVariables: {fontFamily}}}%%` を足しても出力バイトは不変だった。

依存の実測: merman は **usvg / resvg 0.47・fontdb 0.23・krilla 0.8.2 / krilla-svg 0.8.1** を持ち込む
（PDF は svg2pdf ではなく krilla）。

### 4. merman のレイアウト計測は差し替えられる

レイアウトの文字幅計測は既定で `TextMeasurementPolicy::deterministic()`（フォント非依存）。
ただしソース上、計測の経路に **`Host { backend: Arc<dyn HostTextMeasurer>, fallback }`** があり、
`Renderer::with_text_measurement_policy` で渡せる（`merman-render/src/environment.rs:808`）。
**同梱フォントで実測する計測器を差し込む口は存在する**。実際に配線して動くかは未確認（P0-2）。

### 5. Windows の GUI サブシステム exe でもパイプの stdio は通る

`#![windows_subsystem = "windows"]` の最小 exe（stdin の行を stdout へ echo）を、
Python の `subprocess.Popen(stdin=PIPE, stdout=PIPE)` と Node の `child_process.spawnSync` から起動した。
**どちらも JSON-RPC 風の行が往復し rc 0**（2026-09-24）。親がパイプを渡せば、GUI サブシステムでも
`GetStdHandle` はそのパイプを返す。Claude Code は MCP サーバーを Node の子プロセスとして起動するので同じ条件。
**未確認なのは「Tauri を組み込んだ配布ビルドで同じか」だけ**（P3 で確認）。

### 6. フォーク元パーサーは AI が普通に書く構文で図を壊す

rev2 時点では「未知の構文を黙って捨てる」と見ていたが、P0-5 の実測で**それより深刻**と分かった —
ノードが生える・辺が付け替わる・図が空になる（詳細は「P0 結果」節）。同じ入力を merman は全部正しく解釈した。

## 設計の核

```text
Claude Code ──stdio(MCP)──▶ lorelei --mcp（ヘッドレス。Tauri を初期化しない）
                              ├─ validate / render ──▶ lorelei_core（純 Rust）
                              └─ open_in_editor
                                   ├─ {app_data_dir}/inbox/{uuid}.mmd を書く（絶対パス）
                                   └─ `lorelei --open <絶対パス>` を切り離して起動（終了を待たない）
                                        └─ 起動中の GUI があれば single-instance が argv を渡し、2 つ目は終了
                                           └─ Rust が inbox を読んで削除 → merman の意味モデルをエディタのデータ形へ変換 → フロントへイベント
```

**Fuseforks（Spec 25）と違い、HTTP の口は開けない。** Fuseforks が GUI の中で HTTP サーバーを
開いたのは、村の状態がその 1 プロセスのメモリにしか無かったから。Lorelei の検査・描画は
**状態を持たない純関数**なので、MCP クライアントが子プロセスとして起動する stdio で足りる。
その結果、トークン・ポート・Origin 検査・bind 先の議論がまるごと不要になる。

> ※ 2026-09-25 [spec 03](03_http-mcp-in-gui.md) でこの判断を覆す（利用者裁定: ローカル接続の HTTP だけにする）。
> 覆した理由は「検査・描画は状態を持たない」が読み戻し（spec 04）で成り立たなくなること — GUI で直した今の図は GUI にしか無い。

## 決めること

- **D1 MCP の入口は `lorelei --mcp`（単一 exe）。** 配布物が 1 つで済み、open_in_editor が
  `current_exe()` で自分自身を起動できる。GUI サブシステムでもパイプの stdio が通ることは現況 5 で実測済み。
  守ること:
  - `main()` の先頭、`tauri::Builder` に入る**前**に `--mcp` を判定して MCP ループへ分岐する。
    MCP モードでは WebView も single-instance プラグインも作らない（Builder に入らなければ登録されない）
  - **stdout は JSON-RPC 専用。** ログ・デバッグ出力はすべて stderr（`tracing` の出力先を stderr に固定）。
    `println!` は MCP モードのコードパスに置かない
  - **切り替え条件**: P3 で配布ビルド（`tauri build` の成果物）から `--mcp` のスモークテストが通らなければ、
    `lorelei-mcp`（console サブシステム）を別 bin にして `externalBin` で同梱する形へ移る

- **D2 ツールは 3 本: `validate` / `render` / `open_in_editor`。**
  入出力の正は [data_contract.yaml](../data_contract.yaml) `McpServer.tools`（spec へ写すと二重管理でずれるので写さない）。
  `list_diagram_types` は入れない — 対応している図の種類は `render` のツール説明に書けば足りる。
  `render` の `preview: true` は PNG を MCP の image content でも返す（AI が描画結果を目で検めて直すループ用）。
  **preview は長辺 1568 px 以内へ縮小してから返す**（元の書き出しファイルは縮小しない）。
  **P5 で既定を true に変更**（2026-09-24 利用者 FB: 説明文で「preview で確かめるのが確実」と勧めても、
  頼まれるまで AI がプレビューしなかった。勧めは制御にならないので既定値で担保する。代償は 1 回の render ごとに画像 1 枚分の入力。
  不要なら `preview: false`）。

- **D3 PNG / PDF の変換は Lorelei 側で書く。merman は SVG 生成だけに使う。**
  - merman は `default-features = false` で `svg` 系の feature だけを有効にする。**`png` / `pdf` / `jpeg` は入れない**。
    どのレイアウト feature（`layout-cytoscape` / `math` 等）が要るかは P1 で図の種類ごとに決める
  - **`htmlLabels` は常に false に固定する**（最上位と `flowchart.htmlLabels`。入力の `%%{init}%%` で true にされても上書き）。
    true のままだと resvg-safe の代替テキストが折り返しを失う（P0-2）
  - merman の SVG（`SvgPipeline::resvg_safe()` で foreignObject を外した形）を、**同梱フォントだけを読んだ
    fontdb** と一緒に usvg へ渡し、PNG は resvg、PDF は krilla-svg で作る。バージョンは merman が持ち込むもの
    （usvg 0.47 / krilla-svg 0.8）に揃え、二重に入れない
  - fontdb はプロセスで 1 つ（`OnceLock<Arc<fontdb::Database>>`）。並行する render で共有する
  - システムフォントは読まない — 端末ごとに出力が変わるのを防ぐ（`FontBundle.system_fonts: false`）
  - 同梱は Noto Sans JP（OFL-1.1）の**静的** Regular / Bold 2 本（P0-3: 可変フォントは Thin で描かれる）。
    日本語だけの版の容量は P1 で測る。About 画面と `THIRD_PARTY_LICENSES` に OFL の表示を入れる
  - 計測と描画のずれは P0-2 でしきい値内だったので、`HostTextMeasurer` は使わない。行頭の「、」（禁則なし）は
    既知の制約として README に書く

- **D4 merman はバージョンを `=0.8.0-alpha.6` で固定する。** alpha 版で API が動く。上げる時は
  構造テストを見てから。フォント DB の差し替え口が無い件は merman へ issue を出す（待たない。D3 で回避済み）。

- **D5' MCP 経由で GUI に開く時は、フォーク元パーサーを通さない**（rev3。rev2 の D5 は P0-5 で前提が崩れたため置き換え）。
  - `lorelei_core` が merman の意味モデル（`Engine::parse_diagram_sync` の JSON）を、フォーク元エディタの
    データ形（flowchart の `FlowData`、ER のノード / 辺）へ変換する。パーサーは merman の 1 つだけになる
  - `dropped` は**変換器が写せなかった要素**（subgraph・classDef・style・属性コメント等）を変換器自身が数える。
    MCP の戻り値も GUI の警告も同じ変換関数の出力なので、数がずれない
  - inbox には Mermaid 本文（`.mmd`）を置き、変換は GUI プロセスの Rust 側で行う（同じ `lorelei_core`）。
    ※ spec 02 P4 で inbox は `{uuid}.json`（`{ source, title }`）に替わった。この節の `.mmd` は spec 01 当時の形
    フロントが受け取るのは変換済みの JSON と `dropped`
  - フォーク元パーサーは**触らない**。手で貼り付ける既存の import ダイアログはフォーク元のまま残る
    （その不具合は上流への issue 候補。本 spec では直さない）
  - rev2 で予定していた「フォーク元パーサーの挙動を固定する vitest」と「fixture と Rust の表の同期検査」は**作らない**

- **D6 図の種類は merman のパース結果で決める。flowchart / erDiagram 以外は GUI で開かない。**
  先頭行の正規表現では判定しない（`%%{init}%%` やコメントが先に来る）。`open_in_editor` は、種類が
  `editable_in_gui` に無ければ `opened: false` と理由を返す。描画と書き出しは全種類できる。

- **D7 MCP 経由のファイル書き出しは `OutputPathPolicy` に従う。**
  - 絶対パスのみ（`Path::is_absolute`）。Windows では `/home/...` のような WSL のパスはドライブが無いので
    絶対パスと見なされず拒否される。**WSL 上の Claude Code からの利用は非対応**と README に明記する
  - 拡張子は format と一致。親ディレクトリは既存であること（作らない）
  - 一時ファイルは **`output_path` と同じディレクトリ**に `.{ファイル名}.tmp.{uuid}` で作り、書き終えてから rename
    （別ボリュームの temp_dir を使うと rename が失敗するため）。rename が失敗したら一時ファイルを消してエラーを返す
  - 既存ファイルは `overwrite: true` の時だけ上書き
  - AI クライアントは元々ファイルを書けるので、これは権限の制限ではなく
    **事故（相対パスの解釈違い・既存ファイルの上書き・壊れファイル）を防ぐための規則**

- **D8 open_in_editor の受け渡し。**
  - inbox は `{app_data_dir}/inbox/`。`app_data_dir` は Tauri の `app_data_dir()` と同じ場所
    （`dirs::data_dir()/jp.outcasts.lorelei`）で、MCP モードは Tauri を使わずに同じパスを組み立てる。
    **2 つの組み立てが一致することをテストで固定する**
  - GUI へは `--open <絶対パス>` で渡す。MCP 側は GUI を切り離して起動し、終了を待たない
  - 読み込みは **Rust 側**（inbox の中に限ってパスを検査してから読む）。フロントへは本文をイベントで渡す。
    **`@tauri-apps/plugin-fs` は入れない** — JS から任意のファイルを読める口を開けることになるため
  - 読み込んだら削除。クラッシュで残った分は、GUI 起動時に 24 時間より古いものを掃除する

- **D9 フロントの変更は次に限る。**

  | 変更 | 理由 |
  |---|---|
  | `next.config.mjs` に Tauri ビルド用の分岐（環境変数で `basePath` / `assetPrefix` を外し、`distDir` を `out` に） | Pages ビルドを壊さずに Tauri 用を出す |
  | `package.json` のスクリプトを `build`（Pages、従来どおり）と `build:tauri` の 2 本に。Tauri の `frontendDist` は `../out` | — |
  | `lib/desktop/`（新規）: `isTauri()`・invoke の薄い包み・open イベントの購読 | Tauri 依存をここへ閉じ込める |
  | 既存の download-modal（flowchart / ER）に SVG / PNG / PDF の書き出しを追加（Tauri 時のみ表示） | 手直しした図を GUI から書き出す |
  | エディタのページで open イベントを受け、変換済みの JSON をキャンバスへ載せ、`dropped` を警告表示 | open_in_editor の受け口（D5'）。既存 import 関数のパース後の処理（配置など）を再利用できるかは P4 の最初に確認 |
  | `package.json` に `@tauri-apps/api`（保存先の選択は plugin-dialog でなく Rust 側の rfd — P4 で利用者承認） | — |

  上流の GitHub へのリンク（`contribution-panel.tsx`）などデザイン面の調整は別 spec。

## Phase

- **P0 実測（製品コードなし）** — **完了**（結果は「P0 結果」節）
  1. `svg` feature だけの merman ＋ resvg-safe SVG ＋ 同梱 Noto Sans JP だけの fontdb → PNG / PDF で太字化が消えるか
  2. 長い日本語ラベルで計測と描画のずれが D3 のしきい値を超えるか。超えるなら `HostTextMeasurer` を仮配線して解消するか
  3. 同梱形式（静的 2 本 / 可変 1 本）の容量と、fontdb が Bold を引けるか
  4. ~~GUI サブシステム exe の stdio~~ → 現況 5 で確認済み。配布ビルドでの確認は P3
  5. フォーク元パーサーに subgraph / classDef / style / linkStyle / click / `%%` コメントを食わせた時の挙動（D5）
  6. merman のパースエラーが行番号を返すか（`ValidationResult.errors[].line`）
- **P1 `crates/lorelei_core`**（**着地 2026-09-24**。後半 = 変換器 D5' と validate の editor 欄。**日本語 ID の件は下の「P1 で判明したこと」**。前半: validate / render / OutputPathPolicy / inbox のパス / 同梱フォント。
  実装で分かったこと: merman の SVG はルートに `background-color:white` を持つので、背景の既定は白（data_contract を訂正）。
  背景の指定はこの値の書き換えで行い 3 形式で揃える）: validate / render（svg / png / pdf）/ 意味モデル → エディタのデータ形の変換と dropped（D5'）/
  OutputPathPolicy / inbox のパス。
  テストは SVG のバイト一致ではなく構造（viewBox・テキスト内容・埋め込みフォント名）で見る
- **P2 MCP モード**（**着地 2026-09-24**: `crates/lorelei_mcp`（ライブラリ + 開発用の単体 bin `lorelei-mcp`）。
  スモークテスト 6 件 + 起動経路の単体テスト 2 件。GUI の起動は stdio を引き継がせず、Windows ではジョブから抜けて
  起動する（抜けられなければ抜けずに起動し直す）— **実際に Claude Code から起動した GUI が残るかは P4 で確認**）: rmcp の stdio サーバー、ツール 3 本。initialize → tools/list → tools/call のスモークテストを
  バイナリ単体で通す。stdout に JSON-RPC 以外が 1 バイトも出ないことも検査する
- **P3 `src-tauri/`**（**着地 2026-09-24**。下の「P3 で判明したこと」）: Tauri 2 の殻（workspace の外）。Next の Tauri 用書き出しを読む。single-instance、
  identifier 確定。**配布ビルドで `--mcp` のスモークテスト**（D1 の切り替え条件）
- **P4 GUI 側**（**着地 2026-09-24**。下の「P4 で判明したこと」）: D9 の変更。open_in_editor の往復（MCP → inbox → GUI → キャンバス → 警告 → inbox 削除）
- **P5 実運用**（進行中 2026-09-24: リポジトリの `.mcp.json` に登録。`command` はプロジェクトのルートからの相対パス。
  使い方は README ではなく `LORELEI.md` に書き、README には 1 行の案内だけ足した（フォーク元の紹介を崩さない）。
  `claude mcp get lorelei` は「承認待ち」— 承認は利用者が対話中の Claude Code で行う。
  **2026-09-24 利用者が承認し、Claude Code 2.1.263 の `/mcp` でツール 3 本が見えることを確認**）: Claude Code へ登録（`.mcp.json` の例を README へ）。DB の MCP からスキーマを読ませて ER 図を
  作らせ、PDF まで出す。**利用者が実際に使って判定する**

## P0 結果（2026-09-24 実測。scratchpad の使い捨てコード、Windows）

| # | 結果 | 帰結 |
|---|---|---|
| 1 | **成立。** merman を `default-features = false, features = ["svg"]` にし、`SvgPipeline::resvg_safe()` の SVG を「同梱フォントだけの fontdb」で usvg → resvg / krilla-svg に通すと、太字化は消えた。PDF は `NotoSansCJKjp-Regular` のサブセット + ToUnicode。依存は `cargo tree -e normal` で 481 → 365 行 | D3 どおり |
| 2 | **条件付きで成立。** 既定（HTML ラベル）では resvg-safe の代替テキストが**折り返しを失い**、長いラベルが 1 行で箱から大きくはみ出して隣と重なった。`htmlLabels: false`（最上位と `flowchart.htmlLabels`）にすると SVG の `<tspan>` で折り返され、箱に収まり余白もしきい値内。副作用として行頭に「、」が来る（禁則処理なし）。見た目の問題で機能は壊れない | **htmlLabels は Lorelei が常に false に固定する**（入力の `%%{init}%%` で true に戻されても上書き）。`HostTextMeasurer` は不要。禁則は既知の制約として README に書く |
| 3 | **静的フォントに決定。** 可変フォント `NotoSansJP-VF.ttf`（9.6 MB）は fontdb が既定インスタンスを weight 100 と読み、**Thin で描かれる**（PDF の BaseFont も `NotoSansJP-Thin`）。静的の `NotoSansCJKjp-Regular/Bold.otf` は 400 / 700 を正しく引いた。ただしこの 2 本は CJK 全域で計 33 MB | 同梱するのは静的 2 本。日本語だけに絞った版（Google Fonts の静的 NotoSansJP）の容量は P1 で入手して測る |
| 4 | 現況 5 で確認済み | D1 どおり |
| 5 | **想定より深刻。** 下表。「知らない構文を捨てる」だけでなく、**図の中身を壊す**入力がある | **D5 を作り直す（rev3 案、下記）** |
| 6 | **成立。** merman のパースエラーは `SourceSpan { start, end }`（バイト位置）を持つ。行番号は Lorelei 側で計算できる。図の種類が判定できない入力は `DetectType` エラー | `ValidationResult.errors[].line` を埋められる |

### P0-5 の詳細: フォーク元パーサーに AI が普通に書く構文を食わせた結果

| 入力 | フォーク元パーサーの結果 | merman の結果 |
|---|---|---|
| `subgraph 受注 … end` | `end` という**名前のノードが生える**（subgraph 自体は消える） | subgraph を正しく保持 |
| `A --> B --> C`（連鎖） | **`A → C` の辺 1 本、ラベル `> B[b]`**。B が消える | A→B, B→C |
| `A[a]:::hot --> B` / `A & B --> C` / `A --- B` / 行末の `;` | **ノード 0・辺 0（図が空になる）** | 正しく解釈 |
| `classDef` / `class` / `style` / `linkStyle` / `click` / `%%` | 黙って捨てる（ノードと辺は残る） | 保持 |
| ER の基本形（日本語の属性名 `string 氏名`） | **同じエンティティが 2 つ生え、日本語名の属性が消える** | 正しく解釈 |
| ER の属性コメント `"主キー"` / `PK, FK` | そのエンティティの**属性が全部消える** | 保持 |
| ER の非識別関係 `||..o{` / 単語形式 `one or zero to many` | **ノード 0・辺 0** | 正しく解釈 |

**D5（数えて警告する）は前提が崩れた。** D5 は「消えるだけ」を想定していたが、実際は B が消えて辺が付け替わる・
ノードが生える・図が空になる。これらは「何件消えた」では説明できない。

### rev3（2026-09-24 利用者承認）: D5 を置き換える

- **D5' MCP 経由で GUI に開く時は、フォーク元パーサーを通さない。** `lorelei_core` が merman の意味モデル
  （`Engine::parse_diagram_sync` が返す JSON。flowchart / ER ともに上の表のとおり正しい）を、フォーク元エディタの
  データ形（flowchart の `FlowData`、ER のノード / 辺）へ変換し、GUI へはその JSON を渡す
  - `dropped` は**変換器が写せなかった要素**（subgraph・classDef・style・属性コメント等）を変換器自身が数える。
    パーサーが 1 つになるので、vitest の fixture と Rust の表を同期させる仕組み（D5 の中核）が**まるごと要らなくなる**
  - フォーク元パーサーは**触らない**。手で貼り付ける既存の import ダイアログはフォーク元のまま残る
    （その不具合は上流の問題として issue を出す候補。本 spec では直さない）
  - フロントの変更は D9 の「open イベントを受けて既存の import 関数へ流す」が
    「open イベントで受けた JSON をキャンバスへ載せる」に変わる。既存の import 関数がパース後に行っている処理
    （レイアウト配置など）を再利用できるかは P4 の最初に確認する

## P1 で判明したこと（2026-09-24）

### merman は日本語のノード ID を受け付けない（本家は受け付ける）— **案 A で対応済み（2026-09-24 利用者承認）**

`flowchart TD
  開始 --> 終了` を merman 0.8.0-alpha.6 は `Unexpected character at 15` で拒否する。同じ入力
（ほか 4 件）を **mermaid.js 11.17.2**（merman が追従を称する版。jsDelivr から読み込み `mermaid.parse`）は全部受け付けた。
**merman 側の互換性のバグ**。原因は `merman-core/src/diagrams/flowchart/lexer.rs` の `lex_id` が
ASCII 英数字と `_` しか ID に取らないバイト単位の実装であること（同種の判定が同ファイルに 7 か所）。
さらにこのエラーは生成時に span を持つのに呼び出し元へ届く時には `span: None` になり、行番号が返らない。

影響:
- AI が日本語 ID で書いた図は validate / render / open_in_editor が全部失敗する（正しい Mermaid なのに）
- **フォーク元エディタは日本語の変数名を意図して保持する**（`getSafeVariableName`）。GUI で日本語の変数名を
  付けた図は、Lorelei 自身の書き出し（D9）で描けない
- ラベル（`A[開始]`）と ER のエンティティ名・属性名の日本語は問題ない（テストで確認済み）

**対応（案 A）**: `vendor/merman-core/`（`merman-core 0.8.0-alpha.6` の写し）の字句解析を直し、`[patch.crates-io]` で
差し替えた。ASCII 以外の文字は mermaid.js 11.17.2 の `UNICODE_TEXT` 範囲表に入っていれば ID に含める（初稿は `char::is_alphabetic()`。
上流の査読で範囲表に置き換わり、2026-09-28 に写しも揃えた）。全角数字・読点・結合記号・BMP 外は mermaid.js と同じく拒否する（本家で確認）。
修正内容と経緯は `vendor/merman-core/LORELEI_PATCH.md`。**上流 PR: Latias94/merman#146**（2026-09-24 提出、同日マージ。crates.io の次版待ち）。
残る差: 全角スペースを区切りに使う書き方（本家は受け付ける）と、字句エラーで行番号が返らない件は別件。

### 変換器（D5'）の実装で分かった merman の出力の癖

- `click` を付けたノードには `clickable` クラスが自動で付く → ユーザーの class として数えない
- subgraph を辺の行き先にすると、その subgraph がノード一覧にも入る → subgraph の ID はノードから除く
- ER の `relSpec` は `cardB` が左側（source 側）、`cardA` が右側の記号。フォーク元の 7 記号すべてで往復を確認

## P3 で判明したこと（2026-09-24）

- **D1 は単一 exe で確定**: 配布ビルド（`tauri build --no-bundle`、GUI サブシステム）の `lorelei.exe --mcp` に
  P2 のスモークテストを当てて全件緑（`LORELEI_MCP_EXE` で差し替え。open_in_editor の 1 件は実物だと GUI を起動するので
  スキップ）。2 bin の退路は不要。
- **single-instance の往復**: 起動中の GUI へ 2 つ目の `lorelei.exe --open <inbox の .mmd>` を投げると、2 つ目は終了コード 0 で
  即終了し、窓は 1 つのまま、inbox のファイルは読まれて消えた（実機）。フロントの受け口は P4。
- **CSP: Tauri は同梱 HTML のインライン `<style>` のハッシュを `style-src` へ自動で足す**。ハッシュが入ると
  ブラウザは `'unsafe-inline'` を無視するので、要素の `style` 属性が全部止まり、ReactFlow のノード配置や読み上げ用テキストの
  隠しが効かず画面が崩れた（実機で確認）。`dangerousDisableAssetCspModification: ["style-src"]` で style-src だけ
  自動追記を止めて解消（script-src のハッシュ追記は残る）。failures #2。
- **ルートの `[patch.crates-io]` は src-tauri に効かない**（独立 project）。同じ patch を src-tauri/Cargo.toml にも書き、
  GUI 側のテストで日本語 ID が通ることを固定した。
- **Windows の cargo test**: Tauri を含むテストの exe は Common-Controls v6 の manifest が無く `STATUS_ENTRYPOINT_NOT_FOUND`
  で落ちる。tauri-build の manifest 埋め込みを止め、同じ manifest をリンカで全 exe に埋め込んだ（`src-tauri/build.rs`）。
- **D9 の変更**: ビルドのスクリプトは 2 本にせず、Tauri の CLI が渡す `TAURI_ENV_PLATFORM` を `next.config.mjs` が見て切り替える
  （追加の道具が要らず Windows でも同じ）。**保存ダイアログは plugin-dialog でなく Rust 側の `rfd`**（AppPromoVideo と同じ。
  JS に権限を足さない）— 2026-09-24 利用者承認、P4 で実装。
- **フロントの依存は `corepack pnpm@9 install --ignore-scripts` で入れた**。`prepare` の `lefthook install`（git hooks）を走らせないため。
  フックを有効にするかは利用者の判断待ち。
- **アイコンは仮**（`src-tauri/app-icon.png`、同梱フォントの「L」）。フォーク元の favicon は Next.js 既定のもので使わない。
- 既存テスト: 基準値 478 件緑。P3 後の全件実行で `arrow-type-selector.test.tsx` の 1 件が落ちたが、単独で 3 回とも緑。
  全件並列時の負荷によるタイムアウトと見ている（ログでタイムアウトと確認はしていない）。フォーク元のテストなので触らない。

## P4 で判明したこと（2026-09-24）

- **フォーク元のファイルへの変更は 4 ファイル・8 行**（各エディタに `useDesktopOpen` の import と呼び出し、
  各コード表示ダイアログに `ExportButtons` の import と配置）。新しいコードは `lib/desktop/` と `src-tauri/src/desktop.rs`
- **実機での往復**（配布ビルドと debug ビルド、MCP クライアントは Python の最小実装）:
  - GUI が起動していない状態から `open_in_editor` → GUI が立ち上がり図が載る。`dropped` の警告が通知で出る（閉じるまで残る）
  - フローチャート画面を開いたまま ER 図を送る → ER 図のページへ移動して載る。窓は 1 つのまま
  - GUI のコード表示ダイアログの PDF ボタン → OS の保存ダイアログ（rfd）→ 保存。埋め込みフォントは NotoSansJP-Regular のみ
  - ヘルプ → Lorelei について → ライセンス一覧（rfd の MessageDialog）。※ spec 02 P1 でネイティブのメニューを撤去し、入口はタイトルバーの「?」に移った
- **About とライセンス**: フォーク元の画面は変えず、Tauri のネイティブメニューから出す。ライセンスの全文
  （Lorelei / フォーク元の MIT、Noto Sans JP の OFL、merman の MIT / Apache）は `bundle.resources` で `licenses/` に同梱。
  **依存する Rust crate 全体の第三者ライセンス一覧（cargo-about 等）は配布の spec へ回す**
- **フォーク元の vitest は、この環境では変更の有無に関係なく 2〜3 件が時間切れで落ちる**。P3 の基準値（478 件緑）は
  1 回だけ測ったもので、たまたま収まっていた。P4 の変更を退避した状態でも 2 回とも 2 件落ちた
  （`arrow-type-selector` / `panel-content`。所要 5,150ms 前後で既定の 5,000ms を超える）。フォーク元のテストなので触らない。failures #3
- 同じ図が複数届いたら最後の 1 件を載せる（取り込み処理がキャンバスを置き換えるため）

## 受け入れ条件

1. Claude Code から `render` で日本語の flowchart と ER 図を PDF に書き出せ、日本語が太字になっていない
2. 同じ入力を OS のフォント設定が違う 2 台で PNG にしても、埋め込み・使用フォントが同じ（同梱フォント）
3. `validate` に文法エラーのある Mermaid を渡すと `ok: false` と理由が返る（行が分かれば行も）
4. subgraph を含む flowchart を `open_in_editor` すると GUI で開き、**subgraph が消えることが MCP の戻り値と
   GUI の警告の両方に、同じ数で出る**。P0-5 の表の入力（連鎖・`&`・`---`・`;`・日本語の属性名・`PK, FK`・`..`）は、
   ノードと辺が merman の解釈どおりにキャンバスへ載る
5. GUI が起動していない状態で `open_in_editor` しても GUI が立ち上がって図が開く。起動中なら 2 つ目の窓も
   エラー表示も出ず、既存の窓に図が開く。読み込んだ inbox のファイルは消えている
6. `output_path` に相対パス・WSL パス・拡張子違い・存在しない親ディレクトリ・既存ファイル（overwrite なし）を
   渡すと、どれも何も書かずに拒否される
7. MCP モードの stdout には JSON-RPC 以外が出ない（P2 のスモークテストで検査）
8. `pnpm build`（GitHub Pages 向け）が従来どおり通り、Tauri 専用の UI は Web 版に出ない
9. フォーク元の既存テスト（vitest / VRT）が全部緑のまま

### 受け入れ条件の結果（2026-09-24）

| # | 結果 | 根拠 |
|---|---|---|
| 1 | **達成** | 日本語の flowchart / ER を PDF にすると埋め込みは NotoSansJP のみ（`lorelei_core` のテスト、MCP スモークテスト、GUI の書き出しの実機）。Claude Code からツールを呼べることは利用者が確認 |
| 2 | **構造で担保、2 台では未測定** | システムフォントを読まず同梱フォントだけの fontdb で描く（D3）。別の端末で比べてはいない |
| 3 | **達成** | `validate` の文法エラーは `ok: false` と行番号（テスト。`%%{init}%%` が先頭にあっても元の行で数える） |
| 4 | **達成** | subgraph の件数が MCP の戻り値と GUI の通知で一致（実機）。P0-5 の入力は変換器のテストで固定 |
| 5 | **一部未確認** | 起動していない GUI の起動・2 つ目の窓が出ない・inbox の削除は実機で確認（Python の MCP クライアント）。**Claude Code のセッションを閉じた後も GUI が残るか（ジョブから抜ける起動）は未確認** |
| 6 | **達成** | `OutputPathPolicy` のテスト（相対・WSL・拡張子違い・親フォルダ無し・既存ファイル、どれも何も書かない） |
| 7 | **達成** | スモークテストが stdout の全行を JSON-RPC として検査。配布ビルドの `lorelei.exe --mcp` でも緑 |
| 8 | **達成** | Pages ビルドは basePath 付きで通る。Web 版（Tauri 外）のコード表示ダイアログに SVG / PNG / PDF ボタンが出ないことを内蔵ブラウザで確認 |
| 9 | **未達（変更と無関係）/ VRT は未実行** | vitest は変更の有無に関係なく 2〜3 件が時間切れで落ちる（変更を退避しても同じ顔ぶれ、failures #3）。**VRT（Docker の Playwright）は走らせていない** |

### 残した課題（別 spec・次の作業へ）

- **ER エディタで表現できる情報が少ない**（FK・属性コメント・別名・非識別関係・16 通りのカーディナリティのうち 7 種のみ）。
  利用者の構想「ER 図の変更から DB の変更を指示する」（spec 04 候補。spec 02 → 03 → 04 と繰り下げ）では、これが差分の誤検出（触っていない FK が削除に見える）に直結する
- 読み戻し（人が直した図を AI への指示として渡す）— spec 04 候補（spec 02 → 03 → 04 と繰り下げ）
- 正式なアイコン、lefthook のフックを入れるか、第三者ライセンス一覧（cargo-about 等）、配布（署名・インストーラー）
- merman 上流 PR（Latias94/merman#146）は 2026-09-24 にマージ済み。crates.io に `0.8.0-alpha.6` より新しい版が出たら `merman` の版を上げ、
  vendor と 2 か所の patch を消す（2026-09-28 時点で未リリース。写しはマージ版の意味に揃えた）

## スコープ外

- Lorelei から LLM を呼ぶ経路（AI 生成ボタン）
- DB / リポジトリへの直接接続
- フォーク元パーサーの拡張（subgraph 等への対応）と、flowchart / ER 以外の GUI 編集
- HTTP / リモートの MCP、WSL 上のクライアントからの利用
- 配布（署名・winget・Homebrew）— 動くものができてから別 spec

## 未検証のまま置いているもの

- `HostTextMeasurer` を実際に配線して計測が変わるか（口の存在はソースで確認、動作は未確認）
- merman が「35 種」と称する図のうち、実際に日本語で破綻なく描けるのがどれか。P1 では
  flowchart / erDiagram / sequenceDiagram / classDiagram / stateDiagram の 5 種だけテストで固定する
- Claude Code が MCP の image content をどの大きさまで受けるか。D2 の 1568 px は Claude の画像入力の
  推奨上限に合わせた値で、Claude Code 側の上限を測ったものではない

## 査読 1 への応答（2026-09-24、rev1 → rev2）

| # | 指摘 | 採否 | 根拠 / 反映先 |
|---|---|---|---|
| 1 | GUI サブシステム exe では stdio が使えない可能性が高い → 2 bin を本線に | **一部不採用** | 実測で否定（現況 5: Python / Node からのパイプで往復成功）。単一 exe を維持し、2 bin は P3 の切り替え条件付きの退路として残す。**Builder 前の分岐・MCP モードで single-instance を作らない**は採用（D1） |
| 2 | PoC と D3 が矛盾。merman の png/pdf feature を切らないと static fontdb が初期化され回避策が効かない | **一部採用** | PoC は merman-export の測定用で採用構成ではない、と現況 3 に明記。feature を `svg` 系に絞るのは採用（依存が減る）。ただし「static fontdb が回避策を無効にする」機序は誤り — 自前の `usvg::Options.fontdb` は merman-export の static と独立で、merman-export を呼ばなければ使われない |
| 3 | `with_text_measurement_policy` が存在するか未確認。ずれた時の方針が無い | **採用（前提は訂正）** | API はソースで存在確認済み（`HostTextMeasurer` 経路、現況 4）。ずれた時の分岐としきい値を D3 に追加 |
| 4 | inbox が相対パス | **一部採用** | data_contract では rev1 から `{app_data_dir}/inbox/` の絶対パスだったが、spec の図が相対に見えた。MCP モードでのパスの組み立てと一致テスト、掃除の方針を D8 に追加 |
| 5 | dropped の正が 2 つ | **採用** | 集合の式、Rust の表、vitest の fixture との一致検査、GUI は再計算しないを D5 に明記。**rev3 で D5' に置き換え、この仕組みごと撤去**（P0-5） |
| 6 | 図の種類を正規表現で判定できない | **採用** | D6 に merman のパース結果で決めると明記 |
| 7 | OutputPathPolicy の TOCTOU / EXDEV / WSL | **採用** | 一時ファイルは同じディレクトリ、rename 失敗時の後始末、WSL 非対応を D7 に。親ディレクトリが途中で消える件は rename の失敗として扱えば壊れファイルは残らない |
| 8 | next.config の分岐不足・ビルド 2 本・plugin-fs が要る | **一部採用** | `assetPrefix` とビルド 2 本は採用（D9）。`images.unoptimized` は既に常時 true（現況 2）。**plugin-fs は不採用** — inbox は Rust が読んで本文をイベントで渡すので不要で、入れると JS から任意のファイルを読める口が開く（D8） |
| 追 | stdout は JSON-RPC 専用 | **採用** | D1・P2・受け入れ 7 |
| 追 | fontdb の共有 | **採用** | D3（`OnceLock`） |
| 追 | サイズ上限（base64 1 MB で落ちる） | **一部採用** | preview を長辺 1568 px へ縮小（D2）。「1 MB で落ちる」は未確認の主張なので数値の根拠にしない（未検証の節へ） |
| 追 | フォントのライセンス表示、容量（静的 18 MB / 可変 5 MB / バンドル 100 MB 超） | **ライセンスは採用、数値は保留** | About と THIRD_PARTY_LICENSES を D3 に。容量は P0-3 で実測する。「100 MB 超」は Tauri 本体とフォント 2 本の和として桁が合わない |
| 追 | ツールのスキーマを spec にインラインすべき | **不採用** | data_contract.yaml は rev1 から存在する（査読側に添付されていなかった）。写すと二重管理でずれる |
| 追 | 2 つ目のプロセスを即 exit しないと OS が起動失敗と判定 | **一部採用** | 2 つ目の終了は single-instance プラグインが行う。要るのは「MCP 側が GUI の終了を待たない」ことと「エラー表示が出ない」ことの検査で、D8 と受け入れ 5 に入れた |
