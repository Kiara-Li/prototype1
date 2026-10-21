// Look Up · 电脑端输入：摄像头读头的角度 → lookValue；两只手比取景框 → frame / zoomValue
// 备用：↑ ↓、滚轮、鼠标拖出一个框（?input=keys 时不开摄像头）。
// 下面的数学和原来写在 main.js 里的完全一样，只是改成写进 input（state.js）。

import { input } from './state.js';
import { vision, startVision, pollVision } from '../vision.js';
import { createFrameState, updateFrame, zoomFor } from '../../../frame.js';

export function createDesktopInput({ app, C, FRAME_CFG, cv, getWorld }) {
  const keysOnly = new URLSearchParams(location.search).get('input') === 'keys';
  const frame = createFrameState();
  const s = { pitch: null, zero: 0, keyUp: false, keyDown: false, calib: [], dragFrom: null };
  input.mode = 'desktop';
  input.frame = frame;
  input.frameMarks = true;

  // ---- 每帧
  function update(now, dt, state) {
    const hands = keysOnly ? null : pollVision(now, FRAME_CFG.lShape, FRAME_CFG.eye, C.frame.everyNFrames);

    // 头的角度（平滑）
    if (vision.faceOk && vision.pitch !== null) {
      const p = (vision.pitch - s.zero) * (C.control.invertPitch ? -1 : 1);
      const a = 1 - Math.exp(-dt / C.control.pitchSmoothingMs);
      s.pitch = s.pitch === null ? p : s.pitch + (p - s.pitch) * a;
      const y = (vision.yaw || 0) * (C.control.invertYaw ? -1 : 1);
      input.yaw += (y - input.yaw) * a;
    }

    // 取景框（手势或鼠标）；只在上升的时候
    if (state === 'ascent' || state === 'top') {
      updateFrame(frame, hands, now, dt, { cfg: FRAME_CFG, video: vision.video, W: app.W, H: app.H, wink: vision.wink });
    }

    // lookValue：抬头的角度 → -1…1（死区、20° 满值、t^1.4、往下乘 downFactor）；↑ ↓ 优先
    const c = C.control;
    let look = 0;
    if (s.keyUp) look = c.keyScreensPerSec / c.maxScreensPerSec;
    else if (s.keyDown) look = -c.keyScreensPerSec / c.maxScreensPerSec;
    else if (!keysOnly && vision.faceOk && s.pitch !== null) {
      const a = Math.abs(s.pitch);
      if (a > c.deadzoneDeg) {
        const t = Math.min(1, (a - c.deadzoneDeg) / (c.maxDeg - c.deadzoneDeg));
        look = Math.sign(s.pitch) * Math.pow(t, 1.4);
        if (look < 0) look *= c.downFactor;
      }
    }
    input.lookValue = look;

    // 放大：框越小放得越大；中心 = 框的中心；找鸽子看框的中心
    if (frame.rect) {
      input.zoomValue = zoomFor(frame.rect, app.W, app.H, FRAME_CFG);
      input.zoomCenter = { x: frame.rect.x + frame.rect.w / 2, y: frame.rect.y + frame.rect.h / 2 };
    } else {
      input.zoomValue = 1;
    }
    input.probe = frame.active && frame.rect ? input.zoomCenter : null;
  }

  // ---- 校准：平视时的 pitch
  const calibrate = {
    start() { s.calib = []; },
    sample() { if (vision.faceOk && vision.pitch !== null) s.calib.push(vision.pitch); },
    ready(since) {
      return since > C.control.calibrationMs || keysOnly || vision.status === 'no-camera' || vision.status === 'error';
    },
    end() {
      if (s.calib.length > 5) s.zero = median(s.calib);
      s.pitch = null;
    },
    prompt() { return keysOnly || vision.status !== 'ready' ? '' : window.CONTENT.calibrate; },
  };

  // ---- 开始（点 Begin 时）
  function begin() { if (!keysOnly) startVision(); }

  function releaseFrame() { frame.active = false; }

  function debugLines() {
    return [
      `camera    ${keysOnly ? 'keys' : vision.status}${vision.faceOk ? ' · face' : ''}${vision.wink ? ' · wink' : ''}`,
      `pitch     ${s.pitch === null ? '—' : s.pitch.toFixed(1) + '°'}   zero ${s.zero.toFixed(1)}°`,
      `yaw       ${input.yaw.toFixed(1)}°`,
    ];
  }

  // ---- 键盘 / 滚轮 / 鼠标框
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowUp') { s.keyUp = true; e.preventDefault(); }
    else if (e.key === 'ArrowDown') { s.keyDown = true; e.preventDefault(); }
    else if (e.key === 'Escape' && frame.lastBoth === Infinity) frame.lastBoth = -1e9;
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp') s.keyUp = false;
    if (e.key === 'ArrowDown') s.keyDown = false;
  });
  window.addEventListener('wheel', (e) => {
    if (app.state !== 'ascent' || app.pausedQ !== null || frame.active) return;
    input.scrollDelta -= e.deltaY * C.control.wheelFactor;
  }, { passive: true });

  // 鼠标拖出一个框 = 取景框（备用）；松开后留着，Esc 或在框外单击去掉
  cv.addEventListener('mousedown', (e) => {
    if (app.state !== 'ascent' && app.state !== 'top') return;
    s.dragFrom = [e.clientX, e.clientY];
  });
  window.addEventListener('mousemove', (e) => {
    if (!s.dragFrom) return;
    const r = { x: Math.min(s.dragFrom[0], e.clientX), y: Math.min(s.dragFrom[1], e.clientY), w: Math.abs(e.clientX - s.dragFrom[0]), h: Math.abs(e.clientY - s.dragFrom[1]) };
    if (r.w < FRAME_CFG.minSizePx || r.h < FRAME_CFG.minSizePx) return;
    frame.target = r;
    if (!frame.rect) frame.rect = { ...r };
    frame.active = true;
    frame.lastBoth = Infinity;
  });
  window.addEventListener('mouseup', (e) => {
    if (!s.dragFrom) return;
    const moved = Math.hypot(e.clientX - s.dragFrom[0], e.clientY - s.dragFrom[1]);
    if (moved < 4 && frame.lastBoth === Infinity) frame.lastBoth = -1e9;   // 单击：去掉手动框
    s.dragFrom = null;
  });

  return { update, calibrate, begin, releaseFrame, debugLines, keysOnly, vision };
}

function median(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
