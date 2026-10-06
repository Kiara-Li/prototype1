"""
用原图替换书里的低清图（由 extract_book.py 调用）。

书里每张图都是 InDesign 压缩过的，分辨率很低。这一步拿书里那块裁切去原图文件夹里找：
1. SIFT 特征匹配 + RANSAC，求出「书里的裁切」在原图上的位置、缩放和旋转；
2. 特征点太少（例如大片天空）时，退回到多尺度模板匹配；
3. 从原图按同样范围重新裁切，再和书里那张比一次像素相关性，够像才采用。
匹配上的原图同时确定了记录表里是哪一行，高度直接用那一行的 height_in。
匹配不上的（历史照片等）保留书里的版本。

原图文件夹只读。
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

ORIG_DIR = Path("/Users/kiara/Desktop/鸽子的照片/离地高度_整理/照片")
FEATURE_LONG_EDGE = 1400      # 原图算特征时缩到的长边
MIN_INLIERS = 25              # SIFT 内点下限
MIN_RATIO = 2.5               # 最佳候选的内点数至少是第二名的几倍
MIN_NCC = 0.55                # 重切后和书里那张的相关性下限
TEMPLATE_MIN_NCC = 0.80       # 模板匹配的相关性下限（只用于特征点太少的图）
TEMPLATE_MIN_EDGE_NCC = 0.15  # 模板匹配还要求边缘细节对得上：大片渐变天空光看像素会误配

_sift = cv2.SIFT_create(nfeatures=4000)
_flann = cv2.FlannBasedMatcher(dict(algorithm=1, trees=5), dict(checks=64))


def _open_original(fn):
    return ImageOps.exif_transpose(Image.open(ORIG_DIR / fn)).convert("RGB")


class OriginalIndex:
    """原图的 SIFT 特征，缓存在 cache_dir，第二次运行很快。"""

    def __init__(self, filenames, cache_dir):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.filenames = [f for f in filenames if (ORIG_DIR / f).exists()]
        self.feats = {}
        self.small = {}

    def features(self, fn):
        if fn in self.feats:
            return self.feats[fn]
        cache = self.cache_dir / (fn + ".npz")
        if cache.exists():
            d = np.load(cache)
            out = (d["kp"], d["des"], float(d["f"]))
        else:
            im = _open_original(fn)
            f = FEATURE_LONG_EDGE / max(im.size)
            g = np.array(im.convert("L").resize((round(im.width * f), round(im.height * f)), Image.LANCZOS))
            kp, des = _sift.detectAndCompute(g, None)
            kp = np.array([k.pt for k in kp], np.float32)
            np.savez(cache, kp=kp, des=des, f=f)
            out = (kp, des, f)
        self.feats[fn] = out
        return out

    def small_gray(self, fn, long=600):
        if fn not in self.small:
            im = _open_original(fn)
            f = long / max(im.size)
            self.small[fn] = (np.array(im.convert("L").resize((round(im.width * f), round(im.height * f)), Image.LANCZOS)), f)
        return self.small[fn]


def _book_features(book_rgb):
    g = np.array(book_rgb.convert("L"))
    up = max(1.0, 600 / max(g.shape))
    g2 = cv2.resize(g, None, fx=up, fy=up, interpolation=cv2.INTER_CUBIC)
    kp, des = _sift.detectAndCompute(g2, None)
    return np.array([k.pt for k in kp], np.float32) / up if kp else np.zeros((0, 2), np.float32), des


def _sift_match(book_kp, book_des, index, fn):
    kp, des, f = index.features(fn)
    if book_des is None or des is None or len(book_kp) < 4 or len(kp) < 4:
        return 0, None
    pairs = _flann.knnMatch(book_des, des, k=2)
    good = [m for m, n in (p for p in pairs if len(p) == 2) if m.distance < 0.75 * n.distance]
    if len(good) < 6:
        return len(good), None
    src = book_kp[[m.queryIdx for m in good]]
    dst = kp[[m.trainIdx for m in good]] / f                     # 换算到原图全尺寸像素
    A, inl = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=4 / f)
    if A is None:
        return 0, None
    return int(inl.sum()), A


def _crop_with_affine(orig, A, bw, bh):
    """A：书里那张的像素 → 原图像素。返回按书里方向摆正的原图裁切。"""
    scale = float(np.hypot(A[0, 0], A[1, 0]))
    angle = float(np.degrees(np.arctan2(A[1, 0], A[0, 0])))
    k = int(round(angle / 90)) % 4
    if abs(angle - round(angle / 90) * 90) > 4:
        return None
    corners = np.array([[0, 0], [bw, 0], [bw, bh], [0, bh]], np.float64)
    mapped = corners @ A[:, :2].T + A[:, 2]
    x0, y0 = mapped.min(axis=0)
    x1, y1 = mapped.max(axis=0)
    W, H = orig.size
    # 超出原图太多说明不是同一张
    if x0 < -0.03 * W or y0 < -0.03 * H or x1 > 1.03 * W or y1 > 1.03 * H:
        return None
    box = (max(0, round(x0)), max(0, round(y0)), min(W, round(x1)), min(H, round(y1)))
    crop = orig.crop(box)
    # 原图里旋转了 k×90° 才对得上书里，所以把裁切转回来
    if k:
        crop = crop.rotate(90 * k, expand=True)
    return crop, scale


def _ncc(a_rgb, b_rgb):
    a = np.asarray(a_rgb.convert("L"), np.float32)
    b = np.asarray(b_rgb.convert("L").resize(a_rgb.size, Image.LANCZOS), np.float32)
    a = (a - a.mean()) / (a.std() + 1e-6)
    b = (b - b.mean()) / (b.std() + 1e-6)
    return float((a * b).mean())


def _edge_ncc(a_rgb, b_rgb):
    """高通后的相关性：只看边缘和细节（鸽子、电线），不看大面积的颜色渐变。"""
    a = np.asarray(a_rgb.convert("L"), np.float32)
    b = np.asarray(b_rgb.convert("L").resize(a_rgb.size, Image.LANCZOS), np.float32)
    a = a - cv2.GaussianBlur(a, (0, 0), 3)
    b = b - cv2.GaussianBlur(b, (0, 0), 3)
    a = (a - a.mean()) / (a.std() + 1e-6)
    b = (b - b.mean()) / (b.std() + 1e-6)
    return float((a * b).mean())


def _template_match(book_rgb, index, candidates):
    """特征点太少时（天空、纯色）：多尺度模板匹配，书里那张必须完整落在原图里。"""
    bg = np.asarray(book_rgb.convert("L"), np.float32)
    best = None
    for fn in candidates:
        small, f = index.small_gray(fn)
        sh, sw = small.shape
        for frac in np.linspace(1.0, 0.35, 27):          # 书里那张占原图宽或高的比例
            for fit in ("w", "h"):
                if fit == "w":
                    tw = int(sw * frac)
                    th = int(round(tw * bg.shape[0] / bg.shape[1]))
                else:
                    th = int(sh * frac)
                    tw = int(round(th * bg.shape[1] / bg.shape[0]))
                if tw < 8 or th < 4 or tw > sw or th > sh:
                    continue
                t = cv2.resize(bg, (tw, th), interpolation=cv2.INTER_AREA)
                r = cv2.matchTemplate(small.astype(np.float32), t, cv2.TM_CCOEFF_NORMED)
                _, mv, _, ml = cv2.minMaxLoc(r)
                if best is None or mv > best[0]:
                    best = (mv, fn, (ml[0] / f, ml[1] / f, (ml[0] + tw) / f, (ml[1] + th) / f))
    return best


def find_original(book_rgb, index, preferred, everything):
    """返回 dict(filename, crop, method, score) 或 None。"""
    bkp, bdes = _book_features(book_rgb)
    bw, bh = book_rgb.size

    def run(cands):
        scored = sorted(((*_sift_match(bkp, bdes, index, fn), fn) for fn in cands), key=lambda t: -t[0])
        return scored

    for cands in (preferred, everything):
        if not cands:
            continue
        scored = run(cands)
        if not scored:
            continue
        n, A, fn = scored[0]
        second = scored[1][0] if len(scored) > 1 else 0
        if A is not None and n >= MIN_INLIERS and n >= MIN_RATIO * max(second, 1):
            res = _crop_with_affine(_open_original(fn), A, bw, bh)
            if res:
                crop, _ = res
                score = _ncc(book_rgb, crop)
                if score >= MIN_NCC:
                    return {"filename": fn, "crop": crop, "method": "sift", "inliers": n, "score": round(score, 3)}

    # 特征点不够：模板匹配，只在优先候选里找（避免误配）
    if preferred:
        tm = _template_match(book_rgb, index, preferred)
        if tm and tm[0] >= TEMPLATE_MIN_NCC:
            _, fn, (x0, y0, x1, y1) = tm
            orig = _open_original(fn)
            crop = orig.crop((round(x0), round(y0), round(x1), round(y1)))
            score = _ncc(book_rgb, crop)
            if score >= TEMPLATE_MIN_NCC and _edge_ncc(book_rgb, crop) >= TEMPLATE_MIN_EDGE_NCC:
                return {"filename": fn, "crop": crop, "method": "template", "inliers": 0, "score": round(score, 3)}
    return None
