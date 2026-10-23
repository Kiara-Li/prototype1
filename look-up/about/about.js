// Look Up · About（Prototype 1 的演讲）：一屏一屏往下讲
//   ← → / 空格 / 滚轮 翻页；上面的刻度（四个部分）可以点
//   地址后面的 #id 直接打开那一屏（结尾回到 dashboard 以后，About 链接带 #learned）

(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const steps = $$('.step');
  // 四个部分：老师要讲的几点（What you learned 和 Process images 合在一起讲）
  const PARTS = [{ name: 'Prototype 1' }, { name: 'What I learned' }, { name: 'Toward Prototype 2' }, { name: 'Question' }];
  const partsEl = $('.parts');
  partsEl.innerHTML = PARTS.map((p, i) => `<button data-p="${i}">${p.name}</button>`).join('');
  let cur = -1;

  function go(i) {
    i = Math.max(0, Math.min(steps.length - 1, i));
    if (i === cur) return;
    cur = i;
    steps.forEach((s, k) => { s.classList.toggle('on', k === i); s.classList.toggle('before', k < i); });
    const st = steps[i];
    const part = Number(st.dataset.part);
    $$('button', partsEl).forEach((b, k) => b.classList.toggle('on', k === part));
    history.replaceState(null, '', `#${st.id}`);
    onShow(st);
  }
  const indexOf = (id) => steps.findIndex((s) => s.id === id);

  partsEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) go(steps.findIndex((s) => Number(s.dataset.part) === Number(b.dataset.p)));
  });

  // ---- 键盘、滚轮、手机左右滑
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(cur + 1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); go(cur - 1); }
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(steps.length - 1);
  });
  const narrow = () => window.matchMedia('(max-width: 760px)').matches;
  let wheelAt = 0;
  let wheelSum = 0;
  window.addEventListener('wheel', (e) => {
    if (narrow()) return;
    e.preventDefault();
    const now = performance.now();
    if (now - wheelAt < 900) return;
    wheelSum += e.deltaY;
    if (Math.abs(wheelSum) > 60) { go(cur + Math.sign(wheelSum)); wheelAt = now; wheelSum = 0; }
  }, { passive: false });
  let touch = null;
  window.addEventListener('touchstart', (e) => { touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  window.addEventListener('touchend', (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(cur + (dx < 0 ? 1 : -1));
    touch = null;
  });

  // ---- 进入一屏：这一屏里会动的东西开始动，别的停下
  const timers = new Map();
  function onShow(st) {
    for (const [, t] of timers) clearInterval(t);
    timers.clear();
    $$('video').forEach((v) => { if (!st.contains(v)) v.pause(); });
    $$('.t-img.sound').forEach((s) => { if (!st.contains(s)) stopSound(s); });
    $$('.win-body.fade', st).forEach((w) => {
      const imgs = $$('img', w);
      let k = Math.max(0, imgs.findIndex((im) => im.classList.contains('on')));
      imgs.forEach((im, j) => im.classList.toggle('on', j === k));
      timers.set(w, setInterval(() => { imgs[k].classList.remove('on'); k = (k + 1) % imgs.length; imgs[k].classList.add('on'); }, Number(w.dataset.auto) || 3500));
    });
    if (st.contains($('#tr'))) { trShow(trAt); timers.set('tr', setInterval(() => trShow(trAt + 1), 5200)); }
    $$('video', st).forEach((v) => { v.play().catch(() => {}); });
  }

  // ---- TRACE：大家画的线，一页一座城市
  const T = window.TRACES || [];
  const tr = $('#tr');
  let trAt = 0;
  const fmtYears = (y) => (y < 1 ? `${Math.round(y * 120) / 10}m` : `${y}y`);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function gridSvg(c, cls = '') {
    let g = '';
    for (let k = 0; k <= 24; k++) g += `M${k * 50} 0V400`;
    for (let k = 0; k <= 8; k++) g += `M0 ${k * 50}H1200`;
    const lines = (c.strokes || []).map((s) => (s.length === 1
      ? `<path d="M${s[0][0] * 1200} ${s[0][1] * 400}h0.1"/>`
      : `<path d="M${s.map((p) => `${(p[0] * 1200).toFixed(1)} ${(p[1] * 400).toFixed(1)}`).join('L')}"/>`)).join('');
    return `<svg viewBox="-2 -2 1204 404" preserveAspectRatio="none"><path d="${g}" stroke="#d4d4d4" stroke-width="2" fill="none"/>
      <g class="${cls}" stroke="#111" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round">${lines}</g></svg>`;
  }
  function trShow(i) {
    if (!T.length) return;
    trAt = (i + T.length) % T.length;
    const c = T[trAt];
    const panel = $('.tr-panel', tr);
    panel.innerHTML = `<div class="ends"><span>arrived</span><span>${c.still ? 'now' : 'left'}</span></div>
      ${c.img ? `<img src="${esc(c.img)}" alt="">` : gridSvg(c, 'draw')}
      <div class="ticks"><span>0</span><span>${fmtYears(c.years)}</span></div>`;
    $$('.draw path', panel).forEach((p) => { p.style.setProperty('--len', Math.ceil(p.getTotalLength() + 2)); });
    $('.tr-city', tr).innerHTML = `${esc(c.city)}<small>${c.years < 1 ? fmtYears(c.years).replace('m', ' months') : `${c.years} years`}</small>`;
    $('.tr-note', tr).textContent = c.note || '—';
    $('.tr-sp', tr).textContent = c.species.length ? c.species.join(', ') : '—';
    $('.tr-count', tr).textContent = `${String(trAt + 1).padStart(2, '0')} / ${String(T.length).padStart(2, '0')}`;
  }
  const trManual = (d) => { clearInterval(timers.get('tr')); trShow(trAt + d); timers.set('tr', setInterval(() => trShow(trAt + 1), 5200)); };
  $('.tr-prev', tr).onclick = () => trManual(-1);
  $('.tr-next', tr).onclick = () => trManual(1);

  // 「越幸福…」那一屏下面：淡淡的一排别人画的线
  $('.happier .lines').innerHTML = T.filter((c) => c.strokes).slice(0, 10).map((c) => gridSvg(c).replace('stroke="#d4d4d4"', 'stroke="none"')).join('');

  // ---- 声音：Union Square Park 的录音
  function stopSound(s) { const a = $('audio', s); a.pause(); s.classList.remove('on'); $('.play', s).textContent = 'Play'; }
  $$('.t-img.sound').forEach((s) => {
    const a = $('audio', s);
    const b = $('.play', s);
    b.classList.add('mk');
    b.onclick = () => {
      if (a.paused) { a.currentTime = a.currentTime || 1; a.play().catch(() => {}); s.classList.add('on'); b.textContent = 'Pause'; }
      else stopSound(s);
    };
    a.addEventListener('ended', () => stopSound(s));
  });

  // ---- 不让一个词单独落到下一行：每段字最后两个词之间换成不断行的空格
  $$('.t1, .t2, .tq, .body, figcaption').forEach((e) => {
    if (e.children.length) return;
    e.textContent = e.textContent.replace(/\s+(\S+)\s*$/, '\u00a0$1');
  });

  // ---- 开始
  const start = indexOf(location.hash.slice(1));
  go(start >= 0 ? start : 0);
  window.addEventListener('hashchange', () => { const i = indexOf(location.hash.slice(1)); if (i >= 0) go(i); });
})();
