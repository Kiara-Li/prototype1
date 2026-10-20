// Look Up · 天空：颜色对应纽约此刻的时间（白天 / 黄昏 / 夜里），风向用真实数据（Open-Meteo，不需要 key）。
// 拿不到数据时用 config 里的默认值，不报错。

const L = () => window.LOOKUP;

export const sky = {
  windDirection: null,     // 风从哪个方向来（度，0 = 北）
  windSpeed: null,         // km/h
  sunrise: null,           // 'HH:MM'（纽约时间）
  sunset: null,
  source: 'default',
};

export async function loadSky() {
  const c = L().sky;
  Object.assign(sky, { windDirection: c.fallback.windDirection, windSpeed: c.fallback.windSpeed,
    sunrise: c.fallback.sunrise, sunset: c.fallback.sunset, source: 'default' });
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.latitude}&longitude=${c.longitude}`
    + '&current=wind_speed_10m,wind_direction_10m&daily=sunrise,sunset&timezone=America%2FNew_York&forecast_days=1';
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), c.fetchTimeoutMs);
    const d = await (await fetch(url, { signal: ctl.signal })).json();
    clearTimeout(timer);
    if (d.current) {
      sky.windDirection = d.current.wind_direction_10m;
      sky.windSpeed = d.current.wind_speed_10m;
    }
    if (d.daily && d.daily.sunrise) {
      sky.sunrise = d.daily.sunrise[0].slice(11, 16);
      sky.sunset = d.daily.sunset[0].slice(11, 16);
    }
    sky.source = 'open-meteo';
  } catch { /* 用默认值 */ }
}

// 纽约此刻的时间（分钟）
function nyMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false })
    .formatToParts(date);
  const hh = Number(parts.find((p) => p.type === 'hour').value) % 24;
  const mm = Number(parts.find((p) => p.type === 'minute').value);
  return hh * 60 + mm;
}
const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

// 天空的两种颜色（上、下），白天 / 黄昏 / 夜里之间平滑过渡
export function skyColors() {
  const c = L().sky;
  const now = nyMinutes();
  const rise = toMin(sky.sunrise);
  const set = toMin(sky.sunset);
  const tw = c.twilightMin;
  // 白天的程度 0–1、黄昏的程度 0–1
  const dayness = smooth(rise - tw, rise + tw, now) * (1 - smooth(set - tw, set + tw, now));
  const duskness = Math.max(bump(rise, tw, now), bump(set, tw, now));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const night = c.colors.night.map(hex);
  const day = c.colors.day.map(hex);
  const dusk = c.colors.dusk.map(hex);
  let top = mix(night[0], day[0], dayness);
  let bottom = mix(night[1], day[1], dayness);
  top = mix(top, dusk[0], duskness * 0.8);
  bottom = mix(bottom, dusk[1], duskness * 0.8);
  return { top, bottom, phase: duskness > 0.5 ? 'dusk' : dayness > 0.5 ? 'day' : 'night' };
}

// 风：屏幕上的漂移方向（风往哪里吹，单位向量）和强度
export function windVector() {
  const to = ((sky.windDirection ?? 270) + 180) * Math.PI / 180;   // 风「来自」的方向转成「吹向」
  const strength = Math.min(1, (sky.windSpeed ?? 10) / 30);
  return { x: Math.sin(to), y: -Math.cos(to), strength };
}

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function bump(center, half, x) {
  return Math.max(0, 1 - Math.abs(x - center) / half);
}
export function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgb = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
