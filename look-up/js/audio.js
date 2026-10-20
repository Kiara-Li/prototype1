// Look Up · 声音：按高度交叉淡入淡出。地面最吵，越往上城市越远，最高处几乎无声。
// 文件在 look-up/sound/（占位，之后换成纸翅膀声，文件名不变）

const L = () => window.LOOKUP;

export const audio = { ctx: null, master: null, layers: {}, buffers: {}, ready: false };

export async function startAudio() {
  if (audio.ctx || !L().audio.enabled) return;      // config.audio.enabled = false：先不出声
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  audio.ctx = ctx;
  audio.master = ctx.createGain();
  audio.master.gain.value = 0;
  audio.master.connect(ctx.destination);
  const names = [...Object.keys(L().audio.layers), 'feather'];
  await Promise.all(names.map(async (n) => {
    try {
      const buf = await (await fetch(`sound/${n}.wav`)).arrayBuffer();
      audio.buffers[n] = await ctx.decodeAudioData(buf);
    } catch { /* 少一个也没关系 */ }
  }));
  for (const n of Object.keys(L().audio.layers)) {
    if (!audio.buffers[n]) continue;
    const src = ctx.createBufferSource();
    src.buffer = audio.buffers[n];
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(audio.master);
    src.start(0, Math.random() * src.buffer.duration);
    audio.layers[n] = gain;
  }
  audio.ready = true;
}

// 按对数高度在关键点之间插值
function curveAt(points, h) {
  const lh = Math.log(1 + h);
  if (h <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (h <= points[i][0]) {
      const [h0, v0] = points[i - 1];
      const [h1, v1] = points[i];
      const t = (lh - Math.log(1 + h0)) / (Math.log(1 + h1) - Math.log(1 + h0));
      return v0 + t * (v1 - v0);
    }
  }
  return points[points.length - 1][1];
}

// 每帧调用：h = 当前高度（英寸），level = 整体音量（0–1，开场 / 结尾淡入淡出用）
export function setAudioHeight(h, level = 1) {
  if (!audio.ready) return;
  const a = L().audio;
  const t = audio.ctx.currentTime;
  const tau = a.fadeMs / 1000 / 3;
  audio.master.gain.setTargetAtTime(a.master * level, t, tau);
  for (const [n, gain] of Object.entries(audio.layers)) {
    gain.gain.setTargetAtTime(Math.max(0, curveAt(a.layers[n], h)), t, tau);
  }
}

export function playFeather() {
  if (!audio.ready || !audio.buffers.feather) return;
  const src = audio.ctx.createBufferSource();
  src.buffer = audio.buffers.feather;
  const g = audio.ctx.createGain();
  g.gain.value = L().audio.featherVolume;
  src.connect(g).connect(audio.ctx.destination);
  src.start();
}

export { curveAt };
