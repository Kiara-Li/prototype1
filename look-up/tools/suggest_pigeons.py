"""
Look Up · 标注工具的「建议轮廓」：用 YOLO 分割模型先把每张照片里的鸽子找一遍。

用法：python3 look-up/tools/suggest_pigeons.py      （需要 pip install ultralytics）

- 只是建议：在 tools/mark.html 里显示成虚线，点一下才会变成正式标注，脖子位置仍然由人来点
- 输出 look-up/data/suggestions.json：{ "<照片 id>": [ { polygon: [[x, y], ...], conf }, ... ] }，坐标是 0–1
- 和旧页面 tools/segment_pigeons.py 用同一个模型、同一套轮廓简化方法
"""
import json
import os
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
from segment_pigeons import BIRD, CONF, DUP_IOU, MODEL, polygons_from_mask  # noqa: E402

PHOTOS = ROOT / "look-up" / "data" / "photos.json"
OUT = ROOT / "look-up" / "data" / "suggestions.json"
IMGSZ = 1280


def main():
    from ultralytics import YOLO
    import torch

    photos = json.loads(PHOTOS.read_text())["photos"]
    cache = Path(tempfile.gettempdir()) / "pigeon_yolo"
    cache.mkdir(exist_ok=True)
    cwd = os.getcwd()
    os.chdir(cache)
    model = YOLO(MODEL)
    os.chdir(cwd)
    device = "mps" if torch.backends.mps.is_available() else "cpu"

    out = {}
    for p in photos:
        path = (ROOT / "look-up" / p["src"]).resolve()
        im = np.array(Image.open(path).convert("RGB"))
        res = model.predict(im[:, :, ::-1], imgsz=IMGSZ, conf=CONF, classes=[BIRD],
                            retina_masks=True, verbose=False, device=device)[0]
        masks = res.masks.data.cpu().numpy() if res.masks is not None else np.zeros((0, 1, 1))
        confs = res.boxes.conf.cpu().numpy() if res.boxes is not None else np.zeros(0)
        keep = []
        for i in np.argsort(-confs):
            mi = masks[i] > 0.5
            if any(np.logical_and(mi, masks[j] > 0.5).sum() / max(1, min(mi.sum(), (masks[j] > 0.5).sum())) > DUP_IOU
                   for j in keep):
                continue
            keep.append(i)
        sugg = []
        for i in keep:
            h, w = masks[i].shape
            polys = polygons_from_mask(masks[i], w, h)
            if polys:
                biggest = max(polys, key=len)
                sugg.append({"polygon": biggest, "conf": round(float(confs[i]), 3)})
        out[p["id"]] = sugg
        print(f"{p['id']}: {len(sugg)}")
    OUT.write_text(json.dumps(out, ensure_ascii=False))
    print(f"\n{sum(len(v) for v in out.values())} 个建议轮廓 → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
