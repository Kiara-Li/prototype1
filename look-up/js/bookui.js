// Look Up · 书页上的界面（Figma frame 19–26）
//
//   卡片       这一页的历史照片（人的照片）的位置；切到鸽子之后像 dashboard 的卡片一样翻过来：
//              front（历史照片）→ intro（这个构件的介绍）→ up（上面还有：再抬头）/ ready（Ready? Yes）
//   右上角     切下来的方块叠在一起，上面写多少 inch
//   面板       Yes 之后卡片放大成填空；填完，切下来的方块飞进句子里，和你的词排在一起
//   手         第一次：两只手示范怎么比框
// 位置由 main.js 每帧告诉它（卡片跟着书页走）。

import { EASE, EASE_OUT, EASE_IN, esc, rv, quiet, reveal, setText, plainSentence } from './motion.js';

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
    <div class="bk-cap"><div class="bk-capmeta"></div><div class="bk-captitle"></div></div>
    <div class="bk-capv"></div>
    <div class="bk-guide"><span class="bk-garrow">↑</span><div class="bk-gtext">${rv('')}</div></div>
    <img class="bk-hand" data-k="bl" src="${HAND.bl.src}" alt="" draggable="false">
    <img class="bk-hand" data-k="tr" src="${HAND.tr.src}" alt="" draggable="false">`;
  const q = (s) => root.querySelector(s);
  const el = {
    card: q('.bk-card'), rot: q('.bk-rot'), faces: [...root.querySelectorAll('.bk-face')],
    stack: q('.bk-stack'), h: q('.bk-h'), panel: q('.bk-panel'), pbody: q('.bk-pbody'), hint: q('.bk-hint'),
    guide: q('.bk-guide'), gtext: q('.bk-gtext'),
    cap: q('.bk-cap'), capMeta: q('.bk-capmeta'), capTitle: q('.bk-captitle'), capV: q('.bk-capv'),
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

  // opts.room：卡片右边空出来多少（px，放竖排的那行字）；opts.cap：要不要显示照片的信息
  function place(r, opts = {}) {
    rect = r;
    placeCaption(r, opts);
    if (!r) { el.card.style.display = 'none'; return; }
    Object.assign(el.card.style, { display: 'block', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  }

  // ---- 历史照片的信息，排在卡片四周（和 dashboard 卡片四周的字一样）：
  //   上面一行「摄影师, 标题」；右边竖排「年份 · 收藏」（右边放不下：变成上面一行灰色小字）
  let capShown = false;
  function caption(c, delay = 0) {
    for (const e of [el.cap, el.capV]) e.getAnimations().forEach((a) => a.cancel());
    capShown = !!c;
    capText = c;
    capFit = '';
    if (!c) { el.cap.style.opacity = 0; el.capV.style.opacity = 0; return; }
    // 浮现：往上浮一点、淡入
    const frames = [{ opacity: 0, transform: 'translateY(0.7em)' }, { opacity: 1, transform: 'none' }];
    el.cap.animate(frames, { duration: 1100, delay, easing: EASE_OUT, fill: 'both' });
    el.capV.animate([{ opacity: 0, transform: 'rotate(180deg) translateY(-0.7em)' }, { opacity: 1, transform: 'rotate(180deg)' }],
      { duration: 1100, delay: delay + 250, easing: EASE_OUT, fill: 'both' });
  }
  function hideCaption() {
    if (!capShown) return;
    capShown = false;
    for (const e of [el.cap, el.capV]) {
      const from = getComputedStyle(e).opacity;
      e.getAnimations().forEach((a) => a.cancel());
      e.animate([{ opacity: from }, { opacity: 0 }], { duration: 600, easing: EASE_OUT, fill: 'both' });
    }
  }
  // 一段信息按「/」或「·」分成几块，从前往后放，放不下就不放了（信息不完整没关系，不要超出卡片）
  let capText = null;
  let capFit = '';
  const measureCv = document.createElement('canvas').getContext('2d');
  function fitParts(text, sep, max, e) {
    if (!text) return '';
    const cs = getComputedStyle(e);
    measureCv.font = `${cs.fontSize} ${cs.fontFamily}`;
    const fits = (t) => measureCv.measureText(t).width <= max;
    let out = '';
    for (const part of text.split(sep)) {
      const t = out ? `${out}${sep}${part}` : part;
      if (fits(t)) { out = t; continue; }
      if (!out) {                                    // 第一块就放不下：按词截
        for (const w of part.split(' ')) { const tw = out ? `${out} ${w}` : w; if (!fits(tw)) break; out = tw; }
      }
      break;
    }
    return out;
  }
  function placeCaption(r, opts) {
    const on = r && capShown && opts.cap;
    el.cap.style.visibility = on ? 'visible' : 'hidden';
    el.capV.style.visibility = on ? 'visible' : 'hidden';
    if (!on) return;
    const side = (opts.room || 0) >= 1.9 * u && !!capText.meta;
    // 两段信息在卡片右上角交成一个 cross mark：上面一行右对齐到卡片右边，右边竖排从卡片顶上开始
    const key = `${Math.round(r.w)}|${Math.round(r.h)}|${side}`;
    if (capFit !== key) {
      capFit = key;
      el.capTitle.textContent = fitParts(capText.title, ' / ', r.w, el.capTitle);
      el.capMeta.textContent = side ? '' : fitParts(capText.meta, ' · ', r.w, el.capMeta);
      el.capV.textContent = side ? fitParts(capText.meta, ' · ', r.h, el.capV) : '';
    }
    el.cap.classList.toggle('with-meta', !side && !!el.capMeta.textContent);
    el.capV.style.display = side ? 'block' : 'none';
    Object.assign(el.cap.style, { left: `${r.x}px`, bottom: `${window.innerHeight - r.y + 0.55 * u}px`, width: `${r.w}px`, maxWidth: '' });
    if (side) {
      // 竖排：从下往上读，结束在卡片顶端（和 dashboard 卡片左边那行一样）
      const lh = 1.5 * u;
      Object.assign(el.capV.style, { left: `${r.x + r.w + Math.min(opts.room / 2, 1.5 * u) - lh / 2}px`,
        top: `${r.y}px`, bottom: '', maxHeight: `${r.h}px` });
    }
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
    const btnPx = Math.max(12, cardFont() * 0.72);
    if (kind === 'intro') {
      // 介绍不会自己翻走：读完点 Next
      return label(data.label) + text(data.text, pad + lab * 2.6, lab * 2.6 + btnPx * 3.2)
        + `<button class="bk-btn bk-cardbtn" data-act="next" style="left:${pad}px;bottom:${pad * 0.6}px;font-size:${btnPx}px">${rv(TB.read)}</button>`;
    }
    if (kind === 'up') {
      // 「LOOK UP」转 90° 竖着排，从卡片底下往上走到顶（视线跟着往上）
      const fs = Math.min((cw - 2 * pad) * 0.9, (ch - 2 * pad) / 4.4);
      return `<div class="bk-lookup" style="font-size:${fs}px;left:${pad}px;top:${pad}px;bottom:${pad}px;width:${fs}px"><span>${esc(TB.up)}</span></div>`;
    }
    if (kind === 'ready') {
      const { fs, lines } = fit(TB.ready, 4 * u);
      return `<div class="bk-text bk-bottom" style="left:${pad}px;bottom:${pad}px;font-size:${fs}px;line-height:${fs * 1.28}px">
        ${lines.map(rv).join('')}
        <div class="bk-btns"><button class="bk-btn" data-act="yes" style="font-size:${btnPx}px">${rv(TB.yes)}</button>
        <button class="bk-btn bk-quiet" data-act="skip" style="font-size:${btnPx}px">${rv(TB.skip)}</button></div></div>`;
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

  // 历史照片换成一段视频（config.book.videos）：灰色方块从左边拉过来盖住照片 → 照片没了 → 方块收向右边，露出视频。
  // 视频一开始就放进卡片里加载（看不见），等 delayMs 以后再换；换页（gen 变了）或卡片已经翻走就不换了
  function video(v, delayMs, onSwap) {
    const g = gen;
    const body = el.faces[0].querySelector('.bk-body');
    const vid = document.createElement('video');
    vid.className = `bk-photo bk-video${v.blend ? ' blend' : ''}`;
    Object.assign(vid, { muted: true, playsInline: true, loop: v.loop !== false, preload: 'auto', src: v.src });
    vid.setAttribute('muted', '');
    vid.setAttribute('playsinline', '');
    const rate = () => { vid.defaultPlaybackRate = v.rate || 1; vid.playbackRate = v.rate || 1; };
    rate();
    vid.addEventListener('loadedmetadata', rate);
    body.appendChild(vid);
    setTimeout(() => {
      if (g !== gen || current !== 'front') return;
      if (v.blend) {
        // 融进背景的：不用方块；main.js 把它画在书页的 canvas 上，慢慢浮现（看不出从哪里开始是视频）
        vid.classList.add('on');
        vid.dataset.on = performance.now();
        rate();
        quiet(vid.play());
        if (onSwap) onSwap();
        return;
      }
      const bar = document.createElement('div');
      bar.className = 'bk-wipe';
      bar.style.background = B.revealColor;
      body.appendChild(bar);
      const dur = B.revealMs * 1.6;
      bar.style.transformOrigin = '0 50%';
      const a1 = bar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: dur, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'both' });
      quiet(a1.finished.then(() => {
        if (g !== gen) return;
        const img = body.querySelector('img.bk-photo');
        if (img) img.remove();
        vid.classList.add('on');
        rate();
        quiet(vid.play());
        if (onSwap) onSwap();
        bar.style.transformOrigin = '100% 50%';
        const a2 = bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: dur, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'both' });
        a1.cancel();
        return a2.finished.then(() => bar.remove());
      }));
    }, delayMs);
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
      from.querySelectorAll('video').forEach((v) => v.pause());       // 翻走的那一面上的视频不用再放
      current = kind;
      reveal(to.querySelector('.bk-body'));
      const lk = to.querySelector('.bk-lookup span');
      if (lk) {
        const travel = Math.max(0, lk.parentElement.clientHeight - lk.offsetHeight);
        lk.animate([{ translate: '0 0', opacity: 0 }, { opacity: 1, offset: 0.15 }, { translate: `0 ${-travel}px`, opacity: 1 }],
          { duration: 1800, easing: EASE, fill: 'both' });
      }
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
    // 先在原地放大（停一下，看清这只鸽子），再划一道弧飞到右上角，落下时转到它的角度、轻轻停住
    const k = from.w / s.size;
    const dx = from.x - s.x;
    const dy = from.y - s.y;
    const big = Math.min(B.pieceZoom, (window.innerHeight * 0.4) / from.w);       // 放大到多少倍（最大不超过屏幕高的 40%）
    const grow = (from.w * (big - 1)) / 2;                                         // 放大时以中心为准
    const bx = dx - grow;
    const by = dy - grow;
    img.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(0deg)`, offset: 0 },
      { transform: `translate(${bx}px, ${by}px) scale(${k * big}) rotate(-1deg)`, offset: 0.28, easing: 'cubic-bezier(.3,0,.2,1)' },
      { transform: `translate(${bx}px, ${by}px) scale(${k * big}) rotate(-1deg)`, offset: 0.5, easing: 'cubic-bezier(.55,0,.3,1)' },
      { transform: `translate(${bx * 0.35}px, ${Math.min(by * 0.35, -2 * u) - 4 * u}px) scale(${(k * big + 1) / 2}) rotate(${s.rot * 0.5}deg)`, offset: 0.78 },
      { transform: `translate(0px, ${0.4 * u}px) scale(0.97) rotate(${s.rot * 1.15}deg)`, offset: 0.92 },
      { transform: `translate(0px, 0px) scale(1) rotate(${s.rot}deg)`, offset: 1 },
    ], { duration: B.pieceFlyMs, easing: 'linear' });
    pieces.push({ el: img, h });
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
    const parts = plainSentence(question.sentence).split('___');
    el.pbody.innerHTML = `
      <div class="bk-plabel">${rv(poemLabel)}</div>
      <div class="bk-q">${wrap(question.prompt, pw - 5 * u, 2.11 * u, sans()).map(rv).join('')}</div>
      <div class="bk-fill">${parts.map((p, i) => `<span>${esc(p)}</span>${i < parts.length - 1 ? `<input class="bk-in" data-i="${i}" size="6" autocomplete="off" spellcheck="false">` : ''}`).join('')}</div>
      <div class="bk-pbtns"><button class="bk-btn bk-quiet" data-act="pskip">${rv(TB.skip)}</button>
      <button class="bk-btn bk-done" data-act="done">${rv(TB.done)}</button></div>`;
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
    el.pbody.querySelector('[data-act="pskip"]').onclick = () => closePanel(null);   // 不回答，直接往上
    setTimeout(() => ins[0] && ins[0].focus(), B.panelMs);
  }

  // 填完：句子里你的词后面各放一块切下来的鸽子 {  }，方块从右上角飞进来；剩下的接在句子后面
  function compose(question, label) {
    const ins = [...el.pbody.querySelectorAll('.bk-in')];
    const answers = ins.map((i) => i.value.trim());
    const parts = plainSentence(question.sentence).split('___');
    let html = '';
    let n = 0;
    parts.forEach((p, i) => {
      html += `<span class="bk-w">${esc(p)}</span>`;
      if (i < parts.length - 1) {
        // 你的词和它后面的 { 鸽子 } 绑在一起，不在中间断行
        const piece = n < pieces.length ? `<span class="bk-slot" data-n="${n++}"></span>` : '';
        html += `<span class="bk-grp"><span class="bk-w bk-ans">${esc(answers[i] || '…')}</span>${piece}</span>`;
      }
    });
    while (n < pieces.length) html += `<span class="bk-grp"><span class="bk-slot" data-n="${n++}"></span></span>`;
    el.pbody.innerHTML = `<div class="bk-poemwrap"><div class="bk-plabel">${rv(label || '')}</div><div class="bk-poem">${html}</div></div>
      <div class="bk-pbtns"><button class="bk-btn bk-done" data-act="next">${rv(TB.next)}</button></div>`;
    el.pbody.querySelectorAll('.bk-w').forEach((w, i) => w.animate([{ opacity: 0, transform: 'translateY(0.25em)' }, { opacity: 1, transform: 'none' }],
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
      ], { duration: B.poemFlyMs, delay: i * 120, easing: EASE, fill: 'backwards' });
    });
    setText(el.h, '');
    setTimeout(() => reveal(el.pbody.querySelector('.bk-done')), B.poemFlyMs + slots.length * 120);
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
    // 提示放在要做的动作旁边：示范的手上方，左边和照片对齐
    const k = B.tutorialHandScale;
    const sTr = (HAND.tr.scale * u * k) / 18;
    const top = r.y - HAND.tr.corner[1] * sTr - 3 * u - 3.5 * u;
    Object.assign(el.hint.style, { left: `${Math.max(u, r.x - 2.5 * u)}px`, top: `${Math.max(u, top)}px` });
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
    // 按宽度断好行，每一行一条方块（黑块一行一行把字拉出来）
    el.hint.innerHTML = text ? wrap(text, 20 * u, 1.24 * u, sans()).map(rv).join('') : '';
    if (text) reveal(el.hint, { stagger: 90 });
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
    guide, caption,
    place, setFront, flipTo, video, hideCaption,
    addPiece, openQuestion, showTutorial, hideTutorial, setHint,
    liveVideo: () => root.querySelector('.bk-face:not(.hidden) .bk-video.blend.on'),     // 天空背景跟着它取颜色
    set on(handlers) { onFace = handlers; },
    get face() { return current; },
    get tutorial() { return tutorial; },
    get pieceCount() { return pieces.length; },
  };
}
