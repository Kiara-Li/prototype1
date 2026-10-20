// Look Up · 竖向空间：照片按高度放在一条连续的竖线上，镜头在里面上下移动。
//
// 世界坐标 Y（px，向上为正）：Y = k · log(1 + h / h0)。同一高度的照片排成一行，底边对齐在一条细基线上。
// 相邻两行太近（会叠在一起）时，把上面那行往上推开一点；高度尺用同一套映射，所以照片永远对着它真实的高度。

const L = () => window.LOOKUP;

export function createWorld(photos) {
  const sorted = [...photos].sort((a, b) => a.height_in - b.height_in || a.id.localeCompare(b.id));
  const mk = (p) => { const img = new Image(); img.decoding = 'async'; img.src = p.src; return { photo: p, img }; };
  let rows;
  if (L().rows.sameHeight === 'stack') {
    // 同一高度的上下排开：一张照片一行
    rows = sorted.map((p) => ({ h: p.height_in, items: [mk(p)] }));
  } else {
    // 同一高度只放一张，隔一段时间换成同一高度的另一张
    const by = new Map();
    for (const p of sorted) {
      if (!by.has(p.height_in)) by.set(p.height_in, []);
      by.get(p.height_in).push(mk(p));
    }
    rows = [...by.entries()].map(([h, items]) => ({ h, items }));
  }
  rows.forEach((r, i) => { r.index = i; r.phase = (i * 0.37) % 1; });
  return { rows, knots: [], k: 1, photoH: 100, W: 0, H: 0, topY: 0, clock: 0 };
}

// 换照片的时钟：取景框在用的时候停住（main.js 每帧调用）
export function tickWorld(world, dt, hold) {
  if (!hold) world.clock += dt;
}

// ---- 高度 ↔ 世界坐标

const curve = (h) => Math.log(1 + h / L().world.curveH0);

export function layoutWorld(world, W, H) {
  const c = L();
  world.W = W;
  world.H = H;
  world.photoH = Math.round(c.rows.photoVh * H);
  world.k = (c.world.journeyScreens * H) / curve(c.world.topInches);
  // 每张照片占一个「屏」：相邻两张至少隔 slotVh 个屏幕高，所以屏幕上大概只有一张
  const slot = c.rows.slotVh * H;
  world.knots = [];
  let last = -Infinity;
  for (const row of world.rows) {
    const y = Math.max(world.k * curve(row.h), last + slot);
    row.y = y;
    world.knots.push({ h: row.h, y });
    last = y;
  }
  world.topY = heightToY(world, c.world.topInches);

  // 照片尺寸：高 photoVh，太宽的（全景）就按宽度缩
  const maxW = W - 2 * c.rows.marginPx;
  for (const row of world.rows) {
    for (const it of row.items) {
      const [pw, ph] = it.photo.px || [4, 3];
      let h = world.photoH;
      let w = (h * pw) / ph;
      if (w > maxW) { w = maxW; h = (w * ph) / pw; }
      it.w = Math.round(w);
      it.h = Math.round(h);
    }
  }
}

export function heightToY(world, h) {
  const ks = world.knots;
  const ch = curve(h);
  if (!ks.length) return world.k * ch;
  if (h <= ks[0].h) return ks[0].y;
  for (let i = 1; i < ks.length; i++) {
    if (h <= ks[i].h) {
      const a = ks[i - 1];
      const b = ks[i];
      const t = (ch - curve(a.h)) / (curve(b.h) - curve(a.h) || 1);
      return a.y + t * (b.y - a.y);
    }
  }
  const last = ks[ks.length - 1];
  return last.y + world.k * (ch - curve(last.h));
}

export function yToHeight(world, y) {
  let lo = 0;
  let hi = L().world.topInches * 1.05;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (heightToY(world, mid) < y) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// 世界坐标 → 屏幕 y
export const screenY = (world, camY, y) => L().world.anchor * world.H - (y - camY);

// 这一帧每张照片在屏幕上的位置
export function photoRects(world, camY) {
  const c = L().rows;
  const cycle = c.cycleSec * 1000;
  const fade = c.cycleFadeMs;
  const out = [];
  for (const row of world.rows) {
    const base = screenY(world, camY, row.y);
    const tall = Math.max(...row.items.map((it) => it.h));
    if (base < -40 || base - tall > world.H + 40) continue;
    const n = row.items.length;
    const put = (it, alpha, main) => out.push({ row, item: it, x: (world.W - it.w) / 2, y: base - it.h, w: it.w, h: it.h, base, alpha, main });
    if (n === 1) { put(row.items[0], 1, true); continue; }
    // 同一高度的几张轮流出现，交叉淡入淡出
    const t = world.clock + row.phase * cycle;
    const k = Math.floor(t / cycle);
    const into = t - k * cycle;
    const cur = row.items[k % n];
    if (into < fade && k > 0) {
      const prev = row.items[(k - 1) % n];
      const a = into / fade;
      put(prev, 1 - a, a < 0.5);
      put(cur, a, a >= 0.5);
    } else put(cur, 1, true);
  }
  return out;
}

// ---- 高度的写法：英寸 → 英尺 → 米

export function fmtHeight(h) {
  if (Math.round(h) < 120) return `${Math.round(h)}″`;
  if (Math.round(h / 12) < 328) return `${Math.round(h / 12)}′`;
  return `${Math.round(h * 0.0254)} m`;
}

// 高度尺上的刻度：低处用英寸，往上换成英尺，再换成米
function rulerTicks() {
  const t = [];
  for (let h = 0; h < 120; h += 6) t.push({ h, major: h % 12 === 0, label: `${h}″` });
  for (let ft = 10; ft < 330; ft += 5) t.push({ h: ft * 12, major: ft % 10 === 0, label: `${ft}′` });
  for (let m = 100; m <= 1000; m += 50) t.push({ h: m / 0.0254, major: m % 100 === 0, label: `${m} m` });
  return t;
}
const TICKS = rulerTicks();

// 左边的高度尺。alpha：到天空时慢慢消失
export function drawRuler(ctx, world, camY, h, ink, alpha, labelFont) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 0.75;
  ctx.font = labelFont;
  ctx.textBaseline = 'middle';
  let lastY = Infinity;
  let lastLabel = Infinity;
  ctx.beginPath();
  for (const tk of TICKS) {
    const y = Math.round(screenY(world, camY, heightToY(world, tk.h)) * 2) / 2;
    if (y < -10 || y > world.H + 10) continue;
    if (Math.abs(lastY - y) < 5) continue;
    lastY = y;
    ctx.moveTo(0, y);
    ctx.lineTo(tk.major ? 22 : 9, y);
    if (tk.major && Math.abs(lastLabel - y) > 16) {
      ctx.fillText(tk.label, 28, y);
      lastLabel = y;
    }
  }
  ctx.stroke();
  // 当前高度
  const ay = L().world.anchor * world.H;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, ay); ctx.lineTo(44, ay); ctx.stroke();
  ctx.fillText(fmtHeight(h), 50, ay - 9);
  ctx.restore();
}
