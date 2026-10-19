"""
Look Up · 阶段 A：从书的数据里只留下 Kiara 自己拍的鸽子照片。

用法：python3 look-up/tools/build_photos.py

- 读 data/groups.json（书拆出来的 41 组，图片在 data/img/，不复制，直接引用）
- 按图注格式过滤：
    自己拍的：「构件 / 地点 / 年月」，例如 Asphalt / 5th Ave & W 14th St / Jan. 2024
    历史照片：「摄影师 / 标题 / 年份 / 来源」
- 图注不符合任何一种格式、但图像比对已经确认是原图文件夹里的照片的，也留下，标 needs_check
- 输出 look-up/data/photos.json（按高度排）和 look-up/data/photos_report.md（给 Kiara 确认）
- 另外（Kiara 10/19 确认）：
    · 图注格式不对的两张也留下：79_02（旗杆，图像比对确认是原图）、81_01（In flight，书里飞行那一组）
    · 记录表里所有「In flight」的照片都加进来（书里只有一张飞行的），从原图导出到 look-up/data/img/
    · 同一张原图切成两块的，两块都留
不改动 鸽子的照片 文件夹，也不改旧页面的数据。
"""
import json
import re
from pathlib import Path

import csv

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
RECORDS = Path("/Users/kiara/Desktop/鸽子的照片/离地高度_整理/记录表.csv")
ORIG_DIR = RECORDS.parent / "照片"
IMG_OUT = ROOT / "look-up" / "data" / "img"
KEEP_ANYWAY = {"79_02", "81_01"}      # 图注格式不对，但是 Kiara 自己拍的
GROUP_HEIGHT = {"81": 960.0}          # 和旧页面 config.heightOverrides 一致（飞行那组，待确认）
LONG_EDGE = 1600
MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."]
GROUPS = ROOT / "data" / "groups.json"
OUT = ROOT / "look-up" / "data"

OWN = re.compile(r"^.+ / .+ / (Jan|Feb|Mar|Apr|May|June|Jun|July|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.? \d{4}$")


def main():
    data = json.loads(GROUPS.read_text())
    groups = data["groups"]
    group_h = {g["id"]: GROUP_HEIGHT.get(g["id"], g["height_in"]) for g in groups}

    kept, dropped = [], []
    for g in groups:
        for im in g["images"]:
            cap = im.get("caption") or ""
            orig = (im.get("original") or {}).get("filename")
            entry = {
                "id": Path(im["file"]).stem,                 # 例如 "01_01"
                "src": "../data/" + im["file"],              # 相对 look-up/ 的路径
                "src_hd": None,
                "px": im.get("px"),
                "group": g["id"],
                "caption": cap,
                "original": orig,
                "record": (im.get("record") or {}).get("filename"),
            }
            if OWN.match(cap):
                entry["rule"] = "caption"
            elif orig or entry["id"] in KEEP_ANYWAY:
                entry["rule"] = "image-match" if orig else "kept"   # 图注格式不对，但确认是自己拍的
                entry["needs_check"] = not orig
            else:
                dropped.append({**entry, "why": "historical caption" if cap else "no caption"})
                continue
            if im.get("height_in") is not None:
                entry["height_in"] = im["height_in"]
                entry["height_source"] = "record"
            else:
                entry["height_in"] = group_h[g["id"]]
                entry["height_source"] = "group"            # 这张自己对不上记录表，用所在组的高度
                entry["needs_check"] = True
            kept.append(entry)

    # 记录表里的飞行照片（书里没有的）
    with open(RECORDS, encoding="utf-8-sig") as f:
        flights = [r for r in csv.DictReader(f) if r["component"].strip().lower() == "in flight"]
    IMG_OUT.mkdir(parents=True, exist_ok=True)
    used = {e["original"] for e in kept if e["original"]}
    for r in flights:
        if r["filename"] in used or not (ORIG_DIR / r["filename"]).exists():
            continue
        im = ImageOps.exif_transpose(Image.open(ORIG_DIR / r["filename"])).convert("RGB")
        sc = LONG_EDGE / max(im.size)
        if sc < 1:
            im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
        im.save(IMG_OUT / r["filename"], quality=86, optimize=True, progressive=True)   # 不带 EXIF
        y, m = r["date"].split("-")
        loc = r["location"].split(" — ")[-1] if " — " in r["location"] else r["location"]
        kept.append({
            "id": Path(r["filename"]).stem,
            "src": "data/img/" + r["filename"],
            "src_hd": None,
            "px": [im.width, im.height],
            "group": None,
            "caption": f"In flight / {loc} / {MONTHS[int(m) - 1]} {y}",
            "original": r["filename"],
            "record": r["filename"],
            "rule": "records: in flight",
            "height_in": float(r["height_in"]),
            "height_source": "record",
        })

    # 同一张原图在书里被切成了几块：标出来
    by_orig = {}
    for e in kept:
        if e["original"]:
            by_orig.setdefault(e["original"], []).append(e["id"])
    for e in kept:
        same = [i for i in by_orig.get(e["original"], []) if i != e["id"]]
        if same:
            e["same_original_as"] = same

    kept.sort(key=lambda e: (e["height_in"], e["id"]))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "photos.json").write_text(json.dumps({"photos": kept}, ensure_ascii=False, indent=1))

    # ---- 给 Kiara 确认的清单
    L = ["# Look Up · 照片过滤结果", "",
         f"书里一共 {len(kept) + len(dropped)} 张图：留下 {len(kept)} 张（自己拍的），去掉 {len(dropped)} 张（历史照片）。", "",
         "规则：图注是「构件 / 地点 / 年月」= 自己拍的；「摄影师 / 标题 / 年份 / 来源」= 历史照片。", "",
         "## 需要确认", ""]
    for e in kept:
        if e.get("needs_check"):
            why = []
            if e["rule"] == "kept":
                why.append(f"图注不符合格式（“{e['caption']}”），没找到原图，按 Kiara 确认留下")
            if e["height_source"] == "group":
                why.append(f"对不上记录表，高度用所在组 {e['group']} 的 {e['height_in']:g}″")
            L.append(f"- `{e['id']}`：" + "；".join(why))
    L += ["", "## 留下的照片（按高度）", "", "| 高度 | 照片 | 组 | 图注 | 备注 |", "|---|---|---|---|---|"]
    for e in kept:
        note = []
        if e.get("same_original_as"):
            note.append("和 " + ", ".join(e["same_original_as"]) + " 是同一张原图")
        if e.get("needs_check"):
            note.append("需确认")
        L.append(f"| {e['height_in']:g}″ | `{e['id']}` | {e['group']} | {e['caption']} | {'；'.join(note)} |")
    L += ["", "## 去掉的照片", "", "| 照片 | 组 | 图注 |", "|---|---|---|"]
    for e in dropped:
        L.append(f"| `{e['id']}` | {e['group']} | {e['caption']} |")
    (OUT / "photos_report.md").write_text("\n".join(L) + "\n")
    print(f"留下 {len(kept)}，去掉 {len(dropped)}；需确认 {sum(1 for e in kept if e.get('needs_check'))}")


if __name__ == "__main__":
    main()
