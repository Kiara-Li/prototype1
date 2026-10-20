// Look Up · 羽毛：用这一路收集到的颜色画一根羽毛；存在这台电脑上（IndexedDB），下一个人在地面上能看到。
// 羽毛图纸（阶段 E）现在只是示意：正面颜色渐变，背面高度 / 答案 / 日期，折线是单独的一层 SVG（assets/fold-lines.svg）。

import { noise, dotCanvas } from './observe.js';

const L = () => window.LOOKUP;

// ---- 画一根羽毛：中间一根羽轴，两边羽片一边窄一边宽，颜色沿着羽毛流动

export function featherColors(found) {
  if (!found.length) return ['hsl(40, 8%, 92%)', 'hsl(210, 6%, 82%)'];   // 一个都没找到：灰白
  return found.map((f) => `hsl(${f.hsl[0]}, ${f.hsl[1] * 100}%, ${f.hsl[2] * 100}%)`);
}

export function drawFeather(ctx, x, y, angle, len, width, colors, seed = 1) {
  const rand = mulberry(seed);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // 羽片轮廓（羽毛沿 -y 方向，根部在 0,0）
  const vane = new Path2D();
  const steps = 24;
  const right = [];
  const left = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;                                  // 0 根部 → 1 尖
    const yy = -len * (0.12 + 0.88 * t);
    const w = width * Math.sin(Math.PI * Math.pow(t, 0.75)) * (0.92 + 0.08 * Math.sin(t * 9 + seed));
    right.push([w * 0.62, yy]);
    left.push([-w * 0.38, yy]);
  }
  vane.moveTo(0, -len * 0.12);
  right.forEach(([px, py]) => vane.lineTo(px, py));
  left.reverse().forEach(([px, py]) => vane.lineTo(px, py));
  vane.closePath();

  // 颜色沿着羽毛
  const grad = ctx.createLinearGradient(0, 0, 0, -len);
  colors.forEach((c, i) => grad.addColorStop(colors.length === 1 ? 0.5 : i / (colors.length - 1), c));
  ctx.filter = 'blur(0.6px)';
  ctx.fillStyle = grad;
  ctx.fill(vane);
  ctx.filter = 'none';

  // 颗粒 + 羽枝的细缝
  ctx.save();
  ctx.clip(vane);
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = ctx.createPattern(noise(), 'repeat');
  ctx.fillRect(-width, -len, width * 2, len);
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 7; i++) {
    const yy = -len * (0.25 + rand() * 0.65);
    const side = rand() > 0.4 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(side * width, yy - width * 0.9);
    ctx.stroke();
  }
  ctx.restore();

  // 羽轴：一根细线
  ctx.strokeStyle = 'rgba(40,40,40,0.55)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(width * 0.04, -len * 0.5, 0, -len * 0.98);
  ctx.stroke();
  ctx.restore();
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- 地面上的羽毛（IndexedDB）

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(L().storage.feathersDb, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('feathers', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction('feathers', mode);
    const r = fn(t.objectStore('feathers'));
    t.oncomplete = () => resolve(r && r.result);
    t.onerror = () => reject(t.error);
  });
}
export const feathers = {
  all: () => tx('readonly', (s) => s.getAll()).catch(() => []),
  add: (f) => tx('readwrite', (s) => s.put(f)).catch(() => {}),
  clear: () => tx('readwrite', (s) => s.clear()).catch(() => {}),
};

// ---- 羽毛图纸（示意）：正方形，正面 + 背面

const SHEET = 1200;

function loadSvg(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

export async function renderSheets({ found, answers, questions, date, fmtHeight }) {
  const fold = await loadSvg('assets/fold-lines.svg');
  const colors = featherColors(found);

  // 正面：收集到的颜色做成带颗粒的渐变（每个人不一样）
  const front = document.createElement('canvas');
  front.width = front.height = SHEET;
  let g = front.getContext('2d');
  g.fillStyle = '#efede7';
  g.fillRect(0, 0, SHEET, SHEET);
  const rand = mulberry(found.length * 97 + 13);
  g.filter = 'blur(60px)';
  colors.forEach((c) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(SHEET * (0.15 + rand() * 0.7), SHEET * (0.15 + rand() * 0.7), SHEET * (0.18 + rand() * 0.14), 0, Math.PI * 2);
    g.fill();
  });
  g.filter = 'none';
  g.globalAlpha = 0.6;
  g.fillStyle = g.createPattern(noise(), 'repeat');
  g.fillRect(0, 0, SHEET, SHEET);
  g.globalAlpha = 1;
  // 每只找到的鸽子一个点，按高度放进格子里（参考图 02）
  const cells = 4;
  const cell = (SHEET - 200) / cells;
  [...found].sort((a, b) => a.height - b.height).slice(0, cells * cells).forEach((f, i) => {
    const cx = 100 + cell * (i % cells) + cell / 2;
    const cy = 100 + cell * Math.floor(i / cells) + cell / 2;
    const d = cell * 0.42;
    g.drawImage(dotCanvas(f), cx - d / 2, cy - d / 2, d, d);
  });
  if (fold) g.drawImage(fold, 0, 0, SHEET, SHEET);

  // 背面：高度、答案、日期（折好后藏在里面）
  const back = document.createElement('canvas');
  back.width = back.height = SHEET;
  g = back.getContext('2d');
  g.fillStyle = '#f4f2ec';
  g.fillRect(0, 0, SHEET, SHEET);
  g.fillStyle = '#1d1d1b';
  g.font = '22px "TWK Everett Mono", Menlo, monospace';
  let y = 190;
  const line = (t, dy = 34) => { g.fillText(t, 140, y); y += dy; };
  line(date, 60);
  line(window.CONTENT.sheet.heights, 40);
  if (found.length) found.forEach((f) => line(`○  ${fmtHeight(f.height)}`));
  else line(window.CONTENT.sheet.none);
  y += 30;
  line(window.CONTENT.sheet.answers, 40);
  const qa = questions.map((q, i) => [q, answers[i]]).filter(([, a]) => a);
  if (qa.length) qa.forEach(([q, a]) => { line(q, 30); line(`— ${a}`, 46); });
  else line(window.CONTENT.sheet.none);
  if (fold) g.drawImage(fold, 0, 0, SHEET, SHEET);
  return { front, back };
}

export function downloadCanvas(c, name) {
  c.toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

// 打印：两页正方形（正面、背面）。存成 PDF 用打印对话框里的「存储为 PDF」
export function printSheets({ front, back }) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><title>Feather</title><style>
    @page { size: 200mm 200mm; margin: 0; }
    html, body { margin: 0; }
    img { display: block; width: 200mm; height: 200mm; page-break-after: always; }
  </style><img src="${front.toDataURL('image/png')}"><img src="${back.toDataURL('image/png')}">
  <script>window.onload = () => setTimeout(() => window.print(), 300);<\/script>`);
  w.document.close();
}
