//! 同梱フォント (data_contract `FontBundle`)。
//!
//! システムフォントは読まない — 端末ごとに出力が変わるのを防ぐ (spec 01 D3)。
//! 可変フォントではなく静的 2 本ずつなのは、fontdb が可変フォントの既定インスタンスを
//! weight 100 と読み Thin で描くため (P0-3)。生成手順は `scripts/build-fonts.py`。
//! SC・KR は JP に無い字だけを持つ (spec 35 D4)。字の無い時は JP → SC → KR の順で、同じ太さのものを先に選ぶ。

use std::sync::{Arc, OnceLock};

use usvg::fontdb::{Database, ID, Source};

pub(crate) const FAMILY: &str = "Noto Sans JP";

/// 読み込む順 = 字の無い時に探す順 (JP → SC → KR)。JP にある漢字は JP の字形で描く
const FONTS: [&[u8]; 6] = [
    include_bytes!("../fonts/NotoSansJP-Regular.ttf"),
    include_bytes!("../fonts/NotoSansJP-Bold.ttf"),
    include_bytes!("../fonts/NotoSansSC-Regular.ttf"),
    include_bytes!("../fonts/NotoSansSC-Bold.ttf"),
    include_bytes!("../fonts/NotoSansKR-Regular.ttf"),
    include_bytes!("../fonts/NotoSansKR-Bold.ttf"),
];

/// プロセスで 1 つ。並行する render で共有する。
pub(crate) fn database() -> Arc<Database> {
    static DB: OnceLock<Arc<Database>> = OnceLock::new();
    DB.get_or_init(|| {
        let mut db = Database::new();
        // include_bytes! のバイト列をそのまま共有する (ヒープへ写さない)
        for data in FONTS {
            db.load_font_source(Source::Binary(Arc::new(data)));
        }
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

/// 字の無い時の代わりのフォントの選び方 (spec 35 D4)。usvg の既定は太さを見ない (斜体・太さ・幅の全部が違う時だけ外す) ので、
/// 太字のハングルが Regular で描かれる。読み込んだ順に字を持つフォントを見て、元のフォントと同じ太さのものを先に選ぶ
pub(crate) fn resolver() -> usvg::FontResolver<'static> {
    usvg::FontResolver {
        select_font: usvg::FontResolver::default_font_selector(),
        select_fallback: Box::new(|c, used, db| {
            let weight = db.face(*used.first()?)?.weight;
            let mut other = None;
            for face in db.faces() {
                if used.contains(&face.id) || !has_char(db, face.id, c) {
                    continue;
                }
                if face.weight == weight {
                    return Some(face.id);
                }
                other.get_or_insert(face.id);
            }
            other
        }),
    }
}

/// usvg の同じ判定 (`DatabaseExt::has_char`) は crate の外に出ていない
fn has_char(db: &Database, id: ID, c: char) -> bool {
    db.with_face_data(id, |data, index| {
        ttf_parser::Face::parse(data, index).ok()?.glyph_index(c)
    })
    .flatten()
    .is_some()
}
