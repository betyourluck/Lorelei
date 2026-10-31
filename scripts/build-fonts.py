"""同梱フォント (crates/lorelei_core/fonts/) を可変フォントから切り出す。

入力は Noto Sans JP・SC・KR の可変フォント (OFL-1.1)。上流は google/fonts の
ofl/notosansjp・ofl/notosanssc・ofl/notosanskr にある NotoSans{JP,SC,KR}[wght].ttf。
Windows 11 には JP だけが C:/Windows/Fonts/NotoSansJP-VF.ttf として入っている。

- JP は全部の字を、wght=400 / 700 の静的フォントにする
- SC は SC の字のうち JP に無いものだけ、KR は KR の字のうち JP にも SC にも無いもの (ハングル) だけを残す
  (spec 35 D4 案 B。JP にある漢字は JP の字形で描く。全部を同梱すると実行ファイルが倍の +33.6MB 増える)
- 書き出しは JP → SC → KR の順に読み、字の無い時に次のフォントを探す (crates/lorelei_core/src/fonts.rs)

可変フォントのまま同梱しないのは、fontdb が既定インスタンスを weight 100 と読み
Thin で描かれるため (spec 01 P0-3)。

同じ入力から同じバイト列を出す (保存時刻を焼き込まない)。入力の sha256 は fonts/SOURCES.txt に書く。

使い方: python scripts/build-fonts.py <NotoSansJP 可変> <NotoSansSC 可変> <NotoSansKR 可変>
必要: fontTools (pip install fonttools)
"""

import hashlib
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

OUT = Path(__file__).resolve().parent.parent / "crates" / "lorelei_core" / "fonts"
WEIGHTS = {"Regular": 400, "Bold": 700}


def static(src: Path, weight: int) -> TTFont:
    font = instancer.instantiateVariableFont(TTFont(src), {"wght": weight}, updateFontNames=True)
    font.recalcTimestamp = False  # 保存時刻を焼き込まない (同じ入力から同じバイト列を出す)
    return font


def keep_only(font: TTFont, codepoints: set[int]) -> TTFont:
    options = subset.Options()
    options.layout_features = ["*"]  # ハングルの字母の組み立てなど、レイアウトの機能は全部残す
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.glyph_names = False
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=sorted(codepoints))
    subsetter.subset(font)
    return font


def main() -> None:
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    sources = {name: Path(p) for name, p in zip(("JP", "SC", "KR"), sys.argv[1:])}
    cmap = {name: set(TTFont(src).getBestCmap()) for name, src in sources.items()}
    keep = {
        "JP": None,
        "SC": cmap["SC"] - cmap["JP"],
        "KR": cmap["KR"] - cmap["JP"] - cmap["SC"],
    }
    lines = []
    for name, src in sources.items():
        digest = hashlib.sha256(src.read_bytes()).hexdigest()
        lines.append(f"NotoSans{name}: {src.name} sha256={digest}")
        print(lines[-1])
        for style, weight in WEIGHTS.items():
            font = static(src, weight)
            if keep[name] is not None:
                font = keep_only(font, keep[name])
            out = OUT / f"NotoSans{name}-{style}.ttf"
            font.save(out)
            chars = len(keep[name]) if keep[name] is not None else len(cmap[name])
            print(
                f"{out.name}: {out.stat().st_size} bytes, {chars} chars, "
                f"usWeightClass={font['OS/2'].usWeightClass}"
            )
    (OUT / "SOURCES.txt").write_text(
        "scripts/build-fonts.py の入力 (spec 35)\n" + "\n".join(lines) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
