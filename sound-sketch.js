// 鸽子的声音（阶段 5，用照片里的鸽子）
// 一张有环境的照片，里面每只鸽子都抠好了剪影（data/sound/photos.json）。
// 鼠标移到鸽子上 = 高亮；点一只鸽子 = 选中它，并播放它已有的声音；
// 按住空格 = 给这只鸽子录一段叫声，松开自动保存（config.sound.askForWords 打开时，录完先写下是什么动物、怎么写）。
//
// 按键：← / → 换照片 · 空格（按住）录音 · Esc 取消选中 / 放弃这段录音
//      E 导出全部声音 · I 导入 · X 清空全部（要再按 Y 确认）· D 显示全部剪影 · F 全屏

import { store, newId, exportAll, importFile } from './sound-store.js';
import { drawFrameMarks } from './frame.js';

const C = window.CONFIG;
const S = C.sound;

// ================================================================ 状态

const photos = [];                 // { info, img }
const recordings = [];             // 见 sound-store.js
const state = {
  index: 0,
  switchedAt: -1e9,
  hover: null,                     // 鼠标下的鸽子
  hoverLabel: null,                // 鼠标下的 label（一条录音）
  selected: null,                  // 点中的鸽子
  mode: 'idle',                    // idle | consent | recording | naming | confirmClear
  consent: false,                  // 这次打开页面后是否已同意
  recStart: 0,
  levels: [],                      // 录音时的音量历史（底部那条线）
  pendingBlob: null,
  message: '',
  messageUntil: 0,
  debug: false,
  labelRects: [],
};
const mic = { stream: null, recorder: null, chunks: [], analyser: null, buf: null, timer: null };
window.pigeonSound = {
  photos, recordings, state,
  // 调试用：不录音，直接拿一段 blob 进入「写下来」那一步（控制台里 pigeonSound.fakeRecording()）
  fakeRecording(blob = new Blob([new Uint8Array(2000)], { type: 'audio/webm' })) {
    if (!state.selected) return 'select a pigeon first';
    state.pendingBlob = blob;
    state.pendingSeconds = 1.5;
    if (S.askForWords) { state.mode = 'naming'; showInputs(); } else saveRecording('', '');
    return 'ok';
  },
};

// ================================================================ 数据

async function loadAll() {
  const data = await (await fetch('data/sound/photos.json')).json();
  for (const info of data.photos) {
    const img = new Image();
    img.decoding = 'async';
    img.src = 'data/' + info.file;
    photos.push({ info, img });
  }
  try {
    recordings.push(...(await store.all()));
  } catch (err) {
    flash('Could not open saved sounds: ' + err.message);
  }
  recordings.sort((a, b) => a.createdAt - b.createdAt);
  showPhoto(0);
}

const photo = () => photos[state.index];
const soundsOf = (pigeonId) => recordings.filter((r) => r.pigeonId === pigeonId);
const soundsOfPhoto = (file) => recordings.filter((r) => r.photo === file);

function showPhoto(i) {
  if (!photos.length) return;
  state.index = ((i % photos.length) + photos.length) % photos.length;
  state.switchedAt = performance.now();
  state.selected = null;
  state.hover = null;
  // 每次翻到一张：随机、轻声地放一两段已经留在这里的声音
  const here = soundsOfPhoto(photo().info.file);
  const pick = here.sort(() => Math.random() - 0.5).slice(0, Math.min(here.length, S.ambientCount));
  pick.forEach((r, k) => setTimeout(() => {
    if (photo().info.file === r.photo) play(r, S.ambientVolume);
  }, S.ambientDelayMs + k * (800 + Math.random() * 1600)));
}

function flash(msg, ms = 2500) {
  state.message = msg;
  state.messageUntil = performance.now() + ms;
}

// ================================================================ 播放

const urls = new Map();
function play(rec, volume = 1) {
  if (!urls.has(rec.id)) urls.set(rec.id, URL.createObjectURL(rec.blob));
  const a = new Audio(urls.get(rec.id));
  a.volume = Math.max(0, Math.min(1, volume));
  a.play().catch(() => {});        // 浏览器要求先有一次点击才能出声，没点过就静静失败
  return a;
}

function playAll(list, volume = 1) {
  let k = 0;
  const next = () => {
    if (k >= list.length) return;
    const a = play(list[k++], volume);
    a.onended = next;
  };
  next();
}

// ================================================================ 录音

async function ensureMic() {
  if (mic.stream) return true;
  try {
    mic.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ac = new AudioContext();
    const src = ac.createMediaStreamSource(mic.stream);
    mic.analyser = ac.createAnalyser();
    mic.analyser.fftSize = 1024;
    mic.buf = new Float32Array(mic.analyser.fftSize);
    src.connect(mic.analyser);
    return true;
  } catch (err) {
    flash('Microphone unavailable: ' + (err && err.message ? err.message : err), 4000);
    return false;
  }
}

function pickMime() {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

async function startRecording() {
  if (!state.selected || state.mode !== 'idle') return;
  if (!state.consent) { state.mode = 'consent'; return; }
  if (!(await ensureMic())) return;
  const mime = pickMime();
  mic.chunks = [];
  mic.recorder = new MediaRecorder(mic.stream, mime ? { mimeType: mime } : undefined);
  mic.recorder.ondataavailable = (e) => { if (e.data && e.data.size) mic.chunks.push(e.data); };
  mic.recorder.onstop = () => {
    state.pendingBlob = new Blob(mic.chunks, { type: mic.recorder.mimeType || mime || 'audio/webm' });
    state.pendingSeconds = Math.min(S.maxSeconds, (performance.now() - state.recStart) / 1000);
    if (state.pendingBlob.size < 200 || state.pendingSeconds < 0.3) { state.mode = 'idle'; flash('Too short.'); return; }
    if (S.askForWords) {
      state.mode = 'naming';
      showInputs();
    } else {
      saveRecording('', '');               // 录完直接保存
    }
  };
  mic.recorder.start();
  state.mode = 'recording';
  state.recStart = performance.now();
  state.levels = [];
  mic.timer = setTimeout(stopRecording, S.maxSeconds * 1000);   // 最长 maxSeconds 秒
}

function stopRecording() {
  clearTimeout(mic.timer);
  if (state.mode === 'recording' && mic.recorder && mic.recorder.state === 'recording') mic.recorder.stop();
}

function level() {
  if (!mic.analyser) return 0;
  mic.analyser.getFloatTimeDomainData(mic.buf);
  let sum = 0;
  for (const v of mic.buf) sum += v * v;
  return Math.min(1, Math.sqrt(sum / mic.buf.length) * S.levelGain);
}

// ---- 写下来：两个很小的输入框

const inputs = {};
function makeInputs() {
  const wrap = document.createElement('div');
  wrap.id = 'naming';
  for (const [key, ph] of [['animal', S.animalPlaceholder], ['text', S.textPlaceholder]]) {
    const el = document.createElement('input');
    el.placeholder = ph;
    el.autocomplete = 'off';
    el.spellcheck = false;
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.isComposing || e.keyCode === 229) return;   // 中文 / 日文输入法正在选字：回车只是确认文字
      if (e.key === 'Escape') { discard(); return; }
      if (e.key !== 'Enter') return;
      if (key === 'animal') inputs.text.focus();
      else save();
    });
    wrap.appendChild(el);
    inputs[key] = el;
  }
  document.body.appendChild(wrap);
}

function showInputs() {
  inputs.animal.value = '';
  inputs.text.value = '';
  document.getElementById('naming').style.display = 'flex';
  inputs.animal.focus();
}

function hideInputs() {
  document.getElementById('naming').style.display = 'none';
  inputs.animal.blur();
  inputs.text.blur();
}

async function save() {
  const animal = inputs.animal.value.trim();
  const text = inputs.text.value.trim();
  if (!animal) { inputs.animal.focus(); return; }
  if (!text) { inputs.text.focus(); return; }
  await saveRecording(animal, text);
  hideInputs();
}

async function saveRecording(animal, text) {
  const rec = {
    id: newId(),
    photo: photo().info.file,
    pigeonId: state.selected.id,
    animal,
    text,
    seconds: Math.round((state.pendingSeconds || 0) * 10) / 10,
    mime: state.pendingBlob.type,
    createdAt: Date.now(),
    blob: state.pendingBlob,
  };
  try {
    await store.put(rec);
    recordings.push(rec);
    flash('Saved.');
  } catch (err) {
    console.error(err);
    flash('Could not save: ' + (err && err.message ? err.message : err), 5000);
  }
  state.pendingBlob = null;
  state.mode = 'idle';
}

function discard() {
  state.pendingBlob = null;
  state.mode = 'idle';
  hideInputs();
}

// ================================================================ 版面

// 照片放进屏幕，右边留一栏给 label；照片底边落在一条贯穿屏幕的细线上
function layout(W, H) {
  const p = photo();
  if (!p) return null;
  const [pw, ph] = p.info.px;
  const m = S.marginPx;
  const availW = W - 2 * m - S.labelColumnPx;
  const s = Math.min(availW / pw, (H - 2 * m) / ph);
  const w = pw * s;
  const h = ph * s;
  return { x: m + (availW - w) / 2, y: (H - h) / 2, w, h };
}

function pigeonPath(ctx, pg, r) {
  ctx.beginPath();
  for (const poly of pg.polygons) {
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(r.x + x * r.w, r.y + y * r.h) : ctx.moveTo(r.x + x * r.w, r.y + y * r.h)));
    ctx.closePath();
  }
}

function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// 鼠标下的鸽子：先看剪影里面；小鸽子不好点，再看外扩 hitPaddingPx 的方框
function pigeonAt(mx, my, r) {
  const p = photo();
  if (!p || !r) return null;
  const x = (mx - r.x) / r.w;
  const y = (my - r.y) / r.h;
  for (const pg of p.info.pigeons) if (pg.polygons.some((poly) => inPoly(x, y, poly))) return pg;
  const pad = S.hitPaddingPx;
  let best = null;
  let bestD = Infinity;
  for (const pg of p.info.pigeons) {
    const [x0, y0, x1, y1] = pg.bbox;
    const bx0 = r.x + x0 * r.w - pad;
    const by0 = r.y + y0 * r.h - pad;
    const bx1 = r.x + x1 * r.w + pad;
    const by1 = r.y + y1 * r.h + pad;
    if (mx < bx0 || mx > bx1 || my < by0 || my > by1) continue;
    const d = Math.hypot(mx - (bx0 + bx1) / 2, my - (by0 + by1) / 2);
    if (d < bestD) { best = pg; bestD = d; }
  }
  return best;
}

// ================================================================ 绘制

function draw(ctx, W, H, now) {
  ctx.fillStyle = C.layout.background;
  ctx.fillRect(0, 0, W, H);
  const p = photo();
  const r = layout(W, H);
  if (!p || !r) return;

  // 照片（换图时淡入）
  ctx.save();
  ctx.globalAlpha = Math.min(1, (now - state.switchedAt) / S.fadeMs);
  if (p.img.complete && p.img.naturalWidth) ctx.drawImage(p.img, r.x, r.y, r.w, r.h);
  ctx.restore();

  // 高亮：鼠标下的鸽子（或选中的那只）保持原样，其余变淡
  const focus = state.hover || state.selected;
  if (focus) {
    ctx.save();
    ctx.globalAlpha = S.dimOthers;
    ctx.fillStyle = C.layout.background;
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    for (const poly of focus.polygons) {
      poly.forEach(([x, y], i) => (i ? ctx.lineTo(r.x + x * r.w, r.y + y * r.h) : ctx.moveTo(r.x + x * r.w, r.y + y * r.h)));
      ctx.closePath();
    }
    ctx.fill('evenodd');
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = C.layout.ink;
    ctx.lineWidth = S.outlinePx;
    pigeonPath(ctx, focus, r);
    ctx.stroke();
    ctx.restore();
  }
  // 选中的鸽子：四角书页上那种 L 形裁切线
  if (state.selected) {
    const [x0, y0, x1, y1] = state.selected.bbox;
    const pad = 6;
    drawFrameMarks(ctx, { x: r.x + x0 * r.w - pad, y: r.y + y0 * r.h - pad, w: (x1 - x0) * r.w + 2 * pad, h: (y1 - y0) * r.h + 2 * pad },
      { ...C.frame, lineWidthPx: 0, cornerLenPx: 10, cornerGapPx: 0 }, C.layout.ink);
  }

  // 调试：所有剪影
  if (state.debug) {
    ctx.save();
    ctx.strokeStyle = C.layout.ink;
    ctx.lineWidth = 1;
    ctx.font = `10px ${C.fonts.mono}`;
    ctx.fillStyle = C.layout.ink;
    for (const pg of p.info.pigeons) {
      pigeonPath(ctx, pg, r);
      ctx.stroke();
      ctx.fillText(pg.id.split('#')[1], r.x + pg.bbox[0] * r.w, r.y + pg.bbox[1] * r.h - 3);
    }
    ctx.restore();
  }

  // 照片底下的细线（贯穿屏幕）
  ctx.save();
  ctx.strokeStyle = C.layout.ink;
  ctx.lineWidth = 1;
  const by = Math.round((r.y + r.h) * 2) / 2;
  ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(W, by); ctx.stroke();
  ctx.restore();

  drawLabels(ctx, r, W);
  drawBottom(ctx, W, H, r, now);
}

// label：右边一栏，等宽小字「pigeon — 咕咕」；一根细线从鸽子连过来。同一只鸽子的依次往下排。
function drawLabels(ctx, r, W) {
  state.labelRects = [];
  const p = photo();
  const here = p.info.pigeons.map((pg) => ({ pg, list: soundsOf(pg.id) })).filter((e) => e.list.length);
  if (!here.length) return;
  const lx = r.x + r.w + S.labelGapPx;
  const px = S.labelPx;
  const lead = px * 1.6;
  // 按鸽子的高度排，太挤就往下推
  const items = [];
  for (const { pg, list } of here) {
    const cy = r.y + ((pg.bbox[1] + pg.bbox[3]) / 2) * r.h;
    list.forEach((rec, k) => items.push({ pg, rec, want: cy + k * lead }));
  }
  items.sort((a, b) => a.want - b.want);
  let last = -Infinity;
  for (const it of items) {
    it.y = Math.max(it.want, last + lead);
    last = it.y;
  }
  ctx.save();
  ctx.font = `${px}px ${C.fonts.mono}`;
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = C.layout.ink;
  ctx.fillStyle = C.layout.ink;
  ctx.lineWidth = 0.75;
  for (const it of items) {
    const focus = state.hover === it.pg || state.selected === it.pg || state.hoverLabel === it.rec;
    ctx.globalAlpha = focus || (!state.hover && !state.selected) ? 1 : 0.35;
    // 引线：鸽子右边 → 照片右边 → label
    const sx = r.x + it.pg.bbox[2] * r.w + 4;
    const sy = r.y + ((it.pg.bbox[1] + it.pg.bbox[3]) / 2) * r.h;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(r.x + r.w + S.labelGapPx * 0.5, sy);
    ctx.lineTo(lx - 4, it.y);
    ctx.stroke();
    const label = labelText(it.rec, it.pg);
    ctx.fillText(label, lx, it.y);
    state.labelRects.push({ rec: it.rec, pg: it.pg, x: lx, y: it.y - lead / 2, w: Math.min(ctx.measureText(label).width, W - lx), h: lead });
  }
  ctx.restore();
}

// 写了字：「pigeon — 咕咕」；没写字：这只鸽子的第几段 + 时长，例如「01   2.4″」
function labelText(rec, pg) {
  if (rec.animal || rec.text) return `${rec.animal} — ${rec.text}`;
  const k = soundsOf(pg.id).indexOf(rec) + 1;
  return `${String(k).padStart(2, '0')}   ${rec.seconds ? rec.seconds.toFixed(1) + '″' : ''}`;
}

// 底部：提示 / 同意说明 / 录音时随音量起伏的线
function drawBottom(ctx, W, H, r, now) {
  const y = H - S.bottomPx;
  ctx.save();
  ctx.fillStyle = C.layout.ink;
  ctx.strokeStyle = C.layout.ink;
  ctx.font = `${S.promptPx}px ${C.fonts.mono}`;
  ctx.textBaseline = 'alphabetic';
  const tx = S.marginPx;
  const ty = H - S.marginPx * 0.4;

  if (state.mode === 'recording') {
    // 一条细线，随音量起伏（样子和书的基线一样：黑、细）
    state.levels.push(level());
    const n = Math.floor(W / 3);
    if (state.levels.length > n) state.levels.splice(0, state.levels.length - n);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const start = W - state.levels.length * 3;
    ctx.moveTo(0, y);
    state.levels.forEach((v, i) => ctx.lineTo(start + i * 3, y - v * S.levelHeightPx));
    ctx.stroke();
    const sec = (now - state.recStart) / 1000;
    ctx.fillText(`● ${sec.toFixed(1)} / ${S.maxSeconds}s`, tx, ty);
  } else if (state.mode === 'consent') {
    ctx.fillText(`${S.consentText}   Enter ↵`, tx, ty);
  } else if (state.mode === 'naming') {
    ctx.fillText('Enter ↵ save   ·   Esc discard', tx + 2 * S.inputWidthPx + 40, ty);
  } else if (state.mode === 'confirmClear') {
    ctx.fillText(`Delete all ${recordings.length} sounds? Press Y to confirm.`, tx, ty);
  } else if (now < state.messageUntil) {
    ctx.fillText(state.message, tx, ty);
  } else if (state.selected) {
    ctx.fillText(S.recordHint, tx, ty);
  }
  ctx.restore();
}

// ================================================================ p5

new p5((p) => {
  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    p.drawingContext.imageSmoothingQuality = 'high';
    makeInputs();
    loadAll().catch((err) => flash('Could not read data/sound/photos.json: ' + err.message, 10000));

    // 空格：按住录音，松开结束（输入框里打字时不算）
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) startRecording();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') stopRecording();
    });
  };

  p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);

  p.draw = () => {
    const now = performance.now();
    const r = layout(p.width, p.height);
    state.hover = state.mode === 'idle' ? pigeonAt(p.mouseX, p.mouseY, r) : null;
    state.hoverLabel = state.labelRects.find((l) => p.mouseX >= l.x && p.mouseX <= l.x + l.w && p.mouseY >= l.y && p.mouseY <= l.y + l.h)?.rec || null;
    p.cursor(state.hover || state.hoverLabel ? p.HAND : p.ARROW);
    draw(p.drawingContext, p.width, p.height, now);
  };

  p.mousePressed = (e) => {
    if (e && e.target && e.target.tagName === 'INPUT') return;
    if (state.mode !== 'idle') return;
    if (state.hoverLabel) { play(state.hoverLabel); return; }
    const pg = pigeonAt(p.mouseX, p.mouseY, layout(p.width, p.height));
    state.selected = pg;
    if (pg) playAll(soundsOf(pg.id));
  };

  p.keyPressed = (e) => {
    if (e && e.target && e.target.tagName === 'INPUT') return;
    const k = p.key.toLowerCase();
    if (state.mode === 'consent') {
      if (p.keyCode === p.ENTER) { state.consent = true; state.mode = 'idle'; flash(S.recordHint); }
      else if (p.keyCode === p.ESCAPE) state.mode = 'idle';
      return;
    }
    if (state.mode === 'confirmClear') {
      if (k === 'y') {
        store.clear().then(() => { recordings.length = 0; flash('All sounds deleted.'); });
      }
      state.mode = 'idle';
      return;
    }
    if (state.mode !== 'idle') return;
    if (p.keyCode === p.RIGHT_ARROW) showPhoto(state.index + 1);
    else if (p.keyCode === p.LEFT_ARROW) showPhoto(state.index - 1);
    else if (p.keyCode === p.ESCAPE) state.selected = null;
    else if (k === 'd') state.debug = !state.debug;
    else if (k === 'f') p.fullscreen(!p.fullscreen());
    else if (k === 'e') exportAll(recordings).then((n) => flash(`Exported ${n} sounds.`));
    else if (k === 'i') document.getElementById('import').click();
    else if (k === 'x' && recordings.length) state.mode = 'confirmClear';
  };
});

// 导入（按 I）：选一个导出的 JSON，合并进来
window.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('import');
  el.addEventListener('change', async () => {
    const f = el.files && el.files[0];
    el.value = '';
    if (!f) return;
    try {
      const n = await importFile(f);
      recordings.length = 0;
      recordings.push(...(await store.all()));
      recordings.sort((a, b) => a.createdAt - b.createdAt);
      flash(`Imported ${n} sounds.`);
    } catch (err) {
      flash('Import failed: ' + err.message, 4000);
    }
  });
});
