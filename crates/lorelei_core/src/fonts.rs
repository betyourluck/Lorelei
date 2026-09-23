//! 同梱フォント (data_contract `FontBundle`)。
//!
//! システムフォントは読まない — 端末ごとに出力が変わるのを防ぐ (spec 01 D3)。
//! 可変フォントではなく静的 2 本なのは、fontdb が可変フォントの既定インスタンスを
//! weight 100 と読み Thin で描くため (P0-3)。生成手順は `scripts/build-fonts.py`。

use std::sync::{Arc, OnceLock};

use usvg::fontdb::Database;

pub(crate) const FAMILY: &str = "Noto Sans JP";

const REGULAR: &[u8] = include_bytes!("../fonts/NotoSansJP-Regular.ttf");
const BOLD: &[u8] = include_bytes!("../fonts/NotoSansJP-Bold.ttf");

/// プロセスで 1 つ。並行する render で共有する。
pub(crate) fn database() -> Arc<Database> {
    static DB: OnceLock<Arc<Database>> = OnceLock::new();
    DB.get_or_init(|| {
        let mut db = Database::new();
        db.load_font_data(REGULAR.to_vec());
        db.load_font_data(BOLD.to_vec());
        // merman の SVG は "trebuchet ms", verdana, arial, sans-serif を指定する。
        // 名前で見つからない分は総称ファミリー経由で同梱フォントへ落ちる
        db.set_sans_serif_family(FAMILY);
        db.set_serif_family(FAMILY);
        db.set_monospace_family(FAMILY);
        db.set_cursive_family(FAMILY);
        db.set_fantasy_family(FAMILY);
        Arc::new(db)
    })
    .clone()
}
