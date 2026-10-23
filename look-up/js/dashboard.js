// Look Up · 电脑版 dashboard（按 Figma frame 2–14 的顺序）
//
//   idle     卡片正面（那张 LOOK UP 的纸）和背面（congrats… let's play!）隔一会儿自己翻一次；
//            鼠标放上去翻到背面，点一下就一直停在背面
//   two      let's play → 翻到白色：只有两个动作（这时打开摄像头）
//   head     the first one → 翻：now move your head up to，LOOK UP 从卡片底边升到顶上；
//            摄像头检测到抬头（没有摄像头：↑）→
//   nice     翻：Nice work! … the second one
//   hands    翻：follow the hands … continue
//   closing  两只手往中间合拢，卡片缩小
//   pigeon   卡片自己翻过来：鸽子；等用户用两只手比出取景框（没有摄像头：点卡片）→
//   framed   四角标记出现，别的字淡出 →
//   leaving  手往两边移开，dashboard 淡出，进入网站（onEnter）
// 体验结束后 showEnd()：解锁「你的羽毛」和 chapter（刻度），回到 idle。
//
// 网格：u = min(屏幕宽 / 96, 屏幕高 / 62)。中间一栏 48u，卡片 40u，上下两条线之间 50u。?grid 显示网格。

import { input } from './input/state.js';
import { EASE, EASE_OUT, EASE_IN, esc, rv, quiet, reveal, setText } from './motion.js';

// 两只手：图片尺寸、在 1728 宽（u = 18）时的缩放、L 形内角在图片里的位置（拇指和食指相交处）
const HAND = {
  bl: { src: 'assets/dash/hand_bl.png', w: 1300, h: 1076, scale: 0.49, corner: [300, 560] },
  tr: { src: 'assets/dash/hand_tr.png', w: 1300, h: 1062, scale: 0.48, corner: [995, 430] },
};
const GREY = new Set(['congrats']);
const CLEAR = new Set(['pigeon']);      // 透明底：只有鸽子


export function createDashboard(o) {
  const { C, driver } = o;
  const T = o.T.dash;
  const D = C.dash;
  const html = document.documentElement;
  const root = document.getElementById('dx');
  const params = new URLSearchParams(location.search);
  let unlocked = o.unlocked;
  let played = false;          // 这次已经完整走过一遍（结尾回来）

  root.innerHTML = `
    ${params.has('grid') ? '<div class="dx-gridview"></div>' : ''}
    <div class="dx-line h" data-k="lt"></div><div class="dx-line h" data-k="lb"></div>
    <div class="dx-line v" data-k="cl"></div><div class="dx-line v" data-k="cr"></div>
    <div class="dx-band" data-k="top">
      <a class="dx-thesis dx-small ui" href="${esc(T.thesisUrl)}" target="_blank" rel="noopener">${rv(T.thesis)}</a>
      <a class="dx-featherlink dx-label ui" role="button">${rv(T.feather)}</a><span></span>
    </div>
    <div class="dx-head ui">${T.headline.map(rv).join('')}</div>
    <div class="dx-tips ui"><h2 class="dx-label">${rv(T.tipsTitle)}</h2><ol>${T.tips.map((t) => `<li><span>${esc(t)}</span></li>`).join('')}</ol></div>
    <div class="dx-edge dx-small" data-k="t">${esc(T.edgeTL[0])}</div>
    <div class="dx-edge dx-small v" data-k="l">${esc(T.edgeTL[1])}</div>
    <div class="dx-edge dx-small" data-k="b">${esc(T.edgeBR[0])}</div>
    <div class="dx-edge dx-small v" data-k="r">${esc(T.edgeBR[1])}</div>
    <div class="dx-card"><div class="dx-rot">
      <div class="dx-face a"><div class="dx-body"></div><div class="dx-shade"></div></div>
      <div class="dx-face b hidden"><div class="dx-body"></div><div class="dx-shade"></div></div>
    </div></div>
    <div class="dx-ticks ui">${o.chapters.map((c, i) => `<div class="dx-tick" data-i="${i}" title="${esc(c.label)}"></div>`).join('')}</div>
    <div class="dx-band" data-k="bot">
      <span></span><div class="dx-chap dx-label ui">${rv('')}</div>
      <a class="dx-about dx-small ui" href="${esc(T.aboutUrl)}" target="_blank" rel="noopener">${rv(T.about)}</a>
    </div>
    <img class="dx-hand" data-k="bl" src="${HAND.bl.src}" alt="" draggable="false">
    <img class="dx-hand" data-k="tr" src="${HAND.tr.src}" alt="" draggable="false">
    <div class="dx-marks"><span class="dx-mark bl"></span><span class="dx-mark tr"></span></div>
    <div class="dx-sq"></div>
    <div class="dx-cam"><div class="dx-camvideo"><video muted playsinline></video></div><span class="dx-mark bl"></span><span class="dx-mark tr"></span></div>`;

  const q = (s) => root.querySelector(s);
  const el = {
    lines: [...root.querySelectorAll('.dx-line')],
    bands: [...root.querySelectorAll('.dx-band')],
    thesis: q('.dx-thesis'), feather: q('.dx-featherlink'), head: q('.dx-head'), tips: q('.dx-tips'),
    edges: [...root.querySelectorAll('.dx-edge')],
    card: q('.dx-card'), rot: q('.dx-rot'), faces: [...root.querySelectorAll('.dx-face')],
    marks: q('.dx-marks'), ticks: q('.dx-ticks'), chap: q('.dx-chap'), about: q('.dx-about'),
    hands: { bl: q('.dx-hand[data-k="bl"]'), tr: q('.dx-hand[data-k="tr"]') },
    grid: q('.dx-gridview'),
    cam: q('.dx-cam'), camVideo: q('.dx-cam video'), sq: q('.dx-sq'),
  };
  const ui = [...root.querySelectorAll('.ui')];
  for (const k of ['bl', 'tr']) el.hands[k].style.width = `${HAND[k].w}px`;

  // ================================================================ 网格和位置

  const L = {};   // 当前布局（px）
  function layout() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const u = Math.min(W / 96, H / 62);
    const lt = Math.round((H - 50 * u) / 2);
    const lb = H - lt;
    const cl = Math.round(W / 2 - 24 * u);
    const cr = Math.round(W / 2 + 24 * u);
    const card = Math.round(40 * u);
    const cx = Math.round(W / 2);
    const cy = Math.round(H / 2);
    const c = { l: cx - card / 2, t: cy - card / 2, r: cx + card / 2, b: cy + card / 2 };
    Object.assign(L, { W, H, u, lt, lb, cl, cr, card, cx, cy, c });
    root.style.setProperty('--u', `${u}px`);
    const px = (v) => (v === undefined ? '' : `${v}px`);
    const at = (e, p) => Object.assign(e.style, { left: px(p.left), top: px(p.top), right: px(p.right), bottom: px(p.bottom), width: px(p.width), height: px(p.height) });

    for (const e of el.lines) {
      const k = e.dataset.k;
      at(e, k === 'lt' || k === 'lb' ? { top: L[k] } : { left: L[k] });
    }
    // 上下两栏：左、中、右三段字在同一条基线上；中间那段正好在页面中线
    for (const b of el.bands) at(b, { left: u, right: u, top: b.dataset.k === 'top' ? lt / 2 : (lb + H) / 2 });
    at(el.head, { left: u, top: lt + 2.33 * u });   // 第一行大写字母的顶 ≈ 卡片上方那行小字的顶
    at(el.tips, { left: cr + u, width: W - cr - 2 * u, bottom: H - c.b });   // 最后一条线和卡片底边齐
    // 卡片四周的字：中线离卡片 2u。左上一组从左上角开始，右下一组在右下角结束
    const lh = 1.5 * u;
    for (const e of el.edges) {
      const k = e.dataset.k;
      if (k === 't') at(e, { left: c.l - u, top: c.t - 2 * u - lh / 2 });
      if (k === 'b') at(e, { right: W - (c.r + u), top: c.b + 2 * u - lh / 2 });
      if (k === 'l') at(e, { left: c.l - 2 * u - lh / 2, top: c.t });
      if (k === 'r') at(e, { left: c.r + 2 * u - lh / 2, bottom: H - c.b });
    }
    at(el.card, { left: c.l, top: c.t, width: card, height: card });
    // 摄像头小窗：右栏，和 tips 同一个位置（左边、下边对齐）
    const cs = Math.min(16 * u, W - cr - 3 * u);
    at(el.cam, { left: cr + 1.5 * u, top: c.b - cs, width: cs, height: cs });
    const s = Math.round(D.smallCard * u);
    at(el.marks, { left: cx - s / 2, top: cy - s / 2, width: s, height: s });
    // chapter 刻度：按高度（对数）排在中间一栏里
    at(el.ticks, { left: cl, top: lb, width: cr - cl, height: 2.5 * u });
    const hs = o.chapters.map((x) => Math.log(1 + x.h / 12));
    const hmax = Math.max(...hs) || 1;
    [...el.ticks.children].forEach((t, i) => { t.style.left = `${2 * u + (hs[i] / hmax) * (cr - cl - 4 * u)}px`; });
    if (el.grid) {
      Object.assign(el.grid.style, {
        backgroundImage: 'linear-gradient(to right, rgba(255,0,80,.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,0,80,.16) 1px, transparent 1px)',
        backgroundSize: `${u}px ${u}px`,
        backgroundPosition: `${(cx % u)}px ${(lt % u)}px`,
      });
    }
    // 动画中的东西：按现在的状态放好
    for (const k of ['bl', 'tr']) { el.hands[k].getAnimations().forEach((a) => a.cancel()); el.hands[k].style.transform = handTf(handMode)[k]; }
    if (step === 'closing') applyClose();
    else if (smallSteps.has(step)) el.card.style.transform = `scale(${D.smallCard / 40})`;
    fitBig();
  }

  // 黑色方块把字拉出来：reveal()、setText() 在 motion.js（书页上也用）

  // ================================================================ 卡片

  const faceHtml = {
    front: () => '<div class="dx-art"></div>',
    congrats: () => text(T.congrats) + btn('play', T.play),
    two: () => text(T.two) + btn('first', T.first),
    head: () => `${text(T.head)}<div class="dx-big">${esc(T.lookUp)}</div><div class="dx-hint">${rv('')}</div>`,
    nice: () => text(T.nice) + btn('second', T.second),
    hands: () => text(T.hands) + btn('go', T.go),
    pigeon: () => '<div class="dx-pigeon"></div>',
    window: (i) => {
      const ch = o.chapters[i];
      return `<div class="dx-hole">${ch.src ? `<img src="${esc(ch.src)}" alt="">` : ''}</div>
              <div class="dx-holelabel">${rv(`Chapter ${i + 1} · ${ch.label}`)}</div>`;
    },
    // 你的羽毛：Kiara 折好的纸羽毛（扫描、抠好的那张）+ 一句话；点整张卡片打开最后那张纸（下载 / 打印 / 折法）
    feather: () => `<img class="dx-fimg" src="assets/fold/step12.png" alt="" draggable="false">
      <div class="dx-ftext">${T.featherFace.map(rv).join('')}</div>`,
  };
  function text(lines) { return `<div class="dx-ctext">${lines.map(rv).join('')}</div>`; }
  function btn(act, label) { return `<button class="dx-btn" data-act="${act}">${rv(label)}</button>`; }

  let angle = 0;               // 卡片翻过的角度（0 / 180）
  let current = 'front';       // 现在朝上的一面
  let target = 'front';        // 最后一次要翻到的一面
  let flipping = false;
  let queue = Promise.resolve();
  const shown = () => el.faces[angle === 0 ? 0 : 1];
  const back = () => el.faces[angle === 0 ? 1 : 0];

  function fill(face, kind, data) {
    face.classList.toggle('grey', GREY.has(kind));
    face.classList.toggle('clear', CLEAR.has(kind));
    face.dataset.kind = kind;
    const body = face.querySelector('.dx-body');
    body.style.opacity = 1;
    body.innerHTML = faceHtml[kind](data);
    body.querySelectorAll('.rv-t').forEach((t) => { t.style.visibility = 'hidden'; });
    if (kind === 'head') fitBig();
  }

  function flipTo(kind, data) {
    target = kind;
    targetData = data;
    queue = queue.then(() => doFlip(kind, data));
    return queue;
  }
  let targetData = null;

  function doFlip(kind, data) {
    const from = shown();
    const to = back();
    fill(to, kind, data);
    to.classList.remove('hidden');
    flipping = true;
    const p = `perspective(${110 * L.u}px)`;
    const a0 = angle;
    const k = [
      { transform: `${p} translateZ(0px) rotateY(${a0}deg)` },
      { transform: `${p} translateZ(${2.5 * L.u}px) rotateY(${a0 + 90}deg)`, offset: 0.5 },
      { transform: `${p} translateZ(0px) rotateY(${a0 + 180}deg)` },
    ];
    const anim = el.rot.animate(k, { duration: D.flipMs, easing: EASE, fill: 'forwards' });
    // 转到侧面时稍微暗一点（像纸背着光）
    for (const f of [from, to]) {
      f.querySelector('.dx-shade').animate([{ opacity: 0 }, { opacity: 0.16, offset: 0.5 }, { opacity: 0 }], { duration: D.flipMs, easing: EASE });
    }
    angle = (a0 + 180) % 360;
    return quiet(anim.finished).then(() => {
      el.rot.style.transform = `${p} rotateY(${angle}deg)`;
      anim.cancel();
      from.classList.add('hidden');
      flipping = false;
      current = kind;
      reveal(to.querySelector('.dx-body'));
    });
  }

  // 不翻，直接换（结尾回来时）
  function setFace(kind) {
    fill(shown(), kind);
    shown().querySelectorAll('.rv-t').forEach((t) => { t.style.visibility = ''; });
    current = target = kind;
  }

  // LOOK UP 大字：撑满卡片宽度（左右各留 0.75u）
  function fitBig() {
    const big = el.card.querySelector('.dx-face:not(.hidden) .dx-big') || el.card.querySelector('.dx-big');
    if (!big || !L.u) return;
    const fam = getComputedStyle(root).getPropertyValue('--sans') || 'sans-serif';
    const g = document.createElement('canvas').getContext('2d');
    g.font = `100px ${fam}`;
    const m = g.measureText(T.lookUp);
    const fs = (100 * (L.card - 1.5 * L.u)) / (m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
    g.font = `${fs}px ${fam}`;
    const n = g.measureText(T.lookUp);
    big.style.fontSize = `${fs}px`;
    big.style.left = `${0.75 * L.u + n.actualBoundingBoxLeft}px`;
    // line-height 1：基线在盒子里的位置 = 半行距 + 字体上伸
    const asc = n.fontBoundingBoxAscent;
    const desc = n.fontBoundingBoxDescent;
    const baseline = (fs - (asc + desc)) / 2 + asc;
    big.dataset.capTop = baseline - n.actualBoundingBoxAscent;     // 盒子顶到大写字母顶
    big.dataset.below = fs;                                         // 整个盒子
  }

  // ================================================================ 两只手

  let handMode = 'away';
  function handTf(mode) {
    const pos = handPos(mode);
    const out = {};
    for (const k of ['bl', 'tr']) out[k] = `translate(${pos[k][0]}px, ${pos[k][1]}px) scale(${pos.s[k]})`;
    return out;
  }
  function handPos(mode) {
    const { W, H, u, cx, cy } = L;
    const s = { bl: (HAND.bl.scale * u) / 18, tr: (HAND.tr.scale * u) / 18 };
    const rest = { bl: [0, H - HAND.bl.h * s.bl], tr: [W - HAND.tr.w * s.tr, 0] };
    let pos;
    if (mode === 'rest') pos = rest;
    else if (mode === 'open') pos = { bl: [rest.bl[0] - 1.4 * u, rest.bl[1] + 1.4 * u], tr: [rest.tr[0] + 1.4 * u, rest.tr[1] - 1.4 * u] };
    else if (mode === 'away') pos = { bl: [rest.bl[0] - W * 0.45, rest.bl[1] + H * 0.4], tr: [rest.tr[0] + W * 0.45, rest.tr[1] - H * 0.4] };
    else {
      // closed：L 形的内角贴在缩小后卡片的左下角 / 右上角外面
      const half = (D.smallCard * u) / 2;
      const g = 0.75 * u;
      pos = {
        bl: [cx - half - g - HAND.bl.corner[0] * s.bl, cy + half + g - HAND.bl.corner[1] * s.bl],
        tr: [cx + half + g - HAND.tr.corner[0] * s.tr, cy - half - g - HAND.tr.corner[1] * s.tr],
      };
    }
    pos.s = s;
    return pos;
  }

  function moveHands(mode, dur, easing, fade = mode === 'away' ? undefined : 1) {
    handMode = mode;
    // 离开角落时，图片被裁掉的掌心 / 手腕那两条边慢慢淡掉（在角落时贴着屏幕边，看不出来）
    for (const k of ['bl', 'tr']) {
      el.hands[k].style.transition = `--hf ${dur}ms ease`;
      el.hands[k].classList.toggle('soft', mode === 'closed' || mode === 'away');
    }
    const to = handTf(mode);
    const all = [];
    for (const k of ['bl', 'tr']) {
      const h = el.hands[k];
      const from = getComputedStyle(h).transform;
      const op = getComputedStyle(h).opacity;
      h.style.opacity = op;                        // 打断上一段动画时，留住它当时的位置和透明度
      h.style.transform = from === 'none' ? h.style.transform : from;
      h.getAnimations().forEach((a) => a.cancel());
      const frames = [{ transform: from === 'none' ? to[k] : from }, { transform: to[k] }];
      if (fade !== undefined) { frames[0].opacity = op; frames[1].opacity = fade; }
      const a = h.animate(frames, { duration: dur, easing, fill: 'forwards' });
      all.push(quiet(a.finished.then(() => {
        h.style.transform = to[k];
        if (fade !== undefined) h.style.opacity = fade;
        a.cancel();
      })));
    }
    return Promise.all(all);
  }

  // 换 chapter 时：两只手张开一下再合上
  function pulseHands() {
    if (handMode !== 'rest') return;
    const r = handTf('rest');
    const op = handTf('open');
    for (const k of ['bl', 'tr']) {
      const h = el.hands[k];
      if (h.getAnimations().length) continue;
      h.animate([{ transform: r[k] }, { transform: op[k], offset: 0.42 }, { transform: r[k] }], { duration: 760, easing: 'cubic-bezier(.45,0,.2,1)' });
    }
  }

  // ================================================================ 流程

  let step = 'intro';
  const smallSteps = new Set(['framed', 'leaving']);
  let hover = false;
  let pinned = false;
  let idleNext = Infinity;
  let peek = null;
  let peekTimer = null;
  let headAt = 0;
  let calib = 'wait';
  let calibAt = 0;
  let upSince = 0;
  let pigeonAt = 0;
  let hinted = false;
  let closeP = 0;              // 合拢进度：0 = 手在角落、卡片原大；1 = 手合拢、卡片缩小
  let closeLast = 0;
  let pigeonShown = false;
  let enterAsap = false;       // 已经检测到手势：鸽子一出现就进入
  let camWanted = false;

  function applyLock() {
    el.feather.classList.toggle('locked', !unlocked);
    el.feather.classList.toggle('open', unlocked);
    el.ticks.classList.toggle('open', unlocked);
    setText(el.chap, unlocked ? T.chaptersOpen : T.chaptersLocked);
  }

  function arrive(now) {
    for (const k of ['bl', 'tr']) { el.hands[k].style.transform = handTf('away')[k]; el.hands[k].style.opacity = 0; }
    moveHands('rest', 1500, EASE_OUT, 1);
    reveal(el.head, { delay: 350, stagger: 70 });
    reveal(el.tips.querySelector('h2'), { delay: 900 });
    reveal(el.chap, { delay: 1100 });
    step = 'idle';
    idleNext = now + D.idleFrontMs;
    // 调试：?dashstep=congrats / two / head / nice / hands 直接跳到那一页
    const jump = params.get('dashstep');
    if (jump && faceHtml[jump]) {
      pinned = true;
      if (jump !== 'congrats') { step = jump === 'head' ? 'head-flip' : jump; o.onPlay(); }
      flipTo(jump).then(() => { if (jump === 'head') startHead(); });
    }
  }

  function startHead() {
    step = 'head';
    showCam(true);
    headAt = performance.now();
    calib = 'wait';
    upSince = 0;
    hinted = false;
    const big = shown().querySelector('.dx-big');
    if (!big) return;
    fitBig();
    const capTop = Number(big.dataset.capTop);
    const endY = 1.25 * L.u - capTop;
    const startY = L.card + 0.25 * L.u;
    big.animate([{ transform: `translateY(${startY}px)` }, { transform: `translateY(${endY}px)` }],
      { duration: D.riseMs, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' });
  }

  // 两只手往中间合：没人动的时候自己慢慢合（closeMs）；摄像头看到两只手时，跟着真实两只手之间的距离开合
  function startClosing() {
    step = 'closing';
    shown().querySelector('.dx-body').style.opacity = 0;
    closeP = 0;
    closeLast = performance.now();
    pigeonShown = false;
    enterAsap = false;
    pigeonAt = 0;
    hinted = false;
    input.wantFrame = true;
    handMode = 'closing';
    for (const k of ['bl', 'tr']) {
      const h = el.hands[k];
      h.style.opacity = 1;
      h.getAnimations().forEach((x) => x.cancel());
      h.style.transition = '--hf 1600ms ease';
      h.classList.add('soft');
    }
    showCam(true);
  }

  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function applyClose() {
    const e = easeIO(closeP);
    const r = handPos('rest');
    const c = handPos('closed');
    for (const k of ['bl', 'tr']) {
      const x = r[k][0] + (c[k][0] - r[k][0]) * e;
      const y = r[k][1] + (c[k][1] - r[k][1]) * e;
      el.hands[k].style.transform = `translate(${x}px, ${y}px) scale(${r.s[k]})`;
    }
    if (!pigeonShown) el.card.style.transform = `scale(${1 + (D.smallCard / 40 - 1) * e})`;
  }

  // 用户自己两只手之间的距离 → 合拢进度（看不到两只手：null）
  function userClose() {
    const v = driver.vision;
    const hs = input.frame && input.frame.hands;
    if (!v || v.status !== 'ready' || !hs || hs.length < 2) return null;
    const a = hs[0].landmarks[5];
    const b = hs[1].landmarks[5];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    return Math.max(0, Math.min(1, (D.handsFar - d) / (D.handsFar - D.handsNear)));
  }

  function updateClosing(now) {
    const dt = Math.min(100, now - closeLast);
    closeLast = now;
    if (input.frame && input.frame.active) enterAsap = true;
    const user = userClose();
    const goal = enterAsap ? 1 : user !== null ? user : 1;
    const speed = enterAsap ? 1 / 450 : user !== null ? 1 / 500 : 1 / D.closeMs;
    const step0 = speed * dt;
    closeP += Math.max(-step0, Math.min(step0, goal - closeP));
    if (pigeonShown) closeP = Math.max(closeP, 0.8);      // 鸽子出来以后，手不会再张得太开
    applyClose();
    // 合到底：卡片翻过来，出现鸽子（透明底）
    if (!pigeonShown && closeP >= 0.999) {
      pigeonShown = true;
      el.card.style.transform = `scale(${D.smallCard / 40})`;
      flipTo('pigeon').then(() => {
        pigeonAt = performance.now();
        if (enterAsap) framed();
      });
    }
    if (pigeonShown && pigeonAt && enterAsap && step === 'closing') framed();
    // 没有摄像头：提示点卡片
    if (pigeonAt && !hinted && now - pigeonAt > D.noCameraHintMs) {
      const v = driver.vision;
      if (!v || v.status !== 'ready') { hinted = true; setText(el.chap, T.noCamHands); el.chap.style.opacity = 1; reveal(el.chap); }
    }
  }

  // 检测到手势：四角标记一闪，马上进入
  function framed() {
    if (step === 'framed' || step === 'leaving') return;
    step = 'framed';
    input.wantFrame = false;
    driver.releaseFrame();
    showCam(false);
    for (const e of ui) e.style.opacity = 0;
    el.marks.style.opacity = 1;
    const u = L.u;
    el.marks.querySelector('.bl').animate([{ transform: `translate(${-u}px, ${u}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: EASE_OUT });
    el.marks.querySelector('.tr').animate([{ transform: `translate(${u}px, ${-u}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: EASE_OUT });
    setTimeout(leave, 320 + D.handsHoldMs);
  }

  // ---- 摄像头小窗：只在两个测试（抬头、手势）的时候出现，在 tips 的位置
  function showCam(on) {
    camWanted = on;
    if (!on && el.cam.classList.contains('on')) {
      el.cam.classList.remove('on');
      el.cam.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.6)', opacity: 0 }], { duration: 420, easing: EASE_IN, fill: 'forwards' });
      el.tips.style.opacity = '';
    }
  }
  function updateCam() {
    if (!camWanted || el.cam.classList.contains('on')) return;
    const v = driver.vision;
    if (!v || !v.video || v.status === 'no-camera') return;
    if (el.camVideo.srcObject !== v.video.srcObject) { el.camVideo.srcObject = v.video.srcObject; quiet(el.camVideo.play()); }
    el.cam.classList.add('on');
    el.tips.style.opacity = 0;
    el.cam.getAnimations().forEach((x) => x.cancel());
    el.cam.animate([{ transform: 'scale(0.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 520, delay: 200, easing: EASE_OUT, fill: 'both' });
  }

  // 进入网站（Figma frame 16 → 19）：
  //   16 四条线收拢，贴住缩小的卡片四边；手离开
  //   17 卡片消失，两条竖线合成一条、两条横线合成一条：一个十字（dashboard 结束）
  //   18 十字再分开，中间是一个灰色的小方块
  //   19 线和方块往外散开，后面的书页露出来
  function leave() {
    step = 'leaving';
    const { cx, cy, u, W, H } = L;
    const half = (D.smallCard * u) / 2;
    const [t1, t2, t3, t4] = D.leaveSteps;
    const lineTo = (pos, dur, easing = EASE) => Promise.all(el.lines.map((e) => {
      const k = e.dataset.k;
      const prop = k === 'lt' || k === 'lb' ? 'top' : 'left';
      const from = parseFloat(getComputedStyle(e)[prop]);
      e.getAnimations().forEach((a) => a.cancel());
      e.style[prop] = `${from}px`;
      const a = e.animate([{ [prop]: `${from}px` }, { [prop]: `${pos[k]}px` }], { duration: dur, easing, fill: 'forwards' });
      return quiet(a.finished);
    }));
    const box = { lt: cy - half, lb: cy + half, cl: cx - half, cr: cx + half };
    const cross = { lt: cy, lb: cy, cl: cx, cr: cx };
    const out = { lt: -2, lb: H + 2, cl: -2, cr: W + 2 };
    for (const e of [...el.edges]) e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: t1, easing: 'ease', fill: 'forwards' });
    moveHands('away', t1, EASE_IN, 0);
    Object.assign(el.sq.style, { left: `${cx - half}px`, top: `${cy - half}px`, width: `${2 * half}px`, height: `${2 * half}px` });
    lineTo(box, t1)
      .then(() => {
        // 17：卡片收掉，线合成十字
        el.marks.animate([{ opacity: 1 }, { opacity: 0 }], { duration: t2 * 0.6, fill: 'forwards' });
        el.card.animate([{ opacity: 1, transform: getComputedStyle(el.card).transform }, { opacity: 0, transform: 'scale(0.02)' }], { duration: t2, easing: EASE, fill: 'forwards' });
        return lineTo(cross, t2);
      })
      .then(() => new Promise((r) => setTimeout(r, 120)))
      .then(() => {
        // 18：十字分开，中间一个灰色方块
        el.sq.animate([{ transform: 'scale(0)', opacity: 1 }, { transform: 'scale(1)', opacity: 1 }], { duration: t3, easing: EASE, fill: 'forwards' });
        return lineTo(box, t3);
      })
      .then(() => {
        // 19：散开，露出书页
        o.onEnter();
        root.style.setProperty('--leave', `${t4}ms`);
        root.classList.add('fading');
        root.style.backgroundColor = 'transparent';
        el.sq.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: `scale(${Math.max(W, H) / half})`, opacity: 0 }], { duration: t4, easing: EASE_IN, fill: 'forwards' });
        for (const e of el.lines) e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: t4, easing: 'ease-in', fill: 'forwards' });
        return lineTo(out, t4, EASE_IN);
      })
      .then(() => {
        root.style.display = 'none';
        html.classList.remove('dx-on');
        step = 'gone';
      });
  }

  // ---- 每帧（main.js 调用）
  function update(now) {
    if (step === 'idle') {
      if (!hover && !pinned && peek === null && !flipping && now > idleNext) {
        if (target === 'front') { flipTo('congrats'); idleNext = now + D.flipMs + D.idleBackMs; }
        else if (target === 'congrats') { flipTo('front'); idleNext = now + D.flipMs + D.idleFrontMs; }
      }
    } else if (step === 'head' && current === 'head') {
      const v = driver.vision;
      // 先记下平视时的角度（人脸出现后），再看有没有抬头
      if (calib === 'wait') {
        if (!v || driver.keysOnly || v.status === 'no-camera' || v.status === 'error') calib = 'skip';
        else if (v.status === 'ready' && v.faceOk) { driver.calibrate.start(); calibAt = now; calib = 'run'; }
      } else if (calib === 'run') {
        driver.calibrate.sample();
        if (now - calibAt > C.control.calibrationMs) { driver.calibrate.end(); calib = 'done'; }
      }
      // 没校准好之前，人脸的角度不算（↑ 键随时可以）
      const safe = calib === 'done' || calib === 'skip' || !(v && v.faceOk);
      if (safe && input.lookValue > D.lookUpAbove) {
        if (!upSince) upSince = now;
        if (now - upSince > D.lookUpHoldMs) { step = 'nice'; showCam(false); flipTo('nice'); }
      } else upSince = 0;
      if (!hinted && now - headAt > D.noCameraHintMs && (!v || v.status !== 'ready')) {
        hinted = true;
        const h = shown().querySelector('.dx-hint .rv');
        if (h) { setText(h, T.noCamUp); reveal(h); }
      }
    } else if (step === 'closing') {
      updateClosing(now);
    }
    updateCam();
  }

  // ================================================================ 点击、悬停

  el.card.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'play') {
        if (played) { location.reload(); return; }
        pinned = true; step = 'two'; o.onPlay(); flipTo('two');
      } else if (a === 'first' && step === 'two') { step = 'head-flip'; flipTo('head').then(startHead); }
      else if (a === 'second' && step === 'nice') { step = 'hands-flip'; flipTo('hands').then(() => { step = 'hands'; }); }
      else if (a === 'go' && step === 'hands') startClosing();
      else if (a === 'download') o.feather.download();
      else if (a === 'print') o.feather.print();
      else if (a === 'fold') o.feather.fold();
      else if (a === 'again') o.feather.again();
      return;
    }
    if (current === 'feather') { o.feather.download(); return; }      // 点羽毛卡片：打开那张纸
    if (step === 'idle' && (target === 'front' || target === 'congrats')) {
      pinned = true;
      if (target === 'front') flipTo('congrats');
    } else if (step === 'closing' && pigeonAt && performance.now() - pigeonAt > D.noCameraHintMs) framed();
  });
  el.card.addEventListener('mouseenter', () => {
    hover = true;
    if (step === 'idle' && peek === null && target === 'front') flipTo('congrats');
  });
  el.card.addEventListener('mouseleave', () => {
    hover = false;
    idleNext = performance.now() + D.idleBackMs;
  });

  // 你的羽毛：锁着的时候 hover 告诉你怎么解锁
  el.feather.addEventListener('mouseenter', () => {
    if (unlocked) return;
    setText(el.feather, T.featherLocked);
    reveal(el.feather);
  });
  el.feather.addEventListener('mouseleave', () => {
    if (unlocked) return;
    setText(el.feather, T.feather);
    reveal(el.feather);
  });
  el.feather.addEventListener('click', () => {
    if (!unlocked || step !== 'idle') return;
    if (target === 'feather') { pinned = false; flipTo('front'); idleNext = performance.now() + D.flipMs + D.idleFrontMs; }
    else { pinned = true; flipTo('feather'); }
  });

  // chapter：解锁后 hover 一个刻度 → 手张合一下，卡片翻到那个高度的窗口
  el.ticks.addEventListener('mouseover', (e) => {
    const t = e.target.closest('.dx-tick');
    if (!t || !unlocked || step !== 'idle') return;
    const i = Number(t.dataset.i);
    clearTimeout(peekTimer);
    if (peek === i) return;
    peek = i;
    [...el.ticks.children].forEach((x) => x.classList.toggle('on', x === t));
    setText(el.chap, `Chapter ${i + 1} · ${o.chapters[i].label}`);
    reveal(el.chap, { dur: 220 });
    pulseHands();
    flipTo('window', i);
  });
  el.ticks.addEventListener('mouseleave', () => {
    if (peek === null) return;
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => {
      peek = null;
      [...el.ticks.children].forEach((x) => x.classList.remove('on'));
      setText(el.chap, T.chaptersOpen);
      reveal(el.chap, { dur: 220 });
      flipTo(pinned ? 'feather' : 'front');
      idleNext = performance.now() + D.flipMs + D.idleFrontMs;
    }, 380);
  });

  // ================================================================ 开始 / 结尾

  function show() {
    root.style.display = 'block';
    html.classList.add('dx-on');
    setFace('front');
    applyLock();
    layout();
    // 字体加载好之后再算一次 LOOK UP 的大小
    document.fonts.ready.then(() => { layout(); arrive(performance.now()); });
  }

  // 体验结束：回到 dashboard，解锁，卡片翻到你的羽毛
  function showEnd() {
    played = true;
    unlocked = true;
    root.classList.remove('fading');
    root.style.backgroundColor = '';
    root.style.display = 'block';
    html.classList.add('dx-on');
    for (const e of [el.card, el.marks, el.sq, ...el.edges, ...el.lines]) e.getAnimations().forEach((a) => a.cancel());
    for (const e of ui) e.style.opacity = '';
    el.marks.style.opacity = 0;
    el.card.style.transform = '';
    setFace('front');
    applyLock();
    layout();
    moveHands('rest', 1500, EASE_OUT, 1);
    reveal(el.head, { delay: 300, stagger: 70 });
    reveal(el.chap, { delay: 900 });
    step = 'idle';
    pinned = true;
    setTimeout(() => flipTo('feather'), 900);
  }

  window.addEventListener('resize', layout);

  return {
    show, showEnd, update,
    get step() { return step; },
    get face() { return current; },
    get debug() { return { closeP, pigeonShown, pigeonAt, enterAsap, flipping, target }; },
  };
}
