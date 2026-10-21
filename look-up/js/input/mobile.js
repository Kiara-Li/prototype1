// Look Up · 手机端输入
//   把手机往上举、往天上指 → lookValue（相当于电脑端的抬头）
//   双指捏合 → zoomValue；手机屏幕本身就是取景框（不画四角线）
//   陀螺仪被拒绝 / 不支持 / 没数据 → 单指上下拖动（摇杆：离起点越远走得越快，松手停下）
// 不加载摄像头和手势识别模型。
//
// 角度：不直接用 beta。用 beta、gamma 算出「手机背面（后摄像头）指向的方向」离地平线的仰角，
// −90°（平放、屏幕朝上）… 0°（竖着拿在面前）… 90°（举过头顶、背面朝天）。
// 这个值从平拿一直到举过头顶都是连续的：beta 过 90° 后 alpha / gamma 会翻转、beta 接近 ±180° 会跳变，
// 但仰角 = asin(−cos β · cos γ) 只用到 cos，不受这些影响。
// 开始时记下当时的仰角作为基准，之后只看相对角度。

import { input } from './state.js';

export function createMobileInput({ app, C, FRAME_CFG, cv }) {
  const M = C.mobile;
  const s = {
    source: 'none',        // none | waiting | gyro | drag
    permission: '—',
    beta: null, gamma: null, elev: null, elevSm: null, gammaSm: null,
    base: 0, gammaBase: 0, calib: [], calibG: [],
    waitSince: 0, lastEvent: 0,
    drag: null, dragDy: 0,
    pinch: null, zoom: 1, center: null, lastTap: 0,
  };
  const frame = { active: false, rect: null, alpha: 0, lastBoth: 0 };
  input.mode = 'mobile';
  input.frame = frame;
  input.frameMarks = false;

  // ---- 陀螺仪
  function onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    s.beta = e.beta;
    s.gamma = e.gamma;
    const r = Math.PI / 180;
    s.elev = Math.asin(Math.max(-1, Math.min(1, -Math.cos(e.beta * r) * Math.cos(e.gamma * r)))) / r;
    s.lastEvent = performance.now();
    if (s.source === 'waiting' || s.source === 'none') s.source = 'gyro';
  }

  // 点 Begin 时调用：iOS 必须在用户点击里请求权限
  function begin() {
    const DOE = window.DeviceOrientationEvent;
    const listen = () => {
      window.addEventListener('deviceorientation', onOrientation);
      s.source = 'waiting';
      s.waitSince = performance.now();
    };
    if (DOE && typeof DOE.requestPermission === 'function') {
      DOE.requestPermission().then((r) => {
        s.permission = r;
        if (r === 'granted') listen(); else s.source = 'drag';
      }).catch(() => { s.permission = 'error'; s.source = 'drag'; });
    } else if (DOE) {
      s.permission = 'not needed';
      listen();
    } else {
      s.source = 'drag';
    }
  }

  // ---- 每帧
  function update(now, dt, state) {
    // 一段时间没收到陀螺仪数据：改用单指拖动
    if (s.source === 'waiting' && now - s.waitSince > M.gyroTimeoutMs) s.source = 'drag';

    // 平滑（低通）
    const a = 1 - Math.exp(-dt / M.smoothingMs);
    if (s.elev !== null) s.elevSm = s.elevSm === null ? s.elev : s.elevSm + (s.elev - s.elevSm) * a;
    if (s.gamma !== null) s.gammaSm = s.gammaSm === null ? s.gamma : s.gammaSm + (s.gamma - s.gammaSm) * a;

    // lookValue
    let look = 0;
    if (s.source === 'gyro' && s.elevSm !== null) {
      const rel = (s.elevSm - s.base) * (M.invert ? -1 : 1);
      look = curve(rel, M.deadzoneDeg, M.maxDeg);
    } else if (s.source === 'drag' && s.drag) {
      look = curve(s.dragDy, M.dragDeadzonePx, M.dragMaxVh * app.H);
    }
    if (look < 0) look *= C.control.downFactor;
    input.lookValue = look;

    // 结构色：手机左右倾斜
    if (s.gammaSm !== null) input.yaw = (s.gammaSm - s.gammaBase) * (C.control.invertYaw ? -1 : 1);

    // 放大：屏幕就是取景框
    if (state !== 'ascent' && state !== 'top') { s.zoom = 1; s.pinch = null; }
    if (!s.center) s.center = { x: app.W / 2, y: app.H / 2 };
    const active = s.zoom > M.zoomActiveAbove;
    frame.active = active;
    frame.rect = { x: 0, y: 0, w: app.W, h: app.H };
    const step = dt / Math.max(1, FRAME_CFG.fadeMs);
    frame.alpha = Math.max(0, Math.min(1, frame.alpha + (active ? step : -step)));
    input.zoomValue = s.zoom;
    input.zoomCenter = s.center;
    // 找鸽子看屏幕中心：换算回没放大时的坐标
    input.probe = active ? {
      x: s.center.x + (app.W / 2 - s.center.x) / s.zoom,
      y: s.center.y + (app.H / 2 - s.center.y) / s.zoom,
    } : null;
  }

  // 死区 + 满值 + t^1.4（和电脑端同样的手感）
  function curve(v, dead, max) {
    const a = Math.abs(v);
    if (a <= dead) return 0;
    return Math.sign(v) * Math.pow(Math.min(1, (a - dead) / (max - dead)), 1.4);
  }

  // ---- 校准：开始时的姿态
  const calibrate = {
    start() { s.calib = []; s.calibG = []; },
    sample() { if (s.elev !== null) { s.calib.push(s.elev); s.calibG.push(s.gamma); } },
    ready(since) {
      if (s.source === 'drag') return since > 400;
      return since > M.calibrationMs && (s.calib.length > 5 || since > M.calibrationMs + M.gyroTimeoutMs);
    },
    end() {
      if (s.calib.length > 5) { s.base = median(s.calib); s.gammaBase = median(s.calibG); }
      s.elevSm = null;
    },
    prompt() { return s.source === 'drag' ? '' : window.CONTENT.calibrateMobile; },
  };

  function releaseFrame() { s.zoom = 1; s.pinch = null; frame.active = false; }

  function debugLines() {
    const f = (v, d = 1) => (v === null || v === undefined ? '—' : v.toFixed(d));
    return [
      `input     ${s.source} · permission ${s.permission}`,
      `beta      ${f(s.beta)}°   gamma ${f(s.gamma)}°`,
      `elevation ${f(s.elevSm)}°   base ${f(s.base)}°   rel ${s.elevSm === null ? '—' : f(s.elevSm - s.base)}°`,
    ];
  }

  // ---- 触控：双指捏合缩放；单指拖动（兜底）；双击回到不放大
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
  const canZoom = () => (app.state === 'ascent' || app.state === 'top') && app.pausedQ === null;

  cv.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.touches;
    if (t.length >= 2 && canZoom()) {
      s.pinch = { d0: dist(t), z0: s.zoom };
      s.drag = null;
      s.dragDy = 0;
      s.center = mid(t);
    } else if (t.length === 1) {
      const now = performance.now();
      if (now - s.lastTap < M.doubleTapMs && s.zoom > 1) { s.zoom = 1; s.lastTap = 0; return; }
      s.lastTap = now;
      if (s.source === 'drag') { s.drag = { y0: t[0].clientY }; s.dragDy = 0; }
    }
  }, { passive: false });

  cv.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.touches;
    if (t.length >= 2 && s.pinch) {
      s.zoom = Math.max(1, Math.min(FRAME_CFG.zoomMax, s.pinch.z0 * (dist(t) / Math.max(1, s.pinch.d0))));
      const m = mid(t);
      s.center = { x: Math.max(0, Math.min(app.W, m.x)), y: Math.max(0, Math.min(app.H, m.y)) };
    } else if (t.length === 1 && s.drag) {
      s.dragDy = s.drag.y0 - t[0].clientY;        // 往上拖 = 往上走
    }
  }, { passive: false });

  const endTouch = (e) => {
    if (e.touches.length < 2) s.pinch = null;
    if (e.touches.length === 0) { s.drag = null; s.dragDy = 0; }
  };
  cv.addEventListener('touchend', endTouch);
  cv.addEventListener('touchcancel', endTouch);
  // iOS Safari 不完全遵守 viewport 的禁止缩放：再拦一次系统的捏合手势
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  return { update, calibrate, begin, releaseFrame, debugLines, keysOnly: false, vision: null };
}

function median(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
