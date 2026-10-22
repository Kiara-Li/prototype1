// Look Up · 每个 section 自己的一点声音（config.book.sectionSounds），很小声，垫在下面
//
//   loop    一直循环（雨打在雨棚上、信号灯的嘀嗒、路灯的电流声）
//   spread  每翻到这个 section 的一页，响一次（开门的铃声）
//   every   隔一会儿响一次，间隔在 everyMs 范围里随机（踩在铁梯上的脚步）
// 换 section 的时候，上一段淡出、这一段淡入。文件找不到就不响，不报错。
// 和 skysound.js（路灯 → 天空那段）、audio.js（按高度切换，关着）互不影响。

export function createSectionSound(cfg) {
  let ctx = null;
  let out = null;
  const buffers = new Map();       // src → AudioBuffer | null（加载失败）
  let cur = null;                  // { key, c, gain, src, timer }

  function audio() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      out = ctx.createGain();
      out.gain.value = cfg.master;
      out.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function load(src) {
    if (buffers.has(src)) return buffers.get(src);
    const p = fetch(src).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((b) => ctx.decodeAudioData(b))
      .catch(() => null);
    buffers.set(src, p);
    return p;
  }

  // 响一次（spread / every）：这一段自己的音量上再随机一点点，听起来不像同一个录音一直重复
  async function once(s, c) {
    const b = await load(c.src);
    if (!b || cur !== s) return;
    const src = ctx.createBufferSource();
    src.buffer = b;
    const g = ctx.createGain();
    g.gain.value = 0.8 + Math.random() * 0.2;
    src.connect(g).connect(s.gain);
    src.start();
  }

  function stopCur(fadeSec) {
    if (!cur) return;
    const s = cur;
    cur = null;
    clearTimeout(s.timer);
    const t = ctx.currentTime;
    s.gain.gain.cancelScheduledValues(t);
    s.gain.gain.setValueAtTime(s.gain.gain.value, t);
    s.gain.gain.linearRampToValueAtTime(0, t + fadeSec);
    if (s.src) s.src.stop(t + fadeSec + 0.1);
    setTimeout(() => s.gain.disconnect(), (fadeSec + 0.3) * 1000);
  }

  // 进入一个 section
  async function enter(key) {
    if (cur && cur.key === key) return;
    audio();
    stopCur(cfg.fadeOutSec);
    const c = cfg.sections[key];
    if (!c) return;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(out);
    const s = { key, c, gain, src: null, timer: 0 };
    cur = s;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(c.vol, t + cfg.fadeInSec);
    if (c.mode === 'loop') {
      const b = await load(c.src);
      if (!b || cur !== s) return;
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.loop = true;
      src.connect(gain);
      src.start(0, Math.random() * b.duration);          // 从中间随便一个地方开始
      s.src = src;
    } else if (c.mode === 'every') {
      const next = () => {
        if (cur !== s) return;
        const [a, b] = c.everyMs;
        s.timer = setTimeout(() => { once(s, c); next(); }, a + Math.random() * (b - a));
      };
      s.timer = setTimeout(() => { once(s, c); next(); }, c.firstMs || 1500);
    } else if (c.mode === 'spread') {
      spread();
    }
  }

  // 翻到新的一页（同一个 section 里）
  function spread() {
    if (!cur || cur.c.mode !== 'spread') return;
    const s = cur;
    clearTimeout(s.timer);
    s.timer = setTimeout(() => once(s, s.c), s.c.firstMs || 900);
  }

  return { enter, spread, stop: () => ctx && stopCur(cfg.fadeOutSec) };
}
