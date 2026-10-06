"""
阶段 1：从 book.pdf 拆出分组，输出 data/groups.json 和 data/img/。

用法：
    pip install pymupdf pillow numpy
    python3 tools/extract_book.py

做法：
- PDF 是单页导出。PDF 第 2–83 页两两组成跨页（2+3, 4+5 …），每个跨页是一组，
  组号取左页基线左端的页码（01, 03 … 81）。第 1、84 页是空白页。
- 坐标统一换算成「跨页坐标」：单位 pt，原点在左页裁切框左上角，
  跨页宽 828pt（2 × 414），高 702pt。
- 图片按「印出来实际看得到的样子」切：把每张图替换成纯品红色重新渲染，
  品红色像素的范围就是这张图的可见区域（已包含裁切、遮挡、旋转）。
  然后从正常渲染的跨页上裁出这块。跨过中缝被拆成两半的图会拼回一张。
- 图注：竖排小字，贴在图片右边。按「图注左边缘 ≈ 图片右边缘」配对。
- 高度：自己拍的照片用图注（构件 / 地点 / 年月）去和记录表对，拿 height_in。
  对不上的组用基线位置在相邻已知组之间插值，标 height_source: "baseline"。
- 只读记录表，不写入 鸽子的照片 文件夹。
"""
import csv
import sys
import json
import re
import statistics
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "book.pdf"
OUT = ROOT / "data"
IMG_OUT = OUT / "img"
IMG_PDF = OUT / "img_pdf"          # 书里原样切出来的低清版本，留作对照
sys.path.insert(0, str(Path(__file__).resolve().parent))
RECORDS = Path("/Users/kiara/Desktop/鸽子的照片/离地高度_整理/记录表.csv")

PAGE_W = 414.0          # 裁切后单页宽 (pt)
PAGE_H = 702.0          # 裁切后单页高 (pt)
SPREAD_W = 2 * PAGE_W
RENDER_SCALE = 4.0      # 渲染密度 px/pt（≈288 dpi），之后再按原图像素缩小
MASK_SCALE = 2.0        # 找可见区域用的渲染密度
LONG_EDGE_MAX = 1600
JPEG_QUALITY = 86
MAGENTA = (255, 0, 255)

MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "june": 6, "jun": 6,
          "july": 7, "jul": 7, "aug": 8, "sept": 9, "sep": 9, "oct": 10,
          "nov": 11, "dec": 12}

# InDesign 里残留在图注末尾的文件名，例如 "NYPLlorimer_2026-03_01.jpg"
CAPTION_JUNK = re.compile(r"\s*lorimer[ _]2026[ _-]03[ _]01[ .]jpg\s*$")


# ---------------------------------------------------------------- 渲染与可见区域

def page_trim(page):
    return page.trimbox


def render_trim(page, scale):
    """渲染单页的裁切框区域，返回 HxWx3 uint8。"""
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=page_trim(page), alpha=False)
    return np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 3).copy()


def visible_rect(pdf_bytes, page_index, xref):
    """把 xref 这张图换成品红色，渲染裁切框，返回品红色像素的范围（页内裁切坐标，pt）。"""
    doc = pymupdf.open("pdf", pdf_bytes)
    page = doc[page_index]
    info = next(i for i in page.get_image_info(xrefs=True) if i["xref"] == xref)
    w, h = max(info["width"], 2), max(info["height"], 2)
    solid = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, w, h), False)
    solid.set_rect(solid.irect, MAGENTA)
    page.replace_image(xref, pixmap=solid)
    arr = render_trim(doc[page_index], MASK_SCALE)
    doc.close()
    m = (arr[:, :, 0] > 245) & (arr[:, :, 1] < 10) & (arr[:, :, 2] > 245)
    if m.sum() < 4:
        return None
    ys, xs = np.nonzero(m)
    s = MASK_SCALE
    return [xs.min() / s, ys.min() / s, (xs.max() + 1) / s, (ys.max() + 1) / s]


def native_density(info):
    """原图像素 / pt（取两个方向的几何平均）。"""
    b = pymupdf.Rect(info["bbox"])
    return ((info["width"] * info["height"]) / max(b.width * b.height, 1e-6)) ** 0.5


# ---------------------------------------------------------------- 文字

def lines_of(page):
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            text = "".join(s["text"] for s in l["spans"])
            if text.strip():
                out.append({"text": text.strip(), "bbox": list(l["bbox"]), "dir": l["dir"],
                            "font": l["spans"][0]["font"], "size": l["spans"][0]["size"]})
    return out


def baseline_of(page):
    """跨页上那条贯穿的细线：最长的水平线。返回 (y_pt 页面坐标, 线宽)。"""
    best = None
    for d in page.get_drawings():
        items = d["items"]
        if len(items) == 1 and items[0][0] == "l":
            a, b = items[0][1], items[0][2]
            if abs(a.y - b.y) < 0.01:
                length = abs(b.x - a.x)
                if best is None or length > best[0]:
                    best = (length, a.y, d.get("width"))
    return (best[1], best[2]) if best else (None, None)


# ---------------------------------------------------------------- 图注解析

def parse_caption(text):
    parts = [p.strip() for p in text.split(" / ")]
    m = re.search(r"\b(Jan|Feb|Mar|Apr|May|June|Jun|July|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.?\s+(\d{4})$", text)
    if m and len(parts) >= 3:
        return {"kind": "own", "component": parts[0], "location": " / ".join(parts[1:-1]),
                "date": f"{m.group(2)}-{MONTHS[m.group(1).lower()]:02d}"}
    return {"kind": "historical"}


# ---------------------------------------------------------------- 记录表匹配

ABBR = {"avenue": "ave", "av": "ave", "street": "st", "place": "pl", "east": "e", "west": "w",
        "fifth": "5th", "third": "3rd", "between": "", "near": "", "at": "", "and": "",
        "the": "", "manhattan": "", "of": "", "side": ""}


def tokens(s):
    s = s.lower().replace("&", " ").replace("–", " ").replace("—", " ").replace("’", "'")
    s = re.sub(r"[^a-z0-9' ]", " ", s)
    out = set()
    for t in s.split():
        t = ABBR.get(t, t)
        if t:
            out.add(t)
    return out


def load_records():
    with open(RECORDS, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def match_record(cap, records):
    """返回 (最佳记录, 分数, 是否有同分但高度不同的候选, 候选列表)。"""
    loc = tokens(cap["location"])
    comp = tokens(cap["component"])
    scored = []
    for r in records:
        if r["date"] != cap["date"]:
            continue
        rloc = tokens(r["location"]) | tokens(r["filename"].replace("-", " ").replace("_", " "))
        rcomp = tokens(r["component"]) | tokens(r["contact_point"] or "") | tokens(r["filename"].replace("-", " ").replace("_", " "))
        sl = len(loc & rloc) / max(len(loc), 1)
        sc = len(comp & rcomp) / max(len(comp), 1)
        score = 0.55 * sl + 0.45 * sc
        if r["status"] == "选用":
            score += 0.02
        scored.append((score, r))
    scored.sort(key=lambda t: -t[0])
    if not scored:
        return None, 0.0, False, []
    top = scored[0][0]
    ties = [r for s, r in scored if top - s < 0.03]
    ambiguous = len({r["height_in"] for r in ties}) > 1
    return scored[0][1], top, ambiguous, scored[:4]


# ---------------------------------------------------------------- 主流程

def use_originals(groups, records, issues):
    """书里的图去原图文件夹里找，找到就用原图重新切，并用那张照片的记录表高度。找不到就用书里的版本。"""
    import tempfile
    from originals import OriginalIndex, find_original

    by_name = {r["filename"]: r for r in records}
    index = OriginalIndex([r["filename"] for r in records], Path(tempfile.gettempdir()) / "pigeon_sift_cache")
    print("\n比对原图…")
    for g in groups:
        for im in g["images"]:
            fname = Path(im["file"]).name
            book_rgb = Image.open(IMG_PDF / fname).convert("RGB")
            cap = im["caption"] or ""
            pc = parse_caption(cap) if cap else {"kind": "historical"}
            if pc["kind"] == "own":
                preferred = [r["filename"] for r in records if r["date"] == pc["date"]]
            else:
                # 图注没有地点和年月（如 “In flight”）：按构件名找候选
                head = tokens(cap.split(" / ")[0]) - {"photographer", "unknown"}
                preferred = [r["filename"] for r in records
                             if head and head <= (tokens(r["component"]) | tokens(r["filename"].replace("-", " ").replace("_", " ")))]
            everything = index.filenames if pc["kind"] == "own" else []
            hit = find_original(book_rgb, index, preferred, everything) if (preferred or everything) else None
            if hit:
                crop = hit["crop"]
                scale = LONG_EDGE_MAX / max(crop.size)
                if scale < 1:
                    crop = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.LANCZOS)
                crop.save(IMG_OUT / fname, quality=JPEG_QUALITY, optimize=True, progressive=True)
                rec = by_name[hit["filename"]]
                im["px"] = [crop.width, crop.height]
                im["kind"] = "own"
                im["original"] = {"filename": hit["filename"], "method": hit["method"],
                                  "inliers": hit["inliers"], "similarity": hit["score"]}
                old = (im.get("record") or {}).get("filename")
                if old and old != hit["filename"]:
                    im["record_text_match"] = old          # 只按文字对上的是另一张
                im["height_in"] = float(rec["height_in"]) if rec["height_in"] else None
                im["record"] = {"filename": rec["filename"], "component": rec["component"],
                                "location": rec["location"], "height_source": rec["height_source"],
                                "status": rec["status"], "matched_by": "image"}
                print(f"  {fname}  <- {hit['filename']}  ({hit['method']}, {hit['score']})", flush=True)
            else:
                (IMG_OUT / fname).write_bytes((IMG_PDF / fname).read_bytes())
                im["px"] = im["px_pdf"]
                im["original"] = None
                if pc["kind"] == "own":
                    issues.append(f"组 {g['id']}：{fname} 没找到原图，用书里的低清版本 —— “{cap[:60]}”")
                    if im.get("record"):
                        im["record"]["matched_by"] = "text"


def to_spread_x(x, side):
    return x - 28.346 + (PAGE_W if side == "R" else 0.0)


def main():
    for d in (IMG_OUT, IMG_PDF):
        d.mkdir(parents=True, exist_ok=True)
        for old in d.glob("*.jpg"):
            old.unlink()
    pdf_bytes = PDF.read_bytes()
    doc = pymupdf.open(PDF)
    records = load_records()
    groups = []
    issues = []

    for left_idx in range(1, len(doc) - 1, 2):       # 0-based: 1,3,5…  = PDF 第 2,4,6… 页
        right_idx = left_idx + 1
        pages = {"L": doc[left_idx], "R": doc[right_idx]}

        # ---- 跨页渲染（两页裁切框并排）
        renders = {k: render_trim(p, RENDER_SCALE) for k, p in pages.items()}
        spread_img = np.concatenate([renders["L"], renders["R"]], axis=1)

        # ---- 组号与基线
        num = None
        for ln in lines_of(pages["L"]):
            if "Mono" in ln["font"] and re.fullmatch(r"\d{2}", ln["text"]):
                num = ln["text"]
                num_bbox = ln["bbox"]
        base_y, base_w = baseline_of(pages["L"])
        base_y_r, _ = baseline_of(pages["R"])
        if base_y_r is not None and abs(base_y_r - base_y) > 0.6:
            issues.append(f"组 {num}：左右页基线高度不一致（{base_y:.1f} / {base_y_r:.1f}pt）")
        baseline_top = base_y - 28.346               # 距裁切框顶部 (pt)

        # ---- 每页图片的可见区域
        pieces = []
        for side, page in pages.items():
            for info in page.get_image_info(xrefs=True):
                r = visible_rect(pdf_bytes, page.number, info["xref"])
                if r is None:
                    continue
                x0, y0, x1, y1 = (float(v) for v in r)
                pieces.append({"side": side, "xref": info["xref"], "density": native_density(info),
                               "rect": [to_spread_x(x0 + 28.346, side), y0, to_spread_x(x1 + 28.346, side), y1]})

        # ---- 把跨中缝拆开的两半拼回去
        merged = []
        lefts = [p for p in pieces if p["side"] == "L"]
        rights = [p for p in pieces if p["side"] == "R"]
        used = set()
        for a in lefts:
            partner = None
            if a["rect"][2] >= PAGE_W - 0.75:
                for b in rights:
                    if id(b) in used:
                        continue
                    if b["rect"][0] <= PAGE_W + 0.75 and abs(a["rect"][1] - b["rect"][1]) < 1.5 \
                            and abs(a["rect"][3] - b["rect"][3]) < 1.5:
                        partner = b
                        break
            if partner:
                used.add(id(partner))
                ra, rb = a["rect"], partner["rect"]
                merged.append({"rect": [ra[0], min(ra[1], rb[1]), rb[2], max(ra[3], rb[3])],
                               "density": max(a["density"], partner["density"]),
                               "xrefs": [a["xref"], partner["xref"]], "crosses_gutter": True})
            else:
                merged.append({"rect": a["rect"], "density": a["density"], "xrefs": [a["xref"]],
                               "crosses_gutter": False})
        for b in rights:
            if id(b) not in used:
                merged.append({"rect": b["rect"], "density": b["density"], "xrefs": [b["xref"]],
                               "crosses_gutter": False})
        merged.sort(key=lambda m: m["rect"][0])

        # ---- 图注（竖排，去掉跨中缝重复的那份）
        caps = []
        for side, page in pages.items():
            for ln in lines_of(page):
                if "Mono" in ln["font"] or abs(ln["dir"][1] + 1) > 0.01:
                    continue
                x0, y0, x1, y1 = ln["bbox"]
                sx0, sx1 = to_spread_x(x0, side), to_spread_x(x1, side)
                if sx0 < -1 or sx1 > SPREAD_W + 1:
                    continue
                if (side == "L" and sx0 > PAGE_W - 1) or (side == "R" and sx1 < PAGE_W + 1):
                    # 跨中缝的文本框在两页各出现一次；只保留中心在本页的那份
                    center = (sx0 + sx1) / 2
                    if (side == "L") != (center < PAGE_W):
                        continue
                caps.append({"text": ln["text"], "side": side, "rect": [sx0, y0 - 28.346, sx1, y1 - 28.346]})

        # 跨中缝的图注框在左右页各导出一份，位置重合、文字偶尔不同（右页那份标点更完整）。
        # 只留右页那份，左页文字记在 alt_text 里。
        deduped = []
        for c in sorted(caps, key=lambda c: c["side"] != "R"):
            twin = next((d for d in deduped if abs(d["rect"][0] - c["rect"][0]) < 1.5
                         and abs(d["rect"][3] - c["rect"][3]) < 1.5), None)
            if twin is None:
                deduped.append(c)
            elif twin["text"] != c["text"]:
                twin["alt_text"] = c["text"]
        caps = deduped

        # ---- 图注配给图片：图注左边缘贴着图片右边缘
        for im in merged:
            im["caption_raw"] = None
        for c in caps:
            best, bestd = None, 99
            for im in merged:
                d = c["rect"][0] - im["rect"][2]          # 图注在图片右边：d 应 ≥ 0
                if d < -2:
                    continue
                vert_ok = c["rect"][3] <= im["rect"][3] + 3 and c["rect"][3] >= im["rect"][1]
                if vert_ok and d < bestd:
                    best, bestd = im, d
            if best is not None and bestd < 8 and best["caption_raw"] is None:
                best["caption_raw"] = c["text"]
                best["caption_rect"] = c["rect"]
            else:
                issues.append(f"组 {num}：图注没有配上图片 —— “{c['text'][:70]}”")

        # ---- 输出图片 + 匹配高度
        images = []
        for i, im in enumerate(merged, 1):
            x0, y0, x1, y1 = im["rect"]
            s = RENDER_SCALE
            crop = spread_img[int(round(y0 * s)):int(round(y1 * s)), int(round(x0 * s)):int(round(x1 * s))]
            pil = Image.fromarray(crop)
            w_pt, h_pt = x1 - x0, y1 - y0
            target_long = min(LONG_EDGE_MAX, max(w_pt, h_pt) * max(im["density"], 1.0))
            scale = target_long / max(pil.size)
            if scale < 1:
                pil = pil.resize((max(1, round(pil.width * scale)), max(1, round(pil.height * scale))), Image.LANCZOS)
            fname = f"{num}_{i:02d}.jpg"
            pil.save(IMG_PDF / fname, quality=JPEG_QUALITY, optimize=True, progressive=True)

            raw = im["caption_raw"]
            clean = CAPTION_JUNK.sub("", raw) if raw else None
            entry = {
                "file": f"img/{fname}",
                "x": round(x0, 2), "y": round(y0, 2), "w": round(w_pt, 2), "h": round(h_pt, 2),
                "px_pdf": [pil.width, pil.height],
                "source_px_per_pt": round(im["density"], 2),
                "crosses_gutter": im["crosses_gutter"],
                "bottom_on_baseline": bool(abs(y1 - baseline_top) < 1.5),
                "caption": clean,
                "caption_raw": raw,
                # 竖排图注的位置：左边缘 x、文字起点（下端）y，跨页坐标 pt
                "caption_x": round(im["caption_rect"][0], 2) if raw else None,
                "caption_bottom": round(im["caption_rect"][3], 2) if raw else None,
                "kind": None, "height_in": None, "record": None,
            }
            if clean:
                pc = parse_caption(clean)
                entry["kind"] = pc["kind"]
                if pc["kind"] == "own":
                    rec, score, amb, top = match_record(pc, records)
                    if rec:
                        entry["height_in"] = float(rec["height_in"]) if rec["height_in"] else None
                        entry["record"] = {"filename": rec["filename"], "component": rec["component"],
                                           "location": rec["location"], "height_source": rec["height_source"],
                                           "status": rec["status"], "match_score": round(score, 2),
                                           "ambiguous": amb,
                                           "alternatives": [{"filename": r["filename"], "height_in": r["height_in"],
                                                             "score": round(s_, 2)} for s_, r in top[1:]]}
                    else:
                        entry["record"] = None
            if not entry["bottom_on_baseline"]:
                issues.append(f"组 {num}：{fname} 底边不在基线上（底边 {y1:.1f}pt，基线 {baseline_top:.1f}pt）")
            images.append(entry)

        groups.append({
            "id": num,
            "pdf_pages": [left_idx + 1, right_idx + 1],
            "baseline_y": round(baseline_top, 2),                 # 距裁切框顶部 (pt)
            "baseline_frac": round(1 - baseline_top / PAGE_H, 4),  # 0 = 页面底，1 = 页面顶
            "baseline_width": base_w,
            "number_pos": {"x": round(num_bbox[0] - 28.346, 2), "y": round(num_bbox[1] - 28.346, 2),
                           "w": round(num_bbox[2] - num_bbox[0], 2), "h": round(num_bbox[3] - num_bbox[1], 2)},
            "images": images,
        })
        print(f"组 {num}: {len(images)} 张图")

    use_originals(groups, records, issues)

    # ---- 组高度
    for g in groups:
        hs = [im["height_in"] for im in g["images"] if im["height_in"] is not None]
        if hs:
            g["height_in"] = statistics.median(hs)
            g["height_source"] = "records"
            g["height_values"] = sorted(set(hs))
        else:
            g["height_in"] = None
            g["height_source"] = None
    known = [(g["baseline_frac"], g["height_in"]) for g in groups if g["height_in"] is not None]
    for gi, g in enumerate(groups):
        if g["height_in"] is not None:
            continue
        prev = next(((groups[j]["baseline_frac"], groups[j]["height_in"]) for j in range(gi - 1, -1, -1)
                     if groups[j]["height_source"] == "records"), None)
        nxt = next(((groups[j]["baseline_frac"], groups[j]["height_in"]) for j in range(gi + 1, len(groups))
                    if groups[j]["height_source"] == "records"), None)
        if prev and nxt and nxt[0] != prev[0]:
            t = (g["baseline_frac"] - prev[0]) / (nxt[0] - prev[0])
            g["height_in"] = round(prev[1] + t * (nxt[1] - prev[1]), 1)
        elif prev:
            g["height_in"] = prev[1]
        elif nxt:
            g["height_in"] = nxt[1]
        g["height_source"] = "baseline"

    data = {
        "source": "book.pdf",
        "units": "pt；跨页坐标，原点在左页裁切框左上角",
        "spread": {"w": SPREAD_W, "h": PAGE_H, "gutter_x": PAGE_W},
        "groups": groups,
    }
    (OUT / "groups.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
    (OUT / "extract_issues.txt").write_text("\n".join(issues) + "\n")
    print(f"\n{len(groups)} 组，问题 {len(issues)} 条 → data/extract_issues.txt")


if __name__ == "__main__":
    main()
