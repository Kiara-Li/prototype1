// Look Up · 标注工具：给每张照片里的鸽子描轮廓、点脖子
//
// 数据格式（look-up/data/pigeons.json）：
// { version: 1, updated: "...", photos: { "<照片 id>": { done: bool, pigeons: [ { id, polygon: [[x,y]...], neck: [x,y] } ] } } }
// 坐标都是 0–1（按照片宽高归一化），和照片分辨率无关。
//
// 每次改动都自动存在这个浏览器里（localStorage），中途关掉不会丢。
// 「Save file」写到电脑上的文件（第一次会问存哪，选 look-up/data/pigeons.json）；「Download」下载一份；「Import」读回来。

const LS_KEY = 'lookup-mark-v1';
const $ = (id) => document.getElementById(id);
const cv = $('c');
const ctx = cv.getContext('2d');

let photos = [];
let suggestions = {};
let data = { version: 1, updated: null, photos: {} };
let idx = 0;
const img = new Image();
let imgReady = false;

// 编辑状态
let draft = [];            // 正在描的轮廓
let mode = 'outline';      // outline | neck
let neckFor = null;        // 等着点脖子的那只鸽子
let selected = null;       // 选中的鸽子
let showSugg = true;
let hoverSugg = null;
let mouse = [0, 0];
let fileHandle = null;

// 视图：缩放 + 平移
const view = { s: 1, ox: 0, oy: 0 };

// ================================================================ 数据

const cur = () => photos[idx];
function entry(id = cur().id) {
  if (!data.photos[id]) data.photos[id] = { done: false, pigeons: [] };
  return data.photos[id];
}

function persist() {
  data.updated = new Date().toISOString();
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) { flash('Could not save in this browser: ' + e.message); }
  renderStrip();
}

async function load() {
  photos = (await (await fetch('../data/photos.json')).json()).photos;
  try { suggestions = await (await fetch('../data/suggestions.json')).json(); } catch { suggestions = {}; }
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LS_KEY)); } catch { saved = null; }
  if (saved && saved.photos) data = saved;
  else {
    try { data = await (await fetch('../data/pigeons.json', { cache: 'no-store' })).json(); } catch { /* 还没有文件 */ }
  }
  const last = Number(localStorage.getItem(LS_KEY + '-idx'));
  show(Number.isFinite(last) ? last : 0);
}

function show(i) {
  idx = (i + photos.length) % photos.length;
  try { localStorage.setItem(LS_KEY + '-idx', String(idx)); } catch { /* */ }
  draft = []; mode = 'outline'; neckFor = null; selected = null;
  imgReady = false;
  img.onload = () => { imgReady = true; fit(); draw(); };
  img.src = '../' + cur().src;
  renderHeader();
  renderStrip();
}

// ================================================================ 坐标

function fit() {
  const W = cv.width / devicePixelRatio;
  const H = cv.height / devicePixelRatio;
  const s = Math.min((W - 220) / img.naturalWidth, (H - 40) / img.naturalHeight);
  view.s = s;
  view.ox = (W - 200 - img.naturalWidth * s) / 2;
  view.oy = (H - img.naturalHeight * s) / 2;
}
const toScreen = ([x, y]) => [view.ox + x * img.naturalWidth * view.s, view.oy + y * img.naturalHeight * view.s];
const toImage = ([sx, sy]) => [(sx - view.ox) / (img.naturalWidth * view.s), (sy - view.oy) / (img.naturalHeight * view.s)];

function inPoly([px, py], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ================================================================ 绘制

function draw() {
  const W = cv.width / devicePixelRatio;
  const H = cv.height / devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  if (!imgReady) return;
  ctx.imageSmoothingQuality = 'high';
  const [x0, y0] = toScreen([0, 0]);
  const [x1, y1] = toScreen([1, 1]);
  ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0);

  const path = (poly) => {
    ctx.beginPath();
    poly.forEach((p, i) => { const [x, y] = toScreen(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
  };

  // 建议轮廓（虚线）：已经采用过的不画
  if (showSugg) {
    const taken = entry().pigeons;
    for (const sg of suggestions[cur().id] || []) {
      if (taken.some((pg) => pg.fromSuggestion && sameShape(pg.polygon, sg.polygon.map(([x, y]) => [round(x), round(y)])))) continue;
      path(sg.polygon);
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = sg === hoverSugg ? 2 : 1;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // 已经标好的鸽子
  entry().pigeons.forEach((pg, k) => {
    path(pg.polygon);
    ctx.fillStyle = pg === selected ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)';
    ctx.fill();
    ctx.lineWidth = pg === selected ? 2 : 1;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    const [lx, ly] = toScreen(pg.polygon.reduce((a, p) => (p[1] < a[1] ? p : a)));
    label(String(k + 1).padStart(2, '0'), lx, ly - 6);
    if (pg.neck) {
      const [nx, ny] = toScreen(pg.neck);
      ctx.beginPath(); ctx.arc(nx, ny, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(nx, ny, 1.5, 0, Math.PI * 2); ctx.fillStyle = '#000'; ctx.fill();
    }
  });

  // 正在描的轮廓
  if (draft.length) {
    ctx.beginPath();
    draft.forEach((p, i) => { const [x, y] = toScreen(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.lineTo(mouse[0], mouse[1]);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);
    draft.forEach((p, i) => {
      const [x, y] = toScreen(p);
      ctx.fillStyle = i === 0 ? '#000' : '#fff';
      ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.strokeStyle = '#000'; ctx.strokeRect(x - 3, y - 3, 6, 6);
    });
  }

  // 点脖子：十字准星
  if (mode === 'neck') {
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mouse[0] - 12, mouse[1]); ctx.lineTo(mouse[0] + 12, mouse[1]);
    ctx.moveTo(mouse[0], mouse[1] - 12); ctx.lineTo(mouse[0], mouse[1] + 12);
    ctx.stroke();
  }
  renderMode();
}

function label(t, x, y) {
  ctx.font = '11px "TWK Everett Mono", Menlo, monospace';
  const w = ctx.measureText(t).width;
  ctx.fillStyle = '#000'; ctx.fillRect(x - 2, y - 11, w + 4, 14);
  ctx.fillStyle = '#fff'; ctx.fillText(t, x, y);
}

function sameShape(a, b) {
  return a.length === b.length && a.every((p, i) => Math.abs(p[0] - b[i][0]) < 1e-6 && Math.abs(p[1] - b[i][1]) < 1e-6);
}

// ================================================================ 文字

function renderHeader() {
  const p = cur();
  $('pid').textContent = p.id;
  $('cap').textContent = p.caption || '(no caption)';
  const e = entry(p.id);
  $('info').textContent = `${idx + 1} / ${photos.length}   ·   ${p.height_in}″   ·   ${e.pigeons.length} pigeon${e.pigeons.length === 1 ? '' : 's'}`
    + `${e.done ? '   ·   done' : ''}   ·   ${(suggestions[p.id] || []).length} suggested`;
}

function renderMode() {
  const t = mode === 'neck' ? 'Click the neck of this pigeon (Esc: skip)'
    : draft.length ? `Outlining · ${draft.length} points · Enter to close`
      : selected ? 'Selected · Del to delete · K to move neck'
        : 'Click to start an outline, or click a dashed suggestion to use it';
  $('mode').textContent = t;
  renderHeader();
}

function renderStrip() {
  const el = $('strip');
  el.innerHTML = '';
  photos.forEach((p, i) => {
    const e = data.photos[p.id];
    const d = document.createElement('div');
    if (i === idx) d.className = 'cur';
    const n = e ? e.pigeons.length : 0;
    d.innerHTML = `<span>${p.id}</span><span class="${e && e.done ? '' : 'mute'}">${e && e.done ? (n ? `● ${n}` : '○ 0') : (n ? `${n} …` : '·')}</span>`;
    d.onclick = () => show(i);
    el.appendChild(d);
  });
  const doneN = photos.filter((p) => data.photos[p.id] && data.photos[p.id].done).length;
  const head = document.createElement('div');
  head.className = 'mute';
  head.innerHTML = `<span>done</span><span>${doneN} / ${photos.length}</span>`;
  el.prepend(head);
  const cur = el.querySelector('.cur');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
}

let flashTimer = null;
function flash(t) {
  $('mode').textContent = t;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(renderMode, 2500);
}

// ================================================================ 编辑

function closeDraft() {
  if (draft.length < 3) return;
  const pg = { id: '', polygon: draft.map(([x, y]) => [round(x), round(y)]), neck: null };
  addPigeon(pg);
  draft = [];
}

function addPigeon(pg) {
  const e = entry();
  e.pigeons.push(pg);
  renumber();
  neckFor = pg;
  selected = pg;
  mode = 'neck';
  persist();
}

function renumber() {
  entry().pigeons.forEach((pg, k) => { pg.id = `${cur().id}-${k + 1}`; });
}

const round = (v) => Math.round(Math.max(0, Math.min(1, v)) * 10000) / 10000;

cv.addEventListener('mousemove', (e) => {
  mouse = [e.offsetX, e.offsetY];
  if (e.altKey && e.buttons === 1) {
    view.ox += e.movementX; view.oy += e.movementY;
  }
  hoverSugg = null;
  if (showSugg && !draft.length && mode === 'outline') {
    const q = toImage(mouse);
    hoverSugg = (suggestions[cur().id] || []).find((sg) => inPoly(q, sg.polygon)) || null;
  }
  draw();
});

cv.addEventListener('mousedown', (e) => {
  if (e.altKey || e.button !== 0 || !imgReady) return;
  const q = toImage([e.offsetX, e.offsetY]);
  if (mode === 'neck') {
    neckFor.neck = [round(q[0]), round(q[1])];
    mode = 'outline'; neckFor = null;
    persist(); draw();
    return;
  }
  if (draft.length) {
    // 点回第一个点 = 闭合
    const [fx, fy] = toScreen(draft[0]);
    if (draft.length >= 3 && Math.hypot(e.offsetX - fx, e.offsetY - fy) < 8) { closeDraft(); draw(); return; }
    draft.push(q); draw();
    return;
  }
  // 点已有的鸽子 = 选中
  const hit = [...entry().pigeons].reverse().find((pg) => inPoly(q, pg.polygon));
  if (hit) { selected = hit; draw(); return; }
  // 点虚线建议 = 采用（已经采用过的不算）
  const sugg = showSugg && (suggestions[cur().id] || []).find((sg) => inPoly(q, sg.polygon)
    && !entry().pigeons.some((pg) => pg.fromSuggestion && sameShape(pg.polygon, sg.polygon.map(([x, y]) => [round(x), round(y)]))));
  if (sugg) {
    addPigeon({ id: '', polygon: sugg.polygon.map(([x, y]) => [round(x), round(y)]), neck: null, fromSuggestion: true });
    hoverSugg = null; draw();
    return;
  }
  selected = null;
  draft = [q]; draw();
});

cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const k = Math.exp(-e.deltaY * 0.0015);
  const [mx, my] = [e.offsetX, e.offsetY];
  view.ox = mx - (mx - view.ox) * k;
  view.oy = my - (my - view.oy) * k;
  view.s *= k;
  draw();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey) return;
  const k = e.key;
  if (k === 'ArrowRight') show(idx + 1);
  else if (k === 'ArrowLeft') show(idx - 1);
  else if (k === 'Enter') { closeDraft(); }
  else if (k === 'Backspace' && draft.length) { draft.pop(); e.preventDefault(); }
  else if (k === 'Escape') { draft = []; if (mode === 'neck') { mode = 'outline'; neckFor = null; } selected = null; }
  else if ((k === 'Delete' || k === 'Backspace') && selected) {
    const e2 = entry();
    e2.pigeons.splice(e2.pigeons.indexOf(selected), 1);
    renumber(); selected = null; persist();
  } else if ((k === 'k' || k === 'K') && selected) { neckFor = selected; mode = 'neck'; }
  else if (k === 's' || k === 'S') showSugg = !showSugg;
  else if (k === 'd' || k === 'D') { const en = entry(); en.done = !en.done; persist(); }
  else if (k === 'n' || k === 'N') {
    for (let j = 1; j <= photos.length; j++) {
      const p = photos[(idx + j) % photos.length];
      if (!(data.photos[p.id] && data.photos[p.id].done)) { show((idx + j) % photos.length); return; }
    }
  } else if (k === '0') { fit(); }
  else return;
  draw();
});

// ================================================================ 保存 / 导出 / 导入

function json() {
  return JSON.stringify(data, null, 1);
}

$('bSave').onclick = async () => {
  if (!window.showSaveFilePicker) { download(); return; }
  try {
    if (!fileHandle) {
      fileHandle = await window.showSaveFilePicker({ suggestedName: 'pigeons.json', types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
    }
    const w = await fileHandle.createWritable();
    await w.write(json());
    await w.close();
    flash(`Saved to ${fileHandle.name}`);
  } catch (err) {
    if (err.name !== 'AbortError') flash('Save failed: ' + err.message);
  }
};

function download() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json()], { type: 'application/json' }));
  a.download = 'pigeons.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  flash('Downloaded pigeons.json — move it to look-up/data/');
}
$('bExport').onclick = download;

$('bImport').onclick = () => $('file').click();
$('file').onchange = async () => {
  const f = $('file').files[0];
  $('file').value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d.photos) throw new Error('not a pigeons.json');
    data = d; persist(); show(idx); flash(`Imported ${f.name}`);
  } catch (err) { flash('Import failed: ' + err.message); }
};

$('bReset').onclick = async () => {
  if (!confirm('Replace the marks in this browser with look-up/data/pigeons.json?')) return;
  try {
    data = await (await fetch('../data/pigeons.json', { cache: 'no-store' })).json();
    persist(); show(idx); flash('Loaded data/pigeons.json');
  } catch { flash('No look-up/data/pigeons.json yet'); }
};

// ================================================================ 画布大小

function resize() {
  const W = window.innerWidth;
  const H = window.innerHeight - 64;
  cv.width = W * devicePixelRatio;
  cv.height = H * devicePixelRatio;
  cv.style.width = W + 'px';
  cv.style.height = H + 'px';
  if (imgReady) fit();
  draw();
}
window.addEventListener('resize', resize);
window.markTool = { toScreen: (p) => toScreen(p), suggestions: () => suggestions, data: () => data, cur: () => cur() };   // 控制台调试用
resize();
load();
