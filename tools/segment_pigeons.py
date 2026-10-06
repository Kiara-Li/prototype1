"""
声音页面用的照片：把每只鸽子的剪影抠出来，输出 data/sound/。

用法：
    pip install ultralytics      # 第一次会下载 yolo11l-seg 模型（约 54MB）
    python3 tools/segment_pigeons.py

- 用 YOLO 分割模型找 COCO 里的 bird 类，每只鸽子得到一个剪影（多边形，坐标按照片宽高归一化到 0–1）
- 只在这里离线跑一次；网页只读结果，不在浏览器里跑任何识别
- 想加照片：把记录表里的文件名加进 PHOTOS，再跑一次
- 会另外写一张检查图到 data/sound/_check/，看抠得对不对（不用提交）
原图文件夹只读。
"""
import json
import os
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent.parent
RECORDS = Path("/Users/kiara/Desktop/鸽子的照片/离地高度_整理/记录表.csv")
ORIG_DIR = RECORDS.parent / "照片"
OUT = ROOT / "data" / "sound"
CHECK = OUT / "_check"

# 有周围环境（街道、建筑、公园）的几张
PHOTOS = [
    "0000_sidewalk-concrete_5th-ave-14th-st_2024-02_01.jpg",
    "0000_park-path_central-park_2025-08_01.jpg",
    "0048_fence-park_tompkins-sq-ave-b-e9th_2026-09_03.jpg",
    "0144_glass-canopy_e14th-st-3rd-ave_2026-09_01.jpg",
    "0000_belgian-block_stuy-town_2025-08_01.jpg",
]

LONG_EDGE = 2400          # 网页用的照片尺寸
MODEL = "yolo11l-seg.pt"
IMGSZ = 1920              # 大一点才找得到远处的小鸽子
CONF = 0.35               # 低于这个的不要（多是重复框或误认）
DUP_IOU = 0.5             # 两个剪影重叠超过这个，只留置信度高的
BIRD = 14                 # COCO: bird


def load_records():
    import csv
    with open(RECORDS, encoding="utf-8-sig") as f:
        return {r["filename"]: r for r in csv.DictReader(f)}


def polygons_from_mask(mask, w, h):
    """二值剪影 → 简化后的多边形（归一化坐标），只留面积够大的几块。"""
    m = (mask > 0.5).astype(np.uint8)
    contours, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return []
    biggest = max(cv2.contourArea(c) for c in contours)
    polys = []
    for c in contours:
        if cv2.contourArea(c) < 0.1 * biggest:
            continue
        eps = 0.004 * cv2.arcLength(c, True)
        c = cv2.approxPolyDP(c, eps, True)
        if len(c) < 3:
            continue
        polys.append([[round(float(x) / w, 4), round(float(y) / h, 4)] for x, y in c[:, 0, :]])
    return polys


def main():
    from ultralytics import YOLO

    records = load_records()
    cache = Path(tempfile.gettempdir()) / "pigeon_yolo"
    cache.mkdir(exist_ok=True)
    os.chdir(cache)                       # 模型下载到这里，不放进项目
    model = YOLO(MODEL)
    device = "mps" if __import__("torch").backends.mps.is_available() else "cpu"

    OUT.mkdir(parents=True, exist_ok=True)
    CHECK.mkdir(parents=True, exist_ok=True)
    photos = []
    for fn in PHOTOS:
        src = ImageOps.exif_transpose(Image.open(ORIG_DIR / fn)).convert("RGB")
        W, H = src.size
        res = model.predict(np.array(src)[:, :, ::-1], imgsz=IMGSZ, conf=CONF, classes=[BIRD],
                            retina_masks=True, verbose=False, device=device)[0]
        masks = res.masks.data.cpu().numpy() if res.masks is not None else np.zeros((0, H, W))
        confs = res.boxes.conf.cpu().numpy() if res.boxes is not None else np.zeros(0)

        # 去掉重复的剪影
        order = np.argsort(-confs)
        keep = []
        for i in order:
            mi = masks[i] > 0.5
            dup = False
            for j in keep:
                mj = masks[j] > 0.5
                inter = np.logical_and(mi, mj).sum()
                if inter / max(1, min(mi.sum(), mj.sum())) > DUP_IOU:
                    dup = True
                    break
            if not dup:
                keep.append(i)

        pigeons = []
        for i in keep:
            mh, mw = masks[i].shape
            polys = polygons_from_mask(masks[i], mw, mh)
            if not polys:
                continue
            xs = [p[0] for poly in polys for p in poly]
            ys = [p[1] for poly in polys for p in poly]
            pigeons.append({"bbox": [min(xs), min(ys), max(xs), max(ys)], "polygons": polys,
                            "conf": round(float(confs[i]), 3)})
        pigeons.sort(key=lambda p: (p["bbox"][0] + p["bbox"][2]) / 2)   # 从左到右编号
        stem = Path(fn).stem
        for k, p in enumerate(pigeons, 1):
            p["id"] = f"{stem}#{k:02d}"

        # 网页用的照片（不带 EXIF）
        out = src.copy()
        s = LONG_EDGE / max(out.size)
        if s < 1:
            out = out.resize((round(W * s), round(H * s)), Image.LANCZOS)
        out.save(OUT / fn, quality=86, optimize=True, progressive=True)

        # 检查图：剪影描黑边 + 编号
        chk = out.copy()
        d = ImageDraw.Draw(chk)
        for p in pigeons:
            for poly in p["polygons"]:
                d.line([(x * out.width, y * out.height) for x, y in poly + [poly[0]]], fill=(255, 0, 0), width=3)
            d.text((p["bbox"][0] * out.width, p["bbox"][1] * out.height - 14), p["id"].split("#")[1], fill=(255, 0, 0))
        chk.thumbnail((1600, 1600))
        chk.save(CHECK / fn, quality=80)

        r = records.get(fn, {})
        photos.append({"file": f"sound/{fn}", "px": [out.width, out.height],
                       "component": r.get("component"), "location": r.get("location"), "date": r.get("date"),
                       "height_in": r.get("height_in"), "pigeons": pigeons})
        print(f"{len(pigeons):3d} 只  {fn}")

    (OUT / "photos.json").write_text(json.dumps({"photos": photos}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
