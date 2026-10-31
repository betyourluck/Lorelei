# Spec: 画面の言語 — 中国語（簡体字）・韓国語

**ID**: 35
**Date**: 2026-10-31
**Status**: **Draft** — rev2（[spec 31](31_ui-language.md) rev1 で分けた → rev1 で下調べを足した → 査読 1 本（「査読の採否」、17 件を全部採った）→ rev2 → 裁定（「裁定」、推奨どおり）→ P0（「P0 結果」、D4 は案 B）→ P1（「P1 結果」、D7 は実物で改めた）。次は P2（書き出しのフォント））
**Branch**: 切らない（Phase 単位で main へ直接コミット）。コミットの分け方は D6

## Goal

spec 31・34 の仕組みに、利用者の言（2026-10-30）「英語と中国語と韓国語と日本語」の残りの 2 つを載せる。訳を作り、4 つの言語で画面がはみ出さず重ならないことを確かめる。
利用者の言（2026-10-31）: 「v0.1.5 でタグ付けしましたが、中国語と韓国語をつけてすぐ v0.1.6 にします」 — この spec の着地が v0.1.6 の中身

## 裁定（2026-10-31、利用者）

利用者の言: 「推奨どおり」 — D1〜D9 を推奨どおりに決めた（D4 はこの spec で扱い、案 A〜C は P0 の測りで選ぶ。Noto Sans KR・SC の可変フォントを落とすことも許された）

## P1 結果（2026-10-31）

- **コミット**（D6 の 1〜3）: フォーク元の改善 `aca01e1`（D9 の判定・`:lang(ko)` の `keep-all`）→ デスクトップの訳 `fb43a19` → 一覧へ足す `50bba2b`（common の訳・`LOCALES`・Rust の保険と fixture・ER 図の名前のテスト・AI が読む文）
- **D9**: `detectLocale` に選べる言語を渡せるようにし（既定は `LOCALES`）、文字体系を地域より先に見る。`zh-Hans-HK`・`zh-Hans-TW` は簡体字、`zh-Hant-CN` は繁体字。簡体字が一覧にある時の 11 通りを先に書き、6 件の赤を見てから直した
- **D7 は実物で改めた**（上の D7 の注）: フォントの並びは入れず、`:lang(ko) { word-break: keep-all }` だけ。テストは先に書いて赤を見た
- **デスクトップの訳を先に入れても緑、は外れた**（査読 7 の根拠の 1 つ）: `default-titles.test.ts` は `desktopResources` の言語へ切り替えて比べるが、i18next は一覧に無い言語を英語に落とすので 2 件が落ちた。
  訳の値の形（`{time}` が素のまま 1 つ）は `desktopResources` の全部、画面が送るひな形は選べる言語（`LOCALES`）で見る形に分けた。
  `hardcoded-text.test.ts` のキーの組も `desktopResources` の全部を回し、`LOCALES` の言語が全部そろっていることを別に見る
- **訳**: common 271・desktop 128 キーを P0 の用語の表で訳した。韓国語の名前の後は 항목・테이블・그룹・다이어그램・형식 を挟んだ（D3）。
  括弧の前の英語の語に助詞が付く 3 つ（`classDef(…)는` など、どちらの音に合わせるかが曖昧）は「지정」を前に出した。`을(를)` の形は使っていない
- **ER 図の初期図**: fixture は data_contract に凍結した 4 つの見込みと一字一句同じ（`用户`・`사용자` は囲まずに書かれる）。Rust の `initial_sources` を足す前は fixture との突き合わせが落ちた（Red）。
  保険のテストは英語・中国語・韓国語の初期図を拒む。ER 図の名前の往復（`er-names.test.ts`・`round-trip-mermaid.test.ts`・`er_names.json` を Rust の `editor.rs`）に 用户・表3・사용자・테이블3 を足し、TS・Rust とも緑
- **テスト**: vitest の全部（119 ファイル 1332 件）で 3 件が時間切れ（`direction-save`・`update-diagram`・`revert-confirmed`。開発サーバーと裏の Edge を同時に回していた。単独では 10〜29 秒で通る、spec 31 から続く重い時の組）。
  `src-tauri` 60 件・`lorelei_core` の `editor` 42 件・`lorelei_mcp` が緑。`tsc`・eslint 0 件
- **画面**（D5。開発サーバーの Web 版、Browser pane と裏の Edge。はみ出しは「文字を持つ要素で中身が箱より広い・窓の右へ出る」を数える使い捨ての関数）:
  - Web 版を中国語で: キャンバス・インポートのダイアログ（中国語の図を入れて取り込み）・取り込んだ図（枠・線のラベル・形の札）・ノードのメニュー・形のメニュー・枠の向きのメニュー・言語のメニュー（4 つの言語、各項目に `lang`）で、はみ出し 0
  - 韓国語で: キャンバス・コード生成のダイアログ・ER 図のページ（テーブルを足すと `테이블2`）ではみ出し 0。`<html lang="ko">`・タブの題も韓国語。ER 図のページを直に開いた初期図は「ユーザー」（受け入れ条件 4 の範囲）
  - デスクトップの外枠（spec 27 の台本の偽の Tauri の口を写した使い捨ての台本、裏の Edge）: **覚えた言語が無くブラウザの言語が `zh-CN`・`ko-KR` なら、`<html lang>` が `zh-Hans`・`ko` で始まった**（D8 の Chromium の側。WebView2 の `--lang` は試していない）。
    幅 1280・1100・900 の外枠・設定画面（コマンドと JSON のタブ）・画面の色のメニューではみ出し 0、幅 900 のツールバーはアイコンだけの形。ページのエラー 0
  - 撮った画面は scratchpad の `p1-shots/`（中国語・韓国語の外枠 3 つの幅・設定・色のメニュー）
- **途中で見つけた前からの穴**: 日本語の `app.erTitle` が「Mermmaid ER図エディター」（m が 1 つ多い。ER 図のページのタブの題）。この spec では直していない

## P0 結果（2026-10-31）

- **data_contract を凍結**: `UiLocale`（値 4 つ・名と並び・D9 の判定）・`UiMessages`（複数形の誤りを直し、`value_forms`（D1・D3）と `fonts`（D7）を足した）・`FontBundle`（6 本・切り出しの規則・`fallback`・`han_glyphs`・`loading`・`license`）・
  `Document.initial_sources`（4 つの言語の ER 図の初期図の見込み）・`Document.default_titles`・`DesktopMessages.tests`
- **今の書き出しの字の欠け（Red）**: 使い捨てのテスト（`render.rs` の中、`svg_tree` の木を歩いて字ごとの glyph id とフォントを出す）に「사용자 목록」「这是简体说们」と Markdown の太字（`**굵은 한글** **简体们**`）を通すと、
  **ハングルと JP に無い簡体字は全部 glyph id 0（.notdef）で豆腐**になり、太字は `NotoSansJP-Bold` の .notdef だった（PNG で目でも見た）。JP にある「是」「体」だけが描かれる。**太字のラベルが書き出しにある**ので、案 C（Regular だけ）は太字のハングルを細字で描く
- **フォントを落とした**（google/fonts の main、`raw.githubusercontent.com` から）: `NotoSansKR[wght].ttf` 10,414,588 バイト（sha256 `194018e6…`）・`NotoSansSC[wght].ttf` 17,772,300 バイト（`a3041811…`）、どちらも Version 2.004。
  **OFL の文は JP・KR・SC と同梱の `OFL.txt` の 4 つがバイト単位で同じ**（sha256 `1c05c68c…`）。ライセンスの文は 1 つで足りる
- **大きさ**（静的 Regular・Bold、fontTools の instancer → subset、レイアウトの機能は全部残す）:

  | | KR Regular | KR Bold | SC Regular | SC Bold | 増える分 |
  | --- | --- | --- | --- | --- | --- |
  | 案 A（全部） | 6,224,868 | 6,222,712 | 10,595,932 | 10,585,456 | **+33.6MB** |
  | 案 B（切り出し） | 2,709,904 | 2,709,528 | 5,484,684 | 5,478,004 | **+16.4MB** |
  | 案 C（B の Regular だけ） | 2,709,904 | — | 5,484,684 | — | +8.2MB |

  案 B の字: SC = SC の cmap 30,890 字のうち JP（16,732 字）に無い 14,811 字、KR = KR の cmap 23,174 字のうち JP にも SC にも無い 11,587 字（ハングルの音節 11,172 字を全部含む）。
  **案 B を採る**（裁定の推奨のとおり。案 C は上の太字で外れ、案 A は B の倍で得るものは JP・SC にある字の韓国の字形だけ）。実行ファイルは 51.4MB → 約 68MB の見込み
- **自前の代わりのフォントの選び方で直るか（試作）**: 使い捨てのテストで fontdb に切り出した 4 本を JP の後に SC → KR の順で足し、`select_fallback` を「字を持つフォントのうち元と太さが同じものを先に、無ければ字を持つ最初のもの」にすると、
  ハングルは `NotoSansKR-Regular`・太字は `NotoSansKR-Bold`、JP に無い簡体字は `NotoSansSC-Regular` / `-Bold`、JP にある「是」「体」「直」「骨」は `NotoSansJP-*`（JP の字形）、空白は JP。PNG で目でも見て、豆腐 0。
  **PDF の `/BaseFont` は `NotoSansJP-Regular`・`-Bold`・`NotoSansSC-Regular`・`-Bold`・`NotoSansKR-Regular`・`-Bold` の 6 つ**（krilla が切り出して埋め込む）。
  usvg は字を持つかの判定（`DatabaseExt::has_char`）を `pub(crate)` にしているので、`ttf-parser` 0.25.1（Cargo.lock にもう入っている版）を直に使う。試作のテストと依存は P2 で入れ直すので戻した
- merman のラベルの幅の見積もりは査読 13 のとおりで、P0 では測らなかった

### 用語と値の形の表（D1）

| 日本語 | English | 简体中文 | 한국어 |
| --- | --- | --- | --- |
| フローチャート | flowchart | 流程图 | 플로차트 |
| ER 図 | ER diagram | ER 图 | ER 다이어그램 |
| 図 | diagram | 图表 | 다이어그램 |
| ノード | node | 节点 | 노드 |
| 線 | line / edge | 连线 | 연결선 |
| 枠 | group | 分组 | 그룹 |
| テーブル・列 | table・column | 表・列 | 테이블・컬럼 |
| 確定・確定へ戻す | Confirm・Revert to confirmed | 确定・恢复到已确定版本 | 확정・확정본으로 되돌리기 |
| 図の一覧 | Diagrams | 图表列表 | 다이어그램 목록 |
| インポート・書き出し・コード生成 | Import・Export・Generate code | 导入・导出・生成代码 | 가져오기・내보내기・코드 생성 |
| 形・向き・テーマ | shape・direction・theme | 形状・方向・主题 | 모양・방향・테마 |
| 形の名（四角形・菱形・角丸・円・六角形・スタジアム） | rectangle・diamond・rounded・circle・hexagon・stadium | 矩形・菱形・圆角矩形・圆形・六边形・体育场形 | 사각형・마름모・둥근 사각형・원・육각형・스타디움 |
| 元に戻す・やり直す | Undo・Redo | 撤销・重做 | 실행 취소・다시 실행 |
| ごみ箱・設定 | Trash・Settings | 回收站・设置 | 휴지통・설정 |
| 画面の言語・画面の色（ライト・ダーク・OS に合わせる） | Language・Color mode | 界面语言・界面颜色（浅色・深色・跟随系统） | 화면 언어・화면 색상（라이트・다크・시스템 설정） |
| ミニマップ | minimap | 小地图 | 미니맵 |
| ER 図の初期図のテーブル名 | User | 用户 | 사용자 |

値の形（data_contract `UiMessages.value_forms`）: `frame.sentenceJoin` は 中国語 `""`・韓国語 `" "`、列挙の区切り（`dropped.separator`・`codeModal.listSeparator`）は 中国語 `、`・韓国語 `", "`、
文の切れ目（`dropWarnings.separator`、日本語 `。`・英語 `"; "`）は 中国語 `；`・韓国語 `"; "`。韓国語の名前の後は D3（항목・테이블・그룹 を挟む）

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

> **P1 で改めた（2026-10-31）**: 実物（開発サーバーの Web 版）で、画面の字は全部 `app/layout.tsx` の next/font の **Inter**（latin だけ）と等幅で描かれ、yamada-ui のフォントの並び（`--ui-fonts-body`）を使う要素は 0 だった（文字を持つ 49 要素を数えた）。
> Inter に無い漢字はブラウザが `<html lang>` に合わせて選ぶフォントに落ち、`lang="zh-Hans"` の行は「直骨角 这们」が一続きの中国語のフォント、`ja` の行は日本語のフォント（JP に無い「这们」だけ別の書体）で描かれた（字形で見分けた）。
> 査読 1 の「中国語の漢字が日本語の字形になる」は、yamada-ui の並びを使う前提で、この画面では起きない。**フォントの並びの差し替えは入れず（効き目の無いコードになる）、韓国語の `word-break: keep-all` だけを入れた**。
> 下の推奨は rev2 の時のもの

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
