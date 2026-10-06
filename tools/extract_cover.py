"""
从 bookcover.pdf 取出左右勒口上的刻度，输出 data/cover.json。

用法：python3 tools/extract_cover.py

- 第 2 页：左边的竖尺（0′–50′，每英尺一格，每 5 英尺一条长线和竖排数字）
- 第 3 页：右边的高度线（书里各组基线所在的高度，带英尺英寸标注）
纵坐标和书页一样，都是「距裁切框顶部」的 pt，所以和 groups.json 的 baseline_y 直接对得上
（0′ 在 698.7pt 处，50′ 在 81pt 处，约 12.35pt / 英尺）。
出血、色条、套准线、页脚这些印刷标记不要。
"""
import json
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "bookcover.pdf"
OUT = ROOT / "data" / "cover.json"


def panel(page):
    trim = page.trimbox
    lines, labels = [], []
    for d in page.get_drawings():
        if abs((d.get("width") or 0) - 0.5) > 0.01:      # 刻度都是 0.5pt；套准线是 1.417 / 0.283
            continue
        for it in d["items"]:
            if it[0] != "l":
                continue
            a, b = it[1], it[2]
            if abs(a.y - b.y) > 0.01:
                continue
            lines.append({"x0": round(min(a.x, b.x), 2), "x1": round(max(a.x, b.x), 2),
                          "y": round(a.y - trim.y0, 2), "w": 0.5})
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            s = l["spans"][0]
            text = "".join(sp["text"] for sp in l["spans"]).strip()
            if not text or "Mono" not in s["font"]:
                continue
            labels.append({"text": text, "x": round(s["origin"][0], 2), "y": round(s["origin"][1] - trim.y0, 2),
                           "size": round(s["size"], 2), "vertical": abs(l["dir"][1] + 1) < 0.01,
                           "font": s["font"]})
    lines.sort(key=lambda l: l["y"])
    return {"lines": lines, "labels": labels}


def main():
    doc = pymupdf.open(PDF)
    left = panel(doc[1])
    right = panel(doc[2])
    # 每个面板的原点：左尺取最右端（贴着书），右边取线的最左端（贴着书）
    left["anchor_x"] = max(l["x1"] for l in left["lines"])
    right["anchor_x"] = min(l["x0"] for l in right["lines"])
    data = {
        "source": "bookcover.pdf",
        "units": "pt；y 为距裁切框顶部，x 为封面页面坐标，按 anchor_x 对齐到跨页左右边",
        "feet_scale": {"zero_y": 670.35, "pt_per_foot": 12.35},
        "left": left,
        "right": right,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    print(f"左：{len(left['lines'])} 条线，{len(left['labels'])} 个数字；右：{len(right['lines'])} 条线，{len(right['labels'])} 个标注")


if __name__ == "__main__":
    main()
