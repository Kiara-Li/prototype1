// 鸽子取景框（单独的页面）
// 屏幕上一张鸽子很多的照片。两只手比 L 形取景框，框里放大看；过一阵子换下一张。
//
// 按键：D 摄像头小窗（点小窗展开详细信息）· F 全屏 · → / ← 换照片
//      Shift + 鼠标拖动：手动画一个取景框；Shift + 单击或 Esc 去掉

import { classifyHand, createFrameState, updateFrame, zoomFor, drawFrameMarks, HAND_EDGES } from './frame.js';
import { HandLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

const C = window.CONFIG;
const P = C.framePage;
const MP_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MP_HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// ================================================================ 状态

const photos = [];          // { info, img }
const show = {
  index: 0,
  previous: null,           // 正在淡出的那张
  switchedAt: -1e9,
  holdUntil: 0,             // 取景框刚用过：这之前不自动换
};

const cam = {
  video: null,
  landmarker: null,
  status: 'starting',
  message: 'Opening camera…',
  lastVideoTime: -1,
  count: 0,
};

const frame = createFrameState();
const view = { debug: C.debug.show, expanded: new URLSearchParams(location.search).has('debug') };
window.pigeonFrame = { photos, show, cam, frame };

// ================================================================ 照片

async function loadPhotos() {
  const data = await (await fetch('data/frame/photos.json')).json();
  for (const info of data.photos) {
    const img = new Image();
    img.decoding = 'async';
    img.src = 'data/' + info.file;
    photos.push({ info, img });
  }
  show.switchedAt = performance.now() - P.fadeMs;   // 第一张直接显示，30 秒后再换
}

function goTo(i, now) {
  if (!photos.length) return;
  const next = ((i % photos.length) + photos.length) % photos.length;
  if (next === show.index) return;
  show.previous = show.index;
  show.index = next;
  show.switchedAt = now;
}

// 照片按比例放进屏幕（上下左右留白），居中；底边落在一条贯穿屏幕的细线上
function photoRect(photo, W, H) {
  const [pw, ph] = photo.info.px;
  const m = P.marginPx;
  const s = Math.min((W - 2 * m) / pw, (H - 2 * m) / ph);
  const w = pw * s;
  const h = ph * s;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

// ================================================================ 摄像头 + 手

async function startCamera() {
  try {
    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    document.body.appendChild(video);
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false,
    });
    await video.play();
    cam.video = video;
    cam.message = 'Loading hand model…';
  } catch (err) {
    cam.status = 'no-camera';
    cam.message = 'Camera unavailable: ' + (err && err.message ? err.message : err) + ' (Shift + drag to test)';
    return;
  }
  try {
    const files = await FilesetResolver.forVisionTasks(MP_WASM);
    const options = (delegate) => ({ baseOptions: { modelAssetPath: MP_HAND_MODEL, delegate }, runningMode: 'VIDEO', numHands: 2 });
    try {
      cam.landmarker = await HandLandmarker.createFromOptions(files, options('GPU'));
    } catch {
      cam.landmarker = await HandLandmarker.createFromOptions(files, options('CPU'));
    }
    cam.status = 'ready';
    cam.message = '';
  } catch (err) {
    cam.status = 'error';
    cam.message = 'Hand model failed to load: ' + (err && err.message ? err.message : err);
  }
}

// 这一页只跑手，可以每帧都算（framePage.everyNFrames）
function detectHands(now) {
  if (!cam.landmarker || !cam.video || cam.video.readyState < 2) return null;
  if (cam.video.currentTime === cam.lastVideoTime) return null;
  cam.count++;
  if (cam.count % Math.max(1, P.everyNFrames) !== 0) return null;
  cam.lastVideoTime = cam.video.currentTime;
  const res = cam.landmarker.detectForVideo(cam.video, now);
  return (res.landmarks || []).map((lm, i) => {
    const world = (res.worldLandmarks && res.worldLandmarks[i]) || lm;
    return { landmarks: lm, world, info: classifyHand(world, C.frame.lShape) };
  });
}

// ================================================================ 绘制

function drawPhoto(ctx, photo, W, H, alpha) {
  if (!photo || alpha <= 0) return;
  const r = photoRect(photo, W, H);
  ctx.save();
  ctx.globalAlpha = alpha;
  if (photo.img.complete && photo.img.naturalWidth) ctx.drawImage(photo.img, r.x, r.y, r.w, r.h);
  ctx.restore();
}

// 整个画面：白底 → 照片（换图时交叉淡入淡出）→ 贯穿屏幕的基线
function drawScene(ctx, W, H, now) {
  ctx.fillStyle = C.layout.background;
  ctx.fillRect(0, 0, W, H);
  if (!photos.length) return;
  const t = Math.max(0, Math.min(1, (now - show.switchedAt) / P.fadeMs));
  if (show.previous !== null && t < 1) drawPhoto(ctx, photos[show.previous], W, H, 1 - t);
  drawPhoto(ctx, photos[show.index], W, H, t);

  const r = photoRect(photos[show.index], W, H);
  ctx.save();
  ctx.strokeStyle = C.layout.ink;
  ctx.lineWidth = P.baselineWidthPx;
  const y = Math.round((r.y + r.h) * 2) / 2;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(W, y);
  ctx.stroke();
  ctx.restore();
}

new p5((p) => {
  let lastNow = performance.now();
  let dragFrom = null;

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.drawingContext.imageSmoothingQuality = 'high';
    loadPhotos().catch((err) => { cam.message = 'Could not read data/frame/photos.json: ' + err.message; });
    startCamera();
  };

  p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);

  p.draw = () => {
    const now = performance.now();
    const dt = Math.min(100, now - lastNow);
    lastNow = now;
    const ctx = p.drawingContext;
    const W = p.width;
    const H = p.height;

    updateFrame(frame, detectHands(now), now, dt, { cfg: C.frame, video: cam.video, W, H });

    // 自动换下一张：取景框在用的时候不换，用完再等 holdAfterFrameSec
    if (frame.active) show.holdUntil = now + P.holdAfterFrameSec * 1000;
    if (photos.length > 1 && P.intervalSec > 0 && now > show.holdUntil
        && now - show.switchedAt > P.intervalSec * 1000) {
      goTo(show.index + 1, now);
    }
    if (show.previous !== null && now - show.switchedAt >= P.fadeMs) show.previous = null;

    ctx.save();
    drawScene(ctx, W, H, now);

    if (frame.alpha > 0 && frame.rect) {
      const r = frame.rect;
      ctx.save();
      ctx.globalAlpha = C.frame.outsideFade * frame.alpha;
      ctx.fillStyle = C.layout.background;
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill('evenodd');
      ctx.restore();

      const m = zoomFor(r, W, H, C.frame);
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
      drawScene(ctx, W, H, now);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = frame.alpha;
      drawFrameMarks(ctx, r, C.frame, C.layout.ink);
      ctx.restore();
    }
    ctx.restore();

    if (view.debug) drawDebug(ctx);
  };

  // ---- 鼠标：Shift + 拖动 = 手动取景框；点摄像头小窗 = 展开 / 收起
  const dragRect = () => ({
    x: Math.min(dragFrom[0], p.mouseX), y: Math.min(dragFrom[1], p.mouseY),
    w: Math.abs(p.mouseX - dragFrom[0]), h: Math.abs(p.mouseY - dragFrom[1]),
  });
  p.mousePressed = (e) => {
    if ((e && e.shiftKey) || p.keyIsDown(p.SHIFT)) { dragFrom = [p.mouseX, p.mouseY]; return; }
    if (!view.debug) return;
    const r = cameraRect();
    if (p.mouseX >= r.x && p.mouseX <= r.x + r.w && p.mouseY >= r.y && p.mouseY <= r.y + r.h) view.expanded = !view.expanded;
  };
  p.mouseDragged = () => {
    if (!dragFrom) return;
    const r = dragRect();
    if (r.w < C.frame.minSizePx || r.h < C.frame.minSizePx) return;
    frame.target = r;
    if (!frame.rect) frame.rect = { ...r };
    frame.active = true;
    frame.lastBoth = Infinity;
  };
  p.mouseReleased = () => {
    if (dragFrom) {
      const r = dragRect();
      if (r.w < C.frame.minSizePx || r.h < C.frame.minSizePx) frame.lastBoth = -1e9;
    }
    dragFrom = null;
  };

  p.keyPressed = () => {
    const k = p.key.toLowerCase();
    const now = performance.now();
    if (k === 'd') view.debug = !view.debug;
    else if (k === 'f') p.fullscreen(!p.fullscreen());
    else if (p.keyCode === p.RIGHT_ARROW) goTo(show.index + 1, now);
    else if (p.keyCode === p.LEFT_ARROW) goTo(show.index - 1, now);
    else if (p.keyCode === p.ESCAPE && frame.lastBoth === Infinity) frame.lastBoth = -1e9;
  };
});

// ================================================================ 调试（和主页面同一套样子）

function cameraRect() {
  return { x: 16, y: 16, w: C.debug.cameraWidth, h: C.debug.cameraWidth * 0.75 };
}

function drawCamera(ctx, x0, y0, vw, vh) {
  ctx.save();
  if (cam.video && cam.video.readyState >= 2) {
    ctx.save();
    if (C.tracking.mirrorVideo) { ctx.translate(x0 + vw, y0); ctx.scale(-1, 1); } else ctx.translate(x0, y0);
    ctx.drawImage(cam.video, 0, 0, vw, vh);
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
  if (!frame.hands.length) ctx.setLineDash([3, 3]);
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, vw, vh);
  ctx.restore();
}

function drawDebug(ctx) {
  const { x: x0, y: y0, w: vw, h: vh } = cameraRect();
  if (!view.expanded) {
    drawCamera(ctx, x0, y0, vw, vh);
    return;
  }
  const photo = photos[show.index];
  const left = Math.max(0, P.intervalSec * 1000 - (performance.now() - show.switchedAt));
  const rows = [
    ['Hands', !cam.landmarker ? '—' : frame.hands.length ? frame.hands.map((h) => (h.info.isL ? 'L' : '·') + ` ${Math.round(h.info.angle)}°`).join('   ') : 'none'],
    ['Frame', frame.active && frame.rect ? `on   ${(frame.zoom || 1).toFixed(1)}×` : 'off'],
    ['Photo', photo ? `${show.index + 1} / ${photos.length}   (← →)` : '—'],
    ['Birds', photo ? String(photo.info.bird_count) : '—'],
    ['Next in', frame.active || performance.now() < show.holdUntil ? 'held' : `${Math.ceil(left / 1000)}s`],
  ];
  if (cam.message) rows.push(['Note', cam.message]);

  const pad = 14;
  const tx = x0 + vw + 24;
  const small = 12;
  const lead = 19;
  const labelW = 96;
  ctx.save();
  ctx.font = `${small}px ${C.fonts.mono}`;
  const colW = labelW + Math.max(...rows.map(([, v]) => ctx.measureText(v).width));
  const pw = vw + 24 + colW + pad * 2;
  const ph = Math.max(vh, rows.length * lead) + pad * 2;
  ctx.fillStyle = '#fff';
  ctx.fillRect(x0 - pad, y0 - pad, pw, ph);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 - pad + 0.5, y0 - pad + 0.5, pw - 1, ph - 1);
  drawCamera(ctx, x0, y0, vw, vh);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';
  ctx.font = `${small}px ${C.fonts.mono}`;
  rows.forEach(([k, v], i) => {
    ctx.globalAlpha = 0.5;
    ctx.fillText(k, tx, y0 + i * lead);
    ctx.globalAlpha = 1;
    ctx.fillText(v, tx + labelW, y0 + i * lead);
  });
  ctx.restore();
}
