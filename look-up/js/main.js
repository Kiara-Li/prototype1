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
import { setPigeons, updateFinding, drawFoundOnPhoto, drawSpots, updateSpots, found, pending, pigeonsOf, isFound, markFound } from './observe.js';
import { createFlock, drawFlock, flockDone } from './flight.js';
import { startAudio, setAudioHeight, playFeather } from './audio.js';
import { sky, loadSky, skyColors, windVector, hex, rgb } from './sky.js';
import { drawFeather, featherColors, feathers, renderSheets, downloadCanvas, printSheets } from './feather.js';
import { drawFrameMarks } from '../../frame.js';
import { input } from './input/state.js';
import { isMobileDevice } from './input/device.js';
import { createDashboard } from './dashboard.js';
import { loadBook, loadGroup, bookLayout, baselineOf, spreadRects, drawSpread, drawBaseline, revealTotal } from './book.js';
import { createBookUI } from './bookui.js';
import { createSkySound } from './skysound.js';
import { openSheet } from './sheet.js';
import { openFold } from './fold.js';
import { createSectionSound } from './sectionsound.js';

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
// 书：按 book.pdf 的跨页，7 次抬头 = 7 个 section（config.book）。false = 原来的竖向照片
const BOOK = C.book && C.book.enabled;
document.documentElement.classList.toggle('book', !!BOOK);
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
  answerParts: [],         // 书：每个 section 填的词（数组），最后那张纸上用
  pieces: [],              // 书：一路切下来的鸽子 { canvas, h, sec }，最后拼成一张纸
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
  const photos = (await (await fetch('data/photos.json', { cache: 'no-cache' })).json()).photos;
  photos.forEach((p) => { p.src = p.src.startsWith('data/') ? p.src : p.src.replace(/^\.\.\//, '../'); });
  let marks = null;
  let sugg = null;
  try { marks = await (await fetch('data/pigeons.json', { cache: 'no-store' })).json(); } catch { /* 还没标 */ }
  try { sugg = await (await fetch('data/suggestions.json')).json(); } catch { /* */ }
  // YOLO 没认出来的几只（手标的大概范围），补进去：不然那一页切不到鸽子，就走不下去
  try {
    const extra = await (await fetch('data/suggestions_manual.json', { cache: 'no-cache' })).json();
    sugg = sugg || {};
    for (const [id, list] of Object.entries(extra)) if (Array.isArray(list) && !(sugg[id] && sugg[id].length)) sugg[id] = list;
  } catch { /* */ }
  setPigeons(photos, marks, sugg);
  world = createWorld(photos, (id) => pigeonsOf(id).length);
  window.lookUp.world = world;
  if (BOOK) await setupBook();
  try { app.answers = JSON.parse(localStorage.getItem(C.storage.answers)) || []; } catch { app.answers = []; }
  if (BOOK) app.answers = [];      // 书：每个 section 一个填空，每次从空白开始（旧版的问题答案不混进来）
  app.groundFeathers = await feathers.all();
  loadSky();
  makeGrain();
  resize();
  setupDashboard();
  if (NEW_DASH) setupNewDashboard();
  if (app.state === 'loading') setState('dashboard');
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
      // 平视角度已经在 dashboard 的抬头测试里记过了：不再闪「Look at the screen」，线框散开后直接是书页
      startAudio();
      setState('ascent');
    },
    feather: {
      download: () => showSheet(),
      print: () => showSheet(),
      fold: () => openFold(T.sheet),
      again: () => location.reload(),
    },
  });
  window.lookUp.dash = dash;
  // 调试：?skipdash 跳过 dashboard，直接进入
  if (PARAMS.has('skipdash')) { setState('calibrate'); driver.begin(); driver.calibrate.start(); app.quietCalib = true; return; }
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
  requestAnimationFrame(loop);
  // 某一帧出错也不要让整个画面停住（只在控制台报错）
  try {
    update(now, dt);
    draw(now);
  } catch (e) {
    console.error(e);
  }
}

function update(now, dt) {
  const since = now - app.stateAt;
  const frame = input.frame;

  tickWorld(world, dt, frame.active || pending.key !== null || app.pausedQ !== null);

  // 输入：电脑端摄像头 / 手势，手机端陀螺仪 / 捏合，都写进 input
  driver.update(now, dt, app.state);
  if (dash) dash.update(now);

  // 滚轮之类的一次性位移（书：不用）
  if (input.scrollDelta) {
    if (!BOOK && app.state === 'ascent' && app.pausedQ === null && !frame.active) {
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
    if (app.quietCalib) showLine('');
    driver.calibrate.sample();
    if (driver.calibrate.ready(since)) {
      driver.calibrate.end();
      showLine('');
      setState('ascent');
    }
  } else if (app.state === 'ascent') {
    if (BOOK) bookUpdate(now, dt); else ascend(now, dt);
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

// ================================================================ 书：指引 → section（跨页自己翻）→ 下一个指引 …… → 天空
//
// guide     屏幕上一句指引；抬一下头（lookValue 超过 lookAbove，保持 lookHoldMs）→ 进入下一个 section
// section   用两只手比一个框，框住鸽子停一会儿 = 切下来（原处留下一个和背景一样颜色的洞，切下的方块飞到右上角）。
//           切到第一只之后，这一页历史照片的位置像 dashboard 的卡片一样翻过来：介绍 → 再翻：
//             上面还有（同一个 section 更高的一页）→「再抬头 ↑」，抬头就上升到那一页
//             这是最后一页 →「Ready? Yes」→ 卡片放大成填空 → 填完，切下来的方块飞进句子里 → 下一个 section 的指引
//           低头不影响
// skyguide  7 个 section 之后：看天空的指引 → 天空也是一个 section：飞行照片一张一页，尽量大，
//           底边还在基线上（不全屏，水平线还在）；最后一张之后 → top（羽毛落下）

let book = null;
const bk = {
  phase: 'guide', next: 0, sec: -1, idx: 0, cur: null, prev: null, prevEnter: false,
  switchedAt: -1e9, enterAt: -1e9, outAt: -1e9, inAt: -1e9, guideAt: 0, baseY: null, upSince: 0,
  targetH: 0,
  rulerH: null,                // 尺子上现在的数字（跟着往上数）
  enterDir: 1,
  skyAt: -1,                   // 进入天空的时间（背景从灰变蓝）
  card: 'front',               // 这一页卡片：front → intro → up / ready → question
  introUntil: 0,
  tutorialDone: false,
  holes: new Map(),            // 切掉的地方：照片 id → [{ x, y, w, h }]（照片里的比例）
  marks: new Map(),            // 去过的高度 → 那一页基线在书页上的位置（高度尺上用浅灰标出来）
};
window.lookUp.bk = bk;

async function setupBook() {
  const items = new Map();
  for (const row of world.rows) for (const it of row.items) items.set(it.photo.id, it);
  book = await loadBook(items);
  // 每个 section 里按高度从低到高；一样高按书里的页码
  book.sections = C.book.sections.map((s) => ({
    ...s,
    groups: s.groups.map((id) => book.groups.get(id)).filter(Boolean)
      .sort((a, b) => a.height_in - b.height_in || Number(a.id) - Number(b.id)),
  }));
  // 天空：不再一页一页切鸽子。抬头以后背景渐变成蓝天、天空视频浮现、一路切下来的鸽子飞上去（startSky）
  book.sections.push({ key: 'sky', sky: true, groups: [] });
  preloadSection(0);                                  // 第一个 section 的图片现在就开始下载（看 dashboard 的时候）
  window.lookUp.book = book;
  bookUI = createBookUI({ C, T });
  bookUI.on = {
    next: () => { if (bk.card === 'intro') toNext(); },     // 介绍读完
    yes: () => askSection(),
    skip: () => { if (bk.card === 'ready') finishSection(); },   // 不回答，直接往上
    jump: (i) => jumpTo(i),                                       // 目录：点一段直接跳过去
  };
  window.lookUp.bookUI = bookUI;
  window.lookUp.rects = () => bookRects(performance.now());     // 调试：这一页照片在屏幕上的位置
  window.lookUp.pigeonsOf = pigeonsOf;
  window.lookUp.ask = () => { bk.card = 'ready'; askSection(); };   // 调试：直接打开这一段的问题
  window.lookUp.show = (i, j = 0) => { enterSection(i, performance.now()); if (j) showSpread(j, performance.now()); };   // 调试：直接跳到第 i 个 section 的第 j 页
}
let bookUI = null;
const skySound = C.book && C.book.skySound ? createSkySound(C.book.skySound) : null;
const sectionSound = C.book && C.book.sectionSounds ? createSectionSound(C.book.sectionSounds) : null;

// 这一页的卡片：历史照片里最大的那张（天空：右边留出来的一栏）
function cardOf(g) {
  if (!g) return null;
  let best = null;
  for (const im of g.images) if (!im.own && (!best || im.w * im.h > best.w * best.h)) best = im;
  return best;
}
// 历史照片的图注「摄影师 / 标题 / 年份 / 收藏」→ { title: '摄影师 / 标题', meta: '年份 · 收藏' }
function parseCaption(cap) {
  if (!cap) return null;
  const parts = cap.split(' / ').map((p) => p.replace(/\s*—\s*Source$/, '').trim())
    .filter((p) => p && !/^Source image:/i.test(p));
  const yi = parts.findIndex((p) => /^(c\.\s*)?\d{4}|^n\.d\.$/.test(p));
  const head = yi >= 0 ? parts.slice(0, yi) : parts;
  const tail = yi >= 0 ? parts.slice(yi) : [];
  return { title: head.join(' / '), meta: tail.join(' · ') };      // 和书里的图注一样用 /
}

// 卡片上半截右边空出来多少（到旁边下一张照片，或者屏幕边）
function cardRoom(r) {
  const im = cardOf(bk.cur);
  if (!im || !r) return 0;
  const L = bookLayout(book, app.W, app.H, C.book);
  let next = app.W;
  for (const o of bk.cur.images) {
    if (o === im || o.virtual) continue;
    const ox = L.ox + o.x * L.s;
    const overlap = o.y < im.y + im.h * 0.45 && o.y + o.h > im.y;     // 竖排那行贴着卡片上半截：只看上半截旁边有没有东西
    if (overlap && ox >= r.x + r.w - 1) next = Math.min(next, ox);
  }
  return next - (r.x + r.w);
}

function cardRect(now) {
  if (!bk.cur || bk.baseY === null) return null;
  const im = cardOf(bk.cur);
  if (!im) return null;
  const L = bookLayout(book, app.W, app.H, C.book);
  const base = bk.baseY + enterShift(now);
  const s = L.s;
  return { x: L.ox + im.x * s, y: base - (bk.cur.baseline_y - im.y) * s, w: im.w * s, h: im.h * s };
}

function bookUpdate(now, dt) {
  const B = C.book;
  // 一进来就是第一页（不先放一句指引）：等 dashboard 的线框完全散开、只剩空白，再从下面滑上来
  if (bk.phase === 'guide' && bk.sec === -1 && !(dash && dash.step === 'leaving')) enterSection(0, now);
  if (bk.phase === 'guide' || bk.phase === 'skyguide') {
    // 判定很宽松：抬一下头就算
    if (app.pausedQ === null && input.lookValue > B.lookAbove) {
      if (!bk.upSince) bk.upSince = now;
      if (now - bk.upSince > B.lookHoldMs) {
        bk.upSince = 0;
        enterSection(bk.next, now);
      }
    } else bk.upSince = 0;
    if (bk.sec >= 0 && now - bk.guideAt > B.lookHintMs && !bk.upSince) lookHint(null);
  }
  // 抬头的提示：状态变了（翻了卡片、上升了、进了下一段）就收走
  if (lookHinted && lookHinted !== hintKey()) { lookHinted = ''; if (!bookUI.tutorial) bookUI.setHint(''); }
  if (bk.phase === 'section') {
    const settled = !bk.prevEnter || enterOffset(now) >= 1;
    // 还没切到鸽子、停了一会儿：两只手再示范一次（一比出框就收走）
    if (bk.card === 'front' && settled && !bk.snap && !bk.cutHinted && !bookUI.tutorial && !input.frame.active
        && now - Math.max(bk.switchedAt, bk.enterAt) > B.cutHintMs + (bk.prevEnter ? B.enterMs : 0)) {
      bk.cutHinted = true;
      showCutTutorial(true);
    }
    // 用力抬头（不管有没有切到鸽子）保持一会儿 → 往上走
    if (settled && !bk.snap && !input.frame.active && input.lookValue > B.skipLook) {
      if (!bk.skipSince) bk.skipSince = now;
      if (now - bk.skipSince > B.skipHoldMs) { bk.skipSince = 0; skipAhead(now); }
    } else bk.skipSince = 0;
    // 该抬头了、还没抬：卡片旁边一句提示
    if (bk.card === 'up' && bk.upAt && now - bk.upAt > B.lookHintMs && !bk.upSince) lookHint(cardRect(now));
    // 教学：第一次用手比出框 → 手离开
    if (bookUI.tutorial && input.frame.active) { bk.tutorialDone = true; bookUI.hideTutorial(); }
    if (bk.card === 'intro' && now > bk.introUntil) toNext();
    // 上面还有：抬头 → 上升到这个 section 更高的一页
    if (bk.card === 'up' && settled && !input.frame.active && input.lookValue > B.lookAbove) {
      if (!bk.upSince) bk.upSince = now;
      if (now - bk.upSince > B.lookHoldMs) { bk.upSince = 0; showSpread(bk.idx + 1, now, false); }
    } else if (bk.card === 'up') bk.upSince = 0;
  }

  // 尺子上的数字：跟着这一页的高度往上数（和书页上升一样快）；天空：一路冲到天空的高度
  if (bk.cur) {
    if (bk.rulerH === null) bk.rulerH = C.book.minHeight;     // 第一页：从视线的高度（60″）往上数
    const sk = bk.skyAt >= 0;
    const target = sk ? C.book.skyScene.height : bk.cur.height_in;
    bk.rulerH += (target - bk.rulerH) * (1 - Math.exp(-dt / (sk ? 1100 : 420)));
  }
  // 天空：鸽子飞完以后问最后一句
  if (bk.phase === 'sky' && !bk.skyAsked && now - bk.skyAt > Math.max(C.book.skyScene.askMinMs, birdsStart() + skyScene.askAfter)) {
    bk.skyAsked = true;
    bk.card = 'ready';
    askSection();
  }
  // 高度尺跟着现在这一页的高度慢慢走
  const ty = heightToY(world, bk.targetH);
  app.camY += (ty - app.camY) * (1 - Math.exp(-dt / 900));

  // 基线慢慢移到这一组的位置（和 Sightline 一样）
  if (bk.cur) {
    const L = bookLayout(book, app.W, app.H, B);
    const target = baselineOf(bk.cur, L);
    if (bk.baseY === null) bk.baseY = target;
    bk.baseY += (target - bk.baseY) * (1 - Math.exp(-dt / 400));
  }

  // 找鸽子：框的中心（手机：屏幕中心）停在一只鸽子上
  updateCutting(bk.phase === 'section' ? bookRects(now) : [], now);

  // 卡片跟着书页走
  const cr = bk.skyAt < 0 && (bk.phase === 'section' || bk.phase === 'question' || bk.phase === 'guide' || bk.phase === 'skyguide') ? cardRect(now) : null;
  bookUI.place(cr, { room: cardRoom(cr), cap: bk.phase === 'section' });
}

// ---- 切鸽子：判定很宽松（框大致罩住一只鸽子就行），停一下 → 框自己缩成刚好包住这只鸽子的正方形 → 切下来
//   bk.aim   正在瞄准的鸽子（四角标记慢慢出现）
//   bk.snap  框正在缩小（from → to，屏幕上看到的位置），缩完就切

// 书页上要不要放大框里的画面：手机（捏合就是放大）要；电脑默认不要，框就是一把刀，看到哪切哪
const bookZoom = () => input.mode === 'mobile' || C.book.zoom;

// 用户的框（屏幕坐标）。手机：放大时屏幕中间的一块
function frameBox() {
  if (!input.frame.active) return null;
  const fr = input.frame.rect;
  if (input.mode === 'mobile' || !fr) {
    const side = (Math.min(app.W, app.H) / Math.max(1, input.zoomValue)) * 0.7;
    const c = input.probe || { x: app.W / 2, y: app.H / 2 };
    return { x: c.x - side / 2, y: c.y - side / 2, w: side, h: side };
  }
  return fr;
}
// 放大镜开着时，照片上的位置 → 屏幕上看到的位置
function toDisplay(b) {
  const fr = input.frame;
  if (!bookZoom() || !(fr.alpha > 0 && fr.rect) || input.zoomValue <= 1) return b;
  const m = input.zoomValue;
  const c = input.zoomCenter;
  return { x: c.x + (b.x - c.x) * m, y: c.y + (b.y - c.y) * m, w: b.w * m, h: b.h * m };
}
function pigeonBox(r, pg) {
  const xs = pg.polygon.map((q) => q[0]);
  const ys = pg.polygon.map((q) => q[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: r.x + x0 * r.w, y: r.y + y0 * r.h, w: (Math.max(...xs) - x0) * r.w, h: (Math.max(...ys) - y0) * r.h };
}

function updateCutting(rects, now) {
  const B = C.book;
  if (bk.snap) {
    if (now - bk.snap.at >= B.snapMs) {
      const s = bk.snap;
      bk.snap = null;
      const f = markFound(s.rect, s.index, now);
      if (f) cutOut(s.rect, s.sq, s.to, now);
    }
    return;
  }
  // 框（用户比的 / 鼠标拖的）：就按框出来的这一块判断，宽松
  const F = frameBox();
  let best = null;
  if (F) {
    for (const r of rects) {
      pigeonsOf(r.item.photo.id).forEach((pg, i) => {
        if (isFound(r.item.photo.id, i)) return;
        const b = pigeonBox(r, pg);
        const ix = Math.max(0, Math.min(b.x + b.w, F.x + F.w) - Math.max(b.x, F.x));
        const iy = Math.max(0, Math.min(b.y + b.h, F.y + F.h) - Math.max(b.y, F.y));
        const cover = (ix * iy) / Math.max(1, b.w * b.h);
        const pad = 0.25 * Math.max(F.w, F.h);
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const near = cx > F.x - pad && cx < F.x + F.w + pad && cy > F.y - pad && cy < F.y + F.h + pad;
        const score = cover + (near ? 0.3 : 0);
        if ((cover >= B.cutCover || near) && (!best || score > best.score)) best = { r, i, b, score };
      });
    }
  }
  if (!best) { bk.aim = null; return; }
  const key = `${best.r.item.photo.id}#${best.i}`;
  if (!bk.aim || bk.aim.key !== key) bk.aim = { key, since: now };
  bk.aim.box = best.b;
  bk.aim.progress = Math.min(1, (now - bk.aim.since) / B.cutDwellMs);
  if (bk.aim.progress >= 1) {
    const side = Math.max(16, Math.max(best.b.w, best.b.h) * B.cutPad);
    const sq = { x: best.b.x + best.b.w / 2 - side / 2, y: best.b.y + best.b.h / 2 - side / 2, w: side, h: side };
    bk.snap = { rect: best.r, index: best.i, sq, from: { ...frameBox() }, to: toDisplay(sq), at: now };
    bk.aim = null;
  }
}

// 收缩时：你的框的角标往鸽子缩，一边缩一边淡掉（贴着鸽子的那一块没有角标）
// 只有右上、左下两个角（和网站上其他的角标一样），不画完整的方框
function corners(b, len, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = C.book.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [x, y, dx, dy] of [[b.x + b.w, b.y, -1, 1], [b.x, b.y + b.h, 1, -1]]) {
    ctx.moveTo(x + dx * len, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * len);
  }
  ctx.stroke();
  ctx.restore();
}
function drawCutting(now) {
  if (bk.snap) {
    const k = ease(Math.min(1, (now - bk.snap.at) / C.book.snapMs));
    const a = bk.snap.from;
    const t = bk.snap.to;
    const b = { x: a.x + (t.x - a.x) * k, y: a.y + (t.y - a.y) * k, w: a.w + (t.w - a.w) * k, h: a.h + (t.h - a.h) * k };
    corners(b, Math.max(8, 0.28 * Math.min(b.w, b.h)), 1 - k);      // 缩到鸽子身边时已经淡没了：贴着鸽子的那一块不要角标
  }
}

// 切下来：鸽子的正方形 → 一张小图（加一层色调）从屏幕上看到的位置飞到右上角；照片上留下一个和背景一样颜色的洞
function cutOut(r, sq, shown, now) {
  const B = C.book;
  const f = { photoId: r.item.photo.id };
  const img = r.item.img;
  const n = 720;                              // 最后那张纸上一块可能很大（只切到一只：整面 130mm）
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  g.fillStyle = B.background;
  g.fillRect(0, 0, n, n);
  const kx = img.naturalWidth / r.w;
  const ky = img.naturalHeight / r.h;
  // 只取照片里面的部分（框伸到照片外面的地方留背景色）
  const ix0 = Math.max(sq.x, r.x);
  const iy0 = Math.max(sq.y, r.y);
  const ix1 = Math.min(sq.x + sq.w, r.x + r.w);
  const iy1 = Math.min(sq.y + sq.h, r.y + r.h);
  if (ix1 > ix0 && iy1 > iy0) {
    g.drawImage(img, (ix0 - r.x) * kx, (iy0 - r.y) * ky, (ix1 - ix0) * kx, (iy1 - iy0) * ky,
      ((ix0 - sq.x) / sq.w) * n, ((iy0 - sq.y) / sq.h) * n, ((ix1 - ix0) / sq.w) * n, ((iy1 - iy0) / sq.h) * n);
    const list = bk.holes.get(f.photoId) || [];
    list.push({ x: (ix0 - r.x) / r.w, y: (iy0 - r.y) / r.h, w: (ix1 - ix0) / r.w, h: (iy1 - iy0) / r.h, at: now });
    bk.holes.set(f.photoId, list);
  }
  if (B.cutTint) {
    g.globalCompositeOperation = 'color';
    g.fillStyle = B.cutTint;
    g.fillRect(0, 0, n, n);
    g.globalCompositeOperation = 'source-over';
  }
  bookUI.addPiece(c, shown, r.item.photo.height_in);
  app.pieces.push({ canvas: c, h: r.item.photo.height_in, sec: bk.sec });
  if (bookUI.tutorial) { bk.tutorialDone = true; bookUI.hideTutorial(); }
  // 这一页第一次切到：卡片翻过来，介绍这个构件（只有每个 section 的第一页有介绍）
  if (bk.card === 'front') {
    const text = (bk.cur.id && T.photoIntros && T.photoIntros[bk.cur.id]) || (bk.idx === 0 ? sectionText().intro : '');
    bk.card = 'intro';
    // 介绍读一会儿自己往下走：按字数算（最少 3 秒，最多 6 秒）
    bk.introUntil = now + B.flipMs + (text ? Math.max(3000, Math.min(6000, 1800 + text.length * 40)) : B.noIntroMs);
    if (text) bookUI.flipTo('intro', { text, dur: bk.introUntil - now - B.flipMs });
  }
}

const sectionText = () => (T.sections && T.sections[bk.sec]) || { intro: '', question: { prompt: '', sentence: '___' } };

// 介绍看完：同一个 section 还有下一页 → 自动往上走（不用再抬头）；最后一页 → 直接问这一段的问题
function toNext() {
  const last = bk.idx + 1 >= book.sections[bk.sec].groups.length;
  if (last) { bk.card = 'ready'; askSection(); return; }
  showSpread(bk.idx + 1, performance.now(), false);
}

// 这个 section 结束（回答完 / 跳过）：卡片翻回历史照片 → 下一个 section 的指引（7 个都完了 → 羽毛落下）
function finishSection() {
  const now = performance.now();
  const im = cardOf(bk.cur);
  bookUI.setFront(im && !im.virtual ? `../data/${im.file}` : null);
  bk.card = 'front';
  if (bk.sec + 1 < book.sections.length) {
    bk.next = bk.sec + 1;
    bk.phase = book.sections[bk.next].sky ? 'skyguide' : 'guide';
    bk.guideAt = now;
  } else {
    bk.phase = 'done';
    bk.doneAt = now;
    if (sectionSound) sectionSound.stop();
    stopPhotoVideo();
    driver.releaseFrame();
    bookUI.toc(null);
    // 结尾就在天空里：纸羽毛从天上落下来 → 落地，碎片拼成那张纸（landFeather）
    setState('falling');
    playFeather();
    app.fallFrom = app.camY;
  }
}

// Yes：卡片放大成填空；填完 → 下一个 section 的指引（7 个都完了 → 羽毛落下）
function askSection() {
  if (bk.card !== 'ready') return;
  bk.card = 'question';
  bk.phase = 'question';
  input.frame.active = false;
  const sec = bk.sec;
  const q = sectionText().question;
  bookUI.openQuestion(q, (answers) => {
    if (answers) {
      app.answerParts[sec] = answers;
      const parts = q.sentence.replace(/\[([^\]]*)\]/g, '$1').split('___');
      app.answers[sec] = parts.map((p, i) => p + (i < answers.length ? answers[i] || '…' : '')).join('').trim();
      try { localStorage.setItem(C.storage.answers, JSON.stringify(app.answers)); } catch { /* */ }
    }
    finishSection();
  }, '');
}

// 这个 section 和下一个 section 的图片开始下载（书里别的页不下载）
function preloadSection(i) {
  for (const k of [i, i + 1]) if (book.sections[k]) book.sections[k].groups.forEach(loadGroup);
}

// 两只手示范怎么比框（框在第一张自己拍的照片上）
function showCutTutorial(withSkip) {
  const r = bookRects(performance.now())[0];
  if (!r) return;
  const side = Math.min(r.w, r.h) * 0.6;
  const v = driver.vision;
  const noCam = driver.keysOnly || !v || v.status === 'no-camera' || v.status === 'error';
  const text = MOBILE ? T.book.tutorialMobile : noCam ? T.book.noCam : T.book.tutorial;
  const skip = withSkip && !MOBILE ? ` ${noCam ? T.book.skipHintKeys : T.book.skipHint}` : '';
  bookUI.showTutorial({ x: r.x + r.w / 2 - side / 2, y: r.y + r.h / 2 - side / 2, w: side, h: side }, text + skip);
}

// 抬头的提示：r = 卡片（放在卡片下面）；null = 屏幕下方中间（指引的时候）
let lookHinted = '';
const hintKey = () => `${bk.phase}|${bk.sec}|${bk.idx}|${bk.card}`;
function lookHint(r) {
  const key = hintKey();
  if (lookHinted === key) return;
  lookHinted = key;
  const v = driver.vision;
  const keys = MOBILE ? false : driver.keysOnly || !v || v.status !== 'ready';
  const u = Math.min(app.W / 96, app.H / 62);
  const at = r ? { x: r.x, y: r.y + r.h + u } : { x: app.W / 2 - 10 * u, y: app.H * 0.72 };
  bookUI.hintAt(at.x, at.y, keys ? T.book.lookHintKeys : T.book.lookHint);
}

// ================================================================ 天空
// 抬头进入天空：最后那页书往下沉、淡掉；背景从灰渐变成天空视频的蓝；尺子上的数字一路冲上去；
// 天空视频在中间浮现（四边羽化，背景跟着视频取颜色，看不出边）；一路切下来的鸽子从下面一只只飞上去；
// 最后问天空那一句（不答也会自己跳过）→ 结尾
const skyScene = { vid: null, birds: [], askAfter: 0 };
// 鸽子起飞的时间（从进入天空算）：对到翅膀声开始的那一刻；声音还没好就按设置里的
function birdsStart() {
  const w = skySound && skySound.wingsAt();
  return w ? Math.max(0, w - bk.skyAt) : C.book.skyScene.birdsAt;
}
function startSky(now) {
  const S = C.book.skyScene;
  bk.phase = 'sky';
  bk.skyAt = now;
  bk.skyAsked = false;
  bk.card = 'front';
  stopPhotoVideo();
  bookUI.caption(null);
  bookUI.place(null);                                  // 历史照片的卡片收掉（天空里没有书页了）
  bookUI.hideTutorial();
  if (!bookUI.tutorial) bookUI.setHint('');
  if (!skyScene.vid) {
    const v = document.createElement('video');
    Object.assign(v, { muted: true, playsInline: true, loop: true, preload: 'auto', src: S.video });
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.className = 'hidden-video';
    document.body.appendChild(v);
    skyScene.vid = v;
  }
  quiet(skyScene.vid.play());
  // 鸽子：一路切下来的那些，从屏幕底下错开飞上去
  const n = app.pieces.length;
  skyScene.birds = app.pieces.map((p, i) => ({
    canvas: p.canvas,
    x: 0.18 + ((i * 0.618) % 1) * 0.64,                 // 横向散开（黄金比例错开，不会挤在一起）
    delay: i * S.birdStaggerMs,
    sway: (i % 2 ? 1 : -1) * (0.02 + ((i * 7) % 5) * 0.008),
    rot: ((i * 37) % 21) - 10,
  }));
  skyScene.askAfter = n * S.birdStaggerMs + S.birdFlyMs * 0.6;      // 鸽子起飞以后多久问天空那一句
}
// 天空视频在屏幕上的位置：竖的，在中间，差不多一屏高
function skyVideoRect() {
  const { W, H } = app;
  const h = H * C.book.skyScene.videoHeight;
  const w = Math.min(W * 0.6, (h * 9) / 16);
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}
function quiet(p) { return p && p.catch ? p.catch(() => {}) : p; }

function drawSkyScene(now, L, o) {
  const { W, H } = app;
  const S = C.book.skyScene;
  const t = now - bk.skyAt;
  // 最后那页书往下沉、淡掉（我们往上了）
  const sink = ease(Math.min(1, t / S.sinkMs));
  if (bk.cur && bk.baseY !== null && sink < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - sink;
    const y = bk.baseY + sink * H * 0.9;
    drawSpread(ctx, bk.cur, L, y, 1, o);
    ctx.restore();
  }
  // 基线（地平线）留着，把两边的尺子连起来
  if (bk.cur && bk.baseY !== null) drawBaseline(ctx, bk.cur, L, bk.baseY, W, C.book.ink, 1 - 0.65 * sink);
  // 天空视频：慢慢浮现，四边羽化
  const v = skyScene.vid;
  if (v && v.readyState >= 2 && t > S.videoAt) {
    drawFeathered(v, skyVideoRect(), Math.min(1, (t - S.videoAt) / C.book.skyBg.videoFadeMs));
  }
  // 鸽子飞上去：从屏幕底下出来，左右轻轻摆，飞出屏幕上方
  const u = Math.min(W / 96, H / 62);
  const size = S.birdU * u;
  for (const b of skyScene.birds) {
    const k = (t - birdsStart() - b.delay) / S.birdFlyMs;
    if (k <= 0 || k >= 1) continue;
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const x = W * (b.x + Math.sin(k * Math.PI * 2) * b.sway);
    const y = H + size - e * (H + 2 * size);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((b.rot * (1 - k)) * Math.PI) / 180);
    ctx.globalAlpha = Math.min(1, k * 8);
    ctx.drawImage(b.canvas, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
}

// 目录的每一项：名字、高度（这一段最后一页的高度；天空用 content.js 里的）
function tocItems() {
  return book.sections.map((s, k) => {
    const t = T.sections[k] || {};
    const gs = s.groups;
    return { name: t.name || s.key, h: Math.round(s.sky ? t.height || C.book.skyScene.height : gs.length ? gs[gs.length - 1].height_in : 0) };
  });
}

// 目录里点了一段：直接跳过去（正在答的问题收掉；从天空跳回来，天空也收掉）
function jumpTo(i) {
  if (!book || app.state !== 'ascent' || i === bk.sec || !book.sections[i]) return;
  bookUI.cancelQuestion();
  bookUI.hideTutorial();
  bookUI.setHint('');
  bk.snap = null;
  bk.aim = null;
  if (bk.skyAt >= 0 && !book.sections[i].sky) {
    bk.skyAt = -1;
    if (skyScene.vid) skyScene.vid.pause();
  }
  enterSection(i, performance.now());
}

// 大幅度抬头（或按住 ↑）保持一会儿：不找鸽子也往上走——同一段还有下一页就去下一页，不然进下一段
function skipAhead(now) {
  bookUI.hideTutorial();
  bookUI.setHint('');
  bk.snap = null;
  bk.aim = null;
  if (bk.idx + 1 < book.sections[bk.sec].groups.length) showSpread(bk.idx + 1, now, false);
  else if (bk.sec + 1 < book.sections.length) enterSection(bk.sec + 1, now);
}

function enterSection(i, now) {
  bk.sec = i;
  bookUI.toc(i, tocItems());                           // 屏幕上方的目录：现在第几段
  preloadSection(i);
  // 去天空之前的那段声音：路灯开始时从头放；进入天空时接到翅膀拍动
  const sec = book.sections[i];
  if (skySound && sec.key === C.book.skySound.startSection) skySound.start();
  if (skySound && sec.sky) skySound.toFinale();
  if (sectionSound) sectionSound.enter(sec.key);      // 这个 section 自己的一点声音（雨、铃声、嘀嗒……）
  if (sec.sky) { startSky(now); return; }
  bk.phase = 'section';
  bk.enterAt = now;
  showSpread(0, now, true);
  // 第一次：两只手示范怎么比框（框在第一张自己拍的照片上）
  if (!bk.tutorialDone) {
    setTimeout(() => {
      if (bk.tutorialDone || bk.phase !== 'section' || bk.card !== 'front') return;
      bk.cutHinted = true;
      showCutTutorial();
    }, C.book.enterMs);
  }
}

function showSpread(j, now, entering) {
  const B = C.book;
  const g = book.sections[bk.sec].groups[j];
  // 同一个 section 里：高度变了 → 直接上升（像进入 section 一样，新的一页从上面落下来）；高度一样 → 方块翻页
  const rise = entering || !bk.cur || g.height_in !== bk.cur.height_in;
  if (rise) bk.enterAt = now;
  bk.enterDir = !bk.cur || g.height_in < bk.cur.height_in ? 1 : -1;   // 第一页 / 往下跳：从下面滑上来；往上：从上面落下来
  if (sectionSound && !entering) sectionSound.spread();
  bk.cutHinted = false;
  bk.upAt = 0;
  if (!bookUI.tutorial) bookUI.setHint('');
  bk.prev = bk.cur;
  bk.prevEnter = rise;
  bk.idx = j;
  bk.cur = g;
  bk.switchedAt = now;
  if (rise) bk.baseY = null;
  if (!bk.marks.has(g.height_in)) bk.marks.set(g.height_in, g.baseline_y);
  // 翻页：上一页的照片先被黑块一张张收走，然后这一页一张张拉出来
  const rv = { stagger: B.revealStaggerMs, dur: B.revealMs };
  bk.outAt = now;
  bk.inAt = rise ? now : now + (bk.prev ? revealTotal(bk.prev, rv) * 0.75 : 0);
  bk.targetH = g.height_in;
  // 这一页的卡片：先是历史照片（天空：空的）；照片的信息等这一页落定以后浮现在卡片四周
  bk.card = 'front';
  const im = cardOf(g);
  bookUI.setFront(im && !im.virtual ? `../data/${im.file}` : null);
  const settle = rise ? B.enterMs : revealTotal(g, rv);
  bookUI.caption(im && !im.virtual && B.historicalPhotos ? parseCaption(im.caption) : null, settle);
  // 天空的最后一页：右边空着的那一栏出现天空视频
  const last = book.sections[bk.sec].sky && j === book.sections[bk.sec].groups.length - 1;
  if (last && B.videos && B.videos.last && im) bookUI.video(B.videos.last, settle + B.videos.last.delayMs, bookUI.hideCaption);
  // 建筑那几页：视频在自己拍的鸽子照片上快速放一遍
  stopPhotoVideo();
  const pv = B.photoVideos && g.id && B.photoVideos[g.id];
  if (pv) startPhotoVideo(g, pv, settle + pv.delayMs);
}

// ---- 鸽子照片上放一遍视频（config.book.photoVideos），放完淡回原来的照片。画在书页的 canvas 上
let photoVid = null;            // { item, el, onAt, offAt, timer }
const PHOTO_VIDEO_FADE = 350;
function startPhotoVideo(g, cfg, delay) {
  // 放在这一页最大的那张自己拍的照片上
  const im = g.images.filter((x) => x.own).sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (!im) return;
  const el = document.createElement('video');
  Object.assign(el, { muted: true, playsInline: true, preload: 'auto', src: cfg.src });
  el.setAttribute('muted', '');
  el.setAttribute('playsinline', '');
  el.className = 'hidden-video';
  document.body.appendChild(el);
  const rate = () => { el.defaultPlaybackRate = cfg.rate || 1; el.playbackRate = cfg.rate || 1; };
  el.addEventListener('loadedmetadata', rate);
  const pv = { item: im.item, el, onAt: 0, offAt: 0, timer: 0 };
  el.addEventListener('ended', () => { pv.offAt = performance.now(); });
  pv.timer = setTimeout(() => {
    if (photoVid !== pv) return;
    rate();
    el.play().then(() => { pv.onAt = performance.now(); }).catch(() => stopPhotoVideo());
  }, delay);
  photoVid = pv;
}
function stopPhotoVideo() {
  const pv = photoVid;
  if (!pv) return;
  photoVid = null;
  clearTimeout(pv.timer);
  pv.el.pause();
  pv.el.remove();
}
function drawPhotoVideo(r) {
  const pv = photoVid;
  if (!pv || pv.item !== r.item || !pv.onAt) return;
  const now = performance.now();
  const a = pv.offAt ? 1 - (now - pv.offAt) / PHOTO_VIDEO_FADE : Math.min(1, (now - pv.onAt) / PHOTO_VIDEO_FADE);
  if (a <= 0) { stopPhotoVideo(); return; }
  const v = pv.el;
  if (v.readyState < 2 || !v.videoWidth) return;
  // 裁成照片的形状（cover）
  const k = Math.max(r.w / v.videoWidth, r.h / v.videoHeight);
  const sw = r.w / k;
  const sh = r.h / k;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, r.x, r.y, r.w, r.h);
  ctx.restore();
}

// 进入 section：新的跨页滑进来。第一页从下面滑上来（线框散开之后）；之后从上面落下来，上一页往下走（像抬头）
// 返回这一页现在离它该在的位置差多少（px，正 = 在下面）
function enterShift(now) {
  const e = bk.prevEnter ? enterOffset(now) : 1;
  return (1 - e) * app.H * bk.enterDir;
}
function enterOffset(now) {
  const k = Math.min(1, (now - bk.enterAt) / C.book.enterMs);
  return ease(k);
}

function bookRects(now) {
  if (bk.phase === 'done') return [];
  if (!bk.cur || bk.baseY === null) return [];
  const L = bookLayout(book, app.W, app.H, C.book);
  return spreadRects(bk.cur, L, bk.baseY + enterShift(now));
}

function drawBookScene(now) {
  const { W, H } = app;
  const B = C.book;
  ctx.fillStyle = B.background;
  ctx.fillRect(-W, -H, W * 3, H * 3);
  const L = bookLayout(book, W, H, B);
  drawSkyBg(now, L);
  const o = { ink: B.ink, bar: B.revealColor, historical: B.historical, historicalPhotos: B.historicalPhotos, captions: B.captions, numbers: B.numbers,
    sans: sansFont(), mono: monoFont(), drawOnPhoto: (r) => { drawPhotoVideo(r); drawHoles(r); } };

  if (bk.skyAt >= 0) {
    drawSkyScene(now, L, o);
  } else if (bk.phase === 'done') {
    // 最后：最后一页的照片被黑块收走，后面是纽约此刻的天空颜色（羽毛在这里落下）
    const s = skyColors();
    const k = Math.min(1, (now - bk.doneAt) / 1600);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(s.top, k));
    g.addColorStop(1, rgb(s.bottom, k));
    ctx.fillStyle = g;
    ctx.fillRect(-W, -H, W * 3, H * 3);
    if (bk.cur && bk.baseY !== null) {
      const rv = { stagger: B.revealStaggerMs, dur: B.revealMs, now, start: bk.doneAt, mode: 'out' };
      drawSpread(ctx, bk.cur, L, bk.baseY, 1, { ...o, reveal: rv });
      drawBaseline(ctx, bk.cur, L, bk.baseY, W, B.ink, 1 - k);
    }
  } else if (bk.cur && bk.baseY !== null) {
    if (bk.prevEnter) {
      const e = enterOffset(now);
      if (bk.prev && e < 1) {
        const pb = baselineOf(bk.prev, L) - e * H * bk.enterDir;
        drawSpread(ctx, bk.prev, L, pb, 1, o);
        drawBaseline(ctx, bk.prev, L, pb, W, B.ink, 1 - e);
      }
      const y = bk.baseY + enterShift(now);
      drawSpread(ctx, bk.cur, L, y, 1, { ...o, skip: cardOf(bk.cur) });
      drawBaseline(ctx, bk.cur, L, y, W, B.ink, 1);
    } else {
      // 翻页：黑块把上一页的照片一张张收走，再把这一页一张张拉出来；基线慢慢移过去
      const rv = { stagger: B.revealStaggerMs, dur: B.revealMs, now };
      if (bk.prev && now < bk.inAt + revealTotal(bk.cur, rv)) {
        drawSpread(ctx, bk.prev, L, baselineOf(bk.prev, L), 1, { ...o, reveal: { ...rv, start: bk.outAt, mode: 'out' } });
      }
      drawSpread(ctx, bk.cur, L, bk.baseY, 1, { ...o, skip: cardOf(bk.cur), reveal: { ...rv, start: bk.inAt, mode: 'in' } });
      drawBaseline(ctx, bk.cur, L, bk.baseY, W, B.ink, 1);
    }
  }

  if (app.state !== 'dashboard' && app.state !== 'end') drawHeights(now, L);
}

// 天空这个 section 的背景：和最后那段天空视频一样的蓝（从上到下的渐变照视频取的颜色），
// 对齐右边那一栏（视频出现的地方），这样看不出哪里是视频、哪里是背景，像真的看到了天空。
// 视频放着的时候，每一帧从视频里取颜色（镜头在动，天空的蓝也在变），背景跟着它慢慢变
const skyLive = { stops: null, g: null };
function drawSkyBg(now, L) {
  const S = C.book.skyBg;
  if (!S || bk.skyAt < 0) return;
  const k = ease(Math.min(1, (now - bk.skyAt) / S.fadeMs));
  const r = skyVideoRect();
  if (!skyLive.stops) skyLive.stops = S.stops.map((c) => hex(c));
  const v = skyScene.vid;
  if (v && v.readyState >= 2 && now - bk.skyAt > C.book.skyScene.videoAt) sampleVideo(v, r.w / r.h);
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  const n = skyLive.stops.length;
  skyLive.stops.forEach((c, i) => g.addColorStop(i / (n - 1), `rgb(${c.map(Math.round).join(',')})`));
  ctx.save();
  ctx.globalAlpha = k;
  ctx.fillStyle = g;
  ctx.fillRect(-app.W, -app.H, app.W * 3, app.H * 3);
  // 云（Kiara 给的天空照片）铺满整个屏幕，盖在蓝色上
  if (cloudImg.complete && cloudImg.naturalWidth) {
    const { W, H } = app;
    const s = Math.max(W / cloudImg.naturalWidth, H / cloudImg.naturalHeight);
    const cw = cloudImg.naturalWidth * s;
    const ch = cloudImg.naturalHeight * s;
    ctx.globalAlpha = k * S.cloudAlpha;
    ctx.drawImage(cloudImg, (W - cw) / 2, (H - ch) / 2, cw, ch);
  }
  ctx.restore();
}
const cloudImg = new Image();
cloudImg.src = 'assets/sky/clouds.jpg';
// 融进背景的视频画在书页的 canvas 上（不用 <video> 直接显示：浏览器显示视频和画 canvas 的颜色不完全一样，
// 画在同一个 canvas 上，和背景取的颜色才对得上）：裁成那一栏的形状，四边羽化，慢慢浮现
let featherCv = null;
function drawFeathered(v, r, alpha) {
  const S = C.book.skyBg;
  const dpr = devicePixelRatio;
  const w = Math.round(r.w * dpr);
  const h = Math.round(r.h * dpr);
  if (!featherCv) featherCv = document.createElement('canvas');
  if (featherCv.width !== w || featherCv.height !== h) { featherCv.width = w; featherCv.height = h; }
  const g = featherCv.getContext('2d');
  const vw = v.videoWidth;
  const vh = v.videoHeight;
  const sw = Math.min(vw, (vh * r.w) / r.h);
  const sh = Math.min(vh, (vw * r.h) / r.w);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, w, h);
  // 只要视频里的鸽子：变黑白、提亮到天空几乎全白，只剩鸽子是深的；下面用「正片叠底」印到云上（云是连续的，看不出视频的边）
  g.filter = 'grayscale(1) brightness(2.4) contrast(1.6)';
  g.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, w, h);
  g.filter = 'none';
  g.globalCompositeOperation = 'destination-in';
  const fx = S.featherX;
  const fy = S.featherY;
  const gx = g.createLinearGradient(0, 0, w, 0);
  gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(fx, '#000'); gx.addColorStop(1 - fx, '#000'); gx.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gx;
  g.fillRect(0, 0, w, h);
  const gy = g.createLinearGradient(0, 0, 0, h);
  gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(fy, '#000'); gy.addColorStop(1 - fy, '#000'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gy;
  g.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(featherCv, r.x, r.y, r.w, r.h);
  ctx.restore();
}

// 视频里露出来的那一条（object-fit: cover，竖着居中），缩成 16 × n 的小图，每一行取平均 → 背景的渐变；慢慢靠过去，不闪
function sampleVideo(v, aspect) {
  const n = skyLive.stops.length;
  if (!skyLive.g) {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = n;
    skyLive.g = c.getContext('2d', { willReadFrequently: true });
  }
  const vw = v.videoWidth;
  const vh = v.videoHeight;
  const sw = Math.min(vw, vh * aspect);
  const sh = Math.min(vh, vw / aspect);
  try {
    skyLive.g.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, 16, n);
    const d = skyLive.g.getImageData(0, 0, 16, n).data;
    for (let y = 0; y < n; y++) {
      const m = [0, 0, 0];
      for (let x = 0; x < 16; x++) for (let i = 0; i < 3; i++) m[i] += d[(y * 16 + x) * 4 + i] / 16;
      const cur = skyLive.stops[y];
      for (let i = 0; i < 3; i++) cur[i] += (m[i] - cur[i]) * 0.06;
    }
  } catch { /* 视频还没准备好 */ }
}

// 高度尺：屏幕左右各一根贯穿全屏的细线（和 dashboard 的线一样），书页的基线横过去把两根连起来。
//   刻度挂在线上、朝书页那边伸：每 3″ 一根短的，每 12″ 一根长的；数字（等宽字）写在线外面
//   现在的高度：基线和尺子相交的地方，黑色粗刻度 + 大一号的数字；上升时刻度往下滚、数字往上数
//   去过的高度：一根浅灰的长刻度
//   该抬头的时候（指引）：一道黑的刻度沿着两根尺子往上走，旁边竖排的 LOOK UP 跟着走（像 dashboard 卡片两边的竖排句子）
function drawHeights(now, L) {
  const B = C.book;
  const { W, H } = app;
  if (!bk.cur || bk.baseY === null || bk.rulerH === null) return;
  const u = Math.min(W / 96, H / 62);
  const ppi = H / B.rulerInchesPerScreen;            // 1 英寸多少像素
  const y0 = baselineOf(bk.cur, L);                  // 现在的高度在这条线上
  const hNow = bk.rulerH;
  const yOf = (h) => y0 - (h - hNow) * ppi;
  const mono = monoFont();
  const xl = Math.round(Math.min(B.sidePx * 0.62, L.ox - 2 * u)) + 0.5;    // 两根尺子线
  const xr = Math.round(W - (xl - 0.5)) - 0.5;
  // 天空里：线和字变成白色（灰色在蓝天上看不清），跟着背景一起变
  const skyK = bk.skyAt >= 0 ? ease(Math.min(1, (now - bk.skyAt) / C.book.skyBg.fadeMs)) : 0;
  const mixC = (a, b) => { const x = hex(a); const y = hex(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * skyK)).join(',')})`; };
  const lineC = mixC(B.rulerLine, '#ffffff');
  const inkC = mixC(B.ink, '#ffffff');
  const visitedC = mixC(B.visitedInk, '#dce8f8');
  const guiding = bk.phase === 'guide' || bk.phase === 'skyguide' || bk.skipSince > 0;
  const wave = guiding ? ((now - bk.guideAt) % 1800) / 1800 : -1;           // 指引：一道光从基线往上走
  const waveY = guiding ? y0 - ease(wave) * (y0 - 3 * u) : -1e9;
  ctx.save();
  // 两根线
  ctx.strokeStyle = lineC;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(xl, 0); ctx.lineTo(xl, H); ctx.moveTo(xr, 0); ctx.lineTo(xr, H); ctx.stroke();
  // 刻度和数字
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.max(10, 0.9 * u)}px ${mono}`;
  const lo = Math.max(0, Math.floor((hNow - (H - y0) / ppi) / 3) * 3);
  const hi = hNow + y0 / ppi;
  for (let h = lo; h <= hi; h += 3) {
    const y = Math.round(yOf(h)) + 0.5;
    const foot = h % 12 === 0;
    const lit = guiding && y < y0 - u && Math.abs(y - waveY) < 2.4 * u;
    const len = (foot ? 1.3 * u : 0.6 * u) * (lit ? 2 : 1);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = lit ? inkC : lineC;
    ctx.lineWidth = lit ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(xl, y); ctx.lineTo(xl + len, y); ctx.moveTo(xr, y); ctx.lineTo(xr - len, y); ctx.stroke();
    if (foot && Math.abs(y - y0) > 1.8 * u) {
      ctx.fillStyle = lit ? inkC : lineC;
      ctx.textAlign = 'right'; ctx.fillText(`${h}″`, xl - 0.6 * u, y);
      ctx.textAlign = 'left'; ctx.fillText(`${h}″`, xr + 0.6 * u, y);
    }
  }
  // 去过的高度：浅灰的长刻度
  ctx.strokeStyle = visitedC;
  ctx.lineWidth = 1;
  for (const h of bk.marks.keys()) {
    if (Math.abs(h - hNow) < 1) continue;
    const y = Math.round(yOf(h)) + 0.5;
    if (y < -10 || y > H + 10) continue;
    ctx.beginPath(); ctx.moveTo(xl, y); ctx.lineTo(xl + 3.2 * u, y); ctx.moveTo(xr, y); ctx.lineTo(xr - 3.2 * u, y); ctx.stroke();
  }
  // 现在的高度：粗刻度 + 大一号的数字（上升时一路往上数）
  const y = Math.round(y0) + 0.5;
  ctx.strokeStyle = inkC;
  ctx.fillStyle = inkC;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(xl - 1.2 * u, y); ctx.lineTo(xl + 2.4 * u, y); ctx.moveTo(xr + 1.2 * u, y); ctx.lineTo(xr - 2.4 * u, y); ctx.stroke();
  ctx.font = `${Math.max(13, 1.3 * u)}px ${mono}`;
  ctx.textBaseline = 'alphabetic';
  const label = `${Math.round(hNow)}″`;
  ctx.textAlign = 'right'; ctx.fillText(label, xl - 0.6 * u, y - 0.5 * u);
  ctx.textAlign = 'left'; ctx.fillText(label, xr + 0.6 * u, y - 0.5 * u);
  // 指引：竖排的 LOOK UP 贴着两根尺子，跟着那道光往上走
  if (guiding) {
    ctx.font = `${Math.max(13, 1.24 * u)}px ${sansFont()}`;
    ctx.globalAlpha = Math.max(0, Math.min(1, wave * 6, (1 - wave) * 4));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [x, rot] of [[xl + 3.4 * u, -Math.PI / 2], [xr - 3.4 * u, Math.PI / 2]]) {
      ctx.save();
      ctx.translate(x, waveY);
      ctx.rotate(rot);
      ctx.fillText(T.book.up, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}

// 切掉的地方：白色的洞，像被剪开了一样
function drawHoles(r) {
  const list = bk.holes.get(r.item.photo.id);
  if (!list) return;
  const now = performance.now();
  for (const h of list) {
    const x = r.x + h.x * r.w;
    const y = r.y + h.y * r.h;
    const w = h.w * r.w;
    const hh = h.h * r.h;
    // 洞从中间张开（像被剪开），切口上有一条细线，慢慢淡掉
    const k = Math.min(1, (now - h.at) / 380);
    const e = 1 - Math.pow(1 - k, 3);
    ctx.fillStyle = C.book.holeColor;
    ctx.fillRect(x + (w * (1 - e)) / 2, y + (hh * (1 - e)) / 2, w * e, hh * e);
    const line = Math.max(0, 1 - (now - h.at - 300) / 1400);
    if (line > 0) {
      ctx.save();
      ctx.globalAlpha = line;
      ctx.strokeStyle = C.book.ink;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(hh) - 1);
      ctx.restore();
    }
  }
}

// 指引的字（bookui.js 画在屏幕上方）
function guideText() {
  if (app.state !== 'ascent' || (bk.phase !== 'guide' && bk.phase !== 'skyguide')) return '';
  if (bk.sec === -1) return '';                  // 第一页不需要指引（进来直接就是）
  return '';                                     // 指引画在尺子上（drawHeights），屏幕中间不放字
}

// ================================================================ 绘制

function draw(now) {
  const { W, H } = app;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  const h = app.h || 0;
  const z = BOOK ? { bgCss: C.book.background, blur: 0, fog: 0, gray: 0, skyness: 0 } : zoneAt(h);

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
    const m = BOOK && !bookZoom() ? 1 : input.zoomValue;
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
      if (BOOK) corners(r, Math.max(10, 0.22 * Math.min(r.w, r.h)), frame.alpha);     // 书页：只有右上、左下两个角
      else drawFrameMarks(ctx, r, FRAME_CFG, inkCss());
      ctx.restore();
    }
  }

  if (BOOK && bookUI) bookUI.guide(guideText());
  if (BOOK && bk.phase === 'section') drawCutting(now);

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
  if (C.spots.show && !BOOK) drawSpots(ctx, input.yaw, now, inkCss(), fmtHeight, `10px ${monoFont()}`);

  // 最高处：找到的鸽子飞进天空
  if (app.state === 'top' && app.flock) drawFlock(ctx, app.flock, now - app.stateAt - 1500);

  // 羽毛落下
  if (app.state === 'falling' || app.state === 'top') drawFalling(now);
  if (app.state === 'end' && !NEW_DASH) drawEndFeather();
}

// 整个世界：背景 → 每一行（照片、基线、图注、被找到的鸽子）→ 地面上的羽毛 → 雾 → 事实 → 高度尺
// clear = 取景框里面：不模糊、不加雾
function drawScene(now, z, clear) {
  if (BOOK && book) { drawBookScene(now); return; }
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
// 落下来的是 Kiara 折好的纸羽毛（扫描的最后两张：两个面）。像一片叶子：左右摆、慢慢转，
// 翻过去的时候（变窄到侧面）换成另一面
const fallImgs = ['assets/fold/step11.png', 'assets/fold/step12.png'].map((src) => { const i = new Image(); i.src = src; return i; });
function drawFalling(now) {
  const { W, H } = app;
  const since = now - app.stateAt;
  if (app.state === 'top') return;
  const k = Math.min(1, since / C.ending.featherFallMs);
  const wind = windVector();
  const sway = Math.sin(since / 1400) * W * 0.08;
  const drift = wind.x * wind.strength * W * 0.12 * Math.sin(k * Math.PI);
  const x = W / 2 + sway + drift;
  const y = H * (0.12 + 0.55 * Math.min(1, k * 1.2));
  const ang = Math.sin(since / 1400 + 0.6) * 0.45 + 0.1;
  const turn = Math.cos(since / C.ending.featherTurnMs * Math.PI);       // 1 → -1 → 1：翻一面再翻回来
  const img = fallImgs[turn >= 0 ? 0 : 1];
  if (!img.complete || !img.naturalWidth) {
    drawFeather(ctx, x, y, ang, C.ending.featherLengthPx, C.ending.featherWidthPx, featherColors(found), 7);
    return;
  }
  const s = C.ending.featherLengthPx / Math.max(img.naturalWidth, img.naturalHeight);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(Math.max(0.08, Math.abs(turn)), 1);
  ctx.drawImage(img, (-img.naturalWidth * s) / 2, (-img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  ctx.restore();
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
  if (BOOK) {
    // 落地的同时，一路切下来的碎片在蓝天上拼成那张纸，翻过来是诗；下面一个按钮回到 dashboard
    setState('sheet');
    showSheet({ clear: true, onHome: toEnd });
    return;
  }
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
  if (BOOK) return C.book.ink;
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
  $('eTutorial').style.cursor = 'pointer';
  $('eTutorial').onclick = () => openFold(T.sheet);
  $('eAgain').textContent = T.dashboard.again;
  $('dClear').textContent = app.groundFeathers.length ? `${app.groundFeathers.length} feather${app.groundFeathers.length > 1 ? 's' : ''} on the ground · X to clear` : '';
  renderCircles();
  app.view.s = C.intro.zoomStart;
  app.view.dy = dashDy();
  layoutDashboard(1);

  $('dBegin').onclick = begin;
  $('eDownload').onclick = async () => {
    if (BOOK) { showSheet(); return; }
    const s = await renderSheets(sheetData());
    downloadCanvas(s.front, 'feather-front.png');
    setTimeout(() => downloadCanvas(s.back, 'feather-back.png'), 400);
  };
  $('ePrint').onclick = async () => (BOOK ? showSheet() : printSheets(await renderSheets(sheetData())));
  $('eAgain').onclick = () => location.reload();
}

// 书：最后的纸（碎片拼成的网格，翻过来是诗），在 js/sheet.js
function showSheet(opts = {}) {
  if (!BOOK || !book) return;
  const secs = book.sections.map((s, i) => T.sections[i]).filter(Boolean);
  openSheet({
    ...opts,
    pieces: app.pieces, sections: secs, answers: app.answerParts, T: T.sheet,
    // 尺子上的高度：这一段最后一页（问问题的那一页）的高度；天空用 content.js 里的
    heights: secs.map((s, i) => { const gs = book.sections[i].groups; return book.sections[i].sky ? s.height : gs.length ? gs[gs.length - 1].height_in : 0; }),
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  });
}
window.lookUp.sheet = showSheet;
window.lookUp.fold = () => openFold(T.sheet);

function sheetData() {
  return { found, answers: app.answers, questions: BOOK && T.sections ? T.sections.map((x) => x.question.prompt) : T.questions, date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), fmtHeight };
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
  if (skyScene.vid) skyScene.vid.pause();
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
    ...(BOOK ? [`book      ${bk.phase} · section ${bk.sec + 1} · spread ${bk.cur ? bk.cur.id || 'sky' : '—'} · card ${bk.card} · cut ${found.length}`] : []),
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
  bk.baseY = null;
  if (app.state === 'dashboard' && !NEW_DASH) { app.view.dy = dashDy(); layoutDashboard(1); }
  if (app.state === 'end') layoutDashboard(1);
}
window.addEventListener('resize', () => { if (world) resize(); });

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function median(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

boot();
