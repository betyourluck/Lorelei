# Spec: AI が既存の図を書き換える（`update_diagram`）

**ID**: 08
**Date**: 2026-09-28
**Status**: Approved（rev1。査読 1・2 を反映。裁定 1〜4 は 2026-09-28 に利用者が案のとおり承認。次は P0）
**Branch**: なし（Phase 単位で main へ直接コミット）

## Goal

AI が `read_diagram` で読んだ図を直して、**同じ 1 件に書き戻せる**ようにする。今は AI が図を直すたびに `open_in_editor` で新しい 1 件が増え（spec 02 D8「開いている図は上書きしない」）、
人が付けた名前・並び・ノードの位置が引き継がれない。「AI が書く → 人が直す → AI が読んで直す → 人がまた直す」の往復を、1 枚の図の上で回せるようにする。

spec 04 でスコープ外にした「AI が既存の図を書き換える」（利用者裁定 2026-09-25: 読むだけ、書き換えは後）の、後の段。

## 現況（実測 2026-09-28、コードで確認）

### 1. 届いた図は必ず新しい 1 件になる

- `open_in_editor` → `EditorPort::open` → `deliver`（`src-tauri/src/lib.rs`）→ `incoming` が `Store::create`（`origin: ai`、`source` は空、`original_source` に原文）→ `OpenRequest` を `PendingOpens` に積み `OPEN_EVENT` を出す → 窓を前に出す
- フロント（`lib/desktop/use-desktop-open.ts` の `drain`）が `take_pending_open` で受け取り、ページの種類で振り分け（`partitionOpens`）、**このページ宛ての最後の 1 件だけ**を `beforeImport`（今の図の保存を**始め**、届いた図へ切り替え、`layoutRef = {}`）→ エディタの `handleImportMermaid`（キャンバスを置き換える）→ `afterImport` → 自動保存が `source` を埋める
- 既存の 1 件を指して中身を差し替える口は、MCP にも Rust の `Store` にも無い

### 2. `Document` の欄と、保存の規則（`Store::save`）

- `source` = エディタの生成器の出力。`original_source` = 届いた原文で「以後書き換えない」（data_contract）。`layout` = Mermaid 上の ID（フローは `getSafeVariableName` した変数名、ER 図はエンティティ名）→ 位置
- `save` は `source` と `layout` だけを書く。中身が同じなら書かない。**`source` が空だった図の最初の書き込みは `updated_at` を進めない**（`first_fill`）。`origin` が ai / import の図に初期図と同じ `source` を書くと拒む（spec 04 D4-2）。`rename` は `updated_at` を動かさない
- `unsaved`（●）= `updated_at > (saved_at ?? created_at)`。一覧の並びは `saved_at ?? created_at`（spec 02 D12）
- 図を開く時（`useDocSession.open`）は `doc.source || doc.originalSource` を `convert_source` に通す。**`source` に入っているのが生成器の出力でなくても開ける**（merman が読める Mermaid なら何でも）
- **同じファイルへの書き手は今は 1 つ**（JS の `Autosaver` が直列化。`deliver` は新しいファイルしか作らない）。`Store` の save / mark_saved / rename はどれも load → 書き換え → write で、排他は無い。`store()` は呼ぶたび新しい `Store` を作る

### 3. 開いている図のファイルを裏で書き換えると、エディタが古い中身で上書きする

- 開いている図のエディタは自分のキャンバスを真として、変化のたびに（1 秒後）`save_document` を呼ぶ。ファイルだけ書き換えても画面は変わらず、次の自動保存で**古い中身が書き戻る**
- 届いた図の経路で載せ替えると、`beforeImport` の `leaveNow` が今の図の `autosaver.flush()` を**先に走らせる**。書き換えた後に古い書きかけが書かれる順になる（spec 07 P3 の「古い向きで書き戻された」と同じ形の危うさ）
- **走り出した保存は止められない**: `Autosaver.flush` は `pending = null` にしてから `await save(...)` する。`cancel()` は待ちと timer を消すだけで、発行済みの IPC は Rust まで届いて書く
- 今 GUI で開いている図は `state.json` の `last_opened` で Rust からも分かるが、`open()` は `leave()`（flush）→ `loadDocument` → `convertSource` の 3 つの await の**後**に `becomeCurrent`（`set_last_opened`）を呼ぶ。**図を開いている全区間、`last_opened` は前の図を指す**
- `drain` は同じ回に並んだ要求のうち最後の 1 件しか取り込まない（現況 1）。Claude Code はツールを並列に呼ぶので、書き換えと別の `open_in_editor` が同じ回に並ぶことがある

### 4. 位置は Mermaid 上の ID で引ける

- `layout` のキーが Mermaid の ID なので、**同じ ID のノードは中身を差し替えても位置を当てられる**（`withLayout`）。取り込みは向きに合わせて全ノードを並べ、その後で保存済みの位置を上書きする（spec 07 D1）。
  位置の無いノード（AI が足したもの）は並べた位置に置かれ、既存のノードと重なることがある
- 位置を当てる門（`expectedKeys` ⊆ ストアのキー）は届いた図のノードで判定し、`layout` の余分なキーは無視する。AI が足した・改名したノードでも門は開く。ただし `applyLayout = layout のキーが 1 つ以上` で、当てる回は保存しない（当てた後の変化で保存する）
- **ノードが 0 の図は `to_editor` を通る**（実測: `flowchart TD` だけ・`erDiagram` だけで `nodes: []`、`dropped: []`）。エディタの取り込みは `data.nodes.length === 0` なら何もしない → キャンバスは前のまま → 門は `expected = []` で開き、**前のキャンバスがその図として保存される**。
  `open_in_editor` にも今ある穴（届いた空の図の 1 件に、前の図の中身が入る）

## 決めること

### D1. 書き換えは「同じ 1 件の中身を、届いた図で丸ごと差し替える」

- ツール `update_diagram(id, source, expected_updated_at, open = false)`。差分の適用（ノードを足す・消す）はしない — AI は `read_diagram` で読んだ Mermaid を直して丸ごと送る（Mermaid はテキストなので、AI 側で差分を作るのが自然）。
  **`title` は受けない**（査読 1-4: 改名は `updated_at` を動かさないので、AI が読んだ名前を写して送ると人の改名が黙って消える。名前は人が付ける。AI が名前を付けるのは `open_in_editor` の時だけ）
- 差し替えるのは `source`・`original_source`・`updated_at`・`normalize_pending`。`id`・`title`・`editor`・`origin`・`created_at`・`saved_at`・`layout` は変えない
  - **`source` には届いた Mermaid をそのまま書く**（生成器を通していない）。GUI で開く（または開いている図なら載せ替える）と、次の自動保存でエディタの書き方に揃う。空にはしない（空にすると、開いていない図を `read_diagram` で読んだ時に「まだエディタに載っていない」の空文字が返り、AI が自分の送った図を読めない）。
    **開いていない図の `read_diagram` は、GUI で開くまで届けた Mermaid そのものを返す**（subgraph など、エディタで省かれる要素も残ったまま）。ツールの説明に書く
  - **`original_source` は「AI・インポートが最後に届けた原文」に改める**（data_contract の「以後書き換えない」を「`update_diagram` で置き換わる」に）。`read_diagram` の `include_original` は、いつも最後に届けた原文を返す。new の図は `update_diagram` されるまで `null`
  - **`origin` は変えない**（査読 1-6）。`origin` は来歴（new / ai / import）のまま。spec 04 D4-2 の初期図の保険は、条件を `origin != new` から **`original_source` が有る**に変える — update された new の図にも効き、import の来歴も消えない
  - **`normalize_pending`（新しい欄、既定 false）を立てる**。`update` の後、最初の `save` はエディタの書き方に揃えるだけで人の変更ではないので、**`save` はこの印が立っていれば `updated_at` を進めず、印を消す**（中身が同じで書かない時も印だけは消す — AI が生成器の書き方で送ると揃え書きが空振りし、印が残ったままだと人の最初の編集が「変更でない」と記録される。査読 2 の指摘）。
    `first_fill`（`source` が空だった図の最初の書き込み）は今のまま。印は `Document` の欄で、ファイルと GUI の受け渡しに乗る（`json_keys: camelCase`。古いファイルに無ければ false）
  - `updated_at` を今にする → ● が付く（最後の「保存」の後に変わった）。`saved_at` は触らないので**一覧の並びは動かない**（見たり直したりしても動かない、spec 02 D12 と同じ扱い）
  - `layout` は残す。同じ ID のノードは位置を保ち、AI が足したノードは向きに合わせて並べた位置に置かれる（現況 4。重なりは人が直す）。ID を変えた・消したノードの位置は、載せ替え後の最初の自動保存で `layout` から消える（`collectLayout` は今のノードだけを書く。仕様）
- **断るもの**（ファイルは変えない）:
  - 届いた図の種類（flowchart / erDiagram）が `Document.editor` と違う → `updated: false` + reason「この図は flowchart です。erDiagram にするなら open_in_editor で新しい図を作ってください」。種類が変わるとページも変わり、載せ替え（D3）の前提が崩れる
  - GUI で開けない種類（sequence など）→ `updated: false` + reason（`open_in_editor` と同じ文言）
  - **ノードが 0 の図** → `updated: false` + reason「ノードの無い図は開けません」（現況 4 の穴）。**`open_in_editor` も同じ条件で断る**（`opened: false`。今ある穴を同時に塞ぐ。判定は `lorelei_mcp` の `to_editor` の結果で、口を呼ぶ前）
  - 初期図と一字一句同じ `source` → 断る（`Store::update`。揃え書きが `INITIAL_FIGURE_REJECTED` で止まり続けるのを避ける。査読 2-(9)。文言は「エディタの初期図と同じ図は受け付けません」）
- `dropped` は `open_in_editor` と同じ（エディタで表現できない要素の件数）

### D2. 書き手は 2 つとも、読んだ時の `updated_at` を添えて書く（楽観ロック）

同じファイルに AI（MCP）と GUI（自動保存）の 2 つが書くようになる。**どちらも「自分が読んだ版」を添え、ファイルがそれより進んでいれば書かない**。

- **AI 側 `expected_updated_at`（必須。利用者裁定待ち — 下の「裁定」）**: `read_diagram` / `list_diagrams` / `open_in_editor` が返す `updated_at` を渡す。今のファイルの `updated_at` と違えば書かずにツール結果のエラー
  「図が変わっています（updated_at: 今の値）。read_diagram で読み直してから update_diagram してください」。人が直していれば（位置を動かしただけでも `updated_at` は進む）AI はそれを知らずに上書きしない。
  比較は **RFC 3339 を時刻として解釈して同じ瞬間か**（`DateTime::parse_from_rfc3339`。マイクロ秒まで残るので安全。文字列の一致にすると AI が UTC に直したり丸めたりした時に空振りする）。解釈できない値はエラー
  - `open_in_editor` の戻り値に `updated_at` を足す（届いた直後の値。揃え書きは `first_fill` で進めないので、人が触るまでそのまま使える）
  - 必須にする理由: 省略できると、それが人の編集を黙って消す唯一の経路になる。必須にしても AI の手間は「読んでから書く」の 1 手で、それは往復の本来の形
- **GUI 側 `base_updated_at`（新規。`save_document` の引数）**: フロントは図を開いた時（`load_document`）・載せ替えの要求（`OpenRequest.document`）・各 `save` の戻り値の `updated_at` を覚えて、自動保存に添える。`Store::save` はファイルの `updated_at` と違えば
  **`STALE_BASE` で拒む**（`DOCUMENT_GONE` / `INITIAL_FIGURE_REJECTED` と同じ「捨ててよい失敗」）。フロントは捨てて、通知「AI が図を書き換えたので開き直します」を出し、その図を `open()` し直す（届いた中身で開く）。
  これが**現況 3 の競合を「狭める」でなく「塞ぐ」**手（査読 2）: 走り出した古い保存も、`last_opened` が古い瞬間に来た書き換えも、古い版を添えた保存はファイルに届かない
  - `mark_saved` / `rename` は `updated_at` を動かさないので `base` は変わらない。`first_fill` と `normalize_pending` の揃え書きも進めないので変わらない。進むのは人の編集の `save` と `update` だけ
- **`Store` に排他を置く**: プロセスで 1 つの `Mutex`（`static`。`Store` は呼ぶたび作られるので構造体のフィールドでは効かない）で save / update / mark_saved / rename / trash の load → write を囲む。比較と書き込みは同じ鍵の中（TOCTOU を作らない）。
  MCP のツールは `spawn_blocking` の別スレッド、Tauri の command も別スレッドで、順序は保証されない
- **止められないもの**: GUI で編集中の、まだファイルに書かれていない直近約 1 秒の変更（自動保存の待ち）。読み戻しが最後の 1 秒を読めない（spec 04 D1）のと対で、書き換えは最後の 1 秒を消すことがある。
  その保存が書き換えの後に届けば `STALE_BASE` で捨てられ、開き直しの通知が出る（人は消えたことに気付ける）。ツールの説明と LORELEI.md に書く

### D3. 開いている図は GUI で載せ替える。開いていない図はファイルだけ書く（`open` で開かせる）

- Rust（`deliver_update`）は、`Store::update` でファイルを書いた後、`last_opened` と `open` で 3 通り:
  - **その図が今開いている図（`last_opened` と一致）** → 届いた図の経路（`OpenRequest` → `OPEN_EVENT`）で**その 1 件を載せ替える**。要求に `reload: true` の印と、その図の `layout`・書き換え後の `DocumentSummary` を持たせる。新しい 1 件は作らない。窓は前に出さない
  - **開いていない図で `open=true`** → 同じ経路で（`reload: false`、`layout` 付き）その図を開き、窓を前に出す。`open_in_editor` と同じ動き（ページが違えば移る）
  - **開いていない図で `open=false`（既定）** → ファイルだけ書く。画面は変えない（人が別の図を直している最中に横取りしない）
  - どの場合も、書いた後に **`lorelei://documents-changed`（本体は書き換え後の `DocumentSummary`）** を出す。外枠はその 1 件だけを一覧で差し替える（`setList(map)`。一覧を丸ごと読み直さない — 読み直しは自動保存の 1 件差し替えと競合して ● が戻ることがある。査読 2-(8)。spec 04 の「● が 1 件落ちた」の候補としても書き戻す）
- **載せ替え（`reload: true`）の要求は、`drain` が `partitionOpens` に入れず別に扱う**（現況 1・3: 最後の 1 件しか取り込まない・別の図の `beforeImport` の flush が古い書きかけを書く）:
  - 今のページの種類と一致し、かつ **今の図の id と一致する**時だけ、`beforeImport`（**flush せず `autosaver.cancel()`**、`layoutRef` を要求の `layout` に、`openingRef` を消す、`base_updated_at` を要求の `document.updated_at` に）→ `onImport` → `afterImport`。
    同じ回に別の図の「開く」が並んでいても、載せ替えを先に処理してから最後の 1 件を取り込む（載せ替えの cancel が先なので、その `beforeImport` の flush は古い書きかけを書かない）
  - 一致しなければ捨てる（`last_opened` が古かった = 人が別の図へ移る途中。ファイルは書けている。古いキャンバスの保存は `STALE_BASE` が受け持つ）
  - 載せ替えた時は通知「AI が図を書き換えました」を出す（人が見ているキャンバスが黙って変わらないように。査読 1-7）
  - `stash` には積まない（起動処理の `hasPendingOpens` に影響しない）
- 位置は今の門（`expectedKeys` → `layoutReady` → `withLayout`）がそのまま効く（現況 4）。ただし **`applyLayout` の条件を「`expected` と `layout` のキーの交わりが空でない」に変える**（査読 2-(7): 全ノードを改名した載せ替えでは当てる位置が 1 つも無く、当てる回で保存も表示も止まって時間切れ 1.5 秒に頼る）
- 戻り値: `{ updated: bool, editor, dropped, reason, open: bool, updated_at }`。`open` は「**載せ替え・開くを GUI へ渡した**」（Rust が積んだ時点の判断。フロントが捨てた場合は分からない）、`updated_at` は書いた後の値（続けて直す時の `expected_updated_at` にそのまま使える。揃え書きは進めない）。
  `updated: false` の時は `open: false`、`updated_at: null`

### D4. 口と契約

```rust
pub trait EditorPort {
    fn open(&self, source: String, title: Option<String>) -> Result<Opened, String>;   // Opened = { id, updated_at }
    fn list(&self) -> Result<Vec<DiagramSummary>, String>;
    fn read(&self, id: Option<String>) -> Result<Diagram, String>;
    /// spec 08。editor は lorelei_mcp が変換で決めた種類 (flowchart | erDiagram)
    fn update(&self, req: UpdateRequest) -> Result<UpdateOutcome, UpdateError>;
}
UpdateRequest = { id, source, editor: Editor(flowchart | erDiagram), expected_updated_at, open }
UpdateOutcome = { open: bool, updated_at }
UpdateError   = KindMismatch { actual }        // → updated: false + reason (AI は別のツールで直せる)
              | NotFound                       // → ツール結果のエラー「図が見つかりません（id: …）」(read_diagram と同じ)
              | Conflict { current_updated_at } // → ツール結果のエラー「図が変わっています（updated_at: …）。read_diagram で…」
              | Rejected(String)               // 初期図と同じ・書けない → ツール結果のエラー (文字列そのまま)
```

- 種類の判定（`to_editor`）・ノード 0・`dropped` は `lorelei_mcp` が口を呼ぶ前に決める（`open_in_editor` と同じ）。`Document.editor` との突き合わせは GUI（`Store`）しか知らないので口の中で行い、`KindMismatch` で返す
- **分け方の規則**: 届いた図そのものの問題（種類・空・GUI で開けない）は `updated: false` + reason（`open_in_editor` の `opened: false` と同じ。AI は図を直すか別のツールを使う）。指した図の状態の問題（無い・変わった・書けない）はツール結果のエラー `{ error }`（`read_diagram` と同じ）。
  `open` の口の Err が reason になるのは今どおり（届けられなかった理由）
- `OpenRequest` に `reload: bool`（既定 false）と `layout: Layout | null` を足す。`convert_source` の戻り（保存した図を開く時）は `reload: false`・`layout: null`（`open()` は `doc.layout` を使う）
- data_contract に足す・改めるもの（P0 で凍結。**改めた語で全台帳を grep する**: `以後書き換えない` / `届いた時の原文` / `生成器の出力` / `5 本` / `origin != new`）:
  - `McpServer.tools.update_diagram`（入出力・断る条件・エラー 3 種）、`open_in_editor.output.updated_at`、`open_in_editor` のノード 0 の拒否、`McpServer.http.editor_port` の 4 つ目と `open` の戻り
  - `Document.original_source`（最後に届けた原文）、`Document.normalize_pending`、`Document.save_guard`（条件を `original_source` の有無に）、`Document.update`（書く欄・書かない欄・断る条件）、`Document.save_stale`（`STALE_BASE`）、`Document.store_lock`
  - `Diagram.source`（update の後、GUI に載るまでは届けた Mermaid そのもの）、`DiagramSummary` は変えない
  - `GuiCommands.save_document`（`base_updated_at`）、`open_request`（`reload` / `layout`）、`documents_event`
  - ツールの説明（`read_diagram` の「エディタが出した Mermaid」「届いた時の原文」、`include_original` の docstring、`open_in_editor` の「開いている図は上書きしない」と対で「書き換えは update_diagram」）、CLAUDE.md・`lorelei_mcp` の crate doc・`tests/http.rs` の「5 本」→ 6 本、LORELEI.md のツール表・「原文をそのまま残しています」・読み戻しの注意、spec 04 D2 / 現況 3 の冒頭に「spec 08 で改定」の 1 行

### D5. 書き換え前の中身を 1 世代だけ残す（利用者裁定待ち — 下の「裁定」）

- `Store::update` は書き換える前の `Document` を `{app_data_dir}/history/{id}.json` に写してから書く（1 世代。次の update で上書き）。`trash/` と同じ「消さない」流儀。GUI は持たない（戻すのは人が手で）
- 動機: D2 で止められない直近 1 秒の編集と、`expected_updated_at` を通り抜けた変更（`first_fill` の窓 = AI の図を開いて最初の書き込みに混ざった編集）は、書き換えで失われる。安価な保険
- 採らない場合はこの節を消し、スコープ外に「履歴なし」と書く

## Phase

- **P0**: data_contract を凍結（D4 の一覧。grep する語も）。`Store` の規則を先に書く: `update` が書く欄と書かない欄、`normalize_pending` と `first_fill` の関係、`expected_updated_at` / `base_updated_at` の比較（時刻として同じ瞬間）、排他、断る条件
- **P1**: `lorelei_mcp` — `EditorPort::update` と `UpdateError`、`open` の戻りに `updated_at`、ツール `update_diagram`、`open_in_editor` のノード 0 の拒否。`tests/http.rs` に HTTP で（`Recorder` / `Refuser` に `update`。種類の不一致 → reason、ノード 0 → reason、GUI で開けない種類 → reason、`NotFound` / `Conflict` / `Rejected` → `{ error }`、`open` と `updated_at` の返し、`updated: false` の時の `open` / `updated_at`）。Red → Green
- **P2**: src-tauri — `Store` の `Mutex`、`Store::update`（テスト: 書く欄と書かない欄・`expected_updated_at` の一致と不一致（UTC に直した同じ瞬間は一致）・ごみ箱の id・`layout` が残る・初期図と同じは拒む・`history/` に 1 世代（D5 を採るなら））、
  `Store::save` の `base_updated_at`（`STALE_BASE`）と `normalize_pending`（進めない・消す・中身が同じでも消す）、保険の条件を `original_source` の有無に（テストに「update した new の図」を足す）、
  `deliver_update` の 3 通り（判断を純粋な関数 `Reload / Open / FileOnly` に分けてテスト。emit は薄く）、`documents-changed`。
  lib/desktop — `OpenRequest.reload` / `layout`、`drain` の載せ替えの別扱い（同じ回に「開く」が並ぶ場合を `use-desktop-open.test.tsx` に）、`beforeImport` の載せ替え（cancel・位置・`openingRef`・`base`・通知）、`base_updated_at` の保持と `STALE_BASE` の開き直し、`applyLayout` の交わり（`doc-session.test.ts`）、外枠の 1 件差し替え。
  jsdom で載せ替えの到着を起こす手段（`listen` の模擬でハンドラを捕まえ、`fake-backend` に `take_pending_open` の中身を足す）を先に作る。`direction-save.test.tsx` の形で「載せ替え後に同じ ID の位置が保たれる / `save_document` が 1 回出て `updated_at` が進まない / 古い書きかけは出ない」
- **P3**: 実機（`tauri dev` → 配布ビルド）— `open_in_editor` → 人がノードを動かして 1 つ足す → `read_diagram` → AI がノードを 1 つ足して `update_diagram(expected_updated_at)` → 位置が保たれ、足したノードが出て、通知と ● → 1 秒待って返った `updated_at` で続けて `update_diagram` が通る → 人が直す → 古い `expected_updated_at` で呼ぶと断られる。
  開いていない図の `open=false`（画面が変わらず ● が付く）と `open=true`（開いて前に出る）。種類の不一致・空の図。**意図して競合を起こす**: ノードを動かした直後（1 秒以内）に update / 別の図を押した直後に前の図を update / update と `open_in_editor` を並列に — 結果を「未検証」か failures に書く。
  LORELEI.md のツール表と頼み方の例・読み戻しの注意の改定

## 受け入れ条件

1. `read_diagram` で読んだ図を直して `update_diagram(id, source, expected_updated_at)` で書くと、同じ id・同じ名前・同じ並びのまま中身が変わり、`read_diagram` で直した Mermaid が返る（開いていない図では届けた Mermaid そのもの、開いている図では 1 秒待つとエディタの書き方に揃ったもの）
2. 開いている図を書き換えると、GUI のキャンバスが新しい中身に変わり通知が出て、**同じ ID のノードは位置を保つ**。1 秒待って、返った `updated_at` をそのまま `expected_updated_at` にした次の `update_diagram` が通る（揃え書きは `updated_at` を進めない）
3. 人が直した後（1 秒以上前）の図に、古い `expected_updated_at` で書くと、ファイルは変わらず、ツール結果のエラーで「読み直して」と返る。`expected_updated_at` を省く・時刻として読めない値は入力のエラー
4. 開いていない図を `open=false` で書き換えると画面は変わらず、一覧の ● が付く。`open=true` なら開いて窓が前に出る
5. 種類の違う図・GUI で開けない種類・ノードが 0 の図は `updated: false` + reason で、ファイルは変わらない（`open_in_editor` もノード 0 を `opened: false` で断る）。無い id・ごみ箱の id・初期図と同じ図はツール結果のエラー（パスを載せない）
6. `include_original=true` の `original_source` が最後に届けた原文になり、`origin` は変わらない。`saved_at` と一覧の並びは動かず、● が付く。「保存」(Ctrl+S) で ● が消える
7. `Store::update` の直後、`layout` は残っている（自動テスト）。載せ替え後の自動保存で、消した・改名したノードの位置は `layout` から消える（自動テスト。仕様）
8. 古い `base_updated_at` を添えた `save_document` は `STALE_BASE` で拒まれ、ファイルは変わらない（自動テスト）。GUI は通知を出してその図を開き直し、AI の中身が出る（jsdom + 実機）
9. `update` した new の図に初期図と同じ `source` を書こうとすると `save` が拒む（保険の条件の変更。自動テスト）

## スコープ外

- 差分の適用（ノードを足す・消す・改名の操作を MCP で受ける）— 丸ごと差し替えで足りる。要るなら別 spec
- 書き換え前の中身を GUI で戻す（D5 は Rust がファイルを 1 世代残すだけ。採らなければ履歴なし）
- 図の種類を変える（flowchart → erDiagram）— `open_in_editor` で新しい 1 件
- AI が名前を変える（`title`。D1）
- 位置（`layout`）を MCP で読む・書く。AI が足したノードの重なりを避ける配置
- 図が変わった時に AI へ知らせる（MCP の通知・購読）

## 未検証のまま置いているもの（P3 で試し、結果を書く）

- **走り出した古い保存**（現況 3 の 3 つ目）: ノードを動かして 1 秒以内に update が来ると、古い保存は `STALE_BASE` で捨てられ、開き直しの通知と載せ替えの要求が重なる（`navSeq` で後の方が勝つ）。人には「AI が書き換えたので開き直した」と見える想定
- **図を切り替えた直後の前の図への update**（`last_opened` が古い窓）: 載せ替えの要求は `drain` で捨てられ、切り替え先を開く途中の `open()` は続く想定（`beforeImport` を通らないので `navSeq` は進まない）
- **update と `open_in_editor` の並列**: 同じ回の `drain` で載せ替え → 新しい図の順に処理され、古い書きかけは書かれない想定
- `first_fill` の窓: AI の図を開いて 1 秒以内の編集は最初の書き込みに混ざり `updated_at` が進まないので、`expected_updated_at` を通り抜ける（既存の穴。D5 の履歴で拾えるか）
- 起動直後の `last_opened`（前回の値）に来た update: 載せ替えの要求が最初の `drain` で拾われ、その図が開く（起動処理は `currentRef` があれば退く）想定

## 裁定（利用者、2026-09-28。rev1 で確定）

1. **D2 `expected_updated_at` は必須**（rev0 は省略可。査読 1-9・2 とも必須を推した）
2. **D3 `open` の既定は false**（画面を変えない）
3. **D5 履歴を 1 世代残す**（`history/{id}.json`。GUI は持たない）
4. **D1 `origin` は変えない**（rev0 は `ai` に改める案。保険の条件を `original_source` の有無に）

## 査読の採否（rev0 → rev1）

| 指摘 | 採否 | 反映 |
|---|---|---|
| 査読 1-1: 種類の不一致の扱いが D4 の中で矛盾（口の前では `Document.editor` が分からない） | 採る | D4: 口の Err を `UpdateError` の enum にし、`KindMismatch` だけ reason、他はツール結果のエラー。分け方の規則を書いた |
| 査読 1-2 / 2-(1) / 2-(5): 開いている図では揃え書きで `updated_at` が進み、返した値が続けて使えない | 採る（形は変えた） | D1: `normalize_pending` の印。1-2 の「`source == original_source` なら進めない」は、AI が生成器の書き方で送ると人の最初の編集を飲み込む（査読 2）ので採らず、印は中身が同じでも消す |
| 査読 1-3 / 2-(2)(a): `Store` に排他が無い（TOCTOU） | 採る | D2: プロセスで 1 つの `static Mutex` で load → write を囲む |
| 査読 1-4: `title` の上書きは楽観ロックで守られない | 採る（強い方） | D1: `title` を受けない。スコープ外に |
| 査読 1-5: 契約の改定の波及が漏れている | 採る | D4: 足す・改める一覧と grep する語 |
| 査読 1-6: `origin` を変えず保険の条件を `original_source` の有無に | 採る（裁定 4） | D1。受け入れ 9 |
| 査読 1-7: 受け入れ 2 が自己矛盾、載せ替えの通知が無い | 採る | 受け入れ 2・3 に分け、通知を D3 と受け入れ 2 に |
| 査読 1-8 / 2-(2) 順序 1: 走り出した保存は cancel で止まらない | 採る | D2: `base_updated_at` + `STALE_BASE` で古い保存を捨てる。未検証に時系列 |
| 査読 1-9: `expected_updated_at` を必須に、比較の単位 | 採る（裁定 1） | D2: 必須、時刻として同じ瞬間か。`open_in_editor` に `updated_at` |
| 査読 1-10: 人の編集が失われる場面の列挙、履歴 1 世代 | 採る | D2 の「止められないもの」、D5（裁定 3）、未検証の `first_fill` の窓 |
| 査読 2-(1) / 2-(4): `partitionOpens` と `mine.at(-1)` が同 id の判定より先に効く。並列の `open_in_editor` で載せ替えが捨てられ flush が潰す | 採る | D3: `reload: true` の要求は `partitionOpens` に入れず別に扱い、載せ替えを先に処理。`use-desktop-open.test.tsx` に同居のケース |
| 査読 2-(2)(b) / 2-(3): `last_opened` が古い窓は `open()` の全区間で、AI の書き込みが消える。GUI 側にも楽観ロック | 採る | D2: `save_document` の `base_updated_at` と `STALE_BASE`、開き直し。受け入れ 8 |
| 査読 2-(3) 代替: `state.json` に `opening` を書く | 採らない | `base_updated_at` で塞がる。`opening` は窓を狭めるだけ |
| 査読 2-(5): `beforeImport` が `openingRef` を消さない（既存の潜在バグ） | 採る | D3: 載せ替えで `openingRef` を消す。`document-list.test.tsx` に |
| 査読 2-(6): 戻り値 `open` は Rust の判断。ページ違いの `beforeLeave` の flush | 採る（一部） | D3: `open` の意味を「GUI へ渡した」に。載せ替えはページ違いなら捨てる（flush の経路に入れない） |
| 査読 2-(7): 全ノード改名の載せ替えで `applyLayout` が空振り | 採る | D3: 交わりが空でない時だけ当てる。`doc-session.test.ts` |
| 査読 2-(8) / 2-(4)（初稿）: `refreshList` の全置換が自動保存の 1 件差し替えと競合。● 落ちの候補 | 採る | D3: `documents-changed` に `DocumentSummary` を載せ 1 件差し替え。spec 04 の未検証へ書き戻す |
| 査読 2-(9): `Store::update` も初期図と同じを拒む。`read_diagram` の説明 | 採る | D1 の断るもの、D4 の説明の改定 |
| 査読 2-(10): jsdom で載せ替えの到着を起こす手段が無い | 採る | P2: `listen` の模擬と `fake-backend` の `take_pending_open`。`deliver_update` の判断を純粋な関数に |
| 査読 2-(3)（初稿）: ノード 0 の図で門が開き前のキャンバスが残る | 採る（実測で確認） | 現況 4、D1: `update_diagram` と `open_in_editor` の両方でノード 0 を断る。受け入れ 5 |
| 軽微（両査読）: `updated: false` の時の `open` / `updated_at`、`convert_source` の `layout: null`、`Recorder` / `Refuser`、受け入れ 1 の「1 秒待つ」、`UpdateRequest.editor` の型、`title` の trim | 採る | D3・D4・P1・受け入れ 1。`title` は受けないので trim は不要 |
| 査読 2-(1) 提案 (a)(b)（初稿）: 揃え書きをフロントの `flush` で即時に | 採らない | 印は「次の `save` が消す」で足り、フロントを変えずに済む。1 秒の窓は D2 で認めている |
