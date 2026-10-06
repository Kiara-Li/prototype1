// 声音存在这台电脑的浏览器里（IndexedDB；音频太大，localStorage 放不下）
// 一条记录：{ id, photo, pigeonId, animal, text, mime, createdAt, blob }

const DB_NAME = 'pigeon-sounds';
const STORE = 'recordings';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
      s.createIndex('pigeonId', 'pigeonId');
      s.createIndex('photo', 'photo');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
  }));
}

export const store = {
  all: () => tx('readonly', (s) => s.getAll()),
  put: (rec) => tx('readwrite', (s) => s.put(rec)),
  clear: () => tx('readwrite', (s) => s.clear()),
};

export function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---- 导出 / 导入：一个 JSON，音频转成 base64

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function exportAll(recordings) {
  const out = [];
  for (const r of recordings) {
    const { blob, ...meta } = r;
    out.push({ ...meta, audio: await blobToDataURL(blob) });
  }
  const json = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), recordings: out });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = `pigeon-sounds-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return out.length;
}

// 合并导入：同一个 id 的覆盖，其余保留
export async function importFile(file) {
  const data = JSON.parse(await file.text());
  let n = 0;
  for (const r of data.recordings || []) {
    const { audio, ...meta } = r;
    const blob = await (await fetch(audio)).blob();
    await store.put({ ...meta, blob });
    n++;
  }
  return n;
}
