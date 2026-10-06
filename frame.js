// 阶段 4：取景框手势
//
// 两只手各比一个 L（拇指、食指伸直成约 90°，其余三指弯曲），合起来是一个取景框。
// 判定用 HandLandmarker 的 worldLandmarks（以米为单位、以手为中心，角度不受透视影响），
// 取景框的位置用图像坐标的 landmarks（拇指尖、食指尖），左右镜像后映射到屏幕。

// MediaPipe 手部关键点编号
const WRIST = 0;
const THUMB = [1, 2, 3, 4];
const INDEX = [5, 6, 7, 8];
const CURLED = [[9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];

const sub = (a, b) => [a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)];
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const dist = (a, b) => len(sub(a, b));

// 一串关节有多直：首尾直线距离 ÷ 各段长度之和（1 = 完全伸直）
function straightness(pts, ids) {
  let seg = 0;
  for (let i = 1; i < ids.length; i++) seg += dist(pts[ids[i]], pts[ids[i - 1]]);
  return seg > 0 ? dist(pts[ids[ids.length - 1]], pts[ids[0]]) / seg : 0;
}

function angleDeg(u, v) {
  const c = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / ((len(u) * len(v)) || 1);
  return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
}

// 判断一只手是不是 L 形。返回各项数值，方便调试时看是哪一条没过。
export function classifyHand(world, cfg) {
  const thumb = straightness(world, THUMB.slice(1));          // 2→3→4，拇指根部关节本来就弯
  const index = straightness(world, INDEX);
  let curled = 0;
  for (const f of CURLED) {
    const bent = straightness(world, f) < cfg.curledStraightMax;
    const folded = dist(world[WRIST], world[f[3]]) < dist(world[WRIST], world[f[1]]);
    if (bent || folded) curled++;
  }
  const angle = angleDeg(sub(world[4], world[2]), sub(world[8], world[5]));
  // isL：开始出现取景框用的判定
  const isL = thumb >= cfg.thumbStraightMin
    && index >= cfg.indexStraightMin
    && curled >= cfg.minCurled
    && angle >= cfg.angleMin && angle <= cfg.angleMax;
  // isLoose：取景框已经出现后，维持它用的更宽松的判定（手指稍微变形也不消失）
  const k = cfg.keep;
  const isLoose = index >= k.indexStraightMin && angle >= k.angleMin && angle <= k.angleMax;
  return { isL, isLoose, thumb, index, curled, angle };
}

// 摄像头画面（归一化坐标）→ 屏幕，左右镜像，按 cover 方式铺满屏幕
export function cameraToScreen(x, y, video, W, H) {
  const vw = (video && video.videoWidth) || 640;
  const vh = (video && video.videoHeight) || 480;
  const s = Math.max(W / vw, H / vh);
  const ox = (W - vw * s) / 2;
  const oy = (H - vh * s) / 2;
  return [ox + (1 - x) * vw * s, oy + y * vh * s];
}

// 取景框状态：两只手都是 L 并持续 onMs 才出现，手放下 offMs 后消失；位置做平滑
export function createFrameState() {
  return {
    active: false,
    onSince: null,
    lastBoth: -1e9,
    rect: null,          // 屏幕坐标 {x, y, w, h}（平滑后）
    target: null,
    alpha: 0,
    hands: [],           // 最近一次的手：{ landmarks, world, info, handedness }
  };
}

// 眯一只眼：一只闭、一只睁（两只一起闭是眨眼，不算）。blink 是 FaceLandmarker 的 eyeBlinkLeft / Right（0–1）
export function isWink(blinkL, blinkR, cfg) {
  if (blinkL == null || blinkR == null) return false;
  const closed = Math.max(blinkL, blinkR);
  const open = Math.min(blinkL, blinkR);
  return closed >= cfg.closedMin && open <= cfg.openMax;
}

// hands = 这一帧新算出来的手；null = 这一帧没有新结果（隔帧计算时），只做平滑和淡入淡出
// ctx.wink = 现在是不是眯着一只眼
export function updateFrame(state, hands, now, dt, ctx) {
  const { cfg, video, W, H } = ctx;
  const wink = !!ctx.wink;
  if (hands) state.hands = hands;
  const two = hands && hands.length >= 2;
  const strictL = two && hands[0].info.isL && hands[1].info.isL;
  const looseL = two && hands[0].info.isLoose && hands[1].info.isLoose;
  let both;
  if (state.active) {
    // 已经出现：两只手都还大致像 L 就保持（眼睛可以睁开）
    both = looseL || strictL;
  } else if (cfg.trigger === 'wink') {
    both = looseL && wink;                  // 必须眯一只眼
  } else if (cfg.trigger === 'hands') {
    both = strictL;                         // 只看手，手要比得标准
  } else {
    both = strictL || (looseL && wink);     // either：手比得标准，或者手大致框住 + 眯一只眼
  }
  state.trigger = both ? (strictL ? 'hands' : 'wink') : null;

  if (both) {
    // 两只手的拇指尖、食指尖（可选再加上 L 的拐角）围出的长方形
    const ids = cfg.includeVertex ? [4, 8, 2, 5] : [4, 8];
    const pts = [];
    for (const h of hands.slice(0, 2)) for (const i of ids) pts.push(cameraToScreen(h.landmarks[i].x, h.landmarks[i].y, video, W, H));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x0 = Math.max(0, Math.min(...xs));
    const y0 = Math.max(0, Math.min(...ys));
    const x1 = Math.min(W, Math.max(...xs));
    const y1 = Math.min(H, Math.max(...ys));
    if (x1 - x0 >= cfg.minSizePx && y1 - y0 >= cfg.minSizePx) {
      state.target = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      state.lastBoth = now;
      if (!state.active && state.onSince === null) state.onSince = now;
      if (!state.active && now - state.onSince >= cfg.onMs) {
        state.active = true;
        state.rect = { ...state.target };
      }
    }
  } else if (hands) {
    state.onSince = null;
  }
  if (state.active && now - state.lastBoth >= cfg.offMs) state.active = false;

  // 位置平滑
  if (state.rect && state.target) {
    const a = 1 - Math.exp(-dt / Math.max(1, cfg.smoothingMs));
    for (const k of ['x', 'y', 'w', 'h']) state.rect[k] += (state.target[k] - state.rect[k]) * a;
  }
  // 出现 / 消失的淡入淡出
  const step = dt / Math.max(1, cfg.fadeMs);
  state.alpha = Math.max(0, Math.min(1, state.alpha + (state.active ? step : -step)));
}

// 框越小放得越大
export function zoomFor(rect, W, H, cfg) {
  const s = Math.sqrt((rect.w * rect.h) / (W * H));             // 框的边长占屏幕的比例
  const t = Math.max(0, Math.min(1, (s - cfg.sizeSmall) / (cfg.sizeLarge - cfg.sizeSmall)));
  return cfg.zoomMax + (cfg.zoomMin - cfg.zoomMax) * t;
}

// 取景框：细黑线 + 四角书页上那种 L 形裁切线（从角往外伸）
export function drawFrameMarks(ctx, r, cfg, ink) {
  const g = cfg.cornerGapPx;
  const l = cfg.cornerLenPx;
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineWidth = cfg.lineWidthPx;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.beginPath();
  for (const [cx, cy, dx, dy] of [[r.x, r.y, -1, -1], [r.x + r.w, r.y, 1, -1], [r.x, r.y + r.h, -1, 1], [r.x + r.w, r.y + r.h, 1, 1]]) {
    ctx.moveTo(cx + dx * g, cy); ctx.lineTo(cx + dx * (g + l), cy);   // 横向
    ctx.moveTo(cx, cy + dy * g); ctx.lineTo(cx, cy + dy * (g + l));   // 纵向
  }
  ctx.stroke();
  ctx.restore();
}

// 调试：在摄像头小窗里画手部关键点（坐标系已经是镜像后的小窗）
export const HAND_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
