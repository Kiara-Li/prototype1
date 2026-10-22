// Look Up · 最后的纸
//
//   正面   一路切下来的鸽子，按高度从下往上摆满一个正方形网格（4 块 = 2 × 2，16 块 = 4 × 4；摆不满的格子是浅灰）
//   背面   七句填空连成的诗，左边一把尺子（参考海报）：你的词是黑的，题目的字是灰的；每句里 [构件名]
//          换成在那一段切下来的鸽子（content.js 的 sentence）。跳过没回答的那句不放，尺子上也没有它的高度
//   动画   碎片从屏幕四周飞进来，从下往上拼成一张纸 → 纸翻过来，是诗 → 下载 / 打印
//   下载   两面并排放在一张 A4（横）上，一个 PNG；打印同一张图，A4 横放，不缩放就是 130mm 的正方形

import { EASE, EASE_OUT, rv, quiet, reveal } from './motion.js';
import { openFold } from './fold.js';

const MM = 300 / 25.4;                 // 300 dpi
const SQ_MM = 130;                     // 每一面的边长（mm）
const SIDE = Math.round(SQ_MM * MM);   // 每一面多少像素
const GREY = '#d9d9d9';                // 空格子：和书里历史照片的灰块一样
const INK = '#000';
const MUTE = '#8c8c8c';

const fontOf = (name) => (getComputedStyle(document.documentElement).getPropertyValue(name) || 'sans-serif').trim();

// ---------------------------------------------------------------- 正面：网格

export function gridLayout(n) {
  const k = Math.max(1, Math.ceil(Math.sqrt(n)));
  const cell = SIDE / k;
  // 第 i 块：从左下角开始，一行一行往上（越高的鸽子越靠上）
  const cells = [];
  for (let i = 0; i < k * k; i++) cells.push({ x: (i % k) * cell, y: (k - 1 - Math.floor(i / k)) * cell, s: cell });
  return { k, cell, cells };
}

function renderGrid(pieces) {
  const c = document.createElement('canvas');
  c.width = c.height = SIDE;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, SIDE, SIDE);
  const { k, cells } = gridLayout(pieces.length);
  const gap = Math.max(2, SIDE * 0.0035);           // 网格：格子之间一条细白缝
  cells.forEach((cl, i) => {
    const x = cl.x + (cl.x > 0 ? gap / 2 : 0);
    const y = cl.y + (cl.y > 0 ? gap / 2 : 0);
    const w = cl.s - (cl.x > 0 ? gap / 2 : 0) - (cl.x + cl.s < SIDE - 1 ? gap / 2 : 0);
    const h = cl.s - (cl.y > 0 ? gap / 2 : 0) - (cl.y + cl.s < SIDE - 1 ? gap / 2 : 0);
    if (pieces[i]) g.drawImage(pieces[i].canvas, x, y, w, h);
    else { g.fillStyle = GREY; g.fillRect(x, y, w, h); }
  });
  return { canvas: c, k };
}

// ---------------------------------------------------------------- 背面：诗

// 一句话 → 一串词：{ t, ans } 文字 / { blank } 没填的空 / { img } 鸽子（换掉构件的名字）
function tokens(sec, answers, piece) {
  const MARK = '\u0001';
  // [构件名]：有这一段切下来的鸽子就换成鸽子，没有就照常写这个词
  const sentence = sec.question.sentence.replace(/\[([^\]]*)\]/, (m, w) => (piece ? MARK : w)).replace(/\[([^\]]*)\]/g, '$1');
  const out = [];
  const words = (s, ans) => s.split(/\s+/).filter(Boolean).forEach((w) => {
    if (!w.includes(MARK)) { out.push({ t: w, ans }); return; }
    const [a, b] = w.split(MARK);
    out.push({ img: piece, pre: a, post: b });
  });
  sentence.split('___').forEach((part, i, parts) => {
    words(part, false);
    if (i < parts.length - 1) {
      const a = answers && answers[i];
      if (a) words(a, true); else out.push({ blank: true });
    }
  });
  // 空后面紧跟的标点（"___," "___."）粘回前一个词
  for (let i = 1; i < out.length; i++) {
    if (out[i].t && /^[,.;:!?’”]+$/.test(out[i].t) && (out[i - 1].blank || out[i - 1].t || out[i - 1].img)) {
      out[i - 1].tail = (out[i - 1].tail || '') + out[i].t;
      out.splice(i, 1);
      i--;
    }
  }
  return out;
}

// 版式参考 Look Up 的海报：左边是一把尺子（短刻度一路排上去，每个 section 一条长线，线上面写高度），
// 每一句诗坐在自己那条线上；最低的 section 在最下面，越往上越高（读的时候也是一路往上看）。
// 左上角两行等宽字（Look Up / 日期），下面一条长线
function renderPoem({ sections, answers, pieceOf, heightOf, title, date }) {
  const c = document.createElement('canvas');
  c.width = c.height = SIDE;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, SIDE, SIDE);
  const sans = fontOf('--sans');
  const mono = fontOf('--mono');
  const lw = Math.max(2, SIDE * 0.0013);
  const tickW = SIDE * 0.032;                        // 短刻度的长度
  const labX = tickW + SIDE * 0.012;                 // 等宽字从刻度右边开始
  const labPx = SIDE * 0.021;
  const x0 = SIDE * 0.24;                            // 诗从这里开始（和尺子之间留出一段空）
  const right = SIDE - SIDE * 0.06;
  const width = right - x0;
  const hline = (y, x1 = 0, x2 = right) => { g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke(); };
  g.strokeStyle = INK;
  g.lineWidth = lw;
  g.textBaseline = 'alphabetic';

  // 左上角：Look Up / 日期，下面一条长线
  g.fillStyle = INK;
  g.font = `${labPx}px ${mono}`;
  const h1 = SIDE * 0.05;
  g.fillText(title, labX, h1);
  g.fillText(date, labX, h1 + labPx * 1.3);
  hline(h1 - labPx * 0.35, 0, tickW);                // 第一行旁边一格刻度（和海报上名字旁边一样）
  const top = h1 + labPx * 1.3 + labPx * 0.9;
  hline(top, 0, x0 + width * 0.35);

  // 只放回答了的 section（跳过的不出现，尺子上也没有它的高度）；每句一格，最低的在最下面
  const answered = sections.map((s, i) => i).filter((i) => answers[i] && answers[i].some((a) => a && a.trim()));
  const bottom = SIDE * 0.965;
  const n = Math.max(1, answered.length);
  const band = (bottom - top) / n;
  const lineY = (k) => bottom - k * band;            // 第 k 个 section 的长线

  // 短刻度：每一格里四根
  for (let y = bottom; y > top + 2; y -= band / 5) hline(y, 0, tickW);

  // 字号：每一句都放得进自己那一格
  const stanzas = answered.map((i, k) => ({ i, k, toks: tokens(sections[i], answers[i], pieceOf(i)) }));
  const measure = (tok, f) => {
    g.font = `${f}px ${sans}`;
    if (tok.img) return g.measureText(tok.pre || '').width + f * 1.3 + g.measureText((tok.post || '') + (tok.tail || '')).width;
    if (tok.blank) return f * 3.2 + g.measureText(tok.tail || '').width;
    return g.measureText(tok.t + (tok.tail || '')).width;
  };
  const wrapToks = (toks, f) => {
    g.font = `${f}px ${sans}`;
    const sp = g.measureText(' ').width;
    const lines = [[]];
    let w = 0;
    for (const tok of toks) {
      const tw = measure(tok, f);
      if (w > 0 && w + sp + tw > width) { lines.push([]); w = 0; }
      lines[lines.length - 1].push({ tok, x: w ? w + sp : 0 });
      w = (w ? w + sp : 0) + tw;
    }
    return lines;
  };
  let f = SIDE * 0.034;
  for (let tries = 0; tries < 40; tries++) {
    const lh = f * 1.34;
    if (stanzas.every((st) => wrapToks(st.toks, f).length * lh + f * 0.55 <= band - f * 0.25)) break;
    f *= 0.95;
  }
  const lh = f * 1.34;

  for (const st of stanzas) {
    const y = lineY(st.k);
    hline(y);
    // 高度：等宽字，坐在长线上（和海报上的 25' 一样）
    const h = heightOf(st.i);
    if (h) {
      g.font = `${labPx}px ${mono}`;
      g.fillStyle = INK;
      g.fillText(`${Math.round(h)}″`, labX, y - labPx * 0.5);
    }
    // 这一句：最后一行坐在线上面一点
    const lines = wrapToks(st.toks, f);
    const base0 = y - f * 0.55 - (lines.length - 1) * lh;
    lines.forEach((line, li) => {
      const base = base0 + li * lh;
      for (const { tok, x } of line) {
        g.font = `${f}px ${sans}`;
        let cx = x0 + x;
        if (tok.img) {
          g.fillStyle = MUTE;
          if (tok.pre) { g.fillText(tok.pre, cx, base); cx += g.measureText(tok.pre).width; }
          const s = f * 1.18;
          g.drawImage(tok.img.canvas, cx + f * 0.06, base - f * 0.86, s, s);
          cx += f * 1.3;
          const post = (tok.post || '') + (tok.tail || '');
          if (post) g.fillText(post, cx, base);
        } else if (tok.blank) {
          g.beginPath();
          g.moveTo(cx, base + f * 0.12);
          g.lineTo(cx + f * 3.2, base + f * 0.12);
          g.stroke();
          if (tok.tail) { g.fillStyle = MUTE; g.fillText(tok.tail, cx + f * 3.2, base); }
        } else {
          g.fillStyle = tok.ans ? INK : MUTE;
          g.fillText(tok.t, cx, base);
          if (tok.tail) { g.fillStyle = MUTE; g.fillText(tok.tail, cx + g.measureText(tok.t).width, base); }
        }
      }
    });
  }
  return c;
}

// ---------------------------------------------------------------- 两面 → 一张 A4（横）

function cornerMarks(g, x, y, s, len, off) {
  // 和网站上一样：只有右上、左下两个角
  g.beginPath();
  g.moveTo(x + s - len, y - off); g.lineTo(x + s + off, y - off); g.lineTo(x + s + off, y + len);
  g.moveTo(x - off, y + s - len); g.lineTo(x - off, y + s + off); g.lineTo(x + len, y + s + off);
  g.stroke();
}

function renderA4(front, back) {
  const W = Math.round(297 * MM);
  const H = Math.round(210 * MM);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  const gap = 12 * MM;
  const x1 = (W - 2 * SIDE - gap) / 2;
  const x2 = x1 + SIDE + gap;
  const y = (H - SIDE) / 2;
  g.drawImage(front, x1, y);
  g.drawImage(back, x2, y);
  // 背面是白纸：画一条极细的边，剪的时候看得见
  g.strokeStyle = '#d9d9d9';
  g.lineWidth = 1;
  g.strokeRect(x2 + 0.5, y + 0.5, SIDE - 1, SIDE - 1);
  g.strokeStyle = INK;
  g.lineWidth = Math.max(1, 0.2 * MM);
  for (const x of [x1, x2]) cornerMarks(g, x, y, SIDE, 6 * MM, 2.5 * MM);
  return c;
}

function download(c, name) {
  c.toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

function print(c) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><title>Look Up</title><style>
    @page { size: A4 landscape; margin: 0; }
    html, body { margin: 0; }
    img { display: block; width: 297mm; height: 210mm; }
  </style><img src="${c.toDataURL('image/png')}">
  <script>window.onload = () => setTimeout(() => window.print(), 300);<\/script>`);
  w.document.close();
}

// 两面：正面按高度从低到高；背面每一句用那一段切到的第一只鸽子
function renderSides({ pieces, sections, answers, T, date, heights }) {
  const ordered = [...pieces].sort((a, b) => a.h - b.h);
  const pieceOf = (i) => pieces.find((p) => p.sec === i) || null;
  const heightOf = (i) => (heights && heights[i]) || (pieceOf(i) ? pieceOf(i).h : 0);      // 尺子上写 content.js 里每段的高度
  return { grid: renderGrid(ordered), poem: renderPoem({ sections, answers, pieceOf, heightOf, title: T.title, date }) };
}
// 调试：整张 A4
export function renderSheetA4(o) {
  const { grid, poem } = renderSides(o);
  return renderA4(grid.canvas, poem);
}

// ---------------------------------------------------------------- 动画：碎片拼成一张纸 → 翻过来是诗

export async function openSheet(o) {
  const { pieces, T } = o;
  await document.fonts.ready;
  const ordered = [...pieces].sort((a, b) => a.h - b.h);
  const { grid, poem } = renderSides(o);
  let a4 = null;
  const sheet = () => (a4 = a4 || renderA4(grid.canvas, poem));

  const W = window.innerWidth;
  const H = window.innerHeight;
  const u = Math.min(W / 96, H / 62);
  const P = Math.min(W - 6 * u, H - 16 * u, 46 * u);     // 纸在屏幕上的边长
  const px = (W - P) / 2;
  const py = Math.max(3 * u, (H - P) / 2 - 3 * u);

  let root = document.getElementById('sh');
  if (root) root.remove();
  root = document.createElement('div');
  root.id = 'sh';
  root.style.setProperty('--u', `${u}px`);
  root.innerHTML = `
    <div class="sh-paper" style="left:${px}px;top:${py}px;width:${P}px;height:${P}px">
      <div class="sh-rot">
        <div class="sh-face sh-front"></div>
        <div class="sh-face sh-back"></div>
      </div>
    </div>
    <div class="sh-btns" style="top:${py + P + 3 * u}px;opacity:0">
      <button class="sh-btn" data-act="download">${rv(T.download)}</button>
      <button class="sh-btn" data-act="print">${rv(T.print)}</button>
      <button class="sh-btn" data-act="fold">${rv(T.fold)}</button>
      <button class="sh-btn sh-quiet" data-act="close">${rv(T.close)}</button>
    </div>`;
  document.body.appendChild(root);
  const q = (s) => root.querySelector(s);
  const front = q('.sh-front');
  const back = q('.sh-back');
  const rot = q('.sh-rot');
  const paper = q('.sh-paper');
  for (const [face, cv] of [[front, grid.canvas], [back, poem]]) {
    const img = document.createElement('img');
    img.src = cv.toDataURL('image/jpeg', 0.92);
    face.appendChild(img);
  }
  root.querySelectorAll('.rv-t').forEach((t) => { t.style.visibility = 'hidden'; });
  front.style.opacity = 0;
  root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, easing: EASE_OUT, fill: 'both' });

  // 1. 碎片从屏幕四周飞进来，从下往上一块一块落进格子
  const k = P / SIDE;
  const { cells } = gridLayout(ordered.length);
  const fly = 1300;
  const stagger = Math.min(110, 2200 / Math.max(1, ordered.length));
  const start = 500;
  const flying = [];
  const anims = [];
  cells.forEach((cl, i) => {
    const e = document.createElement(ordered[i] ? 'img' : 'div');
    e.className = ordered[i] ? 'sh-piece' : 'sh-piece sh-empty';
    if (ordered[i]) e.src = ordered[i].canvas.toDataURL('image/jpeg', 0.9);
    const tx = px + cl.x * k;
    const ty = py + cl.y * k;
    const s = cl.s * k;
    Object.assign(e.style, { left: `${tx}px`, top: `${ty}px`, width: `${s}px`, height: `${s}px` });
    root.appendChild(e);
    flying.push(e);
    const delay = start + i * stagger;
    if (!ordered[i]) {
      anims.push(e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: start + ordered.length * stagger + fly * 0.6, easing: EASE_OUT, fill: 'both' }));
      return;
    }
    // 从哪里来：屏幕外面一圈，随机的角度；小一点、歪着
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.hypot(W, H) * (0.55 + Math.random() * 0.25);
    const fx = W / 2 + Math.cos(ang) * dist - (tx + s / 2);
    const fy = H / 2 + Math.sin(ang) * dist - (ty + s / 2);
    const r0 = (Math.random() - 0.5) * 70;
    const sc = Math.min(1.6, Math.max(0.5, (7 * u) / s));
    anims.push(e.animate([
      { transform: `translate(${fx}px, ${fy}px) rotate(${r0}deg) scale(${sc})`, opacity: 0 },
      { opacity: 1, offset: 0.2 },
      { transform: `translate(${fx * 0.12}px, ${fy * 0.12 - 2 * u}px) rotate(${r0 * 0.2}deg) scale(${1 + (sc - 1) * 0.2})`, offset: 0.78 },
      { transform: 'none', opacity: 1 },
    ], { duration: fly, delay, easing: EASE, fill: 'both' }));
  });

  // 2. 拼好了：换成整张纸（格子之间有细缝），碎片退场
  await Promise.all([...anims.map((a) => quiet(a.finished)), front.querySelector('img').decode().catch(() => {})]);
  await wait(250);
  if (!root.isConnected) return;
  front.style.opacity = 1;
  paper.classList.add('on');
  flying.forEach((e) => e.remove());
  paper.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.015)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 700, easing: EASE_OUT });

  // 3. 翻过来：诗
  await wait(1100);
  if (!root.isConnected) return;
  let angle = 0;
  const flip = () => {
    const a0 = angle;
    angle = (angle + 180) % 360;
    const p = `perspective(${P * 3}px)`;
    const an = rot.animate([
      { transform: `${p} translateZ(0) rotateY(${a0}deg)` },
      { transform: `${p} translateZ(${3 * u}px) rotateY(${a0 + 90}deg)`, offset: 0.5 },
      { transform: `${p} translateZ(0) rotateY(${a0 + 180}deg)` },
    ], { duration: 1300, easing: EASE, fill: 'forwards' });
    return quiet(an.finished).then(() => { rot.style.transform = `${p} rotateY(${angle}deg)`; an.cancel(); });
  };
  await flip();
  if (!root.isConnected) return;

  // 4. 下载 / 打印 / 关掉；点纸翻面
  q('.sh-btns').style.opacity = 1;
  reveal(q('.sh-btns'), { stagger: 120 });
  q('.sh-btns').style.pointerEvents = 'auto';
  paper.style.cursor = 'pointer';
  paper.addEventListener('click', flip);
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'download') download(sheet(), `look-up-${new Date().toISOString().slice(0, 10)}.png`);
    else if (act.dataset.act === 'print') print(sheet());
    else if (act.dataset.act === 'fold') openFold(T);
    else if (act.dataset.act === 'close') close(root);
  });
}

function close(root) {
  const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, easing: EASE_OUT, fill: 'forwards' });
  quiet(a.finished).then(() => root.remove());
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
