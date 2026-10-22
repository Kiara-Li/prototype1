// Look Up · 主程序
//
// 状态：dashboard → intro（两只手移开、窗口打开）→ calibrate（平视）→ ascent（抬头 = 上升速度）
//       → top（最高处）→ falling（羽毛落下，镜头跟着回到地面）→ lastline → end（回到 dashboard）
//
// 按键：↑ ↓ 上升 / 下降（备用）· 滚轮 · 鼠标拖出一个框（代替手势）· Esc 去掉框
//      C 重新校准 · D 摄像头小窗 · F 全屏 · X 清空地面上的羽毛（dashboard，按 Y 确认）
// URL 加 ?input=keys：不开摄像头，直接用备用控制。?debug：显示调试数值。?device=mobile / desktop：强制手机 / 电脑模式。
//
// 输入和画面分开：电脑端（input/desktop.js：摄像头、手势、键盘、鼠标）和手机端（input/mobile.js：陀螺仪、捏合、拖动）
// 都只写 input/state.js 里的 lookValue、zoomValue、frame…；下面的画面只读这些值。

import { createWorld, layoutWorld, tickWorld, heightToY, yToHeight, screenY, photoRects, drawRuler, fmtHeight } from './world.js';
import { setPigeons, updateFinding, drawFoundOnPhoto, drawSpots, updateSpots, found, pending, pigeonsOf } from './observe.js';
import { createFlock, drawFlock, flockDone } from './flight.js';
import { startAudio, setAudioHeight, playFeather } from './audio.js';
import { sky, loadSky, skyColors, windVector, hex, rgb } from './sky.js';
import { drawFeather, featherColors, feathers, renderSheets, downloadCanvas, printSheets } from './feather.js';
import { drawFrameMarks } from '../../frame.js';
import { input } from './input/state.js';
import { isMobileDevice } from './input/device.js';
import { createDashboard } from './dashboard.js';

const C = window.LOOKUP;
const T = window.CONTENT;
const FRAME_CFG = { ...window.CONFIG.frame, ...C.frame };
const $ = (id) => document.getElementById(id);
const cv = $('scene');
const ctx = cv.getContext('2d');
const MOBILE = isMobileDevice();
if (new URLSearchParams(location.search).has('debug')) C.debug.show = true;
document.documentElement.classList.toggle('mobile', MOBILE);
// 电脑：新的 dashboard（dashboard.js，按 Figma）。手机先用原来的，等手机版设计。?olddash：电脑上也用原来的
const PARAMS = new URLSearchParams(location.search);
const NEW_DASH = !MOBILE && !PARAMS.has('olddash');
document.documentElement.classList.toggle('newdash', NEW_DASH);
let driver;              // 输入：电脑或手机（boot 里按设备加载，手机不加载摄像头和手势模型）
let dash = null;

const app = {
  state: 'loading',
  stateAt: 0,
  W: 0, H: 0,
  camY: 0,
  vel: 0,
  asked: new Set(),        // 已经问过的问题
  pausedQ: null,
  answers: [],
  groundFeathers: [],
  newFeather: null,
  view: { s: 1, dy: 0 },   // dashboard / 开场时整个画面的放大和偏移
  clearConfirm: false,
};
window.lookUp = { app, input, found, sky };   // 控制台调试用

let world;

// ================================================================ 启动

async function boot() {
  const args = { app, C, FRAME_CFG, cv, getWorld: () => world };
  driver = MOBILE
    ? (await import('./input/mobile.js')).createMobileInput(args)
    : (await import('./input/desktop.js')).createDesktopInput(args);
  window.lookUp.driver = driver;
  const photos = (await (await fetch('data/photos.json')).json()).photos;
  photos.forEach((p) => { p.src = p.src.startsWith('data/') ? p.src : p.src.replace(/^\.\.\//, '../'); });
  let marks = null;
  let sugg = null;
  try { marks = await (await fetch('data/pigeons.json', { cache: 'no-store' })).json(); } catch { /* 还没标 */ }
  try { sugg = await (await fetch('data/suggestions.json')).json(); } catch { /* */ }
  setPigeons(photos, marks, sugg);
  world = createWorld(photos, (id) => pigeonsOf(id).length);
  window.lookUp.world = world;
  try { app.answers = JSON.parse(localStorage.getItem(C.storage.answers)) || []; } catch { app.answers = []; }
  app.groundFeathers = await feathers.all();
  loadSky();
  makeGrain();
  resize();
  setupDashboard();
  if (NEW_DASH) setupNewDashboard();
  setState('dashboard');
  requestAnimationFrame(loop);
}

// 电脑版 dashboard：let's play 时开摄像头；教完两个动作 → 直接进入（不再走原来的开场）
function setupNewDashboard() {
  app.view.s = 1;
  app.view.dy = 0;
  let unlocked = false;
  try { unlocked = localStorage.getItem(C.storage.unlocked) === '1'; } catch { /* */ }
  if (PARAMS.has('unlock')) unlocked = true;
  if (PARAMS.has('lock')) unlocked = false;
  // chapter 刻度（占位）：每个高度用离它最近的那一行的照片当窗口里的画面
  const chapters = C.dash.chapters.map((h) => {
    let best = null;
    for (const r of world.rows) if (!best || Math.abs(Math.log1p(r.h) - Math.log1p(h)) < Math.abs(Math.log1p(best.h) - Math.log1p(h))) best = r;
    return { h, label: fmtHeight(h), src: best ? best.items[0].photo.src : null };
  });
  dash = createDashboard({
    C, T, driver, unlocked, chapters,
    onPlay: () => driver.begin(),
    onEnter: () => {
      startAudio();
      setState('calibrate');
      driver.calibrate.start();
      showLine(driver.calibrate.prompt());
    },
    feather: {
      draw: (canvas) => {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        canvas.width = w * devicePixelRatio;
        canvas.height = h * devicePixelRatio;
        const g = canvas.getContext('2d');
        g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        const last = app.newFeather || app.groundFeathers[app.groundFeathers.length - 1];
        const colors = found.length ? featherColors(found) : last ? last.colors : featherColors([]);
        drawFeather(g, w * 0.46, h * 0.94, 0.35, h * 0.86, h * 0.21, colors, 7);
      },
      download: async () => {
        const s = await renderSheets(sheetData());
        downloadCanvas(s.front, 'feather-front.png');
        setTimeout(() => downloadCanvas(s.back, 'feather-back.png'), 400);
      },
      print: async () => printSheets(await renderSheets(sheetData())),
      again: () => location.reload(),
    },
  });
  window.lookUp.dash = dash;
  dash.show();
}

function setState(s) {
  app.state = s;
  app.stateAt = performance.now();
}

// ================================================================ 每帧

let last = performance.now();
function loop(now) {
  const dt = Math.min(100, now - last);
  last = now;
  update(now, dt);
  draw(now);
  requestAnimationFrame(loop);
}

function update(now, dt) {
  const since = now - app.stateAt;
  const frame = input.frame;

  tickWorld(world, dt, frame.active || pending.key !== null || app.pausedQ !== null);

  // 输入：电脑端摄像头 / 手势，手机端陀螺仪 / 捏合，都写进 input
  driver.update(now, dt, app.state);
  if (dash) dash.update(now);

  // 滚轮之类的一次性位移
  if (input.scrollDelta) {
    if (app.state === 'ascent' && app.pausedQ === null && !frame.active) {
      app.camY = Math.max(0, Math.min(world.topY, app.camY + input.scrollDelta));
    }
    input.scrollDelta = 0;
  }

  if (app.state === 'intro') {
    const k = Math.min(1, Math.max(0, (since - C.intro.handsHoldMs) / C.intro.openMs));
    const e = ease(k);
    app.view.s = C.intro.zoomStart + (1 - C.intro.zoomStart) * e;
    app.view.dy = dashDy() * (1 - e);
    layoutDashboard(1 - e);
    placeHands(e, Math.min(1, since / 400));
    setAudioHeight(0, e);
    if (k >= 1) {
      hideHands();
      $('dash').style.display = 'none';
      setState('calibrate');
      driver.calibrate.start();
      showLine(driver.calibrate.prompt());
    }
  } else if (app.state === 'calibrate') {
    driver.calibrate.sample();
    if (driver.calibrate.ready(since)) {
      driver.calibrate.end();
      showLine('');
      setState('ascent');
    }
  } else if (app.state === 'ascent') {
    ascend(now, dt);
  } else if (app.state === 'top') {
    if (!app.flock) app.flock = C.flight.enabled ? createFlock(found, app.W, app.H, windVector()) : [];
    const done = app.flock.length ? since > 1500 && flockDone(app.flock, since - 1500) : since > 4500;
    if (done) { setState('falling'); playFeather(); app.fallFrom = app.camY; }
  } else if (app.state === 'falling') {
    const k = Math.min(1, since / C.ending.featherFallMs);
    app.camY = app.fallFrom * (1 - ease(k));
    if (k >= 1) landFeather(now);
  } else if (app.state === 'lastline') {
    if (since > C.ending.lastLineMs) { showLine(''); toEnd(); }
  } else if (app.state === 'end') {
    const k = Math.min(1, since / 1400);
    layoutDashboard(ease(k));
  }

  updateSpots(now, app.W, app.H);

  // 声音跟着高度走
  const h = yToHeight(world, app.camY);
  const level = app.state === 'end' ? 0.35 : app.state === 'dashboard' ? 0 : 1;
  if (app.state !== 'intro') setAudioHeight(h, level);
  app.h = h;
  renderDebug();
}

// 抬头 = 往上走：角度对应速度，不对应高度
function ascend(now, dt) {
  const c = C.control;
  const frame = input.frame;
  // lookValue（-1…1）→ 目标速度。人脸丢失 / 陀螺仪没数据时 lookValue 是 0
  let target = input.lookValue * c.maxScreensPerSec * app.H;
  // 取景框在用 / 停顿：停下
  if (frame.active || app.pausedQ !== null) target = 0;
  const k = 1 - Math.exp(-dt / c.responseMs);
  app.vel += (target - app.vel) * k;
  const before = app.camY;
  app.camY = Math.max(0, Math.min(world.topY, app.camY + (app.vel * dt) / 1000));

  // 到了问问题的高度：停下
  if (app.pausedQ === null) {
    C.pauses.forEach((h, i) => {
      if (app.asked.has(i) || !T.questions[i]) return;
      const y = heightToY(world, h);
      if (before < y && app.camY >= y) { app.camY = y; app.vel = 0; ask(i); }
    });
  }
  // 最高处
  if (app.camY >= world.topY - 0.5) { app.camY = world.topY; app.vel = 0; driver.releaseFrame(); setState('top'); }

  // 找鸽子：框的中心（手机：屏幕中心）停在一只鸽子上
  const rects = photoRects(world, app.camY).filter((r) => r.main);
  const p = input.probe;
  app.finding = updateFinding(rects, p ? { x: p.x, y: p.y, w: 0, h: 0 } : null, now);
}

// ================================================================ 绘制

function draw(now) {
  const { W, H } = app;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  const h = app.h || 0;
  const z = zoneAt(h);

  ctx.save();
  if (app.view.s !== 1 || app.view.dy) {
    const cx = W / 2;
    const cy = dashWindow().cy;
    ctx.translate(cx, cy);
    ctx.scale(app.view.s, app.view.s);
    ctx.translate(-cx, -cy + app.view.dy);
  }
  drawScene(now, z, false);
  ctx.restore();

  // 取景框：框外变淡，框里放大、清楚（手机：整个屏幕就是框）
  const frame = input.frame;
  if (frame.alpha > 0 && frame.rect && (app.state === 'ascent' || app.state === 'top')) {
    const r = frame.rect;
    ctx.save();
    ctx.globalAlpha = C.frame.outsideFade * frame.alpha;
    ctx.fillStyle = z.bgCss;
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(r.x, r.y, r.w, r.h); ctx.fill('evenodd');
    ctx.restore();
    const m = input.zoomValue;
    const cx = input.zoomCenter.x;
    const cy = input.zoomCenter.y;
    ctx.save();
    ctx.globalAlpha = frame.alpha;
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.translate(cx, cy); ctx.scale(m, m); ctx.translate(-cx, -cy);
    drawScene(now, z, true);
    ctx.restore();
    if (input.frameMarks) {
      ctx.save();
      ctx.globalAlpha = frame.alpha;
      drawFrameMarks(ctx, r, FRAME_CFG, inkCss());
      ctx.restore();
    }
  }

  // 停顿问问题时：画面淡下去，问题浮在上面
  app.pauseFade = Math.max(0, Math.min(1, (app.pauseFade || 0) + (app.pausedQ !== null ? 0.06 : -0.06)));
  if (app.pauseFade > 0) {
    ctx.save();
    ctx.globalAlpha = 0.82 * app.pauseFade;
    ctx.fillStyle = z.bgCss;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // 屏幕上的颜色（贴在屏幕表面，不跟着高度走）：找到的鸽子保持一会儿之后，在它的位置晕开
  if (C.spots.show) drawSpots(ctx, input.yaw, now, inkCss(), fmtHeight, `10px ${monoFont()}`);

  // 最高处：找到的鸽子飞进天空
  if (app.state === 'top' && app.flock) drawFlock(ctx, app.flock, now - app.stateAt - 1500);

  // 羽毛落下
  if (app.state === 'falling' || app.state === 'top') drawFalling(now);
  if (app.state === 'end' && !NEW_DASH) drawEndFeather();
}

// 整个世界：背景 → 每一行（照片、基线、图注、被找到的鸽子）→ 地面上的羽毛 → 雾 → 事实 → 高度尺
// clear = 取景框里面：不模糊、不加雾
function drawScene(now, z, clear) {
  const { W, H } = app;
  // 背景：低处是灰，越往上越接近纽约此刻的天空
  ctx.fillStyle = z.bgCss;
  ctx.fillRect(-W, -H, W * 3, H * 3);
  if (z.skyness > 0) {
    const s = skyColors();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(s.top, z.skyness));
    g.addColorStop(1, rgb(s.bottom, z.skyness));
    ctx.fillStyle = g;
    ctx.fillRect(-W, -H, W * 3, H * 3);
  }

  const rects = photoRects(world, app.camY);
  const ink = inkCss();
  const anchor = C.world.anchor * H;
  // 每一行的细基线（贯穿屏幕）
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.75;
  const seen = new Set();
  for (const r of rects) {
    if (seen.has(r.row)) continue;
    seen.add(r.row);
    ctx.globalAlpha = 0.55 * belowFade(r.base, anchor, clear);
    const y = Math.round(r.base * 2) / 2;
    ctx.beginPath(); ctx.moveTo(-W, y); ctx.lineTo(W * 2, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (const r of rects) {
    // 已经走过的（在眼睛下面的）照片：慢慢变模糊、变淡
    const fade = belowFade(r.base, anchor, clear);
    const extra = clear ? 0 : belowBlur(r.base, anchor);
    ctx.save();
    ctx.globalAlpha = r.alpha * fade;
    ctx.filter = clear ? `grayscale(${z.gray})` : `grayscale(${z.gray}) blur(${(z.blur + extra).toFixed(2)}px)`;
    if (r.item.img.complete && r.item.img.naturalWidth) ctx.drawImage(r.item.img, r.x, r.y, r.w, r.h);
    ctx.filter = extra > 0.3 ? `blur(${extra.toFixed(2)}px)` : 'none';
    drawFoundOnPhoto(ctx, r, now);
    ctx.filter = 'none';
    // 竖排小图注（书的语言）；比照片高就缩短
    if (C.rows.showCaptions) {
      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.7 * r.alpha * fade;
      ctx.font = `${C.rows.captionPx}px ${monoFont()}`;
      ctx.textBaseline = 'top';
      ctx.translate(r.x + r.w + 3, r.base);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(fitCaption(r.item.photo.caption, r.h), 0, 0);
    }
    ctx.restore();
  }

  drawGroundFeathers();

  // 雾：越往上越灰蒙蒙（取景框里面不加）
  if (!clear && z.fog > 0) {
    ctx.fillStyle = z.bgCss;
    ctx.globalAlpha = z.fog;
    ctx.fillRect(-W, -H, W * 3, H * 3);
    ctx.globalAlpha = 1;
  }

  if (app.state !== 'dashboard' && app.state !== 'end' && app.state !== 'intro') drawFacts(ink);
  // 高度尺：从英寸开始，往上换成英尺、米，到天空时消失
  const rulerAlpha = 1 - smooth(heightToY(world, 8000), world.topY * 0.985, app.camY);
  if (app.state !== 'dashboard' && app.state !== 'end') drawRuler(ctx, world, app.camY, app.h || 0, ink, rulerAlpha, `10px ${monoFont()}`);
}

// 往上走之后，下面的部分逐渐模糊、变淡（config.depth）
function belowBlur(base, anchor) {
  const d = C.depth;
  if (!d.enabled) return 0;
  const t = Math.max(0, Math.min(1, (base - anchor - d.startPx) / (d.rangeVh * app.H)));
  return t * d.blurPx;
}
function belowFade(base, anchor, clear) {
  const d = C.depth;
  if (!d.enabled || clear) return 1;
  const t = Math.max(0, Math.min(1, (base - anchor - d.startPx) / (d.rangeVh * app.H)));
  return 1 - t * d.fade;
}

// 图注太长：先去掉地点（构件 / 年月），还长就只留构件
const captionCache = new Map();
function fitCaption(cap, maxW) {
  const key = `${cap}|${Math.round(maxW)}`;
  if (captionCache.has(key)) return captionCache.get(key);
  const parts = cap.split(' / ');
  const tries = [cap, parts.length >= 3 ? `${parts[0]} / ${parts[parts.length - 1]}` : cap, parts[0]];
  let out = tries[tries.length - 1];
  for (const t of tries) if (ctx.measureText(t).width <= maxW - 4) { out = t; break; }
  captionCache.set(key, out);
  return out;
}

// 事实：在对应高度的右边出现
function drawFacts(ink) {
  const { W, H } = app;
  ctx.save();
  ctx.fillStyle = ink;
  ctx.font = `13px ${sansFont()}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  C.facts.forEach((h, i) => {
    const text = T.facts[i];
    if (!text) return;
    const y = screenY(world, app.camY, heightToY(world, h));
    const d = Math.abs(y - C.world.anchor * H) / (H * 0.45);
    const a = Math.max(0, 1 - d);
    if (a <= 0) return;
    ctx.globalAlpha = a;
    wrap(text, W - 64, Math.max(40, Math.min(H - 40, y - 18)), 300, 18);
  });
  ctx.restore();
}

function wrap(text, x, y, maxW, lh) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  lines.push(cur);
  lines.forEach((l, i) => ctx.fillText(l, x, y - (lines.length - 1 - i) * lh));
}

// 地面上之前的人留下的羽毛：躺在 0″ 那条线下面
function drawGroundFeathers() {
  const list = app.newFeather ? [...app.groundFeathers, app.newFeather] : app.groundFeathers;
  if (!list.length) return;
  const base = screenY(world, app.camY, 0);
  if (base > app.H + 60 || base < -200) return;
  for (const f of list) {
    drawFeather(ctx, f.x * app.W, base + 18 + (f.seed % 23), Math.PI / 2 + ((f.seed % 40) - 20) / 100,
      C.ending.featherLengthPx * 0.42, C.ending.featherWidthPx * 0.42, f.colors, f.seed);
  }
}

// 羽毛从最高处慢慢落下，镜头跟着回到地面
function drawFalling(now) {
  const { W, H } = app;
  const since = now - app.stateAt;
  const colors = featherColors(found);
  if (app.state === 'top') return;
  const k = Math.min(1, since / C.ending.featherFallMs);
  const wind = windVector();
  const sway = Math.sin(since / 1400) * W * 0.08;
  const drift = wind.x * wind.strength * W * 0.12 * Math.sin(k * Math.PI);
  const x = W / 2 + sway + drift;
  const y = H * (0.12 + 0.55 * Math.min(1, k * 1.2));
  const ang = Math.sin(since / 1400 + 0.6) * 0.5 + 0.15;
  drawFeather(ctx, x, y, ang, C.ending.featherLengthPx, C.ending.featherWidthPx, colors, 7);
}

function landFeather(now) {
  const f = {
    id: `${Date.now()}`,
    x: 0.15 + Math.random() * 0.7,
    seed: Math.floor(Math.random() * 1000),
    colors: featherColors(found),
    heights: found.map((x) => x.height),
    date: new Date().toISOString(),
  };
  app.newFeather = f;
  feathers.add(f);
  setState('lastline');
  showLine(T.last);
}

// 结尾回到 dashboard：窗口里是这根羽毛
function drawEndFeather() {
  const w = dashWindow();
  const k = Math.min(1, (performance.now() - app.stateAt) / 1400);
  ctx.save();
  ctx.globalAlpha = ease(k);
  ctx.fillStyle = zoneAt(0).bgCss;
  ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.globalAlpha = ease(k);
  drawFeather(ctx, w.cx - w.w * 0.05, w.y + w.h * 0.9, 0.35, w.h * 0.78, w.h * 0.19, featherColors(found), 7);
  ctx.restore();
}

// ================================================================ 区段：颜色、模糊、雾随高度

function zoneAt(h) {
  const zs = C.zones;
  const lh = Math.log(1 + h);
  let a = zs[0];
  let b = zs[zs.length - 1];
  let t = 0;
  for (let i = 1; i < zs.length; i++) {
    if (h <= zs[i].h) {
      a = zs[i - 1]; b = zs[i];
      t = (lh - Math.log(1 + a.h)) / (Math.log(1 + b.h) - Math.log(1 + a.h));
      break;
    }
    if (i === zs.length - 1) { a = b; t = 0; }
  }
  const lerp = (p, q) => p + (q - p) * t;
  const skyBottom = skyColors().bottom;
  const col = (zz) => (zz.bg === 'sky' ? skyBottom : hex(zz.bg));
  const ca = col(a);
  const cb = col(b);
  const bg = ca.map((v, i) => v + (cb[i] - v) * t);
  const skyness = a.bg === 'sky' ? 1 : b.bg === 'sky' ? t : 0;
  return { blur: lerp(a.blur, b.blur), fog: lerp(a.fog, b.fog), gray: lerp(a.gray, b.gray), bgCss: rgb(bg), skyness };
}

// 字和线的颜色：天空暗的时候（夜里）变浅
function inkCss() {
  const z = app.h > 3000 ? skyColors() : null;
  if (z && z.phase === 'night') return 'rgba(236,238,242,0.9)';
  return 'rgba(29,35,40,0.95)';
}
const monoFont = () => '"TWK Everett Mono", "SF Mono", Menlo, monospace';
const sansFont = () => '"TWK Everett", "Helvetica Neue", Helvetica, Arial, sans-serif';

// ================================================================ dashboard + 开场

function palette() { return C.dashboard.palettes[C.dashboard.palette] || C.dashboard.palettes[1]; }

function dashWindow() {
  const d = C.dashboard.window;
  const w = app.W * d.w;
  const h = app.H * d.h;
  const cy = app.H * d.y;
  return { x: (app.W - w) / 2, y: cy - h / 2, w, h, cx: app.W / 2, cy };
}

// 窗口里显示地面那一行：把它挪到窗口中间
function dashDy() {
  const w = dashWindow();
  return (w.cy + world.photoH / 2) - C.world.anchor * app.H;
}

function setupDashboard() {
  const p = palette();
  document.documentElement.style.setProperty('--frame', p.frame);
  document.documentElement.style.setProperty('--ink', p.ink);
  document.documentElement.style.setProperty('--mute', p.mute);
  $('dTitle').textContent = T.dashboard.title;
  $('dLines').innerHTML = T.dashboard.lines.map((l) => `<p>${l}</p>`).join('');
  $('dHow').textContent = T.dashboard.howTo;
  $('dBegin').textContent = T.dashboard.begin;
  $('rotate').textContent = T.rotate;
  $('dKeys').textContent = driver.keysOnly ? T.dashboard.keysNote : '';
  if (MOBILE) $('dHow').textContent = T.dashboard.howToMobile;
  $('eTitle').textContent = T.dashboard.title;
  $('eLines').innerHTML = T.dashboard.endLines.map((l) => `<p>${l}</p>`).join('');
  $('eDownload').textContent = T.dashboard.download;
  $('ePrint').textContent = T.dashboard.print;
  $('eTutorial').textContent = T.dashboard.tutorial;
  $('eAgain').textContent = T.dashboard.again;
  $('dClear').textContent = app.groundFeathers.length ? `${app.groundFeathers.length} feather${app.groundFeathers.length > 1 ? 's' : ''} on the ground · X to clear` : '';
  renderCircles();
  app.view.s = C.intro.zoomStart;
  app.view.dy = dashDy();
  layoutDashboard(1);

  $('dBegin').onclick = begin;
  $('eDownload').onclick = async () => {
    const s = await renderSheets(sheetData());
    downloadCanvas(s.front, 'feather-front.png');
    setTimeout(() => downloadCanvas(s.back, 'feather-back.png'), 400);
  };
  $('ePrint').onclick = async () => printSheets(await renderSheets(sheetData()));
  $('eAgain').onclick = () => location.reload();
}

function sheetData() {
  return { found, answers: app.answers, questions: T.questions, date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), fmtHeight };
}

// 每一层高度一个圆圈编号（参考图 03）；找到过鸽子的那层填上颜色
function renderCircles() {
  const el = $('circles');
  el.innerHTML = '';
  world.rows.forEach((row, i) => {
    const s = document.createElement('span');
    s.textContent = String(i + 1);
    s.title = fmtHeight(row.h);
    const f = found.find((x) => x.height === row.h);
    if (f) { s.style.background = `hsl(${f.hsl[0]}, ${f.hsl[1] * 100}%, ${f.hsl[2] * 100}%)`; s.style.borderColor = 'transparent'; }
    el.appendChild(s);
  });
}

// open = 1：完整的外框；0：外框完全打开（窗口变成整个屏幕）
function layoutDashboard(open) {
  const { W, H } = app;
  const w = dashWindow();
  const x0 = w.x * open;
  const y0 = w.y * open;
  const x1 = W - (W - (w.x + w.w)) * open;
  const y1 = H - (H - (w.y + w.h)) * open;
  const set = (id, l, t, ww, hh) => Object.assign($(id).style, { left: `${l}px`, top: `${t}px`, width: `${Math.max(0, ww)}px`, height: `${Math.max(0, hh)}px` });
  set('bT', 0, 0, W, y0);
  set('bB', 0, y1, W, H - y1);
  set('bL', 0, y0, x0, y1 - y0);
  set('bR', x1, y0, W - x1, y1 - y0);
  const pad = 40;
  Object.assign($('dStart').style, { left: `${pad}px`, top: `${pad}px`, width: `${Math.max(180, w.x - pad * 1.5)}px` });
  Object.assign($('dEnd').style, { left: `${pad}px`, top: `${pad}px`, width: `${Math.max(180, w.x - pad * 1.5)}px` });
  Object.assign($('dCircles').style, { left: `${w.x}px`, top: `${w.y + w.h + 18}px`, width: `${w.w}px` });
  Object.assign($('dClear').style, { right: `${pad}px`, bottom: `${pad * 0.6}px` });
  $('dash').style.opacity = open < 0.02 ? 0 : 1;
}

async function begin() {
  $('dStart').style.opacity = 0;
  $('dStart').style.pointerEvents = 'none';
  $('dCircles').style.opacity = 0;
  $('dClear').style.opacity = 0;
  driver.begin();          // 手机：这一下点击里请求陀螺仪权限（iOS 必须）；电脑：打开摄像头
  startAudio();
  setState('intro');
}

// 两只手比成取景框：左手在窗口左下角，右手在右上角；然后一只往左、一只往右慢慢移开
function placeHands(open, fadeIn) {
  const w = dashWindow();
  const hl = $('handL');
  const hr = $('handR');
  if (!hl.naturalWidth || !hr.naturalWidth) return;
  const s = (C.intro.handScale * app.H) / hl.naturalHeight;
  // 两只手 L 形的内角（图片里的位置）
  const aL = [218 * s, 205 * s];
  const aR = [318 * s, 238 * s];
  const lx = w.x - aL[0] - open * app.W * 0.55;
  const ly = w.y + w.h - aL[1] + open * app.H * 0.25;
  const rx = w.x + w.w - aR[0] + open * app.W * 0.55;
  const ry = w.y - aR[1] - open * app.H * 0.25;
  const a = Math.min(fadeIn, 1 - Math.max(0, (open - 0.75) / 0.25));
  Object.assign(hl.style, { left: `${lx}px`, top: `${ly}px`, width: `${hl.naturalWidth * s}px`, opacity: a });
  Object.assign(hr.style, { left: `${rx}px`, top: `${ry}px`, width: `${hr.naturalWidth * s}px`, opacity: a });
}
function hideHands() { $('handL').style.opacity = 0; $('handR').style.opacity = 0; }

function toEnd() {
  setState('end');
  try { localStorage.setItem(C.storage.unlocked, '1'); } catch { /* */ }
  if (dash) { app.view.s = 1; app.view.dy = 0; dash.showEnd(); return; }
  $('dash').style.display = 'block';
  $('dStart').style.display = 'none';
  $('dEnd').style.opacity = 1;
  $('dEnd').style.pointerEvents = 'auto';
  $('dCircles').style.opacity = 1;
  renderCircles();
  app.view.s = 1;
  app.view.dy = 0;
}

// ================================================================ 停顿：问一个问题

function ask(i) {
  app.pausedQ = i;
  $('pQ').textContent = T.questions[i];
  $('pNote').innerHTML = `${T.answerNote}<br>${MOBILE ? T.answerHintMobile : T.answerHint}`;
  $('pInput').value = app.answers[i] || '';
  $('prompt').style.display = 'block';
  setTimeout(() => $('pInput').focus(), 50);
}

function closeQuestion(keep) {
  const i = app.pausedQ;
  if (i === null) return;
  if (keep && $('pInput').value.trim()) {
    app.answers[i] = $('pInput').value.trim();
    try { localStorage.setItem(C.storage.answers, JSON.stringify(app.answers)); } catch { /* */ }
  }
  app.asked.add(i);
  app.pausedQ = null;
  $('prompt').style.display = 'none';
  $('pInput').blur();
}

$('pInput').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.isComposing || e.keyCode === 229) return;          // 输入法正在选字
  if (e.key === 'Enter') closeQuestion(true);
  else if (e.key === 'Escape') closeQuestion(false);
});
// 手机没有 Esc：收起键盘 / 点别处 = 留下已经写的（没写就是跳过）
if (MOBILE) $('pInput').addEventListener('blur', () => setTimeout(() => closeQuestion(true), 0));

// ================================================================ 文字、颗粒、调试

let lineTimer = null;
function showLine(text) {
  const el = $('line');
  clearTimeout(lineTimer);
  if (text) { el.textContent = text; el.style.opacity = 1; } else { el.style.opacity = 0; }
}

// 全局颗粒（哑光、印刷感），跟着真实风向慢慢漂
function makeGrain() {
  const n = C.grain.sizePx;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const d = g.createImageData(n, n);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = 150 + Math.random() * 105;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  const el = $('grain');
  el.style.backgroundImage = `url(${c.toDataURL()})`;
  el.style.opacity = C.grain.opacity;
  let ox = 0;
  let oy = 0;
  if (C.grain.fps > 0) {
    setInterval(() => {
      const w = windVector();
      ox += w.x * C.grain.windDrift * w.strength + (Math.random() - 0.5) * 30;
      oy += w.y * C.grain.windDrift * w.strength + (Math.random() - 0.5) * 30;
      el.style.backgroundPosition = `${Math.round(ox)}px ${Math.round(oy)}px`;
    }, 1000 / C.grain.fps);
  }
}

function renderDebug() {
  const el = $('debug');
  if (!C.debug.show) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.textContent = [
    `state     ${app.state}${MOBILE ? ' · mobile' : ''}${dash ? ` · dash ${dash.step} (${dash.face})` : ''}`,
    ...driver.debugLines(),
    `look      ${input.lookValue.toFixed(2)}   zoom ${input.zoomValue.toFixed(2)}`,
    `speed     ${(app.vel / app.H).toFixed(2)} screens/s`,
    `height    ${fmtHeight(app.h || 0)}`,
    `frame     ${input.frame.active ? 'on' : 'off'}`,
    `found     ${found.length}`,
    `sky       ${sky.source} · wind ${sky.windDirection}° ${sky.windSpeed} km/h · ${skyColors().phase}`,
  ].join('\n');
}

// ================================================================ 按键（调试、全屏、校准、清空羽毛）

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'd') C.debug.show = !C.debug.show;
  else if (k === 'f') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }
  else if (k === 'c' && app.state === 'ascent') { setState('calibrate'); driver.calibrate.start(); showLine(T.calibrate); }
  else if (k === 'x' && (app.state === 'dashboard' || app.state === 'end') && app.groundFeathers.length) {
    app.clearConfirm = true; $('dClear').textContent = T.dashboard.clearConfirm;
  } else if (k === 'y' && app.clearConfirm) {
    feathers.clear().then(() => { app.groundFeathers = []; app.newFeather = null; $('dClear').textContent = ''; });
    app.clearConfirm = false;
  } else if (app.clearConfirm) { app.clearConfirm = false; $('dClear').textContent = ''; }
});
// ↑ ↓、滚轮、鼠标拖框（电脑）和陀螺仪、捏合、拖动（手机）在 input/ 里

// ================================================================ 工具

function resize() {
  app.W = window.innerWidth;
  app.H = window.innerHeight;
  cv.width = app.W * devicePixelRatio;
  cv.height = app.H * devicePixelRatio;
  cv.style.width = `${app.W}px`;
  cv.style.height = `${app.H}px`;
  const ratio = world.topY ? app.camY / world.topY : 0;
  layoutWorld(world, app.W, app.H);
  app.camY = ratio * world.topY;
  if (app.state === 'dashboard' && !NEW_DASH) { app.view.dy = dashDy(); layoutDashboard(1); }
  if (app.state === 'end') layoutDashboard(1);
}
window.addEventListener('resize', () => { if (world) resize(); });

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function median(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

boot();
