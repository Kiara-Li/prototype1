// Look Up · 最高处：这一路找到的鸽子变成飞鸽，扇着翅膀飞进天空，越飞越远。
// 样子和被找到的鸽子一样（参考图 07 的 riso 风格：浅灰、柔和的深灰、脖子薄荷绿 + 粉、细颗粒）。
// 翅膀的动作参考 Kiara 给的飞鸽剪影序列：翅膀高举 → 平展 → 压下 → 收回，循环。

import { noise } from './observe.js';

const L = () => window.LOOKUP;

// 每只找到的鸽子一只飞鸽；从屏幕下面升起来，顺着风飞走
export function createFlock(found, W, H, wind) {
  const F = L().flight;
  const rand = mulberry(found.length * 31 + 7);
  return found.map((f, i) => {
    const x0 = W * (0.15 + rand() * 0.7);
    const dir = wind.x >= 0 ? 1 : -1;
    return {
      x0,
      y0: H * (1.05 + rand() * 0.15),
      dx: (wind.x * 0.5 + dir * 0.15 + (rand() - 0.5) * 0.3) * W,
      dy: -H * (1.25 + rand() * 0.3),
      delay: i * F.staggerMs + rand() * 400,
      phase: rand() * Math.PI * 2,
      hz: F.flapHz * (0.85 + rand() * 0.3),
      size: F.sizePx * (0.75 + rand() * 0.5),
      wobble: rand() * Math.PI * 2,
      hue: f.hsl[0],
    };
  });
}

export function flockDone(birds, t) {
  const F = L().flight;
  return birds.every((b) => t - b.delay > F.flyMs);
}

const off = document.createElement('canvas');

export function drawFlock(ctx, birds, t) {
  const F = L().flight;
  for (const b of birds) {
    const p = (t - b.delay) / F.flyMs;
    if (p <= 0 || p >= 1) continue;
    const e = 1 - Math.pow(1 - p, 1.6);
    const x = b.x0 + b.dx * e + Math.sin(p * Math.PI * 2 + b.wobble) * 18;
    const y = b.y0 + b.dy * e;
    const scale = b.size * (1 - 0.6 * e);                       // 越飞越远，越来越小
    const face = b.dx >= 0 ? 1 : -1;
    const tilt = -0.35 + Math.sin(p * 6 + b.wobble) * 0.08;      // 往上飞，头朝上一点
    // 扇翅膀：开始扇得急，后面越来越多滑翔
    const flap = Math.sin((t / 1000) * b.hz * Math.PI * 2 + b.phase);
    const glide = Math.min(1, p * 1.4);
    const wing = flap * (1 - 0.55 * glide) * 1.15 + 0.15 * glide;
    const alpha = Math.min(1, p * 6) * (1 - Math.max(0, (p - 0.8) / 0.2));
    drawBird(ctx, x, y, scale, face, tilt, wing, b.hue, alpha);
  }
}

// 一只飞鸽（侧面），本地坐标：身体中心 (0,0)，头朝 +x，长度 1
function drawBird(ctx, x, y, size, face, tilt, wing, hue, alpha) {
  const S = Math.ceil(size * 2.4);
  off.width = S;
  off.height = S;
  const g = off.getContext('2d');
  g.translate(S / 2, S / 2);
  g.scale(size * face, size);
  g.rotate(tilt);                                              // 镜像之后旋转方向也跟着反过来，所以不乘 face

  const st = L().observe.silhouette;
  // 翅膀：k = 1 高举，0 平展，-1 压下。后缘有几根飞羽的锯齿（参考飞鸽剪影）
  const wingPath = (k, dx) => {
    const up = Math.max(-1, Math.min(1.2, k));
    const P = (x, y) => [x + dx, y];
    const pts = [
      P(0.16, -0.06),                                           // 翼根前
      P(0.1, -0.48 * up - 0.04),                                // 前缘
      P(-0.06, -0.86 * up - 0.02),                              // 翼尖
      P(-0.14, -0.8 * up + 0.01), P(-0.16, -0.72 * up),         // 飞羽
      P(-0.23, -0.66 * up + 0.02), P(-0.24, -0.56 * up + 0.01),
      P(-0.3, -0.5 * up + 0.03), P(-0.3, -0.4 * up + 0.02),
      P(-0.34, -0.3 * up + 0.04),
      P(-0.26, -0.12 * up + 0.04),
      P(-0.16, -0.03),                                          // 翼根后
    ];
    const p = new Path2D();
    p.moveTo(pts[0][0], pts[0][1]);
    p.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
    for (let i = 3; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    p.closePath();
    return p;
  };
  const body = new Path2D();
  body.ellipse(-0.02, 0.02, 0.34, 0.14, 0, 0, Math.PI * 2);   // 身体
  body.ellipse(0.17, 0.03, 0.19, 0.14, 0, 0, Math.PI * 2);     // 饱满的胸口
  body.moveTo(0.5, -0.07);
  body.arc(0.41, -0.07, 0.095, 0, Math.PI * 2);                // 头
  body.moveTo(-0.28, -0.04);                                   // 扇形的短尾巴
  body.quadraticCurveTo(-0.46, -0.1, -0.6, -0.11);
  body.lineTo(-0.64, -0.02);
  body.lineTo(-0.6, 0.07);
  body.quadraticCurveTo(-0.46, 0.08, -0.28, 0.08);
  body.closePath();

  // 远处那只翅膀：暗一点
  g.fillStyle = shadeOf(st.body, -26);
  g.fill(wingPath(wing * 0.9 - 0.08, -0.04));
  // 身体
  g.fillStyle = st.body;
  g.fill(body);
  // 身体上的柔和深灰 + 脖子两条色带（只在身体里面）
  g.save();
  g.clip(body);
  g.filter = 'blur(0.06px)';
  const sh = g.createRadialGradient(-0.12, -0.04, 0, -0.12, -0.04, 0.38);
  sh.addColorStop(0, 'rgba(96,98,104,0.55)');
  sh.addColorStop(1, 'rgba(96,98,104,0)');
  g.fillStyle = sh;
  g.fillRect(-1, -1, 2, 2);
  const nudge = Math.max(-1, Math.min(1, (((hue - 160 + 540) % 360) - 180) / 180));
  const band = g.createLinearGradient(0.38, 0, 0.18, 0);
  band.addColorStop(0, `hsla(${165 + nudge * 10}, 52%, 72%, 0)`);
  band.addColorStop(0.25, `hsla(${165 + nudge * 10}, 52%, 72%, 0.95)`);
  band.addColorStop(0.6, `hsla(${325 + nudge * 8}, 62%, 74%, 0.9)`);
  band.addColorStop(1, `hsla(${325 + nudge * 8}, 62%, 74%, 0)`);
  g.fillStyle = band;
  g.fillRect(0.12, -0.3, 0.3, 0.6);
  g.restore();
  // 嘴
  g.fillStyle = 'rgba(236,232,226,0.95)';
  g.beginPath(); g.moveTo(0.49, -0.09); g.lineTo(0.57, -0.06); g.lineTo(0.49, -0.04); g.closePath(); g.fill();
  // 近处那只翅膀
  const wp = wingPath(wing, 0);
  g.fillStyle = st.body;
  g.fill(wp);
  g.save();
  g.clip(wp);
  const ws = g.createLinearGradient(0, 0, -0.3, -0.7 * wing);
  ws.addColorStop(0, 'rgba(96,98,104,0)');
  ws.addColorStop(1, 'rgba(96,98,104,0.45)');
  g.fillStyle = ws;
  g.fillRect(-1, -1, 2, 2);
  g.restore();

  // 细颗粒（只在鸽子身上）
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 0.5;
  g.fillStyle = g.createPattern(noise(), 'repeat');
  g.fillRect(0, 0, S, S);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.globalAlpha = alpha * st.alpha;
  ctx.filter = `blur(${size * st.blur}px)`;                    // 和被找到的鸽子一样糊开
  ctx.drawImage(off, x - S / 2, y - S / 2);
  ctx.restore();
}

function shadeOf(hexColor, d) {
  const n = parseInt(hexColor.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, v + d)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
