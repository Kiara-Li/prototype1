// Look Up · 书页上的界面（Figma frame 19–26）
//
//   卡片       这一页的历史照片（人的照片）的位置；切到鸽子之后像 dashboard 的卡片一样翻过来：
//              front（历史照片）→ intro（这个构件的介绍）→ up（上面还有：再抬头）/ ready（Ready? Yes）
//   右上角     切下来的方块叠在一起，上面写多少 inch
//   面板       Yes 之后卡片放大成填空；填完，切下来的方块飞进句子里，和你的词排在一起
//   手         第一次：两只手示范怎么比框
// 位置由 main.js 每帧告诉它（卡片跟着书页走）。

import { EASE, EASE_OUT, EASE_IN, esc, rv, quiet, reveal, setText } from './motion.js';

const HAND = {
  bl: { src: 'assets/dash/hand_bl.png', w: 1300, h: 1076, scale: 0.49, corner: [300, 560] },
  tr: { src: 'assets/dash/hand_tr.png', w: 1300, h: 1062, scale: 0.48, corner: [995, 430] },
};

export function createBookUI(o) {
  const { C, T } = o;
  const B = C.book;
  const TB = T.book;
  const root = document.getElementById('bk');
  root.innerHTML = `
    <div class="bk-card"><div class="bk-rot">
      <div class="bk-face a"><div class="bk-body"></div><div class="bk-shade"></div></div>
      <div class="bk-face b hidden"><div class="bk-body"></div><div class="bk-shade"></div></div>
    </div></div>
    <div class="bk-stack"><div class="bk-h">${rv('')}</div></div>
    <div class="bk-panel"><div class="bk-pbody"></div></div>
    <div class="bk-hint">${rv('')}</div>
    <div class="bk-guide"><span class="bk-garrow">↑</span><div class="bk-gtext">${rv('')}</div></div>
    <img class="bk-hand" data-k="bl" src="${HAND.bl.src}" alt="" draggable="false">
    <img class="bk-hand" data-k="tr" src="${HAND.tr.src}" alt="" draggable="false">`;
  const q = (s) => root.querySelector(s);
  const el = {
    card: q('.bk-card'), rot: q('.bk-rot'), faces: [...root.querySelectorAll('.bk-face')],
    stack: q('.bk-stack'), h: q('.bk-h'), panel: q('.bk-panel'), pbody: q('.bk-pbody'), hint: q('.bk-hint'),
    guide: q('.bk-guide'), gtext: q('.bk-gtext'),
    hands: { bl: q('.bk-hand[data-k="bl"]'), tr: q('.bk-hand[data-k="tr"]') },
  };
  for (const k of ['bl', 'tr']) el.hands[k].style.width = `${HAND[k].w}px`;
  let u = 18;
  const layout = () => {
    u = Math.min(window.innerWidth / 96, window.innerHeight / 62);
    root.style.setProperty('--u', `${u}px`);
  };
  layout();
  window.addEventListener('resize', layout);

  // ================================================================ 卡片

  let rect = null;            // 卡片在屏幕上的位置（main.js 每帧给）
  let angle = 0;
  let current = 'none';
  let queue = Promise.resolve();
  let gen = 0;                // 换页时 +1：上一页还没翻完的都作废
  let onFace = {};            // 按钮
  const shown = () => el.faces[angle === 0 ? 0 : 1];
  const back = () => el.faces[angle === 0 ? 1 : 0];

  function place(r) {
    rect = r;
    if (!r) { el.card.style.display = 'none'; return; }
    Object.assign(el.card.style, { display: 'block', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  }

  // 字按卡片宽度断行，每一行一条方块（黑块拉出来的动画一行一行走）
  function wrap(text, width, fontPx, family) {
    const g = document.createElement('canvas').getContext('2d');
    g.font = `${fontPx}px ${family}`;
    const lines = [];
    for (const para of String(text).split('\n')) {
      let cur = '';
      for (const w of para.split(/\s+/).filter(Boolean)) {
        const t = cur ? `${cur} ${w}` : w;
        if (cur && g.measureText(t).width > width) { lines.push(cur); cur = w; } else cur = t;
      }
      lines.push(cur);
    }
    return lines;
  }
  const sans = () => getComputedStyle(root).getPropertyValue('--sans') || 'sans-serif';
  // 卡片上的字号：卡片窄就小一点
  const cardFont = () => Math.max(13, Math.min(2.11 * u, (rect ? rect.w : 200) * 0.12));

  function faceHtml(kind, data) {
    const cw = rect ? rect.w : 200;
    const ch = rect ? rect.h : 400;
    const pad = Math.max(10, Math.min(cw, ch) * 0.1);
    const width = cw - 2 * pad;
    // 字太多就缩小，直到放得进卡片（留出上面一行小标签）
    const fit = (t, reserve) => {
      let fs = cardFont();
      let lines = wrap(t, width, fs, sans());
      while (fs > 11 && lines.length * fs * 1.28 > ch - 2 * pad - reserve) { fs *= 0.92; lines = wrap(t, width, fs, sans()); }
      return { fs, lines };
    };
    const text = (t, top, reserve = 0) => {
      const { fs, lines } = fit(t, reserve);
      return `<div class="bk-text" style="left:${pad}px;top:${top}px;font-size:${fs}px;line-height:${fs * 1.28}px">${lines.map(rv).join('')}</div>`;
    };
    const lab = Math.max(10, Math.min(1.1 * u, cw * 0.075));
    const label = (t) => `<div class="bk-label" style="left:${pad}px;top:${pad}px;font-size:${lab}px">${rv(t)}</div>`;
    if (kind === 'front') return data ? `<img class="bk-photo" src="${esc(data)}" alt="">` : '';
    if (kind === 'intro') return label(data.label) + text(data.text, pad + lab * 2.6, lab * 2.6);
    if (kind === 'up') return `${text(TB.up, pad)}<div class="bk-arrow" style="font-size:${cardFont() * 2.2}px;left:${pad}px">↑</div>`;
    if (kind === 'ready') {
      const { fs, lines } = fit(TB.ready, 4 * u);
      return `<div class="bk-text bk-bottom" style="left:${pad}px;bottom:${pad}px;font-size:${fs}px;line-height:${fs * 1.28}px">
        ${lines.map(rv).join('')}
        <button class="bk-btn" data-act="yes" style="font-size:${Math.max(12, fs * 0.72)}px">${rv(TB.yes)}</button></div>`;
    }
    return '';
  }

  function fill(face, kind, data) {
    face.classList.toggle('paper', kind !== 'front');
    face.classList.toggle('clear', kind === 'front' && !data);
    const body = face.querySelector('.bk-body');
    body.innerHTML = faceHtml(kind, data);
    body.querySelectorAll('.rv-t').forEach((t) => { t.style.visibility = 'hidden'; });
  }

  // 不翻，直接换成这一页的历史照片（翻到新的一页时）
  function setFront(src) {
    gen++;
    queue = Promise.resolve();
    el.rot.getAnimations().forEach((a) => a.cancel());
    angle = 0;
    el.rot.style.transform = 'none';
    el.faces[1].classList.add('hidden');
    el.faces[0].classList.remove('hidden');
    fill(el.faces[0], 'front', src);
    current = 'front';
  }

  function flipTo(kind, data) {
    const g = gen;
    queue = queue.then(() => (g === gen ? doFlip(kind, data) : null));
    return queue;
  }

  function doFlip(kind, data) {
    if (!rect) return Promise.resolve();
    const from = shown();
    const to = back();
    fill(to, kind, data);
    to.classList.remove('hidden');
    const p = `perspective(${Math.max(600, rect.h * 2.4)}px)`;
    const a0 = angle;
    const anim = el.rot.animate([
      { transform: `${p} translateZ(0px) rotateY(${a0}deg)` },
      { transform: `${p} translateZ(${2.5 * u}px) rotateY(${a0 + 90}deg)`, offset: 0.5 },
      { transform: `${p} translateZ(0px) rotateY(${a0 + 180}deg)` },
    ], { duration: B.flipMs, easing: EASE, fill: 'forwards' });
    for (const f of [from, to]) f.querySelector('.bk-shade').animate([{ opacity: 0 }, { opacity: 0.16, offset: 0.5 }, { opacity: 0 }], { duration: B.flipMs, easing: EASE });
    angle = (a0 + 180) % 360;
    return quiet(anim.finished).then(() => {
      el.rot.style.transform = `${p} rotateY(${angle}deg)`;
      anim.cancel();
      from.classList.add('hidden');
      current = kind;
      reveal(to.querySelector('.bk-body'));
    });
  }

  el.card.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act && onFace[act.dataset.act]) { onFace[act.dataset.act](); return; }
    if (onFace.card) onFace.card();
  });

  // ================================================================ 右上角：切下来的方块

  const pieces = [];          // { el, h }
  function stackSlot(i) {
    const size = B.pieceU * u;
    const r = ((i * 7919) % 17) - 8;                 // 每一块稍微歪一点（-8° … 8°）
    return { x: window.innerWidth - u - size - (i % 3) * 0.6 * u, y: 2.4 * u + (i % 2) * 0.5 * u, size, rot: r };
  }
  function addPiece(canvas, from, h) {
    const s = stackSlot(pieces.length);
    const img = document.createElement('img');
    img.className = 'bk-piece';
    img.src = canvas.toDataURL('image/jpeg', 0.9);
    Object.assign(img.style, { left: `${s.x}px`, top: `${s.y}px`, width: `${s.size}px`, height: `${s.size}px`, transform: `rotate(${s.rot}deg)` });
    root.appendChild(img);
    // 先从洞里被拎起来一点（稍微放大），然后划一道弧飞到右上角，落下时转到它的角度、轻轻停住
    const k = from.w / s.size;
    const dx = from.x - s.x;
    const dy = from.y - s.y;
    const lift = Math.min(3 * u, from.w * 0.25);
    img.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(0deg)`, offset: 0 },
      { transform: `translate(${dx - 0.04 * from.w}px, ${dy - lift}px) scale(${k * 1.08}) rotate(-2deg)`, offset: 0.22, easing: 'cubic-bezier(.45,0,.2,1)' },
      { transform: `translate(${dx * 0.35}px, ${Math.min(dy * 0.35, -2 * u) - 4 * u}px) scale(${(k + 1) / 2}) rotate(${s.rot * 0.5}deg)`, offset: 0.62 },
      { transform: `translate(0px, ${0.4 * u}px) scale(0.97) rotate(${s.rot * 1.15}deg)`, offset: 0.86 },
      { transform: `translate(0px, 0px) scale(1) rotate(${s.rot}deg)`, offset: 1 },
    ], { duration: B.pieceFlyMs, easing: 'linear' });
    pieces.push({ el: img, h });
    setText(el.h, `${Math.round(h)} ${TB.inch}`);
    Object.assign(el.h.style, { right: `${u + s.size + 0.5 * u}px`, top: `${1.6 * u}px` });
    reveal(el.h, { dur: 220 });
  }

  // ================================================================ 面板：填空 → 你的词 + 切下来的鸽子

  let answersDone = null;
  let poemLabel = '';
  function openQuestion(question, done, label) {
    answersDone = done;
    poemLabel = label || '';
    const W = window.innerWidth;
    const H = window.innerHeight;
    const pw = Math.min(W - 8 * u, 57 * u);
    const ph = Math.min(H - 10 * u, 40 * u);
    const px = (W - pw) / 2;
    const py = Math.max(5 * u, (H - ph) / 2 - 2 * u);
    Object.assign(el.panel.style, { display: 'block', left: `${px}px`, top: `${py}px`, width: `${pw}px`, height: `${ph}px` });
    el.card.style.visibility = 'hidden';               // 卡片变成了面板
    // 从卡片的位置放大出来
    const r = rect || { x: px, y: py, w: pw, h: ph };
    el.panel.animate([
      { transform: `translate(${r.x - px}px, ${r.y - py}px) scale(${r.w / pw}, ${r.h / ph})` },
      { transform: 'none' },
    ], { duration: B.panelMs, easing: EASE });
    const parts = question.sentence.split('___');
    el.pbody.innerHTML = `
      <div class="bk-plabel">${rv(poemLabel)}</div>
      <div class="bk-q">${wrap(question.prompt, pw - 5 * u, 2.11 * u, sans()).map(rv).join('')}</div>
      <div class="bk-fill">${parts.map((p, i) => `<span>${esc(p)}</span>${i < parts.length - 1 ? `<input class="bk-in" data-i="${i}" size="6" autocomplete="off" spellcheck="false">` : ''}`).join('')}</div>
      <button class="bk-btn bk-done" data-act="done">${rv(TB.done)}</button>`;
    el.pbody.querySelectorAll('.rv-t').forEach((t) => { t.style.visibility = 'hidden'; });
    setTimeout(() => reveal(el.pbody), B.panelMs * 0.7);
    const ins = [...el.pbody.querySelectorAll('.bk-in')];
    ins.forEach((inp, i) => {
      inp.addEventListener('input', () => { inp.size = Math.max(6, inp.value.length + 1); });
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') { if (i + 1 < ins.length) ins[i + 1].focus(); else compose(question, poemLabel); }
      });
    });
    el.pbody.querySelector('.bk-done').onclick = () => compose(question, poemLabel);
    setTimeout(() => ins[0] && ins[0].focus(), B.panelMs);
  }

  // 填完：句子里你的词后面各放一块切下来的鸽子 {  }，方块从右上角飞进来；剩下的接在句子后面
  function compose(question, label) {
    const ins = [...el.pbody.querySelectorAll('.bk-in')];
    const answers = ins.map((i) => i.value.trim());
    const parts = question.sentence.split('___');
    let html = '';
    let n = 0;
    parts.forEach((p, i) => {
      html += `<span class="bk-w">${esc(p)}</span>`;
      if (i < parts.length - 1) {
        // 你的词和它后面的 { 鸽子 } 绑在一起，不在中间断行
        const piece = n < pieces.length ? `<span class="bk-br">{</span><span class="bk-slot" data-n="${n++}"></span><span class="bk-br">}</span>` : '';
        html += `<span class="bk-grp"><span class="bk-w bk-ans">${esc(answers[i] || '…')}</span>${piece}</span>`;
      }
    });
    while (n < pieces.length) html += `<span class="bk-grp"><span class="bk-br">{</span><span class="bk-slot" data-n="${n++}"></span><span class="bk-br">}</span></span>`;
    el.pbody.innerHTML = `<div class="bk-poemwrap"><div class="bk-plabel">${rv(label || '')}</div><div class="bk-poem">${html}</div></div>
      <button class="bk-btn bk-done" data-act="next">${rv(TB.next)}</button>`;
    el.pbody.querySelectorAll('.bk-w, .bk-br').forEach((w, i) => w.animate([{ opacity: 0, transform: 'translateY(0.25em)' }, { opacity: 1, transform: 'none' }],
      { duration: 700, delay: 80 + i * 45, easing: EASE_OUT, fill: 'backwards' }));
    reveal(el.pbody.querySelector('.bk-plabel'), { delay: 200 });
    // 方块从右上角飞到句子里
    const slots = [...el.pbody.querySelectorAll('.bk-slot')];
    slots.forEach((slot, i) => {
      const p = pieces[i];
      const a = p.el.getBoundingClientRect();
      const b = slot.getBoundingClientRect();
      const img = p.el;
      img.getAnimations().forEach((x) => x.cancel());
      slot.appendChild(img);
      Object.assign(img.style, { position: 'static', left: '', top: '', width: '100%', height: '100%', transform: 'none' });
      img.animate([
        { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width})`, transformOrigin: '0 0' },
        { transform: 'none', transformOrigin: '0 0' },
      ], { duration: B.pieceFlyMs, delay: i * 120, easing: EASE, fill: 'backwards' });
    });
    setText(el.h, '');
    setTimeout(() => reveal(el.pbody.querySelector('.bk-done')), B.pieceFlyMs + slots.length * 120);
    el.pbody.querySelector('.bk-done').onclick = () => closePanel(answers);
  }

  function closePanel(answers) {
    // 往上飘走（接着就是「再往上看」）
    const a = el.panel.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateY(${-6 * u}px)` }], { duration: 900, easing: EASE_IN, fill: 'forwards' });
    quiet(a.finished).then(() => {
      a.cancel();
      el.panel.style.display = 'none';
      el.pbody.innerHTML = '';
      el.card.style.visibility = '';
      pieces.length = 0;
      const done = answersDone;
      answersDone = null;
      if (done) done(answers);
    });
  }

  // ================================================================ 教学：两只手示范比框

  let tutorial = false;
  function handTf(r, open) {
    const k = B.tutorialHandScale;                   // 比 dashboard 上的手小（设计稿 frame 19）
    const s = { bl: (HAND.bl.scale * u * k) / 18, tr: (HAND.tr.scale * u * k) / 18 };
    const g = 0.5 * u + open * 2 * u;
    return {
      bl: `translate(${r.x - g - HAND.bl.corner[0] * s.bl}px, ${r.y + r.h + g - HAND.bl.corner[1] * s.bl}px) scale(${s.bl})`,
      tr: `translate(${r.x + r.w + g - HAND.tr.corner[0] * s.tr}px, ${r.y - g - HAND.tr.corner[1] * s.tr}px) scale(${s.tr})`,
    };
  }
  function showTutorial(r, hint) {
    tutorial = true;
    const a = handTf(r, 1);
    const b = handTf(r, 0);
    for (const k of ['bl', 'tr']) {
      const h = el.hands[k];
      h.getAnimations().forEach((x) => x.cancel());
      h.style.display = 'block';
      h.animate([{ transform: a[k], opacity: 0 }, { transform: a[k], opacity: 1, offset: 0.15 }, { transform: b[k], opacity: 1, offset: 0.55 },
        { transform: b[k], opacity: 1, offset: 0.8 }, { transform: a[k], opacity: 1 }], { duration: 2600, iterations: Infinity, easing: 'ease-in-out' });
    }
    setHint(hint);
  }
  function hideTutorial() {
    if (!tutorial) return;
    tutorial = false;
    for (const k of ['bl', 'tr']) {
      const h = el.hands[k];
      const tf = getComputedStyle(h).transform;
      h.getAnimations().forEach((x) => x.cancel());
      const a = h.animate([{ transform: tf, opacity: 1 }, { transform: `${tf} translate(${k === 'bl' ? -400 : 400}px, ${k === 'bl' ? 300 : -300}px)`, opacity: 0 }],
        { duration: 900, easing: EASE_IN, fill: 'forwards' });
      quiet(a.finished).then(() => { h.style.display = 'none'; a.cancel(); });
    }
    setHint('');
  }
  function setHint(text) {
    setText(el.hint, text || '');
    if (text) reveal(el.hint);
  }

  // 指引：屏幕上方，一个慢慢浮动的箭头 + 一句话（字用黑块拉出来）
  let guideText = null;
  function guide(text) {
    if (text === guideText) return;
    guideText = text;
    if (!text) {
      el.guide.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' });
      return;
    }
    el.guide.getAnimations().forEach((x) => x.cancel());
    el.guide.style.opacity = 1;
    setText(el.gtext, text);
    reveal(el.gtext, { delay: 250 });
    el.guide.querySelector('.bk-garrow').animate([{ opacity: 0, transform: 'translateY(0.6em)' }, { opacity: 1, transform: 'none' }], { duration: 700, easing: EASE_OUT });
  }

  return {
    guide,
    place, setFront, flipTo, addPiece, openQuestion, showTutorial, hideTutorial, setHint,
    set on(handlers) { onFace = handlers; },
    get face() { return current; },
    get tutorial() { return tutorial; },
    get pieceCount() { return pieces.length; },
  };
}
