// Look Up · 去天空之前的那段声音（Kiara 录的，sound/sky_wings.m4a）
//
// 前面大约 30 秒是平稳的环境声，30 秒之后是鸽子翅膀拍动的声音。观众走到天空要多久不一定，所以：
//   start()     从头播放，音量从 0 慢慢升到 volFrom，再随着时间慢慢升到 volTo（从小到大）；
//               还没抬头去天空的时候，只在前面那段环境声里循环（loopStart–loopEnd），翅膀声不会提前出来
//   toFinale()  抬头进入天空的那一刻：交叉淡入到 jumpTo（前后都是同样的环境声，听不出接缝），
//               过一秒就是翅膀拍动，正好和天空那一页对上；播完就停
// 和 audio.js（按高度切换的几层声音，现在关着）互不影响。

export function createSkySound(cfg) {
  let ctx = null;
  let buffer = null;
  let loading = null;
  let src = null;
  let gain = null;
  let state = 'idle';            // idle → looping → finale → done

  function load() {
    if (loading) return loading;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    loading = fetch(cfg.src).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b))
      .then((b) => { buffer = b; }).catch(() => { buffer = null; });
    return loading;
  }

  // 一个播放头：从 offset 开始，可以循环一段
  function voice(offset, loop) {
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    if (loop) { s.loop = true; s.loopStart = cfg.loopStart; s.loopEnd = Math.min(cfg.loopEnd, buffer.duration); }
    const g = ctx.createGain();
    g.gain.value = 0;
    s.connect(g).connect(ctx.destination);
    s.start(0, offset);
    return { s, g };
  }

  async function start() {
    if (state !== 'idle') return;
    state = 'looping';
    await load();
    if (!buffer || state !== 'looping') return;      // 加载的时候已经进了天空：toFinale 会接手
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const v = voice(0, true);
    src = v.s;
    gain = v.g;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(cfg.volFrom, t + cfg.fadeInSec);          // 从无到有
    gain.gain.linearRampToValueAtTime(cfg.volTo, t + cfg.fadeInSec + cfg.riseSec);   // 再慢慢变大
  }

  function toFinale() {
    if (state === 'finale' || state === 'done') return;
    const was = state;
    state = 'finale';
    // 还没开始放 / 还没加载好（在路灯那一页很快就过去了）：加载好以后直接从 jumpTo 放
    if (was !== 'looping' || !src) {
      load().then(async () => {
        if (!buffer) { state = 'done'; return; }
        if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
        const v = voice(cfg.jumpTo, false);
        const t = ctx.currentTime;
        v.g.gain.setValueAtTime(0, t);
        v.g.gain.linearRampToValueAtTime(cfg.volTo, t + cfg.crossfadeSec);
        v.s.onended = () => { state = 'done'; };
        src = v.s;
        gain = v.g;
      });
      return;
    }
    const t = ctx.currentTime;
    const x = cfg.crossfadeSec;
    const now = gain.gain.value;
    // 旧的播放头淡出
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(now, t);
    gain.gain.linearRampToValueAtTime(0, t + x);
    src.stop(t + x + 0.05);
    // 新的从 jumpTo 开始，淡入到最终音量，一直播到结尾
    const v = voice(cfg.jumpTo, false);
    v.g.gain.setValueAtTime(0, t);
    v.g.gain.linearRampToValueAtTime(cfg.volTo, t + x);
    v.s.onended = () => { state = 'done'; };
    src = v.s;
    gain = v.g;
  }

  return { start, toFinale, load, get state() { return state; } };
}
