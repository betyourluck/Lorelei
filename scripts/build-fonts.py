"""同梱フォント (crates/lorelei_core/fonts/) を可変フォントから切り出す。

入力は Noto Sans JP の可変フォント (OFL-1.1)。上流は
https://github.com/google/fonts/tree/main/ofl/notosansjp の NotoSansJP[wght].ttf。
Windows 11 には同じものが C:/Windows/Fonts/NotoSansJP-VF.ttf として入っている。

可変フォントのまま同梱しないのは、fontdb が既定インスタンスを weight 100 と読み
Thin で描かれるため (spec 01 P0-3)。

使い方: python scripts/build-fonts.py <NotoSansJP 可変フォントのパス>
必要: fontTools (pip install fonttools)
"""

import hashlib
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

OUT = Path(__file__).resolve().parent.parent / "crates" / "lorelei_core" / "fonts"
WEIGHTS = {"Regular": 400, "Bold": 700}


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    print(f"source: {src} sha256={hashlib.sha256(src.read_bytes()).hexdigest()}")
    for style, weight in WEIGHTS.items():
        font = instancer.instantiateVariableFont(
            TTFont(src), {"wght": weight}, updateFontNames=True
        )
        out = OUT / f"NotoSansJP-{style}.ttf"
        font.recalcTimestamp = False  # 保存時刻を焼き込まない (同じ入力から同じバイト列を出す)
        font.save(out)
        print(f"{out.name}: {out.stat().st_size} bytes, usWeightClass={font['OS/2'].usWeightClass}")


if __name__ == "__main__":
    main()
