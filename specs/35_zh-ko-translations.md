# Spec: 画面の言語 — 中国語（簡体字）・韓国語

**ID**: 35
**Date**: 2026-10-31
**Status**: **Draft** — rev2（[spec 31](31_ui-language.md) rev1 で分けた → rev1 で下調べを足した → 査読 1 本（「査読の採否」、17 件を全部採った）→ rev2。D1〜D9 の裁定待ち）
**Branch**: 切らない（Phase 単位で main へ直接コミット）。コミットの分け方は D6

## Goal

spec 31・34 の仕組みに、利用者の言（2026-10-30）「英語と中国語と韓国語と日本語」の残りの 2 つを載せる。訳を作り、4 つの言語で画面がはみ出さず重ならないことを確かめる。
利用者の言（2026-10-31）: 「v0.1.5 でタグ付けしましたが、中国語と韓国語をつけてすぐ v0.1.6 にします」 — この spec の着地が v0.1.6 の中身

## 現況（2026-10-31、rev1・rev2 でコードと実物で確かめた）

### 訳の仕組み（spec 31・34 で作ったもの）

- 言語を足す所は 3 つ: `components/i18n/i18n.ts` の `LOCALES`（1 行）と `resources`、`lib/desktop/i18n.ts` の `desktopResources`。言語のメニュー（Web 版のパネル・デスクトップのタイトルバー）は `LOCALES` を読むので、部品は変えない
- 言語の判定（`detectLocale`）は、`zh`・`zh-CN`・`zh-SG` を `zh-Hans`（一覧にある時だけ）、`ko*` を `ko` にする。繁体字（`-tw`・`-hk`・`-mo`・`-hant`）は寄せずに次の言語へ進む。
  **ただし `zh-Hans-HK`・`zh-Hans-TW`・`zh-Hans-MO`（簡体字の文字体系で地域が香港・台湾・澳門）も、地域の部分に正規表現 `/-(tw|hk|mo|hant)\b/` が当たって繁体字として飛ばす**（`i18n.ts:54`。査読 9、手元で確かめた。data_contract の「`zh-Hans*` → zh-Hans」と違う）。
  今のテスト（`__tests__/i18n/locale.test.tsx:31-33`）は「`ko-KR`・`zh-CN` → 英語」（一覧に無いから）を固定しているので、足したら期待を改める
- **i18next は `zh-Hans` をそのまま扱う**（使い捨ての台本で確かめた: `changeLanguage("zh-Hans")` の後、`language`・`resolvedLanguage` が `zh-Hans`、落ちる先は `["zh-Hans", "en"]`。`ko` も同じ）
- **複数形のキーは無い**（`_one`・`_other` を使うキーは 0。`{{count}}` は差し込むだけ）。中国語・韓国語の複数形の分類は `other` だけ。data_contract `UiMessages.keys` の「英語は `_one`・`_other` を持つ」は誤り（査読 3）
- キーの数: common 271・desktop 128。キーの組と差し込みの名の一致は、`__tests__/i18n/locales.test.ts`（common、`LOCALES` を回す）、`__tests__/lib/desktop/hardcoded-text.test.ts`（desktop、`LOCALES` を回す）、`default-titles.test.ts`（`desktopResources` を回す）が見る
- **テストが値の形を見ないキー**（査読 11）: `frame.sentenceJoin`（日本語 `""`・英語 `" "`）、`dropped.separator`・`dropWarnings.separator`・`codeModal.listSeparator`（区切りの記号）、
  `importModal.flowHelp` の `{{label}}`（差し込みではなく Mermaid の六角形の書き方。差し込みの名の組のテストでは 1 つの差し込みに数えられ、どの言語も同じ形で持つ）
- **名前を差し込んだ直後に助詞が付く文は 12**（common 6・desktop 6。韓国語の `을/를`・`이/가` が名前の終わりの音で変わる所の候補）:
  `confirmDelete.named`「『{{name}}』を削除しますか？」・`frame.deleteOne`・`erTable.openMenuNamed`・`codeModal.emptyFrames`・`frame.noticeIgnored`・`frame.noticeReversed`・
  `list.trashNamed`・`session.cannotOpen`・`settings.copied`「{{what}}をコピーしました」・`save.dialogTitle`・`error.MCP_LISTEN_FAILED`・`error.MCP_PORT_RANGE`（後ろの 3 つは数・形式の名なので、韓国語では助詞が要らない形にできる）
- 直書きを見つけるテスト（`__tests__/i18n/hardcoded-text.ts:11`）の正規表現は漢字と仮名を見るので、`LOCALES` の「简体中文」に当たる（`i18n-allow` が要る）。ハングルは見ないので、韓国語の直書きはこのテストでは見つからない（査読 10）
- **ER 図の初期図のテーブル名は言語ごと**（spec 34 D6、common の `defaults.initialTable`）。言語を足すと初期図が増え、**Rust の保険 `initial_sources`（`src-tauri/src/documents.rs:492`）と fixture `src-tauri/tests/fixtures/initial_sources.json` を同じコミットで足さないと、Rust の 2 件が落ちる**（spec 34 P4 で確かめた結び）。
  中国語・韓国語の名前は、TS の生成器（`features/er-diagram/utils/er-names.ts:9` の `BARE_NAME` が `\p{L}` を受ける）・mermaid.js（`À-￿`）・merman の写し（`vendor/merman-core/src/diagrams/er.rs:1994` が ASCII でない字を受ける）の 3 つとも囲まずに通る見込み（査読 12、コードを読んだだけ）。
  Web 版を中国語・韓国語で直に開くと、最初の描画が日本語なので初期図は「ユーザー」のまま（spec 34 P4 の英語と同じ範囲、査読 17）
- AI が読む文に「日本語なら『AI の図 …』、英語なら『AI diagram …』」と 2 つの言語だけを並べた所がある: `crates/lorelei_mcp/src/lib.rs:241`（`open_in_editor` の `title` の説明）・`LORELEI.md:66`（査読 6）
- data_contract の古い所（査読 3）: `UiLocale.values: [ja, en]`・`UiLocale.detect`（`zh-Hans*`）・`UiMessages.keys`（複数形）・`FontBundle`（JP の 2 本だけ）・`Document.initial_sources`

### 画面の文字

- **画面のフォントは日本語のフォントを名指ししている**（査読 1、確かめた）: yamada-ui の既定（`@yamada-ui/theme` の `tokens/fonts.js`）の `body`・`heading` は
  `-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", "游ゴシック体", YuGothic, "YuGothic M", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif, …`。`components/providers/theme.ts` は `fonts` を上書きしていない。
  `<html lang>` は言語ごとに書き換わるが、名指しのフォントが先に選ばれるので、**中国語の画面の漢字は日本語の字形（游ゴシック・ヒラギノ）で描かれ、日本語のフォントに無い簡体字だけが YaHei・PingFang に落ちて 1 語の中で書体が混ざる**（推測。描いて見るのは P1）。
  韓国語はハングルが日本語のフォントに無いので Malgun Gothic・Apple SD Gothic Neo に落ちる（漢字が混ざる時だけ日本語の字形）
- 韓国語は語（어절）で折り返すのが普通だが、CSS の既定（`word-break: normal`）は音節の間でも折る（査読 16）
- **Linux は CJK のフォントが無いと画面の字が欠ける**（OS の側の事情。スコープ外）
- ツールバーを縮める判定は文字の幅を測っており、言語に依らない（`lib/desktop/toolbar.tsx:41-61`）
- 見た目の台本（`scripts/ui-style-snapshot.mjs`）は日本語のボタンの名で要素を探すので、そのままでは中国語・韓国語の画面を撮れない。spec 31 P2 の英語の画面は、使い捨ての台本で 15 場面を撮り、はみ出す要素を数えた

### デスクトップの言語の判定

- spec 34 の受け入れ条件 10（覚えた言語が無い時に OS の言語で始まる）の macOS・Linux は未確認（v0.1.5 の Actions の版で確かめる）。合わない時の直し方の案の `CFBundleLocalizations` は、`src-tauri/` に `Info.plist` がまだ無い（査読 8）
- Windows の WebView2 は `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--lang=zh-CN` で `navigator.languages` を変えられる見込み（効くかは未確認）

### 書き出しの字（PNG・PDF・MCP の `render` の preview）

- `crates/lorelei_core/src/fonts.rs` は同梱の Noto Sans JP（Regular・Bold の静的 2 本、各 5.8MB）だけを読み、システムのフォントは読まない（spec 01 D3: 端末ごとに出力を変えない）。読み込みは `load_font_data(REGULAR.to_vec())` でバイト列をヒープへ写す（査読 14）
- **同梱フォントに、ハングルの音節は 11,172 字のうち 0 字、GB2312 の漢字は 6,763 字のうち 2,215 字（33%）が無い**（fontTools で数えた。査読も数え直して同じ。ハングルの字母の互換形は 93 字ある）。
  無い字を描いた時に豆腐になるのか、消えるのかは**まだ描いていない**（P0）。これは画面の言語に依らず、AI が韓国語・中国語のラベルの図を書いた時に今も起きうる
- **usvg の既定の代わりのフォントの選び方は太さを見ない**（査読 2、`usvg-0.47.0/src/text/mod.rs:147-189` を読んで確かめた）: 外す条件が「斜体・太さ・幅が**全部**違う」（`&&`）なので、太さだけ違うフォントは外れず、
  `fontdb.faces()` の順で最初に字を持つものを返す。KR の Regular を Bold より先に読むと太字のハングルが Regular で、逆だと普通のハングルが Bold で描かれる。KR を SC より先に読むと、JP に無い簡体字を KR が持っていれば韓国の字形で描かれる
- merman はラベルの幅をフォントを読まずに見積もる（`merman-render/src/text/heuristic.rs:42-47`: ASCII でない字は `unicode_width` が 2 なら 1.0em。ハングルの音節は全角）。`crates/lorelei_core/src/engine.rs` は merman に fontdb も測り手も渡していない。
  **フォントを足しても図の配置は変わらない**ので、日本語の図の書き出しは画素で前と比べられる（査読 13、rev1 の P0 の「幅の見積もりを確かめる」は外した）
- google/fonts の可変フォントの大きさ（GitHub の API で調べた。まだ落としていない）: Noto Sans KR 10.4MB・Noto Sans SC 17.8MB（JP は 9.6MB で、静的 1 本が 5.8MB）。
  JP と同じ比で静的 2 本ずつ作ると **KR 約 12MB・SC 約 21MB、合わせて約 34MB が実行ファイル（今 51,355,136 バイト）に増える**見込み（推測）
- 同じ漢字（統合漢字）は、同梱の並びで先にある JP の字形で描かれる（「直」「骨」などは中国の字形と違う）。字が欠けるのとは別の、見た目の違い
- フォントの名を持つ所（査読 5。フォントを足す時に grep で追う）: `src-tauri/tauri.conf.json` の `bundle.resources`（`OFL.txt` → `licenses/NotoSansJP-OFL.txt`）・`src-tauri/src/desktop.rs:153`（About の JP の行）・
  `crates/lorelei_mcp/src/lib.rs:327`（`render` の説明「日本語は同梱フォント (Noto Sans JP) で描く」。AI が読む文）・`README.md`・`README.ja.md`（16・116 行）・`LORELEI.md`（7・139・147・156 行）・`scripts/build-fonts.py`（入力 1 つ・出力名を直書き）・
  `crates/lorelei_core/tests/core.rs:113-127`（`pdf_embeds_only_the_bundled_font` は全部のフォントに `NotoSansJP-` を求める。フォントを足すと落ちる、査読 4）

## 決めること

### D1. 訳の作り方と確かめ方

- **推奨**: 日本語と英語の訳を元に、こちらで中国語（簡体字）・韓国語の訳を作る。**母語の人が確かめていない**ことを README（英語・日本語）に書き、直しを Issues で受ける（CONTRIBUTING に 1 行）
- 訳の前に、用語と値の形の表を spec に書く（P0）:
  - Mermaid の語（flowchart・ER 図・subgraph・Mermaid の形の名）と Lorelei の語（確定・枠・図の一覧・初期図のテーブル名）の訳語
  - 値の形を言語ごとに決めるキー（査読 11）: `frame.sentenceJoin`（中国語 `""`・韓国語 `" "`）、区切りの記号（中国語 `、`・韓国語 `, `）、`importModal.flowHelp` の `{{label}}` は Mermaid の書き方なのでそのまま

### D2. 言語の名・コード・並び

- **推奨**: コードは `zh-Hans`・`ko`（spec 31 D4 で決めた対応表のまま）、名は `简体中文`（`i18n-allow`）・`한국어`、並びは 日本語・English・简体中文・한국어。2 つを同じコミットで一覧に足す

### D3. 韓国語の名前の後の助詞

- **推奨**: 12 の文は、まず助詞が要らない並びにする。名前の後に助詞の決まった名詞を置く（「'{{name}}'을(를) 삭제할까요?」ではなく「'{{name}}' 항목을 삭제할까요?」、テーブルなら 테이블、枠なら 그룹）。
  数・形式の 3 つは助詞の付かない言い方にする。自然に並べ替えられない文だけ `을(를)` の形（spec 31 D6 の決め）
- 案: 全部 `을(를)` の形（作るのは速いが、韓国語として硬い）

### D4. 書き出しのフォント

- **推奨: この spec で扱う**（中国語・韓国語の利用者が図を書き出すと字が欠けるので、Goal に直に響く。v0.1.6 で言語を足して書き出しが欠けるのは避けたい）。形は次の 3 つから P0 の測りで選ぶ:
  - **案 A**: Noto Sans KR・SC を JP と同じく静的 Regular・Bold で全部同梱（約 +34MB の見込み）
  - **案 B（推奨）**: 切り出して同梱。KR はハングル（音節・字母）と記号、SC は **SC が持つ字のうち JP に無いもの全部**（母集合は SC の cmap 全部。GB2312 などに絞らない。JP にある漢字は JP の字形のまま、査読 15）。Regular・Bold。
    `scripts/build-fonts.py` は 3 つの可変フォントを入力に取り、JP の cmap を引いて SC を切り出す。同じ入力から同じバイト列を出し、3 つの入力の sha256 を出力に記録する。大きさは P0 で測る
  - **案 C**: 案 B を Regular だけ。太字の字は Regular で描かれる（D4 の代わりのフォントの選び方を、太さが合わない時に Regular へ落ちる形にした結果）
- **代わりのフォントの選び方は自前で書く**（査読 2）: `fonts.rs` に `usvg::FontResolver` の `select_fallback` を書き、字を持つフォントの中で、①元のフォントと太さが合うもの、②SC → KR の順（簡体字を韓国の字形で描かない）を選ぶ。
  PNG（resvg）・PDF（krilla-svg）・MCP の `render` が同じ resolver を通ることを P0 で確かめる
- フォントの読み込みは `load_font_source(Source::Binary(Arc::new(&'static [u8])))` で写さずに共有する（査読 14）
- 統合漢字が JP の字形になるのは受け入れ、LORELEI.md の既知の制約に書く（図のラベルの言語は分からないので、言語で並びを変えられない）
- P0 で Noto Sans KR・SC の可変フォント（google/fonts の `ofl/notosanskr/NotoSansKR[wght].ttf` 10.4MB・`ofl/notosanssc/NotoSansSC[wght].ttf` 17.8MB、OFL-1.1）を落とす（裁定で許しを得てから）。
  ライセンスの文（`OFL.txt`）が 3 つとも同じ文かを確かめ、違えば別々に同梱する
- 案: 別の spec にする（画面の言語と独立の不具合なので）。v0.1.6 は訳だけで出し、書き出しの字の欠けは既知の制約に書く

### D5. 見た目の確かめ

- **推奨**: spec 31 P2 と同じく使い捨ての台本で、本番と同じ組み立ての Web 版（裏の Edge）を中国語・韓国語で開き、15 場面を撮って、はみ出す要素を数え、画面を目で見る。
  デスクトップの外枠は spec 34 P1 と同じく偽の Tauri の口で描き、ツールバー（幅 900・1100・1280）・タイトルバー・図の一覧・設定画面・About の部品を見る。
  **効いているフォントの名を記録する**（`getComputedStyle` の `font-family` と、漢字が中国の字形のフォントで描かれているか。母語でない目では字形の違いに気付きにくいので、査読 1）。
  `scripts/ui-style-snapshot.mjs` を言語に依らない形へ書き換えるのはしない（台本の書き換えの方が訳より大きく、要るのは 1 回の確かめだけ）

### D6. コミットの分け方

- **推奨**（査読 7。掟「上流へ返せる修正はコミットを分ける」に合わせた）:
  1. **フォーク元の改善**: D7 の言語ごとのフォントの並び・韓国語の折り返し、D9 の `zh-Hans-HK` の判定の直し（訳の前でも緑）
  2. **デスクトップの訳**（`lib/desktop/locales/zh-Hans.json`・`ko.json` と `desktopResources`）。`LOCALES` に無い言語の訳は誰も選ばないので、先に入れても緑のまま
  3. **一覧へ足す**: `LOCALES`・common の訳（`locales/zh-Hans`・`locales/ko`）・テストの期待・fixture・Rust の `initial_sources`、AI が読む文の言語の例（査読 6）を **1 つのコミット**（ER 図の初期図が増えると Rust の保険と fixture を同時に変えないと落ちる。spec 34 P4 と同じ例外）。
     上流へ返す時は、このコミットから `locales/`・`components/i18n/i18n.ts`・`__tests__/i18n/` だけを抜く（Rust・fixture・`lib/desktop` を除く）と spec に書く
  4. **フォント**（`crates/`・`scripts/build-fonts.py`・ライセンス・About・MCP の説明）

### D7. 画面のフォントの並び（新、査読 1・16）

- **推奨**: `components/providers/theme.ts` で、`:lang(zh-Hans)` に `"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", sans-serif` を、`:lang(ko)` に `"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans CJK KR", "Noto Sans KR", sans-serif` を先頭にした並びを当てる
  （英字は今の並びの先頭の `-apple-system`・`"Segoe UI"` を残す）。`:lang(ko)` には `word-break: keep-all`（語で折り返す）。フォーク元の改善で、Web 版にも効く。
  日本語・英語の画面は前と同じ（spec 27 の台本で計算されたスタイルを比べる）
- 案: 入れない（中国語の画面の漢字は日本語の字形のまま。既知の制約に書く）

### D8. デスクトップの言語の判定（新、査読 8）

- **推奨**: Windows で `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--lang=zh-CN`（`ko-KR`）を付けて `tauri dev` を立て、覚えた言語が無い時に中国語・韓国語で始まるかを確かめる（効かなければ、偽の `navigator.languages` で外枠を描くテストで代える）。
  spec 34 の受け入れ条件 10 の直しで `CFBundleLocalizations` を採る時は、`zh-Hans`・`ko` も並べる

### D9. 簡体字の判定の直し（新、査読 9）

- **推奨**: `detectLocale` は文字体系の部分（`hans`・`hant`）を地域より先に見る: `zh-Hans*` は地域を問わず簡体字、`zh-Hant*` は飛ばす、文字体系の無い `zh-TW`・`zh-HK`・`zh-MO` は飛ばす、それ以外の `zh*` は簡体字。
  `zh-Hans-HK`・`zh-Hant-CN` をテストに足す。data_contract の説明と合わせる。フォーク元の改善（D6 の 1）

## 受け入れ条件（rev2）

1. Web 版とデスクトップで、中国語（簡体字）・韓国語に切り替えられる。キーの組と差し込みのテストが 4 つの言語で緑。ブラウザ・OS の言語が `zh-CN`・`zh-Hans-HK`・`ko-KR` なら、覚えた言語が無い時にその言語で始まり、`zh-TW`・`zh-Hant-CN` は英語
2. 中国語・韓国語の 15 場面とデスクトップの外枠で、文字が部品からはみ出さない・重ならない（幅 900 のツールバーは縮めた形で）
3. 韓国語の名前を差し込む 12 の文が、助詞の要らない並びか `을(를)` の形
4. ER 図の初期図のテーブル名が 4 つの言語で訳され、Rust の保険が 4 つとも効く（fixture で結んだテスト）。中国語・韓国語の名前が生成器と Rust の取り込みを往復する（`er-names.test.ts` と `er_names.json` の fixture）。
   Web 版を直に開いた時の初期図は組み立ての言語（spec 34 P4 と同じ範囲）
5. （D7 を採るなら）中国語の画面の漢字が中国の字形のフォント、韓国語は韓国のフォントで描かれる（効いているフォントの名を記録）。日本語・英語の画面の計算されたスタイルは前と同じ
6. （D4 を採るなら）韓国語・簡体字のラベル（普通と太字）の図を PNG・PDF・MCP の `render` に書き出して字が欠けない。機械で見る: usvg の配置した字に glyph id 0（.notdef）が無い、PDF の `/BaseFont` に KR・SC の Regular（と Bold）が出る。
   日本語の図の書き出しは画素で前と同じ。実行ファイルの増え方を記録する
7. data_contract（UiLocale・UiMessages・FontBundle・Document.initial_sources）と、AI が読む文（`open_in_editor` の `title`・`render` の説明）・README・LORELEI.md・About・ライセンスが 4 つの言語・3 つのフォントに合う（名前で grep して漏れ 0）
8. README（英語・日本語）に 4 つの言語と、訳を母語の人が確かめていないこと。LORELEI.md に統合漢字の字形（D4）
9. 配布ビルドで利用者が確かめる

## Phase

- **P0**: data_contract を凍結（UiLocale の値と判定、UiMessages の複数形の誤りの直し、FontBundle のフォント・切り出し・代わりのフォントの選び方・並び、Document.initial_sources）。訳の用語と値の形の表（D1）。
  （D4 を採るなら）韓国語・簡体字のラベルの図を今の書き出しに通して字の欠け方を見る（Red）、フォントを落として案 A〜C の大きさを測る、自前の `select_fallback` が PNG・PDF・MCP で効くかを試す（**台帳のコミット**）
- **P1**: D6 の 1〜3 のコミット（フォーク元の改善 → デスクトップの訳 → 一覧へ足す）→ 台本で 2 つの言語を撮って直す（D5）・デスクトップの言語の判定（D8）
- **P2**: フォント（D4。D6 の 4。`core.rs` の PDF のテストの改め・フォントの名の grep の一覧）
- **P3**: 配布ビルドで利用者が確かめる。README・LORELEI.md・CONTRIBUTING。v0.1.6

## スコープ外

- 繁体字ほかの言語
- README・LORELEI.md・CONTRIBUTING の中国語・韓国語の版
- Linux で CJK のフォントが入っていない時の画面の字の欠け（OS の側）
- ライブデモの作り直し（spec 31 P3。v0.1.6 の時に一緒にするかは利用者が決める）

## 査読の採否（rev2、2026-10-31）

査読 1 本（こちらから依頼、spec とコードの場所だけを渡した）。要の主張（yamada-ui のフォントの並び・usvg の `&&`・data_contract の古い所・`core.rs` の PDF のテスト・`zh-Hans-HK` の判定）はコードと手元の実行で確かめてから採った。

| # | 指摘 | 採否 |
| --- | --- | --- |
| 1 | 画面のフォントは日本語のフォントを名指しする（要修正） | **採る** — 現況・D7・D5・受け入れ条件 5 |
| 2 | usvg の代わりのフォントの選び方は太さを見ない（要修正） | **採る** — 現況・D4（自前の `select_fallback`）・受け入れ条件 6 |
| 3 | data_contract の更新が Phase に無い（要修正） | **採る** — 現況・P0・受け入れ条件 7 |
| 4 | `core.rs` の PDF のテストが落ちる・字の欠けを機械で見る | **採る** — 現況・受け入れ条件 6・P2 |
| 5 | フォントの名・ライセンスの grep の一覧 | **採る** — 現況・受け入れ条件 7 |
| 6 | AI が読む文の言語の例 | **採る** — 現況・D6 の 3 |
| 7 | コミットの分け方が掟と食い違う | **採る** — D6 を 4 つに |
| 8 | デスクトップの言語の判定 | **採る** — 現況・D8 |
| 9 | `zh-Hans-HK` を繁体字として飛ばす | **採る** — 現況・D9 |
| 10 | 「简体中文」に `i18n-allow` が要る・ハングルの直書きは見つからない | **採る** — 現況・D2 |
| 11 | 値の形を見ないキー | **採る** — 現況・D1 |
| 12 | ER 図の中国語・韓国語の名前の PoC | **採る** — 受け入れ条件 4 |
| 13 | merman の幅の見積もりはもう答えられる | **採る** — 現況、P0 から外した |
| 14 | フォントのバイト列を写す | **採る** — D4 |
| 15 | 簡体字の切り出しの母集合 | **採る** — D4 案 B |
| 16 | 韓国語の折り返し | **採る** — D7 |
| 17 | Web 版の ER 図の初期図 | **採る** — 受け入れ条件 4 |
