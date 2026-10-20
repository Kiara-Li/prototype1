// Look Up · 观察：取景框框住一只鸽子 → 颜色从它的脖子慢慢渗出来 → 找到它 → 屏幕上慢慢晕开一块颜色
//
// 鸽子的位置：look-up/data/pigeons.json（标注工具）；还没标的照片先用 YOLO 的建议轮廓（脖子位置是估的）。
// 被找到的鸽子画成参考图 07：哑光的灰色剪影，脖子一圈横过去的色带（绿在上、紫在下），边缘是颗粒，从脖子开始扩散。
// 屏幕上的颜色画成参考图 05 / 01：不规则的色斑，几种颜色在里面晕开，边缘颗粒溶解，慢慢扩散开。

const L = () => window.LOOKUP;

export const found = [];              // { key, photoId, height, hsl, x, y, at, seed }
const foundKeys = new Set();
const silhouettes = new Map();        // key → { canvas, fx, fy, fw, fh, neck }
const spotCanvases = new Map();       // key → [偏绿的, 偏紫的]
const photoPixels = new Map();
const sampled = new Map();            // key → hsl（框住时就取色，渗色预览要用）
let pigeonsByPhoto = new Map();
let noiseCanvas = null;
export const pending = { key: null, progress: 0, rect: null, index: -1 };

// ================================================================ 鸽子数据

export function setPigeons(photos, marks, suggestions) {
  pigeonsByPhoto = new Map();
  const useSugg = L().observe.useSuggestionsUntilMarked;
  for (const p of photos) {
    const m = marks && marks.photos && marks.photos[p.id];
    let list = [];
    if (m && (m.done || m.pigeons.length)) {
      list = m.pigeons.filter((pg) => pg.polygon && pg.polygon.length >= 3)
        .map((pg) => ({ polygon: pg.polygon, neck: pg.neck || estimateNeck(pg.polygon), marked: true }));
    } else if (useSugg && suggestions && suggestions[p.id]) {
      list = suggestions[p.id].map((s) => ({ polygon: s.polygon, neck: estimateNeck(s.polygon), marked: false }));
    }
    pigeonsByPhoto.set(p.id, list);
  }
}

// 没点脖子的：轮廓最高处往下、往中间一点（鸽子的头通常在最上面）
function estimateNeck(poly) {
  const top = poly.reduce((a, p) => (p[1] < a[1] ? p : a));
  const ys = poly.map((p) => p[1]);
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const h = Math.max(...ys) - Math.min(...ys);
  return [top[0] + (cx - top[0]) * 0.18, top[1] + h * 0.3];
}

export const pigeonsOf = (photoId) => pigeonsByPhoto.get(photoId) || [];

function inPoly([px, py], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pigeonAt(rects, sx, sy) {
  for (const r of rects) {
    if (sx < r.x || sx > r.x + r.w || sy < r.y || sy > r.y + r.h) continue;
    const q = [(sx - r.x) / r.w, (sy - r.y) / r.h];
    const list = pigeonsOf(r.item.photo.id);
    for (let i = 0; i < list.length; i++) if (inPoly(q, list[i].polygon)) return { rect: r, index: i, pigeon: list[i] };
  }
  return null;
}

// ================================================================ 找到：框的中心停在同一只鸽子上 findDwellMs

const dwell = { key: null, since: 0 };
export function updateFinding(rects, frameRect, now) {
  pending.key = null;
  if (!frameRect) { dwell.key = null; return null; }
  const cx = frameRect.x + frameRect.w / 2;
  const cy = frameRect.y + frameRect.h / 2;
  const hit = pigeonAt(rects, cx, cy);
  if (!hit) { dwell.key = null; return null; }
  const key = `${hit.rect.item.photo.id}#${hit.index}`;
  if (foundKeys.has(key)) { dwell.key = null; return hit; }
  if (dwell.key !== key) { dwell.key = key; dwell.since = now; }
  if (!sampled.has(key)) sampled.set(key, sampleNeck(hit.rect.item, hit.pigeon));
  const progress = Math.min(1, (now - dwell.since) / L().observe.findDwellMs);
  Object.assign(pending, { key, progress, index: hit.index });
  if (progress >= 1) {
    foundKeys.add(key);
    // 色斑留在鸽子脖子在屏幕上的位置
    const r = hit.rect;
    const f = { key, photoId: r.item.photo.id, height: r.item.photo.height_in, hsl: sampled.get(key),
      x: r.x + hit.pigeon.neck[0] * r.w, y: r.y + hit.pigeon.neck[1] * r.h, at: now, seed: found.length * 7919 + 13 };
    found.push(f);
    dwell.key = null;
    pending.key = null;
  }
  return { ...hit, progress };
}

// ================================================================ 取色

function pixelsOf(item) {
  const id = item.photo.id;
  if (!photoPixels.has(id)) {
    const c = document.createElement('canvas');
    c.width = item.img.naturalWidth;
    c.height = item.img.naturalHeight;
    c.getContext('2d', { willReadFrequently: true }).drawImage(item.img, 0, 0);
    photoPixels.set(id, c);
  }
  return photoPixels.get(id);
}

function sampleNeck(item, pigeon) {
  const c = pixelsOf(item);
  const r = Math.max(2, Math.round(L().observe.neckSampleRadius * c.width));
  const x = Math.round(pigeon.neck[0] * c.width);
  const y = Math.round(pigeon.neck[1] * c.height);
  const d = c.getContext('2d').getImageData(Math.max(0, x - r), Math.max(0, y - r), 2 * r, 2 * r).data;
  let R = 0, G = 0, B = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const dx = ((i / 4) % (2 * r)) - r;
    const dy = Math.floor(i / 4 / (2 * r)) - r;
    if (dx * dx + dy * dy > r * r) continue;
    R += d[i]; G += d[i + 1]; B += d[i + 2]; n++;
  }
  const [h, s, l] = rgbToHsl(R / n, G / n, B / n);
  const o = L().observe;
  return [
    s < 0.03 ? 165 : h,                                  // 几乎没有颜色时，给一个脖子上常见的绿
    Math.min(0.85, Math.max(o.minSaturation, s * o.saturationBoost)),
    Math.min(o.lightness[1], Math.max(o.lightness[0], l)),
  ];
}

// ================================================================ 被找到的鸽子（参考图 07：riso 印的鸽子）
// 干净的外轮廓；里面是喷枪一样柔和的明暗（浅灰身体、背上一团深灰）；
// 脖子两条糊开的色带（上薄荷绿、下粉）；粉脚；浅色小嘴；细颗粒。

export const STYLE = () => L().observe.silhouette;

function silhouetteFor(item, index, pigeon, hsl) {
  const key = `${item.photo.id}#${index}`;
  if (silhouettes.has(key)) return silhouettes.get(key);
  const src = pixelsOf(item);
  const W = src.width;
  const H = src.height;
  const xs = pigeon.polygon.map((p) => p[0] * W);
  const ys = pigeon.polygon.map((p) => p[1] * H);
  const bw = Math.max(...xs) - Math.min(...xs);
  const bh = Math.max(...ys) - Math.min(...ys);
  const pad = Math.max(bw, bh) * (0.06 + STYLE().blur * 2.5);   // 留出模糊晕开的地方
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  const sc = Math.min(2, 560 / Math.max(bw + 2 * pad, bh + 2 * pad));
  const cw = Math.max(2, Math.round((bw + 2 * pad) * sc));
  const ch = Math.max(2, Math.round((bh + 2 * pad) * sc));
  const pts = smooth(pigeon.polygon.map(([px, py]) => [(px * W - x0) * sc, (py * H - y0) * sc]), 1);
  const shape = new Path2D();
  pts.forEach(([a, b], i) => (i ? shape.lineTo(a, b) : shape.moveTo(a, b)));
  shape.closePath();
  const size = Math.max(cw, ch);
  const nx = (pigeon.neck[0] * W - x0) * sc;
  const ny = (pigeon.neck[1] * H - y0) * sc;
  const bx = pts.reduce((s2, p) => s2 + p[0], 0) / pts.length;
  const by = pts.reduce((s2, p) => s2 + p[1], 0) / pts.length;
  // 脖子的方向：从脖子指向头顶（轮廓最高处）。色带横过脖子，垂直于这个方向
  const head = pts.reduce((a, p) => (p[1] < a[1] ? p : a));
  let ux = head[0] - nx;
  let uy = head[1] - ny;
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul; uy /= ul;
  const st = STYLE();
  const rand = mulberry(index * 131 + item.photo.id.length * 17);

  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  const g = out.getContext('2d', { willReadFrequently: true });
  g.save();
  g.clip(shape);
  // 底色：浅灰
  g.fillStyle = st.body;
  g.fillRect(0, 0, cw, ch);
  // 背上一团深灰（远离头、偏上），喷枪一样软
  g.filter = `blur(${size * 0.09}px)`;
  let tx = bx - head[0];
  let ty = by - head[1];
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl; ty /= tl;                                   // 往尾巴的方向
  const sx = bx + tx * size * 0.12;
  const sy = by + ty * size * 0.06 - size * 0.04;
  g.fillStyle = st.shade;
  g.beginPath(); g.ellipse(sx, sy, size * 0.3, size * 0.18, Math.atan2(ty, tx), 0, Math.PI * 2); g.fill();
  // 头：有的亮有的暗（参考图上下两只不一样）
  if (rand() < 0.5) {
    g.fillStyle = st.shade;
    g.globalAlpha = 0.6;
    g.beginPath(); g.arc(head[0] - ux * size * 0.05, head[1] - uy * size * 0.05 + size * 0.04, size * 0.09, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }
  // 脖子两条色带：垂直于头的方向，上薄荷绿、下粉；颜色跟着取到的颜色稍微偏一点
  const nudge = Math.max(-1, Math.min(1, (((hsl[0] - 160 + 540) % 360) - 180) / 180));
  g.filter = `blur(${size * 0.018}px)`;
  const band = (offset, color, width) => {
    const cx = nx + ux * offset * size;
    const cy = ny + uy * offset * size;
    g.save();
    g.translate(cx, cy);
    g.rotate(Math.atan2(uy, ux));
    g.fillStyle = color;
    g.fillRect(-width * size / 2, -size * 0.18, width * size, size * 0.36);
    g.restore();
  };
  band(0.03, `hsla(${165 + nudge * 10}, 50%, 74%, 0.95)`, 0.05);    // 上：薄荷绿
  band(-0.025, `hsla(${325 + nudge * 8}, 60%, 76%, 0.9)`, 0.045);   // 下：粉
  // 嘴：头的方向最远的那一点，浅色
  const tip = pts.filter((p) => p[1] < head[1] + size * 0.18)
    .reduce((best, p) => ((p[0] - bx) * -tx + (p[1] - by) * -ty > (best[0] - bx) * -tx + (best[1] - by) * -ty ? p : best), head);
  g.filter = `blur(${size * 0.012}px)`;
  g.fillStyle = 'rgba(236,232,226,0.9)';
  g.beginPath(); g.arc(tip[0] + tx * size * 0.012, tip[1] + ty * size * 0.012, size * 0.022, 0, Math.PI * 2); g.fill();
  // 脚：轮廓最下面那一截，粉
  g.filter = `blur(${size * 0.01}px)`;
  // 只在身体正下方那一段（脚），不是整条下边缘
  const low = pts.filter((p) => Math.abs(p[0] - bx) < size * 0.22);
  const ymax = Math.max(...(low.length ? low : pts).map((p) => p[1]));
  const feet = g.createRadialGradient(bx, ymax, 0, bx, ymax, size * 0.16);
  feet.addColorStop(0, st.feet);
  feet.addColorStop(0.55, st.feet);
  feet.addColorStop(1, 'rgba(240,150,200,0)');
  g.fillStyle = feet;
  g.fillRect(bx - size * 0.2, ymax - size * 0.06, size * 0.4, size * 0.1);
  g.restore();
  g.filter = 'none';

  // 整体糊开：边缘和明暗都软下来（像缩小看时那样），再加一点很轻的颗粒
  const soft = document.createElement('canvas');
  soft.width = cw;
  soft.height = ch;
  const sg = soft.getContext('2d', { willReadFrequently: true });
  sg.filter = `blur(${size * st.blur}px)`;
  sg.drawImage(out, 0, 0);
  sg.filter = 'none';
  grainify(sg, cw, ch, st.grain, 0);

  const res = { canvas: soft, fx: x0 / W, fy: y0 / H, fw: (cw / sc) / W, fh: (ch / sc) / H, neck: [nx / cw, ny / ch] };
  silhouettes.set(key, res);
  return res;
}

// 轮廓圆滑一点（Chaikin）
function smooth(pts, n) {
  let p = pts;
  for (let k = 0; k < n; k++) {
    const q = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = q;
  }
  return p;
}

// 颗粒：亮度抖一点，边缘半透明的地方随机溶解成点（参考图 09 那种）
function grainify(g, w, h, lumAmt, edgeAmt) {
  const im = g.getImageData(0, 0, w, h);
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    if (a === 0) continue;
    const n = (Math.random() - 0.5) * lumAmt * 255;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    if (edgeAmt > 0 && a < 0.98) {
      const keep = Math.random() < Math.pow(a, 0.7);
      d[i + 3] = keep ? Math.min(255, (a + (1 - a) * edgeAmt) * 255) : a * 255 * (1 - edgeAmt);
    }
  }
  g.putImageData(im, 0, 0);
}

function averageInPolygon(src, poly, W, H) {
  const xs = poly.map((p) => p[0] * W);
  const ys = poly.map((p) => p[1] * H);
  const x0 = Math.floor(Math.min(...xs));
  const y0 = Math.floor(Math.min(...ys));
  const w = Math.max(1, Math.ceil(Math.max(...xs)) - x0);
  const h = Math.max(1, Math.ceil(Math.max(...ys)) - y0);
  const d = src.getContext('2d').getImageData(x0, y0, w, h).data;
  let R = 0, G = 0, B = 0, n = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 4000)));
  for (let yy = 0; yy < h; yy += step) {
    for (let xx = 0; xx < w; xx += step) {
      if (!inPoly([(x0 + xx) / W, (y0 + yy) / H], poly)) continue;
      const i = (yy * w + xx) * 4;
      R += d[i]; G += d[i + 1]; B += d[i + 2]; n++;
    }
  }
  return n ? [R / n, G / n, B / n] : [150, 150, 150];
}

// 在照片上画被找到的鸽子：
//   1. 从脖子开始慢慢显出模糊的剪影（silhouetteSpreadMs）
//   2. 保持鸽子的样子一段时间（holdMs）
//   3. 剪影慢慢淡去（dissolveMs），同时在它脖子的位置晕开一块颜色，贴在屏幕上（drawSpots）
// 正在框住的那只：颜色先从脖子渗出来一点
const tmp = document.createElement('canvas');
export function drawFoundOnPhoto(ctx, rect, now) {
  const id = rect.item.photo.id;
  const list = pigeonsOf(id);
  const O = L().observe;
  for (let i = 0; i < list.length; i++) {
    const key = `${id}#${i}`;
    let reveal;
    let dissolve = 0;
    const f = foundKeys.has(key) ? found.find((x) => x.key === key) : null;
    if (f) {
      const e = now - f.at;
      reveal = Math.min(1, e / O.silhouetteSpreadMs) * 0.65 + 0.35;
      dissolve = Math.max(0, Math.min(1, (e - O.silhouetteSpreadMs - O.holdMs) / O.dissolveMs));
    } else if (pending.key === key) {
      reveal = pending.progress * 0.35;
    } else continue;
    const s = silhouetteFor(rect.item, i, list[i], sampled.get(key) || [160, 0.6, 0.5]);
    const dx = rect.x + s.fx * rect.w;
    const dy = rect.y + s.fy * rect.h;
    const dw = s.fw * rect.w;
    const dh = s.fh * rect.h;
    const nx = dx + s.neck[0] * dw;
    const ny = dy + s.neck[1] * dh;
    const prevA = ctx.globalAlpha;
    const prevF = ctx.filter;

    // 剪影：散开的时候越来越糊、越来越大、越来越淡
    const silA = 1 - ease(dissolve);
    if (silA > 0.01) {
      ctx.globalAlpha = prevA * STYLE().alpha * silA;
      if (dissolve > 0) {
        const grow = 1 + 0.35 * dissolve;
        ctx.filter = `blur(${(dissolve * Math.max(dw, dh) * 0.08).toFixed(1)}px)`;
        ctx.drawImage(s.canvas, nx - (nx - dx) * grow, ny - (ny - dy) * grow, dw * grow, dh * grow);
        ctx.filter = prevF;
      } else if (reveal >= 0.999) {
        ctx.drawImage(s.canvas, dx, dy, dw, dh);
      } else {
        // 显出来：以脖子为中心，一个软边的圆慢慢变大
        tmp.width = s.canvas.width;
        tmp.height = s.canvas.height;
        const t = tmp.getContext('2d');
        t.clearRect(0, 0, tmp.width, tmp.height);
        t.drawImage(s.canvas, 0, 0);
        t.globalCompositeOperation = 'destination-in';
        const mx = s.neck[0] * tmp.width;
        const my = s.neck[1] * tmp.height;
        const R = Math.max(tmp.width, tmp.height) * (0.05 + 1.2 * ease(reveal));
        const m = t.createRadialGradient(mx, my, 0, mx, my, R);
        m.addColorStop(0, 'rgba(0,0,0,1)');
        m.addColorStop(0.6, 'rgba(0,0,0,0.8)');
        m.addColorStop(1, 'rgba(0,0,0,0)');
        t.fillStyle = m;
        t.fillRect(0, 0, tmp.width, tmp.height);
        t.globalCompositeOperation = 'source-over';
        ctx.drawImage(tmp, dx, dy, dw, dh);
      }
    }

    // 记下它脖子现在在屏幕上的位置：剪影淡去时，颜色就从这里晕开（见 updateSpots）
    if (f && ctx.getTransform().a === devicePixelRatio) { f.lx = nx; f.ly = ny; }
    ctx.globalAlpha = prevA;
  }
}

// 每帧调用：保持够久的鸽子，开始在屏幕上晕开颜色（就算照片已经滚出屏幕也一样）
export function updateSpots(now, W, H) {
  const O = L().observe;
  for (const f of found) {
    if (f.spotAt != null || now - f.at < O.silhouetteSpreadMs + O.holdMs) continue;
    f.spotAt = now;
    const m = 60;
    f.x = Math.max(m, Math.min(W - m, f.lx ?? f.x));
    f.y = Math.max(m, Math.min(H - m, f.ly ?? f.y));
  }
}

// 一个点的样子（颗粒、边缘溶解；羽毛图纸也用它）
export function dotCanvas(f) {
  return spotFor(f)[0];
}

// 给飞走的鸽子用：这只鸽子的颜色
export function foundList() { return found; }

// ================================================================ 屏幕上的颜色（参考图 05 / 01）

function spotFor(f) {
  if (spotCanvases.has(f.key)) return spotCanvases.get(f.key);
  const S = L().spots;
  const R = S.radiusPx;
  const make = (shift) => {
    const size = Math.round(R * 2.8);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d', { willReadFrequently: true });
    const rand = mulberry(f.seed);
    const [h, s, l] = f.hsl;
    g.filter = `blur(${R * 0.16}px)`;
    // 几块大小不一的颜色叠在一起，形状不规则
    const blobs = 6 + Math.floor(rand() * 3);
    for (let i = 0; i < blobs; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * R * 0.42;
      const r = R * (0.32 + rand() * 0.42);
      const x = size / 2 + Math.cos(a) * d;
      const y = size / 2 + Math.sin(a) * d;
      const hh = h + shift + (rand() - 0.5) * 34;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `hsla(${hh}, ${s * 100}%, ${(l + (rand() - 0.5) * 0.12) * 100}%, 0.85)`);
      gr.addColorStop(0.7, `hsla(${hh + 14}, ${s * 90}%, ${l * 100}%, 0.45)`);
      gr.addColorStop(1, `hsla(${hh + 24}, ${s * 80}%, ${l * 100}%, 0)`);
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // 一小块更深的核（参考图 01 的那种）
    const kx = size / 2 + (rand() - 0.5) * R * 0.5;
    const ky = size / 2 + (rand() - 0.5) * R * 0.5;
    const kr = R * (0.16 + rand() * 0.12);
    const kg = g.createRadialGradient(kx, ky, 0, kx, ky, kr);
    kg.addColorStop(0, `hsla(${h + shift + 40}, ${s * 100}%, ${Math.max(0.2, l - 0.18) * 100}%, 0.7)`);
    kg.addColorStop(1, `hsla(${h + shift + 40}, ${s * 100}%, ${Math.max(0.2, l - 0.18) * 100}%, 0)`);
    g.fillStyle = kg;
    g.beginPath(); g.arc(kx, ky, kr, 0, Math.PI * 2); g.fill();
    g.filter = 'none';
    grainify(g, size, size, 0.16, 0.5);
    return c;
  };
  const pair = [make(-S.hueShiftDeg), make(S.hueShiftDeg)];
  spotCanvases.set(f.key, pair);
  return pair;
}

// 色斑：慢慢晕开（spreadMs），之后极轻地呼吸；转头时在偏绿和偏紫两张之间过渡（结构色）
export function drawSpots(ctx, yaw, now, ink, fmtHeight, labelFont) {
  const S = L().spots;
  const t = Math.max(-1, Math.min(1, (yaw || 0) / S.yawMaxDeg)) * 0.5 + 0.5;
  for (const f of found) {
    if (f.spotAt == null) continue;                    // 还在保持鸽子的样子
    const p = Math.min(1, (now - f.spotAt) / S.spreadMs);
    const e = ease(p);
    const breathe = 1 + 0.025 * Math.sin(now / 2600 + f.seed);
    const [a, b] = spotFor(f);
    const size = a.width * (0.25 + 0.75 * e) * breathe;
    ctx.save();
    ctx.globalAlpha = Math.pow(p, 0.6) * (1 - t);
    ctx.drawImage(a, f.x - size / 2, f.y - size / 2, size, size);
    ctx.globalAlpha = Math.pow(p, 0.6) * t;
    ctx.drawImage(b, f.x - size / 2, f.y - size / 2, size, size);
    // 细线圆圈 + 极小的高度（晕开一半之后才出现）
    const la = Math.max(0, (p - 0.45) / 0.55);
    if (la > 0) {
      ctx.globalAlpha = la;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 0.6;
      const rr = S.radiusPx * S.ringRatio;
      const ox = f.x + rr * 0.3;
      const oy = f.y - rr * 0.2;
      ctx.beginPath(); ctx.arc(ox, oy, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.font = labelFont;
      ctx.fillStyle = ink;
      ctx.textBaseline = 'middle';
      ctx.fillText(fmtHeight(f.height), ox + rr + 6, oy);
    }
    ctx.restore();
  }
}

// ================================================================ 工具

export function noise() {
  if (noiseCanvas) return noiseCanvas;
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d');
  const d = g.createImageData(160, 160);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.random() * 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 90;
  }
  g.putImageData(d, 0, 0);
  noiseCanvas = c;
  return c;
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ease = (t) => 1 - Math.pow(1 - t, 3);

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

// 调试：在控制台看某张照片里鸽子的剪影（不算找到）
export function previewSilhouette(item, index) {
  const pg = pigeonsOf(item.photo.id)[index];
  const key = `${item.photo.id}#${index}`;
  if (!sampled.has(key)) sampled.set(key, sampleNeck(item, pg));
  return silhouetteFor(item, index, pg, sampled.get(key));
}
