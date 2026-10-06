"""
取景框页面用的照片：从记录表里挑鸽子最多的几张，从原图导出到 data/frame/。

用法：python3 tools/make_frame_photos.py

- 按 bird_count 从多到少排，同一构件 + 同一地点只留一张（避免连拍的几张都进来）
- 导出长边 3200px（取景框最多放大 4 倍，要足够清楚）
- 写 data/frame/photos.json；想换照片、改顺序，直接改这个 JSON 或改下面的 COUNT
原图文件夹只读。
"""
import csv
import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
RECORDS = Path("/Users/kiara/Desktop/鸽子的照片/离地高度_整理/记录表.csv")
ORIG_DIR = RECORDS.parent / "照片"
OUT = ROOT / "data" / "frame"
COUNT = 8
LONG_EDGE = 3200


def main():
    rows = list(csv.DictReader(open(RECORDS, encoding="utf-8-sig")))

    def birds(r):
        try:
            return int(r["bird_count"])
        except ValueError:
            return -1

    rows.sort(key=lambda r: -birds(r))
    picked, seen = [], set()
    for r in rows:
        key = (r["component"], r["location"])
        if key in seen or not (ORIG_DIR / r["filename"]).exists():
            continue
        seen.add(key)
        picked.append(r)
        if len(picked) == COUNT:
            break

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.jpg"):
        old.unlink()
    photos = []
    for r in picked:
        im = ImageOps.exif_transpose(Image.open(ORIG_DIR / r["filename"])).convert("RGB")
        s = LONG_EDGE / max(im.size)
        if s < 1:
            im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        im.save(OUT / r["filename"], quality=85, optimize=True, progressive=True)   # 不带 EXIF（没有 GPS）
        photos.append({"file": f"frame/{r['filename']}", "px": [im.width, im.height],
                       "bird_count": birds(r), "height_in": r["height_in"],
                       "component": r["component"], "location": r["location"], "date": r["date"]})
        print(f"{birds(r):3d}  {r['filename']}")
    (OUT / "photos.json").write_text(json.dumps({"photos": photos}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
