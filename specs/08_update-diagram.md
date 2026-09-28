# Spec: AI が既存の図を書き換える（`update_diagram`）

**ID**: 08
**Date**: 2026-09-28
**Status**: Approved（rev2。査読 1〜4 を反映。裁定 1〜4 は 2026-09-28 に利用者が承認。次は P0）
**Branch**: なし（Phase 単位で main へ直接コミット）

## Goal

AI が `read_diagram` で読んだ図を直して、**同じ 1 件に書き戻せる**ようにする。今は AI が図を直すたびに `open_in_editor` で新しい 1 件が増え（spec 02 D8「開いている図は上書きしない」）、
人が付けた名前・並び・ノードの位置が引き継がれない。「AI が書く → 人が直す → AI が読んで直す → 人がまた直す」の往復を、1 枚の図の上で回せるようにする。

spec 04 でスコープ外にした「AI が既存の図を書き換える」（利用者裁定 2026-09-25: 読むだけ、書き換えは後）の、後の段。

## 現況（実測 2026-09-28、コードで確認）

### 1. 届いた図は必ず新しい 1 件になる

- `open_in_editor` → `EditorPort::open` → `deliver`（`src-tauri/src/lib.rs`）→ `incoming` が `Store::create`（`origin: ai`、`source` は空、`original_source` に原文）→ `OpenRequest` を `PendingOpens` に積み `OPEN_EVENT` を出す → 窓を前に出す
- フロント（`lib/desktop/use-desktop-open.ts` の `drain`）が `take_pending_open` で受け取り、ページの種類で振り分け（`partitionOpens`）、**このページ宛ての最後の 1 件だけ**を `beforeImport`（今の図の保存を**始め**、`becomeCurrent` で届いた図へ切り替え（`ready` / `imported` を落とし `expected` を立て直す）、`layoutRef = {}`、隠す）→ エディタの `handleImportMermaid`（キャンバスを置き換える）→ `afterImport` → 自動保存が `source` を埋める
- 既存の 1 件を指して中身を差し替える口は、MCP にも Rust の `Store` にも無い

### 2. `Document` の欄と、保存の規則（`Store::save`）

- `source` = エディタの生成器の出力。`original_source` = 届いた原文で「以後書き換えない」（data_contract）。`layout` = Mermaid 上の ID（フローは `getSafeVariableName` した変数名、ER 図はエンティティ名）→ 位置
- `save` は `source` と `layout` だけを書く。中身が同じなら**ファイルに書かない**（`write` を呼ばず戻る）。**`source` が空だった図の最初の書き込みは `updated_at` を進めない**（`first_fill`）。`origin` が ai / import の図に初期図と同じ `source` を書くと拒む（spec 04 D4-2。前の `source` に依らず）。`rename` は `updated_at` を動かさない
- `unsaved`（●）= `updated_at > (saved_at ?? created_at)`。一覧の並びは `saved_at ?? created_at`（spec 02 D12）
- 図を開く時（`useDocSession.open`）は `doc.source || doc.originalSource` を `convert_source` に通す。**`source` に入っているのが生成器の出力でなくても開ける**（merman が読める Mermaid なら何でも）
- **同じファイルへの書き手は今は 1 つ**（JS の `Autosaver` が直列化。`deliver` は新しいファイルしか作らない）。`Store` の save / mark_saved / rename はどれも load → 書き換え → write で、排他は無い。`store()` は呼ぶたび新しい `Store` を作る（状態を持たない）

### 3. 開いている図のファイルを裏で書き換えると、エディタが古い中身で上書きする

- 開いている図のエディタは自分のキャンバスを真として、変化のたびに（1 秒後）`save_document` を呼ぶ。ファイルだけ書き換えても画面は変わらず、次の自動保存で**古い中身が書き戻る**
- 届いた図の経路で載せ替えると、`beforeImport` の `leaveNow` が今の図の `autosaver.flush()` を**先に走らせる**。書き換えた後に古い書きかけが書かれる順になる（spec 07 P3 の「古い向きで書き戻された」と同じ形の危うさ）
- **走り出した保存は止められない**: `Autosaver.flush` は `pending = null` にしてから `await save(...)` する。`cancel()` は待ちと timer を消すだけで、発行済みの IPC は Rust まで届いて書く
- 今 GUI で開いている図は `state.json` の `last_opened` で Rust からも分かるが、`open()` は `leave()`（flush）→ `loadDocument` → `convertSource` の 3 つの await の**後**に `becomeCurrent`（`set_last_opened`）を呼ぶ。**図を開いている全区間、`last_opened` は前の図を指す**。起動直後は前回の値のままで、フロントの `currentRef` は null
- `drain` は同じ回に並んだ要求のうち最後の 1 件しか取り込まない（現況 1）。Claude Code はツールを並列に呼ぶので、書き換えと別の `open_in_editor` が同じ回に並ぶことがある

### 4. 位置は Mermaid 上の ID で引ける

- `layout` のキーが Mermaid の ID なので、**同じ ID のノードは中身を差し替えても位置を当てられる**（`withLayout`）。取り込みは向きに合わせて全ノードを並べ、その後で保存済みの位置を上書きする（spec 07 D1）。
  位置の無いノード（AI が足したもの）は並べた位置に置かれ、既存のノードと重なることがある
- 位置を当てる門（`expectedKeys` ⊆ ストアのキー）は届いた図のノードで判定し、`layout` の余分なキーは無視する。AI が足した・改名したノードでも門は開く。ただし `applyLayout = layout のキーが 1 つ以上` で、当てる回は保存しない（当てた後の変化で保存する）。
  `ready` が true のままだと門を通らず即 `save: true` になる（`onNodesChanged`）— 載せ替えでは `becomeCurrent` が `ready` を落とすので通る
- **ノードが 0 の図は `to_editor` を通る**（実測: `flowchart TD` だけ・`erDiagram` だけで `nodes: []`、`dropped: []`）。エディタの取り込みは `data.nodes.length === 0` なら何もしない → キャンバスは前のまま → 門は `expected = []` で開き、**前のキャンバスがその図として保存される**。
  `open_in_editor` にも今ある穴（届いた空の図の 1 件に、前の図の中身が入る）。**空文字・空白だけ**は `to_editor` が「図の種類を判定できません」の Err（文法エラーと同じツール結果のエラー）で、この穴には当たらない
- **初期図は空白の違いだけで同じペイロードになる**（実測: `startNode[Start]` の字下げを変えても `to_editor` の出力は同じ）。文字列の一致で初期図を事前に弾いても、空白違いは通って揃え書きが初期図になる

## 決めること

### D1. 書き換えは「同じ 1 件の中身を、届いた図で丸ごと差し替える」

- ツール `update_diagram(id, source, expected_updated_at, open = false)`。差分の適用（ノードを足す・消す）はしない — AI は `read_diagram` で読んだ Mermaid を直して丸ごと送る（Mermaid はテキストなので、AI 側で差分を作るのが自然）。
  **`title` は受けない**（査読 1-4: 改名は `updated_at` を動かさないので、AI が読んだ名前を写して送ると人の改名が黙って消える。名前は人が付ける。AI が名前を付けるのは `open_in_editor` の時だけ）
- 差し替えるのは `source`・`original_source`・`updated_at`・`normalize_pending`。`id`・`title`・`editor`・`origin`・`created_at`・`saved_at`・`layout` は変えない
  - **`source` には届いた Mermaid をそのまま書く**（生成器を通していない）。GUI で開く（または開いている図なら載せ替える）と、次の自動保存でエディタの書き方に揃う。空にはしない（空にすると、開いていない図を `read_diagram` で読んだ時に「まだエディタに載っていない」の空文字が返り、AI が自分の送った図を読めない）。
    **開いていない図の `read_diagram` は、GUI で開くまで届けた Mermaid そのものを返す**（subgraph など、エディタで省かれる要素も残ったまま）。ツールの説明に書く
  - **`original_source` は「AI・インポートが最後に届けた原文」に改める**（data_contract の「以後書き換えない」を「`update_diagram` で置き換わる」に）。`read_diagram` の `include_original` は、いつも最後に届けた原文を返す。new の図は `update_diagram` されるまで `null`（されたら文字列）
  - **`origin` は変えない**（査読 1-6、裁定 4）。`origin` は来歴（new / ai / import）のまま
  - **`normalize_pending`（新しい欄、既定 false）を立てる**。`update` の後、最初の `save` はエディタの書き方に揃えるだけで人の変更ではない。**`save` はこの印が立っていれば `updated_at` を進めず、印を消してファイルに書く — `source` と `layout` が同じで普段なら書かない時も、印を消すためにファイルに書く**（AI が生成器の書き方で送ると揃え書きは中身が同じになる。印が残ったままだと人の最初の編集が「変更でない」と記録される。査読 2）。
    印は `Document` の欄で、ファイルと GUI の受け渡しに乗る（`json_keys: camelCase`。古いファイルに無ければ false）。
    **`first_fill` とは重ならない**: `update` は `source` を非空にするので、その後の `save` で `first_fill`（`source` が空だった）は起きない。`updated_at` を進めない書き込みは、`first_fill` か印の消える 1 回かのどちらか 1 回だけ
  - `updated_at` を今にする → ● が付く（最後の「保存」の後に変わった）。`saved_at` は触らないので**一覧の並びは動かない**（見たり直したりしても動かない、spec 02 D12 と同じ扱い）
  - `layout` は残す。同じ ID のノードは位置を保ち、AI が足したノードは向きに合わせて並べた位置に置かれる（現況 4。重なりは人が直す）。ID を変えた・消したノードの位置は、載せ替え後の最初の自動保存で `layout` から消える（`collectLayout` は今のノードだけを書く。仕様）
- **届いた図そのものの問題 → `updated: false` + reason**（ファイルは変えない。AI は図を直すか別のツールを使う。`open_in_editor` の `opened: false` と同じ形）:
  - 届いた図の種類（flowchart / erDiagram）が `Document.editor` と違う → reason「この図は flowchart です。erDiagram にするなら open_in_editor で新しい図を作ってください」。種類が変わるとページも変わり、載せ替え（D3）の前提が崩れる
  - GUI で開けない種類（sequence など）→ `open_in_editor` と同じ文言
  - **ノードが 0 の図** → reason「ノードの無い図は開けません」（現況 4 の穴）。**`open_in_editor` も同じ条件で断る**（`opened: false`。今ある穴を同時に塞ぐ）
- **指した図の状態の問題 → ツール結果のエラー `{ error }`**（`read_diagram` の `not_found` と同じ形）: 無い id・ごみ箱の id・`expected_updated_at` が違う（D2）・書けない
- **文法エラー・空文字**は今の `validate` / `open_in_editor` と同じ（`to_editor` の Err → ツール結果のエラー `{ error, line? }`）。新しい規則は無い
- **初期図の保険（spec 04 D4-2）は「空への最初の書き込み」に絞る**: 条件を `origin != new && source == initial` から **`doc.source が空 && origin != new && source == initial`**（= `first_fill` の時だけ）に変える。
  - 保険が止めたかった形は spec 04 現況 4 の 1 件目（空の `source` への最初の書き込みで初期図が入った）で、`first_fill` の形そのもの。2 件目（初期図の上で編集された）は元から保険では止まらない。前の `source` に依らず拒む今の条件は、
    「人が手で全部消して初期図とちょうど同じ図を作った」を拒む（spec 04 で受け入れた誤検出）以外に何も守っていない
  - `update` の後の揃え書きは `source` が非空なので保険に掛からない。AI が初期図と同じ図を `update` で送っても、揃え書きは通り、拒まれ続けない（査読 2-(9)・4-7 の「止まり続ける」は起きない）。
    **文字列で初期図を事前に弾く案は採らない**（現況 4: 空白違いで空振りする）
  - `open_in_editor` で初期図と同じ図を送ると、今も `first_fill` で拒まれ続ける（既存。稀。「未検証」に書く）
- `dropped` は `open_in_editor` と同じ（エディタで表現できない要素の件数）

### D2. 書き手は 2 つとも、読んだ時の `updated_at` を添えて書く（楽観ロック）

同じファイルに AI（MCP）と GUI（自動保存）の 2 つが書くようになる。**どちらも「自分が読んだ版」を添え、ファイルがそれより進んでいれば書かない**。

- **AI 側 `expected_updated_at`（必須。裁定 1）**: `read_diagram` / `list_diagrams` / `open_in_editor` / 前の `update_diagram` が返す `updated_at` を渡す。今のファイルの `updated_at` と違えば書かずにツール結果のエラー
  「図が変わっています（updated_at: 今の値）。read_diagram で読み直してから update_diagram してください」。人が直していれば（位置を動かしただけでも `updated_at` は進む）AI はそれを知らずに上書きしない。
  比較は **RFC 3339 を時刻として解釈して同じ瞬間か**（`DateTime::parse_from_rfc3339`。マイクロ秒まで残る）。時刻の表記の違い（UTC に直す・オフセットの書き方）は吸収するが、**AI が秒やミリ秒に丸めた値は別の瞬間なので一致しない**（正しく Conflict）。ツールの説明に「返ってきた値をそのまま渡す」と書く。解釈できない値は入力のエラー
  - `open_in_editor` の戻り値に `updated_at` を足す（届いた直後の値。揃え書きは `first_fill` で進めないので、人が触るまでそのまま使える）
  - 必須にする理由: 省略できると、それが人の編集を黙って消す唯一の経路になる。必須にしても AI の手間は「読んでから書く」の 1 手で、それは往復の本来の形
- **GUI 側 `base_updated_at`（新規。`save_document` の引数）**: フロントは図を開いた時（`load_document`）・載せ替えの要求（`OpenRequest.document`）・各 `save` の戻り値の `updated_at` を覚えて、自動保存に添える。`Store::save` はファイルの `updated_at` と違えば
  **`STALE_BASE: {今の updated_at}` で拒む**（`DOCUMENT_GONE` / `INITIAL_FIGURE_REJECTED` と同じ「捨ててよい失敗」。文字列の頭で見分け、今の値を後ろに載せる）。
  これが**現況 3 の競合を「狭める」でなく「塞ぐ」**手（査読 2）: 走り出した古い保存も、`last_opened` が古い瞬間に来た書き換えも、古い版を添えた保存はファイルに届かない
  - **フロントが `STALE_BASE` を受けた時**（査読 4-1: 載せ替えと二重に開き直さない）: エラーに載った今の `updated_at` が**自分の `base_updated_at` と同じなら、載せ替え（D3）が先に届いていて画面は既に新しい → 黙って捨てる**。
    違えば（載せ替えが来ない = `last_opened` が古くて Rust が「開いていない」と見た）、通知「AI が図を書き換えたので開き直します」を出してその図を `open()` し直す（届いた中身で開く）。
    捨てた後に載せ替えが来る順（エラーが先）では、`open()` の途中に載せ替えの `beforeImport` が `navSeq` を進めて `open()` を止める（載せ替えが勝つ）。この順では通知が 2 つ出る（開き直します・書き換えました）。稀なので受け入れ、「未検証」で確かめる
  - `mark_saved` / `rename` は `updated_at` を動かさないので `base` は変わらない。`first_fill` と `normalize_pending` の揃え書きも進めないので変わらない。進むのは人の編集の `save` と `update` だけ
- **`Store` に排他を置く**: プロセスで 1 つの `Mutex`（`static`。`Store` は呼ぶたび作られるので構造体のフィールドでは効かない）で save / update / mark_saved / rename / trash の load → write を囲む。比較と書き込みは同じ鍵の中（TOCTOU を作らない）。
  MCP のツールは `spawn_blocking` の別スレッド、Tauri の command も別スレッドで、順序は保証されない
- **止められないもの**: GUI で編集中の、まだファイルに書かれていない直近約 1 秒の変更（自動保存の待ち）。読み戻しが最後の 1 秒を読めない（spec 04 D1）のと対で、書き換えは最後の 1 秒を消すことがある。
  その保存が書き換えの後に届けば `STALE_BASE` で捨てられ、開き直しか載せ替えの通知が出る（人は消えたことに気付ける）。
  **揃え書きの窓も同じ**（査読 4-4）: `update` の後（載せ替え・開いた後）1 秒以内の人の編集は揃え書きに混ざり、印を消す 1 回として `updated_at` を進めない → 次の `update_diagram` が `expected_updated_at` を通り抜けて上書きする。
  `first_fill` に元からある窓と同じ形で、D5 の履歴で拾える。「揃え書きは `layout` が同じ時だけ進めない」にはしない（AI がノードを足す・消すと `layout` は必ず変わり、返した `updated_at` が使えなくなる）。ツールの説明と LORELEI.md に書く

### D3. 開いている図は GUI で載せ替える。開いていない図はファイルだけ書く（`open` で開かせる）

- Rust（`deliver_update`）は、`Store::update` でファイルを書けた後、`last_opened` と `open` で決める（判断は純粋な関数 `Reload / Open / FileOnly` + 前に出すか）:
  - **その図が `last_opened` と一致** → 届いた図の経路（`OpenRequest` → `OPEN_EVENT`）で**その 1 件を載せ替える**（`Reload`）。要求に `reload: true` の印と、その図の `layout`・書き換え後の `DocumentSummary` を持たせる。新しい 1 件は作らない。
    **`open=true` なら窓を前に出す**（査読 4-6: 窓が裏に隠れていて「更新したので見て」の意図の時）。`open=false` なら出さない
  - **一致せず `open=true`** → 同じ経路で（`reload: false`、`layout` 付き）その図を開き、窓を前に出す（`Open`）。`open_in_editor` と同じ動き（ページが違えば移る）
  - **一致せず `open=false`（既定。裁定 2）** → ファイルだけ書く（`FileOnly`）。画面は変えない（人が別の図を直している最中に横取りしない）
  - **`last_opened` は図を開いている全区間で古い**（現況 3）。その間に来た書き換えは、開いている図でも `FileOnly` に倒れる。一覧は `documents-changed` で更新され、キャンバスは古いまま → 次の自動保存が `STALE_BASE` で拒まれ、フロントが開き直す（D2）。載せ替えの要求は来ないので二重にならない
  - 書けた時は**どの場合も** `lorelei://documents-changed`（本体は書き換え後の `DocumentSummary`）を出す（`updated: false` の時は出さない。ファイルが変わっていない）。外枠はその 1 件だけを一覧で差し替える（`setList(map)`。一覧を丸ごと読み直さない — 読み直しは自動保存の 1 件差し替えと競合して ● が戻ることがある。査読 2-(8)。spec 04 の「● が 1 件落ちた」の候補としても書き戻す）
- **載せ替え（`reload: true`）の要求は、`drain` が `partitionOpens` に入れず別に扱う**（現況 1・3: 最後の 1 件しか取り込まない・別の図の `beforeImport` の flush が古い書きかけを書く）:
  - **今のページの種類と一致し、かつ今の図の id と一致する**時は載せ替える: `beforeImport` は**今の `beforeImport` と同じ**（`becomeCurrent` で `ready` / `imported` を落とし `expected` を届いた図で立て直す、隠す、一覧を読む）で、違いは 4 点 — **flush せず `autosaver.cancel()`**、`layoutRef` を要求の `layout` に、`openingRef` を消す（査読 2-(5)）、`base_updated_at` を要求の `document.updated_at` に。その後 `onImport` → `afterImport`。
    載せ替えた時は通知「AI が図を書き換えました」を出す（人が見ているキャンバスが黙って変わらないように。査読 1-7）
  - **今の図が無い（起動直後、`currentRef` が null）時は「開く」として扱う**（査読 4-2: 起動直後は前回の `last_opened` に来た書き換えが載せ替えの要求になる。捨てると起動処理が前回の図を古い中身で… ではなくファイルは新しいので正しく開くが、要求を無駄にする）。`reload: false` と同じ経路で `becomeCurrent` して開く。起動処理は `currentRef` があれば退く（今のまま）
  - それ以外（ページ違い・別の図が今の図）は捨てる（人が別の図へ移る途中。ファイルは書けている。古いキャンバスの保存は `STALE_BASE` が受け持つ）
  - 同じ回に別の図の「開く」が並んでいても、載せ替えを先に処理してから最後の 1 件を取り込む（載せ替えの cancel が先なので、その `beforeImport` の flush は古い書きかけを書かない）
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
UpdateRequest = { id, source, editor: Editor(flowchart | erDiagram), expected_updated_at, open (既定 false) }
UpdateOutcome = { open: bool, updated_at }
UpdateError   = KindMismatch { actual }        // → updated: false + reason (AI は別のツールで直せる)
              | NotFound                       // → ツール結果のエラー「図が見つかりません（id: …）」(read_diagram と同じ)
              | Conflict { current_updated_at } // → ツール結果のエラー「図が変わっています（updated_at: …）。read_diagram で…」
              | Other(String)                  // 書けない等 → ツール結果のエラー (文字列そのまま)
```

- 種類の判定（`to_editor`）・ノード 0・`dropped` は `lorelei_mcp` が口を呼ぶ前に決める（`open_in_editor` と同じ）。`Document.editor` との突き合わせは GUI（`Store`）しか知らないので口の中で行い、`KindMismatch` で返す
- **分け方の規則**: 届いた図そのものの問題（種類・空・GUI で開けない）は `updated: false` + reason（`open_in_editor` の `opened: false` と同じ。AI は図を直すか別のツールを使う）。指した図の状態の問題（無い・変わった・書けない）はツール結果のエラー `{ error }`（`read_diagram` と同じ）。
  `open` の口の Err が reason になるのは今どおり（届けられなかった理由）
- `OpenRequest` に `reload: bool`（既定 false）と `layout: Layout | null` を足す。`convert_source` の戻り（保存した図を開く時）は `reload: false`・`layout: null`（`open()` は `doc.layout` を使う）
- data_contract に足す・改めるもの（P0 で凍結。**改めた語で全台帳を grep する**（テストのコメントも）: `以後書き換えない` / `届いた時の原文` / `生成器の出力` / `5 本` / `origin != new` / `前の source に依らず`）:
  - `McpServer.tools.update_diagram`（入出力・断る条件の 2 分類・エラー）、`open_in_editor.output.updated_at`、`open_in_editor` のノード 0 の拒否、`McpServer.http.editor_port` の 4 つ目と `open` の戻り
  - `Document.original_source`（最後に届けた原文。new は update されるまで null）、`Document.normalize_pending`、`Document.save_guard`（`first_fill` の時だけ）、`Document.update`（書く欄・書かない欄・断る条件）、`Document.save_stale`（`STALE_BASE: {updated_at}`）、`Document.store_lock`、`Document.history`（D5）
  - `Diagram.source`（update の後、GUI に載るまでは届けた Mermaid そのもの）、`Diagram.original_source`（最後に届けた原文。new は update されるまで null）。`DiagramSummary` は変えない
  - `GuiCommands.save_document`（`base_updated_at`）、`open_request`（`reload` / `layout`）、`documents_event`、`trash_document`（履歴は動かさない）
  - ツールの説明（`read_diagram` の「エディタが出した Mermaid」「届いた時の原文」、`include_original` の docstring、`open_in_editor` の「開いている図は上書きしない」と対で「書き換えは update_diagram」）、CLAUDE.md・`lorelei_mcp` の crate doc・`tests/http.rs` の「5 本」→ 6 本、LORELEI.md のツール表・「原文をそのまま残しています」・読み戻しの注意、spec 04 D2 / 現況 3 / D4-2 の冒頭に「spec 08 で改定」の 1 行

### D5. 書き換え前の中身を 1 世代だけ残す（裁定 3: 残す）

- `Store::update` は書き換える前の `Document` を `{app_data_dir}/history/{id}.json` に写してから書く（1 世代。次の update で上書き）。`trash/` と同じ「消さない」流儀。GUI は持たない（戻すのは人が手で）
- 動機: D2 で止められない直近 1 秒の編集と、`expected_updated_at` を通り抜けた変更（`first_fill` / 揃え書きの窓）は、書き換えで失われる。安価な保険
- ごみ箱へ移しても `history/{id}.json` は動かさない・消さない（`trash/` と同じく、空にする操作は無い。一覧は `documents/` 直下しか読まないので害は無い）

## Phase

- **P0**: data_contract を凍結（D4 の一覧。grep する語も）。`Store` の規則を先に書く: `update` が書く欄と書かない欄、`normalize_pending` と `first_fill` の関係（重ならない。進めない書き込みは 1 回だけ）、保険を `first_fill` の時だけに、`expected_updated_at` / `base_updated_at` の比較（時刻として同じ瞬間）、排他、断る条件の 2 分類、`history/`
- **P1**: `lorelei_mcp` — `EditorPort::update` と `UpdateError`、`open` の戻りに `updated_at`、ツール `update_diagram`、`open_in_editor` のノード 0 の拒否。`tests/http.rs` に HTTP で（`Recorder` / `Refuser` に `update`。種類の不一致 → reason、ノード 0 → reason（`open_in_editor` も）、GUI で開けない種類 → reason、`NotFound` / `Conflict` / `Other` → `{ error }`、`open` と `updated_at` の返し、`updated: false` の時の `open` / `updated_at`）。Red → Green
- **P2**: src-tauri — `Store` の `Mutex`、`Store::update`（テスト: 書く欄と書かない欄・`expected_updated_at` の一致と不一致（UTC に直した同じ瞬間は一致、丸めた値は不一致）・ごみ箱の id・`layout` が残る・`history/` に 1 世代）、
  `Store::save` の `base_updated_at`（`STALE_BASE` と今の値）と `normalize_pending`（進めない・消してファイルに書く・中身が同じでも書く・2 回目は進む）、保険を `first_fill` の時だけに（テスト: update の後の揃え書きが初期図でも拒まれない / 空への最初の書き込みは今どおり拒む）、
  `deliver_update` の判断（純粋な関数: `last_opened` × `open` → `Reload / Open / FileOnly` と前に出すか。emit は薄く）、`documents-changed`。
  lib/desktop — `OpenRequest.reload` / `layout`、`drain` の載せ替えの別扱い（同じ回に「開く」が並ぶ場合・今の図が無い時は開く、を `use-desktop-open.test.tsx` に）、`beforeImport` の載せ替え（cancel・位置・`openingRef`・`base`・通知）、`base_updated_at` の保持と `STALE_BASE`（同じ値なら捨てる / 違えば開き直す）、`applyLayout` の交わり（`doc-session.test.ts`）、外枠の 1 件差し替え。
  jsdom で載せ替えの到着を起こす手段（`listen` の模擬でハンドラを捕まえ、`fake-backend` に `take_pending_open` の中身を足す）を先に作る。`direction-save.test.tsx` の形で「載せ替え後に同じ ID の位置が保たれる / `save_document` が 1 回出て `updated_at` が進まない / 古い書きかけは出ない」
- **P3**: 実機（`tauri dev` → 配布ビルド）— `open_in_editor` → 人がノードを動かして 1 つ足す → `read_diagram` → AI がノードを 1 つ足して `update_diagram(expected_updated_at)` → 位置が保たれ、足したノードが出て、通知と ● → 1 秒待って返った `updated_at` で続けて `update_diagram` が通る → 人が直す → 古い `expected_updated_at` で呼ぶと断られる。
  開いていない図の `open=false`（画面が変わらず ● が付く）と `open=true`（開いて前に出る）、開いている図の `open=true`（前に出る）。種類の不一致・空の図・空文字。**意図して競合を起こす**: ノードを動かした直後（1 秒以内）に update / 別の図を押した直後に前の図を update / update と `open_in_editor` を並列に / 起動直後に前回の図を update — 結果を「未検証」か failures に書く。
  LORELEI.md のツール表と頼み方の例・読み戻しの注意の改定

## P0 結果（2026-09-28）

data_contract に凍結した（コードはまだ触らない）:

- `McpServer.tools.update_diagram`（入力 4 つ・`writes`・断る 3 つ（reason）・エラー 3 つ・出力・`gui_effect`（`Reload / Open / FileOnly`）・`blind_spot`）、`open_in_editor.refuses`（ノード 0）と `output.updated_at`、
  `McpServer.http.editor_port` の 4 つ目（`UpdateRequest` / `UpdateOutcome` / `UpdateError`）と `open` の戻り `{ id, updated_at }`、`McpServer.refusal_vs_error`（2 分類の規則）
- `Document`: `original_source`（最後に届けた原文）・`updated_at`（何で進むか）・`normalize_pending`・`save_guard`（`first_fill` の時だけ）・`save_stale`（`STALE_BASE: {今の updated_at}` とフロントの受け方）・`save_normalize`・`update`・`store_lock`・`history`
- `Diagram.source` / `original_source`、`GuiCommands.save_document`（`base_updated_at`）・`open_request`（`reload` / `layout` と `drain` の扱い）・`trash_document`（履歴は動かさない）・`documents_event`
- grep（`以後書き換えない` / `届いた時の原文` / `生成器の出力` / `5 本` / `origin != new` / `前の source に依らず`）: spec 04 の現況 3・D2・D4 と spec 02 の `Document` に「spec 08 で改定」の注記、`Document.source` の注記。
  残り（CLAUDE.md の「5 本」2 か所、`lorelei_mcp/src/lib.rs` の `include_original` の docstring と crate doc、LORELEI.md のツール表）は**ツールが実在する P1・P2 で直す**（今直すと嘘になる）

## P1 結果（2026-09-28）

- `lorelei_mcp`: `EditorPort` に `update(UpdateRequest) → Result<UpdateOutcome, UpdateError>` を足し、`open` の戻りを `Opened { id, updated_at }` に。型 `EditorKind` / `UpdateRequest` / `UpdateOutcome` / `UpdateError`（`KindMismatch { actual }` / `NotFound` / `Conflict { current_updated_at }` / `Other`）。
  ツール `update_diagram`（`UpdateParams` は `expected_updated_at` が必須。`open` は既定 false）と `UpdateResult`。`open_in_editor` の戻りに `updated_at`
- 届いた図そのものの検査を `check_editable` に 1 か所にまとめ、`open_in_editor` と `update_diagram` の両方が使う（GUI で開けない種類・**ノードが 0** → reason。文法エラー・空文字は `CoreError` のまま = `validate` と同じツール結果のエラー）
- `expected_updated_at` は `chrono::DateTime::parse_from_rfc3339` で読めることだけをツールの層で確かめる（同じ瞬間かの比較は GUI 側、P2）。読めなければツール結果のエラー。`chrono` を `std` だけの feature で足した（時計は使わない）
- ツールの説明を改定: `read_diagram`（update の後は届けた Mermaid そのもの・最後に届けた原文・書き戻しは `update_diagram`）、`include_original` の docstring、`open_in_editor`（ノード 0・書き換えは `update_diagram`・`document_id` と `updated_at`）、`get_info` の案内（読む → 直す → 書き戻す）、crate doc「6 本」
- テスト（Red → Green、`tests/http.rs`）: `Recorder` / `Refuser` に `update`。新規 3 本 — 書き戻し（口へ渡す 5 つの値・`open` と `updated_at`・`dropped`）/ 届いた図そのものの問題は reason（種類の不一致は口の `KindMismatch` から今の種類を文言に、ノード 0 と GUI で開けない種類は口を呼ばない、`open_in_editor` もノード 0 を断る）/
  指した図の状態の問題はツール結果のエラー（無い id・`Conflict` は今の値と「read_diagram」を含む・時刻として読めない・**省くと呼べない**・文法エラー・口の `Other`）。既存 1 本にツール 6 本と `updated_at` を足した。12 本緑、clippy 警告 0
- src-tauri: `deliver` が `Opened` を返す（テストで `updated_at` も突き合わせ）、`GuiEditor::update` は P2 まで `Other("まだ使えません")`（spec 04 P1 の `list` / `read` と同じ流儀）、`mcp_host` の偽の口。clippy 警告 0、39 本緑
- CLAUDE.md の「5 本」2 か所を 6 本に。`lib.rs` の `include_original` の docstring も直した（P0 の grep の残り）。LORELEI.md は P2 で
- `cargo fmt` の差分は変更前から `lib.rs`・`tests/http.rs` にあった（fmt は完了の条件に無い）。揃えて整形はしていない

## 受け入れ条件

1. `read_diagram` で読んだ図を直して `update_diagram(id, source, expected_updated_at)` で書くと、同じ id・同じ名前・同じ並びのまま中身が変わり、`read_diagram` で直した Mermaid が返る（開いていない図では届けた Mermaid そのもの、開いている図では 1 秒待つとエディタの書き方に揃ったもの）
2. 開いている図を書き換えると、GUI のキャンバスが新しい中身に変わり通知が出て、**同じ ID のノードは位置を保つ**。1 秒待って、返った `updated_at` をそのまま `expected_updated_at` にした次の `update_diagram` が通る（揃え書きは `updated_at` を進めない）
3. 人が直した後（1 秒以上前）の図に、古い `expected_updated_at` で書くと、ファイルは変わらず、ツール結果のエラーで「読み直して」と返る。`expected_updated_at` を省く・時刻として読めない値は入力のエラー。UTC に書き直した同じ瞬間は通る
4. 開いていない図を `open=false` で書き換えると画面は変わらず、一覧の ● が付く。`open=true` なら開いて窓が前に出る。開いている図でも `open=true` なら前に出る
5. 種類の違う図・GUI で開けない種類・ノードが 0 の図は `updated: false` + reason で、ファイルは変わらない（`open_in_editor` もノード 0 を `opened: false` で断る）。無い id・ごみ箱の id はツール結果のエラー（パスを載せない）。空文字は文法エラーと同じツール結果のエラー
6. `include_original=true` の `original_source` が最後に届けた原文になり（new の図も）、`origin` は変わらない。`saved_at` と一覧の並びは動かず、● が付く。「保存」(Ctrl+S) で ● が消える
7. `Store::update` の直後、`layout` は残っている（自動テスト）。載せ替え後の自動保存で、消した・改名したノードの位置は `layout` から消える（自動テスト。仕様）。`history/{id}.json` に書き換え前の中身がある（自動テスト）
8. 古い `base_updated_at` を添えた `save_document` は `STALE_BASE` で拒まれ、ファイルは変わらない（自動テスト）。載せ替えが先に届いていれば GUI は黙って捨て、届いていなければ通知を出してその図を開き直し、AI の中身が出る（jsdom + 実機）
9. 初期図と同じ Mermaid を `update_diagram` で送っても、揃え書きは拒まれず保存される。空の `source` への最初の書き込みが初期図なら今どおり拒む（自動テスト。保険は `first_fill` の時だけ）

## スコープ外

- 差分の適用（ノードを足す・消す・改名の操作を MCP で受ける）— 丸ごと差し替えで足りる。要るなら別 spec
- 書き換え前の中身を GUI で戻す（D5 は Rust がファイルを 1 世代残すだけ）
- 図の種類を変える（flowchart → erDiagram）— `open_in_editor` で新しい 1 件
- AI が名前を変える（`title`。D1）
- 位置（`layout`）を MCP で読む・書く。AI が足したノードの重なりを避ける配置
- 図が変わった時に AI へ知らせる（MCP の通知・購読）
- `open_in_editor` で初期図と同じ図を送った時に `first_fill` が拒まれ続ける件（既存。文字列で弾いても空白違いで空振りする。起きたら failures に）

## 未検証のまま置いているもの（P3 で試し、結果を書く）

- **走り出した古い保存**（現況 3 の 3 つ目）: ノードを動かして 1 秒以内に update が来ると、古い保存は `STALE_BASE` で捨てられる。載せ替えが先ならエラーは黙って捨てられ通知は 1 つ、エラーが先なら開き直しと載せ替えが重なって通知が 2 つ（`navSeq` で載せ替えが勝つ）想定
- **図を切り替えた直後の前の図への update**（`last_opened` が古い窓）: `FileOnly` に倒れ、切り替え先を開いた後の前の図には何も起きない想定（前の図を再び開くとファイルから新しい中身）。逆に**今開こうとしている図**への update は、`last_opened` がまだ前の図なので `FileOnly` → 開き終えた後の最初の自動保存が `STALE_BASE`（値が違う）→ 開き直しの通知、の想定
- **update と `open_in_editor` の並列**: 同じ回の `drain` で載せ替え → 新しい図の順に処理され、古い書きかけは書かれない想定
- **起動直後に前回の図を update**: 載せ替えの要求が最初の `drain` で「開く」として拾われ、その図が新しい中身で開く想定
- `first_fill` と揃え書きの窓: 開いて（載せ替えて）1 秒以内の編集は `updated_at` を進めないので、`expected_updated_at` を通り抜ける。D5 の履歴で拾えることを確かめる

## 裁定（利用者、2026-09-28。rev1 で確定）

1. **D2 `expected_updated_at` は必須**（rev0 は省略可。査読 1-9・2 とも必須を推した）
2. **D3 `open` の既定は false**（画面を変えない）
3. **D5 履歴を 1 世代残す**（`history/{id}.json`。GUI は持たない）
4. **D1 `origin` は変えない**（rev0 は `ai` に改める案。保険の条件を変える案は rev2 で `first_fill` の時だけに）

## 査読の採否（rev1 → rev2、査読 3・4。利用者が持ち込んだ 2 本）

| 指摘 | 採否 | 反映 |
|---|---|---|
| 査読 3-1: D2 に「裁定待ち」の文言が残っている | 採る | D2・D5 の見出しを確定の記述に |
| 査読 3-2: D1 の「断るもの」が reason とエラーの 2 分類を混ぜている | 採る | D1 を「届いた図そのものの問題 → reason」「指した図の状態の問題 → エラー」の 2 つに分けた |
| 査読 3-3 / 4-7: 初期図の拒否が `update` と `save` の保険で重複、`open_in_editor` に無い片手落ち | 採る（形は変えた） | 文字列の事前拒否は空白違いで空振りする（現況 4 で実測）ので**やめ**、保険を `first_fill` の時だけに絞った（D1）。`update` の後の揃え書きは保険に掛からず、拒まれ続けない。受け入れ 9 を書き直した。`open_in_editor` の同件は既存の稀な件としてスコープ外に |
| 査読 3-4: `deliver_update` の `last_opened` は開いている全区間で古い。D3 に限界を明記 | 採る | D3: `FileOnly` に倒れ、一覧は `documents-changed`、キャンバスは `STALE_BASE` の開き直し |
| 査読 3-5: 空文字の扱いが未定義 | 採る（実測） | `to_editor` が Err（文法エラーと同じツール結果のエラー）。現況 4・D1・受け入れ 5 |
| 査読 3-6: `normalize_pending` と `first_fill` の同時点灯 | 採る（記述） | D1: `update` は `source` を非空にするので重ならない。進めない書き込みは 1 回だけ |
| 査読 3-7: `updated: false` でも `documents-changed` を出すのか | 採る | D3: 書けた時だけ |
| 査読 3-8: `Diagram.original_source`（new の null）が D4 の一覧に無い | 採る | D4 |
| 査読 3 軽微: `UpdateRequest.open` の既定、ごみ箱と `history/`、grep はテストのコメントも | 採る | D4・D5 |
| 査読 4-1: `STALE_BASE` の開き直しと `reload` の載せ替えが二重になる | 採る | D2: エラーに今の `updated_at` を載せ、自分の `base` と同じなら黙って捨てる（載せ替え済み）。違う時だけ開き直す。未検証に順序 |
| 査読 4-2: 起動直後は `currentRef` が null で載せ替えが捨てられる | 採る | D3: 今の図が無ければ「開く」として扱う |
| 査読 4-3: 載せ替えで `readyRef` / `importedRef` / `expectedRef` を落とさないと位置を当てる前に保存される | 採る（記述の明確化） | D3: 載せ替えの `beforeImport` は今のと同じ（`becomeCurrent` が落とす）で、違いは 4 点だけと明記。現況 4 にも |
| 査読 4-4: 揃え書きの窓が `first_fill` と同じ穴 | 採る（記述。提案の条件は採らない） | D2「止められないもの」に揃え書きの窓を足し、D5 の履歴で拾う。「`layout` が同じ時だけ」は AI がノードを足す・消すと使えない |
| 査読 4-5: 「書かない時も印だけ消す」は永続化と矛盾 | 採る | D1: 印を消すためにファイルに書く、と書き直した |
| 査読 4-6: 開いている図に `open=true` でも前に出ない | 採る | D3: `Reload` でも `open=true` なら前に出す。受け入れ 4 |
| 査読 4-8: 「丸めた値も一致」は誤り | 採る | D2: 表記の違いだけ吸収、丸めは別の瞬間で Conflict。受け入れ 3 |

## 査読の採否（rev0 → rev1、査読 1・2）

| 指摘 | 採否 | 反映 |
|---|---|---|
| 査読 1-1: 種類の不一致の扱いが D4 の中で矛盾（口の前では `Document.editor` が分からない） | 採る | D4: 口の Err を `UpdateError` の enum にし、`KindMismatch` だけ reason、他はツール結果のエラー。分け方の規則を書いた |
| 査読 1-2 / 2-(1) / 2-(5): 開いている図では揃え書きで `updated_at` が進み、返した値が続けて使えない | 採る（形は変えた） | D1: `normalize_pending` の印。1-2 の「`source == original_source` なら進めない」は、AI が生成器の書き方で送ると人の最初の編集を飲み込む（査読 2）ので採らず、印は中身が同じでも消す |
| 査読 1-3 / 2-(2)(a): `Store` に排他が無い（TOCTOU） | 採る | D2: プロセスで 1 つの `static Mutex` で load → write を囲む |
| 査読 1-4: `title` の上書きは楽観ロックで守られない | 採る（強い方） | D1: `title` を受けない。スコープ外に |
| 査読 1-5: 契約の改定の波及が漏れている | 採る | D4: 足す・改める一覧と grep する語 |
| 査読 1-6: `origin` を変えず保険の条件を `original_source` の有無に | 採る（裁定 4。条件は rev2 で `first_fill` に） | D1 |
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
| 査読 2-(9): `Store::update` も初期図と同じを拒む。`read_diagram` の説明 | 一部採る | 説明の改定は D4。拒否は rev2 で保険の絞り込みに置き換えた（査読 3-3 / 4-7） |
| 査読 2-(10): jsdom で載せ替えの到着を起こす手段が無い | 採る | P2: `listen` の模擬と `fake-backend` の `take_pending_open`。`deliver_update` の判断を純粋な関数に |
| 査読 2-(3)（初稿）: ノード 0 の図で門が開き前のキャンバスが残る | 採る（実測で確認） | 現況 4、D1: `update_diagram` と `open_in_editor` の両方でノード 0 を断る。受け入れ 5 |
| 軽微（両査読）: `updated: false` の時の `open` / `updated_at`、`convert_source` の `layout: null`、`Recorder` / `Refuser`、受け入れ 1 の「1 秒待つ」、`UpdateRequest.editor` の型、`title` の trim | 採る | D3・D4・P1・受け入れ 1。`title` は受けないので trim は不要 |
| 査読 2-(1) 提案 (a)(b)（初稿）: 揃え書きをフロントの `flush` で即時に | 採らない | 印は「次の `save` が消す」で足り、フロントを変えずに済む。1 秒の窓は D2 で認めている |
