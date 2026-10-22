// Look Up · 书的跨页（和 Sightline 页面同一套数据：../data/groups.json，从 book.pdf 拆出来的）
//
// 跨页 828 × 702pt，居中放在屏幕上；照片底边对齐基线，竖排小图注，组号。
// 照片照原样画（不加滤镜、不模糊）。历史照片：config.book.historicalPhotos = false 时用一块浅灰色代替。
// 找鸽子用的矩形（spreadRects）和 observe.js 的格式一样：{ x, y, w, h, item: { photo, img } }。

const idOf = (file) => file.replace(/^.*\//, '').replace(/\.\w+$/, '');

// photoItems：Look Up 自己的照片（id → { photo, img }），书里同一张照片直接用它，图片只加载一次
export async function loadBook(photoItems) {
  const data = await (await fetch('../data/groups.json', { cache: 'no-cache' })).json();
  const groups = new Map();
  for (const g of data.groups) {
    const images = g.images.map((im) => {
      if (im.kind !== 'own') {
        const img = new Image();
        img.src = `../data/${im.file}`;
        return { ...im, own: false, img };
      }
      const id = idOf(im.file);
      let item = photoItems.get(id);
      if (!item) {
        const img = new Image();
        img.src = `../data/${im.file}`;
        item = { photo: { id, height_in: g.height_in, caption: im.caption }, img };
      }
      return { ...im, own: true, item };
    });
    // 翻页动画的先后：从左到右
    [...images].sort((a, b) => a.x - b.x || a.y - b.y).forEach((im, i) => { im.order = i; });
    groups.set(g.id, { ...g, images });
  }
  return { spread: data.spread, groups };
}

// 跨页放在屏幕中间：左边留出高度尺的位置
export function bookLayout(book, W, H, B) {
  const sw = book.spread.w;
  const sh = book.spread.h;
  const s = Math.min((W - 2 * B.sidePx) / sw, (H - 2 * B.marginY) / sh);
  const w = sw * s;
  const h = sh * s;
  return { s, w, h, ox: (W - w) / 2, oy: (H - h) / 2 };
}

// 这一组的基线在屏幕上的 y（不移动时）
export const baselineOf = (g, L) => L.oy + g.baseline_y * L.s;

// 自己拍的照片在屏幕上的位置（找鸽子用）；dy = 整个跨页的纵向位移
export function spreadRects(g, L, baselineY) {
  const s = L.s;
  const Y = (y) => baselineY - (g.baseline_y - y) * s;
  return g.images.filter((im) => im.own).map((im) => ({
    item: im.item, x: L.ox + im.x * s, y: Y(im.y), w: im.w * s, h: im.h * s, base: Y(im.y + im.h), alpha: 1, main: true,
  }));
}

// 翻页：黑色方块（和 dashboard 上的字一样）。一张一张从左到右：
//   in   方块从左边拉出来盖住这张的位置 → 收向右边，露出照片
//   out  方块从左边拉出来盖住照片 → 照片没了，方块收向右边
// 返回 { show, bar }：bar = [从, 到]（宽度的比例）或 null
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export function revealAt(r, i) {
  if (!r) return { show: true, bar: null };
  const k = (r.now - r.start - i * r.stagger) / r.dur;
  const on = r.mode === 'in';
  if (k <= 0) return { show: !on, bar: null };
  if (k < 1) return { show: !on, bar: [0, ease(k)] };
  if (k < 2) return { show: on, bar: [ease(k - 1), 1] };
  return { show: on, bar: null };
}
// 整个翻页动画要多久
export const revealTotal = (g, r) => (Math.max(1, g.images.length) - 1) * r.stagger + 2 * r.dur;

// 画一个跨页。drawOnPhoto(rect)：在照片上再画东西（被找到的鸽子）；o.reveal：翻页动画
export function drawSpread(ctx, g, L, baselineY, alpha, o) {
  if (alpha <= 0) return;
  const s = L.s;
  const Y = (y) => baselineY - (g.baseline_y - y) * s;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const im of g.images) {
    const x = L.ox + im.x * s;
    const y = Y(im.y);
    const w = im.w * s;
    const h = im.h * s;
    const rv = revealAt(o.reveal, im.order);
    if (rv.bar) {
      ctx.fillStyle = o.bar || o.ink;
      ctx.fillRect(x + rv.bar[0] * w, y, (rv.bar[1] - rv.bar[0]) * w, h);
    }
    if (!rv.show) continue;
    if (im.own) {
      const img = im.item.img;
      if (img.complete && img.naturalWidth) ctx.drawImage(img, x, y, w, h);
      if (o.drawOnPhoto) o.drawOnPhoto({ item: im.item, x, y, w, h });
    } else if (o.historicalPhotos && im.img.complete && im.img.naturalWidth) {
      ctx.drawImage(im.img, x, y, w, h);
    } else {
      ctx.fillStyle = o.historical;
      ctx.fillRect(x, y, w, h);
    }
    if (rv.bar) {
      ctx.fillStyle = o.bar || o.ink;
      ctx.fillRect(x + rv.bar[0] * w, y, (rv.bar[1] - rv.bar[0]) * w, h);
    }
    if (im.caption && o.captions) verticalText(ctx, im.caption, L.ox + im.caption_x * s, Y(im.caption_bottom), 5 * s, o.sans, o.ink);
  }
  const np = g.number_pos;
  if (np && o.numbers && revealAt(o.reveal, 0).show) verticalText(ctx, g.id, L.ox + np.x * s, Y(np.y + np.h), 7 * s, o.mono, o.ink);
  ctx.restore();
}

// 贯穿屏幕的基线
export function drawBaseline(ctx, g, L, baselineY, W, ink, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(0.5, (g.baseline_width || 0.5) * L.s);
  const y = Math.round(baselineY * 2) / 2;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(W, y);
  ctx.stroke();
  ctx.restore();
}

// 竖排：旋转 90°，从下往上读。(x, bottom) 是文字列的左边缘和下端。
function verticalText(ctx, text, x, bottom, sizePx, family, ink) {
  ctx.save();
  ctx.translate(x, bottom);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = ink;
  ctx.font = `${sizePx}px ${family}`;
  ctx.textBaseline = 'top';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// 天空：一张飞行照片做成一页。照片尽量大（不全屏），底边在页面下边的基线上，竖排图注在右边，和书一样
export function skySpread(item, spread) {
  const m = 22.5;                                    // 书里的页边
  const base = spread.h - m;
  const [pw, ph] = item.photo.px || [item.img.naturalWidth || 4, item.img.naturalHeight || 3];
  const k = Math.min((spread.w - 2 * m - 10) / pw, (base - m) / ph);
  const w = pw * k;
  const h = ph * k;
  const x = m;
  return {
    id: '', sky: true, height_in: item.photo.height_in, baseline_y: base, baseline_width: 0.5, number_pos: null,
    images: [{ own: true, item, x, y: base - h, w, h, order: 0, caption: item.photo.caption, caption_x: x + w + 1.5, caption_bottom: base - 1 }],
  };
}
