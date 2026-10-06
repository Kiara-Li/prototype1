// 鸽子视线实验
// 摄像头读头部俯仰角 → 换算成高度 → 翻到书里对应高度的那一组。
//
// 两只手比 L 形取景框 → 框里放大看（阶段 4；默认在单独的 frame.html 上，config.frame.onMainPage 打开主页面上的）。
//
// 按键：D 调试窗口 · F 全屏 · C 校准 · G 切换角度→高度算法
//      ↑ / ↓ 手动模拟抬头低头（没有摄像头时也能看效果）· M 回到摄像头
//      Shift + 鼠标拖动：手动画一个取景框

import { drawElevation } from './elevation.js';
import { classifyHand, createFrameState, updateFrame, zoomFor, drawFrameMarks, HAND_EDGES } from './frame.js';
import { FaceLandmarker, HandLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

const C = window.CONFIG;
const MP_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const MP_HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const DEG = 180 / Math.PI;
const CALIB_KEY = 'pigeon-calibration-v1';

// ================================================================ 状态

const book = { spread: null, groups: [], images: new Map(), cover: null };

const tracker = {
  status: 'starting',          // starting | tracking | lost | no-camera | error
  message: 'Opening camera…',
  video: null,
  landmarker: null,
  lastVideoTime: -1,
  rawPitch: null,              // 本帧原始角度（已按方向修正，未减零点）
  pitch: null,                 // 校准 + 平滑后的角度，抬头为正
  landmarks: null,
  lostSince: null,
  lastSeenPitch: null,
  losses: [],                  // 最近几次丢失：{ at, pitch, ms }
  manual: false,
  manualPitch: 0,
  heightMode: C.heightMode,
  handLandmarker: null,
  handFrameCount: 0,
  lastHandVideoTime: -1,
};

// 取景框（阶段 4）
const frame = createFrameState();

const calib = Object.assign({ zero: 0, maxUp: null, invert: false }, loadCalib());
const calibRun = { phase: null, start: 0, samples: [], doneAt: 0 };

const view = {
  // 调试：显示时默认只有左上角的摄像头小窗，点一下展开详细信息；D 整个隐藏 / 显示
  debug: C.debug.show,
  expanded: new URLSearchParams(location.search).has('debug'),
  current: null,       // 当前组的下标
  previous: null,      // 正在淡出的组
  switchedAt: -1e9,
  baselineY: null,     // 当前基线在屏幕上的 y（px）
};

// 浏览器控制台里可以看：window.pigeon.frame / .tracker / .view
window.pigeon = { book, tracker, frame, view, calib };

// ================================================================ 读取书的数据

async function loadBook() {
  // 封面勒口上的刻度（左：竖尺，右：高度线）。读不到就不画。
  fetch('data/cover.json').then((r) => r.json()).then((c) => { book.cover = c; }).catch(() => {});
  const data = await (await fetch('data/groups.json')).json();
  book.spread = data.spread;
  const groups = data.groups.map((g) => ({
    ...g,
    height: C.heightOverrides[g.id] ?? g.height_in,
  }));

  // 选组用的「轴」：0 = 最低，1 = 最高
  let running = -Infinity;
  const n = groups.length;
  groups.forEach((g, i) => {
    running = Math.max(running, g.height);
    g.axisHeight = C.selection.monotonic ? running : g.height;
    const byHeight = axisFromHeight(g.axisHeight);
    const byOrder = n > 1 ? i / (n - 1) : 0;
    const w = C.selection.orderWeight;
    g.axis = byHeight * (1 - w) + byOrder * w;
  });
  book.groups = groups;
  book.levels = buildLevels(groups);

  for (const g of groups) {
    for (const im of g.images) {
      const img = new Image();
      img.decoding = 'async';
      img.src = 'data/' + im.file;
      // 原图版本还没生成或丢了：退回书里切出来的版本
      img.onerror = () => { img.onerror = null; img.src = 'data/' + im.file.replace(/^img\//, 'img_pdf/'); };
      book.images.set(im.file, img);
    }
  }
}

// ================================================================ 角度 ↔ 高度

function heightFromPitch(p) {
  if (tracker.heightMode === 'geometry') {
    const { eyeHeight, distance } = C.geometry;
    const clamped = Math.max(-89, Math.min(89, p));
    return Math.max(0, eyeHeight + distance * Math.tan(clamped / DEG));
  }
  const t = C.pitchTable;
  if (p <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (p <= t[i][0]) {
      const [p0, h0] = t[i - 1];
      const [p1, h1] = t[i];
      return h0 + ((p - p0) / (p1 - p0)) * (h1 - h0);
    }
  }
  return t[t.length - 1][1];
}

// 高度 → 轴上的位置（0–1）。用对照表反推角度，再按表的角度范围归一化。
function axisFromHeight(h) {
  const t = C.pitchTable;
  const pMin = t[0][0];
  const pMax = t[t.length - 1][0];
  let p = pMin;
  if (h <= t[0][1]) p = pMin;
  else if (h >= t[t.length - 1][1]) p = pMax;
  else {
    for (let i = 1; i < t.length; i++) {
      if (h <= t[i][1]) {
        const [p0, h0] = t[i - 1];
        const [p1, h1] = t[i];
        p = p0 + ((h - h0) / (h1 - h0 || 1)) * (p1 - p0);
        break;
      }
    }
  }
  return (p - pMin) / (pMax - pMin);
}

// ================================================================ 选组（带回滞）

function chooseGroup(axis, now) {
  const gs = book.groups;
  if (!gs.length) return;
  let best = 0;
  for (let i = 1; i < gs.length; i++) {
    if (Math.abs(gs[i].axis - axis) < Math.abs(gs[best].axis - axis)) best = i;
  }
  if (view.current === null) {
    view.current = best;
    view.switchedAt = now - 1e6;
    return;
  }
  if (best === view.current) return;
  const dCur = Math.abs(gs[view.current].axis - axis);
  const dNew = Math.abs(gs[best].axis - axis);
  if (dCur - dNew < C.selection.hysteresis) return;
  if (now - view.switchedAt < C.selection.minDwellMs) return;
  view.previous = view.current;
  view.current = best;
  view.switchedAt = now;
}

// ================================================================ 摄像头 + MediaPipe

async function startTracking() {
  try {
    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    document.body.appendChild(video);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    tracker.video = video;
    tracker.message = 'Loading face model…';
  } catch (err) {
    tracker.status = 'no-camera';
    tracker.message = 'Camera unavailable: ' + (err && err.message ? err.message : err) + ' (use ↑ ↓ to simulate)';
    return;
  }
  try {
    const files = await FilesetResolver.forVisionTasks(MP_WASM);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MP_MODEL, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFacialTransformationMatrixes: true,
      outputFaceBlendshapes: false,
    });
    try {
      tracker.landmarker = await FaceLandmarker.createFromOptions(files, options('GPU'));
    } catch {
      tracker.landmarker = await FaceLandmarker.createFromOptions(files, options('CPU'));
    }
    tracker.status = 'lost';
    tracker.message = '';
    if (C.frame.onMainPage) startHands(files);
  } catch (err) {
    tracker.status = 'error';
    tracker.message = 'Face model failed to load: ' + (err && err.message ? err.message : err);
  }
}

async function startHands(files) {
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MP_HAND_MODEL, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
  });
  try {
    try {
      tracker.handLandmarker = await HandLandmarker.createFromOptions(files, options('GPU'));
    } catch {
      tracker.handLandmarker = await HandLandmarker.createFromOptions(files, options('CPU'));
    }
  } catch (err) {
    tracker.message = 'Hand model failed to load: ' + (err && err.message ? err.message : err);
  }
}

// 手：隔 everyNFrames 帧算一次。返回这一帧新算出的手，没算就返回 null。
function detectHands(now) {
  const tk = tracker;
  if (!tk.handLandmarker || !tk.video || tk.video.readyState < 2) return null;
  if (tk.video.currentTime === tk.lastHandVideoTime) return null;
  tk.handFrameCount++;
  if (tk.handFrameCount % Math.max(1, C.frame.everyNFrames) !== 0) return null;
  tk.lastHandVideoTime = tk.video.currentTime;
  const res = tk.handLandmarker.detectForVideo(tk.video, now);
  const hands = [];
  (res.landmarks || []).forEach((lm, i) => {
    const world = (res.worldLandmarks && res.worldLandmarks[i]) || lm;
    hands.push({ landmarks: lm, world, info: classifyHand(world, C.frame.lShape) });
  });
  return hands;
}

// 从 4×4 变换矩阵（列主序）求绕 X 轴的旋转 = 俯仰角
function pitchFromMatrix(m) {
  // R[2][1] = m[6], R[2][2] = m[10]
  let p = -Math.atan2(m[6], m[10]) * DEG;
  if (C.tracking.invertPitch) p = -p;
  if (calib.invert) p = -p;
  return p;
}

function updateTracking(now, dt) {
  const tk = tracker;
  let measured = null;

  if (tk.landmarker && tk.video && tk.video.readyState >= 2 && tk.video.currentTime !== tk.lastVideoTime) {
    tk.lastVideoTime = tk.video.currentTime;
    const res = tk.landmarker.detectForVideo(tk.video, now);
    const mats = res.facialTransformationMatrixes;
    if (mats && mats.length && res.faceLandmarks && res.faceLandmarks.length) {
      measured = pitchFromMatrix(mats[0].data);
      tk.landmarks = res.faceLandmarks[0];
      tk.rawPitch = measured;
      if (tk.status === 'lost' && tk.lostSince !== null) {
        const last = tk.losses[tk.losses.length - 1];
        if (last) last.ms = now - tk.lostSince;
      }
      tk.status = 'tracking';
      tk.lostSince = null;
    } else if (tk.status === 'tracking') {
      // 人脸丢了：保持上一次的值
      tk.status = 'lost';
      tk.lostSince = now;
      tk.landmarks = null;
      tk.losses.push({ at: new Date(), pitch: tk.pitch, ms: null });
      if (tk.losses.length > 5) tk.losses.shift();
    }
  }

  runCalibration(now, measured);

  // 手动模拟优先
  let target = null;
  if (tk.manual) target = tk.manualPitch;
  else if (measured !== null) target = calibrated(measured);

  if (target !== null) {
    if (tk.pitch === null) tk.pitch = target;
    const a = 1 - Math.exp(-dt / Math.max(1, C.tracking.smoothingMs));
    tk.pitch += (target - tk.pitch) * a;
    if (!tk.manual) tk.lastSeenPitch = tk.pitch;
  }
}

function calibrated(raw) {
  let p = raw - calib.zero;
  if (C.calibration.stretchMaxUp && calib.maxUp && calib.maxUp > 5 && p > 0) {
    const top = C.pitchTable[C.pitchTable.length - 1][0];
    p *= top / calib.maxUp;
  }
  return p;
}

// ================================================================ 校准（按 C）

function startCalibration() {
  calibRun.phase = 'zero';
  calibRun.start = performance.now();
  calibRun.samples = [];
}

function runCalibration(now, raw) {
  const r = calibRun;
  if (!r.phase || r.phase === 'done') return;
  const t = now - r.start;
  const cc = C.calibration;
  if (r.phase === 'zero') {
    if (t > cc.settleMs && raw !== null) r.samples.push(raw);
    if (t > cc.settleMs + cc.zeroSampleMs) {
      if (r.samples.length) calib.zero = median(r.samples);
      r.phase = 'up';
      r.start = now;
      r.samples = [];
    }
  } else if (r.phase === 'up') {
    if (t > cc.settleMs && raw !== null) r.samples.push(raw - calib.zero);
    if (t > cc.settleMs + cc.upSampleMs) finishUp();
  }
}

function finishUp() {
  const s = calibRun.samples;
  if (s.length) {
    // 取偏离 0 最多的值；如果抬头读出来是负的，说明方向反了，自动翻转
    const extreme = s.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
    if (Math.abs(extreme) > 5) {
      if (extreme < 0) {
        calib.invert = !calib.invert;
        calib.zero = -calib.zero;
      }
      calib.maxUp = Math.abs(extreme);
    }
  }
  endCalibration();
}

function endCalibration() {
  calibRun.phase = 'done';
  calibRun.doneAt = performance.now();
  tracker.pitch = null; // 重新起步，避免从旧值慢慢滑过来
  saveCalib();
}

function calibrationPrompt(now) {
  const r = calibRun;
  if (r.phase === 'zero') return 'Look straight ahead';
  if (r.phase === 'up') return 'Look up as far as you can (Esc to skip)';
  if (r.phase === 'done' && now - r.doneAt < 1500) return 'Calibrated';
  return null;
}

function loadCalib() {
  try { return JSON.parse(localStorage.getItem(CALIB_KEY)) || {}; } catch { return {}; }
}
function saveCalib() {
  try { localStorage.setItem(CALIB_KEY, JSON.stringify(calib)); } catch { /* 无痕模式等 */ }
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ================================================================ 绘制

new p5((p) => {
  let lastNow = performance.now();

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.drawingContext.imageSmoothingQuality = 'high';
    loadBook().catch((err) => { tracker.message = 'Could not read data/groups.json: ' + err.message; });
    startTracking();
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
    view.baselineY = null;
  };

  p.draw = () => {
    const now = performance.now();
    const dt = Math.min(100, now - lastNow);
    lastNow = now;
    const ctx = p.drawingContext;

    updateTracking(now, dt);

    const pitch = tracker.pitch ?? 0;
    const height = heightFromPitch(pitch);
    const axis = axisFromHeight(height);
    if (book.groups.length && (tracker.pitch !== null || view.current === null)) chooseGroup(axis, now);

    // ---- 动画状态（每帧只更新一次；画面可能画两遍：整屏一遍、取景框里放大一遍）
    const L = layout(p.width, p.height);
    if (view.current !== null) {
      const g = book.groups[view.current];
      const targetY = L.oy + g.baseline_y * L.s;
      if (view.baselineY === null) view.baselineY = targetY;
      const a = 1 - Math.exp(-dt / Math.max(1, C.animation.baselineMs / 3));
      view.baselineY += (targetY - view.baselineY) * a;
      if (view.previous !== null && now - view.switchedAt >= C.animation.fadeOutMs) view.previous = null;
    }

    // ---- 取景框
    updateFrame(frame, detectHands(now), now, dt, { cfg: C.frame, video: tracker.video, W: p.width, H: p.height });

    ctx.save();
    drawScene(ctx, p.width, p.height, L, axis, now);

    if (frame.alpha > 0 && frame.rect) {
      const r = frame.rect;
      // 框外稍微变淡
      ctx.save();
      ctx.globalAlpha = C.frame.outsideFade * frame.alpha;
      ctx.fillStyle = C.layout.background;
      ctx.beginPath();
      ctx.rect(0, 0, p.width, p.height);
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill('evenodd');
      ctx.restore();
      // 框里放大：以框的中心为中心，框越小放得越大；图片用原图，放大不糊
      const m = zoomFor(r, p.width, p.height, C.frame);
      frame.zoom = m;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      ctx.save();
      ctx.globalAlpha = frame.alpha;
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      ctx.translate(cx, cy);
      ctx.scale(m, m);
      ctx.translate(-cx, -cy);
      drawScene(ctx, p.width, p.height, L, axis, now);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = frame.alpha;
      drawFrameMarks(ctx, r, C.frame, C.layout.ink);
      ctx.restore();
    }

    // 提示文字；校准时总是显示校准提示
    const prompt = calibrationPrompt(now);
    const hint = prompt || (C.text.showHint ? C.text.hint : null);
    if (hint) {
      ctx.fillStyle = C.layout.ink;
      ctx.font = `${Math.max(11, C.text.hintSizePt * L.s)}px ${C.fonts.regular}`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(hint, L.ox + 10 * L.s, L.oy + L.h - 8 * L.s);
    }
    ctx.restore();

    if (view.debug) drawDebug(ctx, p, { pitch, height, axis, L });
  };

  // Shift + 鼠标拖动：手动画一个取景框，松开后留着；Shift + 单击（或 Esc）去掉。
  // 没有摄像头、或者想慢慢看放大效果 / 调参数时用。
  let dragFrom = null;
  const dragRect = () => ({
    x: Math.min(dragFrom[0], p.mouseX), y: Math.min(dragFrom[1], p.mouseY),
    w: Math.abs(p.mouseX - dragFrom[0]), h: Math.abs(p.mouseY - dragFrom[1]),
  });
  p.mouseDragged = () => {
    if (!dragFrom) return;
    const r = dragRect();
    if (r.w < C.frame.minSizePx || r.h < C.frame.minSizePx) return;
    frame.target = r;
    if (!frame.rect) frame.rect = { ...r };
    frame.active = true;
    frame.lastBoth = Infinity;            // 手动框不会自己消失
  };
  p.mouseReleased = () => {
    if (dragFrom) {
      const r = dragRect();
      if (r.w < C.frame.minSizePx || r.h < C.frame.minSizePx) frame.lastBoth = -1e9;   // Shift + 单击：去掉
    }
    dragFrom = null;
  };

  // 点摄像头小窗：展开 / 收起详细信息
  p.mousePressed = (e) => {
    if (e && e.target && e.target.closest && e.target.closest('nav')) return;   // 点的是右上角的页面标签
    if (C.frame.onMainPage && ((e && e.shiftKey) || p.keyIsDown(p.SHIFT))) { dragFrom = [p.mouseX, p.mouseY]; return; }
    if (!view.debug) return;
    const r = debugCameraRect();
    if (p.mouseX >= r.x && p.mouseX <= r.x + r.w && p.mouseY >= r.y && p.mouseY <= r.y + r.h) {
      view.expanded = !view.expanded;
    }
  };

  p.keyPressed = () => {
    const k = p.key.toLowerCase();
    if (k === 'd') view.debug = !view.debug;
    else if (k === 'f') p.fullscreen(!p.fullscreen());
    else if (k === 'c') startCalibration();
    else if (k === 'g') tracker.heightMode = tracker.heightMode === 'table' ? 'geometry' : 'table';
    else if (k === 'm') tracker.manual = false;
    else if (p.keyCode === p.ESCAPE && calibRun.phase === 'up') finishUp();
    else if (p.keyCode === p.ESCAPE && frame.lastBoth === Infinity) frame.lastBoth = -1e9;   // 去掉手动框
    else if (p.keyCode === p.UP_ARROW || p.keyCode === p.DOWN_ARROW) {
      if (!tracker.manual) { tracker.manual = true; tracker.manualPitch = tracker.pitch ?? 0; }
      tracker.manualPitch = Math.max(-40, Math.min(50, tracker.manualPitch + (p.keyCode === p.UP_ARROW ? 2 : -2)));
      return false;
    }
  };
});

// 背景立面 → 两边刻度 → 书的一组 → 基线。只画，不改状态。
function drawScene(ctx, W, H, L, axis, now) {
  ctx.fillStyle = C.layout.background;
  ctx.fillRect(0, 0, W, H);
  if (C.elevation.show && book.cover) {
    drawElevation(ctx, L, W, H, book.cover, { ...C.elevation, background: C.layout.background });
  }
  drawRulers(ctx, L, W, axis);
  if (view.current === null) return;
  const g = book.groups[view.current];
  const since = now - view.switchedAt;
  const { fadeOutMs, fadeInMs, fadeInDelayMs } = C.animation;
  if (view.previous !== null) {
    const outA = 1 - clamp01(since / fadeOutMs);
    if (outA > 0) drawGroup(ctx, book.groups[view.previous], L, view.baselineY, outA);
  }
  drawGroup(ctx, g, L, view.baselineY, clamp01((since - fadeInDelayMs) / fadeInMs));

  // 基线：从屏幕最左贯穿到最右，把左右两边的刻度连起来
  ctx.save();
  ctx.strokeStyle = C.layout.ink;
  ctx.lineWidth = Math.max(0.5, g.baseline_width * L.s);
  const y = Math.round(view.baselineY * 2) / 2;
  ctx.beginPath();
  if (C.layout.baselineFullWidth) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  else { ctx.moveTo(L.ox, y); ctx.lineTo(L.ox + L.w, y); }
  ctx.stroke();
  ctx.restore();
}

// 跨页（828 × 702pt）居中；左右两边至少留出 sideMinPt 给刻度
function layout(W, H) {
  const sw = book.spread ? book.spread.w : 828;
  const sh = book.spread ? book.spread.h : 702;
  const side = C.rulers.show ? C.rulers.sideMinPt : 0;
  const s = Math.min(W / (sw + 2 * side), (H - 2 * C.layout.marginY) / sh);
  const w = sw * s;
  const h = sh * s;
  return { s, w, h, ox: (W - w) / 2, oy: (H - h) / 2 };
}

// 两边的刻度：从屏幕边缘伸进来，和调试窗口里那条轴是同一套数据，跟着头部实时变化。
//   左：英尺尺（每英尺一格，每 5 英尺一条长刻度 + 数字），纵坐标照 bookcover.pdf（和书页同一套）
//   右：书里每组基线所在的高度（同高度的组合成一条，标组号），当前组那条伸到书页边
//   两边都有一个黑色标记 = 你现在看的位置；它在相邻两组的基线之间按「轴」插值，
//   所以停在某一组时，标记、右边那条线、贯穿屏幕的基线正好在同一高度。
function drawRulers(ctx, L, W, axis) {
  const c = book.cover;
  if (!c || !C.rulers.show) return;
  const s = L.s;
  const R = C.rulers;
  const ppf = c.feet_scale.pt_per_foot;
  const zeroY = c.feet_scale.zero_y;
  const Y = (y) => Math.round((L.oy + y * s) * 2) / 2;
  const gap = R.gapPt * s;
  const hair = Math.max(0.5, R.lineWidthPt * s);
  const labelPx = Math.max(R.labelMinPx, R.labelPt * s);
  const levels = book.levels || [];
  const curLevel = view.current !== null ? levels.findIndex((lv) => lv.idxs.includes(view.current)) : -1;

  ctx.save();
  ctx.strokeStyle = C.layout.ink;
  ctx.fillStyle = C.layout.ink;

  // ---- 左：英尺尺
  ctx.lineWidth = hair;
  ctx.beginPath();
  for (const l of c.left.lines) {
    const major = l.x1 - l.x0 > 40;
    ctx.moveTo(0, Y(l.y));
    ctx.lineTo((major ? R.leftMajorPt : R.leftMinorPt) * s, Y(l.y));
  }
  ctx.stroke();
  if (C.text.showRulerLabels) {
    ctx.font = `${labelPx}px ${C.fonts.monoLight}`;
    ctx.textBaseline = 'middle';
    for (let ft = 0; ft <= 50; ft += 5) ctx.fillText(`${ft}′`, (R.leftMajorPt + 4) * s, Y(zeroY - ft * ppf));
  }

  // ---- 右：各组基线高度
  ctx.beginPath();
  levels.forEach((lv, i) => {
    const x0 = i === curLevel ? L.ox + L.w + gap : W - R.rightShortPt * s;
    ctx.moveTo(x0, Y(lv.y));
    ctx.lineTo(W, Y(lv.y));
  });
  ctx.stroke();
  if (C.text.showRulerLabels) {
    ctx.font = `${labelPx}px ${C.fonts.monoLight}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    // 标签太挤时跳过（当前组和它上下的标签留出位置）
    const x = W - R.rightShortPt * s - 4;
    const curY = curLevel >= 0 ? Y(levels[curLevel].y) : null;
    let lastY = Infinity;
    levels.forEach((lv, i) => {
      const y = Y(lv.y);
      const isCur = i === curLevel;
      if (!isCur && (lastY - y < labelPx * 1.1 || (curY !== null && Math.abs(y - curY) < labelPx * 1.1))) return;
      ctx.globalAlpha = isCur ? 1 : 0.55;
      ctx.fillText(lv.label, x, y - labelPx * 0.6);
      lastY = y;
    });
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // ---- 标记：你现在看的位置
  const my = Y(markerY(axis));
  const mlen = R.markerPt * s;
  ctx.lineWidth = Math.max(1.5, R.markerWidthPt * s);
  ctx.beginPath();
  ctx.moveTo(0, my); ctx.lineTo(mlen, my);
  ctx.moveTo(W - mlen, my); ctx.lineTo(W, my);
  ctx.stroke();
  if (C.text.showRulerLabels) {
    const ft = (zeroY - markerY(axis)) / ppf;
    ctx.font = `${labelPx * 1.25}px ${C.fonts.mono}`;
    ctx.textBaseline = 'bottom';
    ctx.fillText(feetInches(ft), (R.leftMajorPt + 4) * s, my - 3);
    const g = view.current !== null ? book.groups[view.current] : null;
    if (g) {
      ctx.textAlign = 'right';
      ctx.fillText(g.id, W - 4, my - 3);
      ctx.textAlign = 'left';
    }
  }
  ctx.restore();
}

// 按书的顺序，把「轴」上的位置插值成书页上的高度（pt，距裁切框顶部）
function markerY(axis) {
  const gs = book.groups;
  if (!gs.length) return 0;
  if (axis <= gs[0].axis) return gs[0].baseline_y;
  for (let i = 1; i < gs.length; i++) {
    if (axis <= gs[i].axis) {
      const t = (axis - gs[i - 1].axis) / (gs[i].axis - gs[i - 1].axis || 1);
      return gs[i - 1].baseline_y + t * (gs[i].baseline_y - gs[i - 1].baseline_y);
    }
  }
  return gs[gs.length - 1].baseline_y;
}

// 同一高度的几组合成一条线，标签如 “01–13”
function buildLevels(groups) {
  const levels = [];
  groups.forEach((g, i) => {
    const last = levels[levels.length - 1];
    if (last && Math.abs(last.y - g.baseline_y) < 0.6) {
      last.idxs.push(i);
      last.ids.push(g.id);
    } else {
      levels.push({ y: g.baseline_y, idxs: [i], ids: [g.id] });
    }
  });
  for (const lv of levels) lv.label = lv.ids.length > 1 ? `${lv.ids[0]}–${lv.ids[lv.ids.length - 1]}` : lv.ids[0];
  return levels;
}

function feetInches(ft) {
  const total = Math.max(0, Math.round(ft * 12));
  return `${Math.floor(total / 12)}′-${total % 12}″`;
}

function drawGroup(ctx, g, L, baselineY, alpha) {
  if (alpha <= 0) return;
  const s = L.s;
  // 组内元素都相对基线放置，基线移动时一起移动
  const Y = (y) => baselineY - (g.baseline_y - y) * s;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const im of g.images) {
    const img = book.images.get(im.file);
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, L.ox + im.x * s, Y(im.y), im.w * s, im.h * s);
    }
    const cap = C.text.useRawCaptions ? im.caption_raw : im.caption;
    if (cap && C.text.showCaptions) {
      verticalText(ctx, cap, L.ox + im.caption_x * s, Y(im.caption_bottom), 5 * s, C.fonts.regular);
    }
  }
  const np = g.number_pos;
  if (C.text.showNumbers) verticalText(ctx, g.id, L.ox + np.x * s, Y(np.y + np.h), 7 * s, C.fonts.mono);
  ctx.restore();
}

// 竖排：旋转 90°，从下往上读。(x, bottom) 是文字列的左边缘和下端。
function verticalText(ctx, text, x, bottom, sizePx, family) {
  ctx.save();
  ctx.translate(x, bottom);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = C.layout.ink;
  ctx.font = `${sizePx}px ${family}`;
  ctx.textBaseline = 'top';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// ================================================================ 调试窗口（按 D）

function debugCameraRect() {
  return { x: 16, y: 16, w: C.debug.cameraWidth, h: C.debug.cameraWidth * 0.75 };
}

function drawDebug(ctx, p, { pitch, height, axis }) {
  const tk = tracker;
  const { x: x0, y: y0, w: vw, h: vh } = debugCameraRect();
  if (!view.expanded) {
    drawCamera(ctx, x0, y0, vw, vh);
    return;
  }

  const g = view.current !== null ? book.groups[view.current] : null;
  let status;
  if (tk.manual) status = 'Manual  ↑ ↓   ·   M → camera';
  else if (tk.status === 'tracking') status = '● Tracking';
  else if (tk.status === 'lost' && tk.lostSince !== null) status = `○ Lost ${((performance.now() - tk.lostSince) / 1000).toFixed(1)}s, holding ${fmt(tk.lastSeenPitch)}°`;
  else if (tk.status === 'lost') status = '○ Waiting for face';
  else status = tk.status;
  const rows = [
    ['Status', status],
    ['Group', g ? `${g.id}   ${g.height}″` : '—'],
    ['Axis', axis.toFixed(3)],
    ['Mapping', `${tk.heightMode === 'table' ? 'Table' : 'Geometry'}   (G)`],
    ['Zero', `${fmt(calib.zero)}°   (C)`],
    ['Max up', calib.maxUp ? `${fmt(calib.maxUp)}°` : '—'],
    ['Direction', calib.invert ? 'Inverted' : 'Normal'],
  ];
  if (C.frame.onMainPage) {
    rows.push(['Hands', !tk.handLandmarker ? '—' : frame.hands.length ? frame.hands.map((h) => (h.info.isL ? 'L' : '·') + ` ${Math.round(h.info.angle)}°`).join('   ') : 'none']);
    rows.push(['Frame', frame.active && frame.rect ? `on   ${(frame.zoom || 1).toFixed(1)}×` : 'off']);
  }
  if (tk.message) rows.push(['Note', tk.message]);

  // 排版：摄像头右边一栏，上面两行大字（角度、高度），下面标签 / 数值两列
  const pad = 14;
  const tx = x0 + vw + 24;
  const big = 40;
  const small = 12;
  const lead = 19;
  const labelW = 96;
  ctx.save();
  ctx.font = `${small}px ${C.fonts.mono}`;
  const valueW = Math.max(...rows.map(([, v]) => ctx.measureText(v).width));
  ctx.font = `${big}px ${C.fonts.mono}`;
  const bigW = ctx.measureText('+00.0°').width;
  const colW = Math.max(bigW, labelW + valueW);
  const textH = big * 2 + 18 + rows.length * lead;
  const pw = vw + 24 + colW + pad * 2;
  const ph = Math.max(vh, textH) + pad * 2;

  ctx.fillStyle = '#fff';
  ctx.fillRect(x0 - pad, y0 - pad, pw, ph);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 - pad + 0.5, y0 - pad + 0.5, pw - 1, ph - 1);
  drawCamera(ctx, x0, y0, vw, vh);

  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';
  ctx.font = `${big}px ${C.fonts.mono}`;
  ctx.fillText(`${pitch >= 0 ? '+' : '−'}${Math.abs(pitch).toFixed(1)}°`, tx, y0 - 4);
  ctx.fillText(`${Math.round(height)}″`, tx, y0 - 4 + big + 4);

  ctx.font = `${small}px ${C.fonts.mono}`;
  const ry = y0 + big * 2 + 18;
  ctx.fillRect(tx, ry - 9, colW, 1);
  rows.forEach(([k, v], i) => {
    ctx.globalAlpha = 0.5;
    ctx.fillText(k, tx, ry + i * lead);
    ctx.globalAlpha = 1;
    ctx.fillText(v, tx + labelW, ry + i * lead);
  });
  ctx.restore();
}

// 摄像头画面 + 人脸点。人脸丢失时边框变成虚线。
function drawCamera(ctx, x0, y0, vw, vh) {
  const tk = tracker;
  ctx.save();
  if (tk.video && tk.video.readyState >= 2) {
    ctx.save();
    if (C.tracking.mirrorVideo) { ctx.translate(x0 + vw, y0); ctx.scale(-1, 1); } else ctx.translate(x0, y0);
    ctx.drawImage(tk.video, 0, 0, vw, vh);
    if (tk.landmarks) {
      ctx.fillStyle = '#00ff66';
      for (const pt of tk.landmarks) ctx.fillRect(pt.x * vw - 0.6, pt.y * vh - 0.6, 1.2, 1.2);
    }
    // 手：骨架线；判定为 L 的手用实线，不是的用虚线
    for (const h of frame.hands) {
      ctx.strokeStyle = '#00ff66';
      ctx.lineWidth = 1.2;
      ctx.setLineDash(h.info.isL ? [] : [2, 2]);
      ctx.beginPath();
      for (const [a, b] of HAND_EDGES) {
        ctx.moveTo(h.landmarks[a].x * vw, h.landmarks[a].y * vh);
        ctx.lineTo(h.landmarks[b].x * vw, h.landmarks[b].y * vh);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // 当前取景框（拇指尖、食指尖围出的长方形）
    if (frame.active && frame.hands.length >= 2) {
      const ids = C.frame.includeVertex ? [4, 8, 2, 5] : [4, 8];
      const pts = frame.hands.slice(0, 2).flatMap((h) => ids.map((i) => h.landmarks[i]));
      const xs = pts.map((q) => q.x * vw);
      const ys = pts.map((q) => q.y * vh);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    }
    ctx.restore();
    // 每只手旁边标 L / ·（文字不镜像）
    ctx.font = `bold 13px ${C.fonts.mono}`;
    ctx.textBaseline = 'middle';
    for (const h of frame.hands) {
      const w = h.landmarks[0];
      const sx = x0 + (C.tracking.mirrorVideo ? 1 - w.x : w.x) * vw;
      const sy = y0 + w.y * vh;
      ctx.fillStyle = '#000';
      ctx.fillRect(sx - 9, sy + 4, 18, 16);
      ctx.fillStyle = '#fff';
      ctx.fillText(h.info.isL ? 'L' : '·', sx - 4, sy + 12);
    }
  } else {
    ctx.fillStyle = '#eee';
    ctx.fillRect(x0, y0, vw, vh);
  }
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  if (tk.status !== 'tracking' && !tk.manual) ctx.setLineDash([3, 3]);
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, vw, vh);
  ctx.restore();
}

function fmt(v) { return v === null || v === undefined ? '—' : v.toFixed(1); }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
