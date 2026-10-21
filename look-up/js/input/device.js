// Look Up · 是手机还是电脑。不只看屏幕宽度：要同时满足
//   · 主要的指针是手指（pointer: coarse），并且没有鼠标 / 触控板（any-pointer: fine）
//   · 有触控（maxTouchPoints > 0）
//   · 浏览器有 DeviceOrientationEvent
// URL 加 ?device=mobile 或 ?device=desktop 可以强制（测试用）。

export function isMobileDevice() {
  const forced = new URLSearchParams(location.search).get('device');
  if (forced === 'mobile') return true;
  if (forced === 'desktop') return false;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const anyFine = matchMedia('(any-pointer: fine)').matches;
  const touch = (navigator.maxTouchPoints || 0) > 0;
  const orientation = typeof window.DeviceOrientationEvent !== 'undefined';
  return coarse && !anyFine && touch && orientation;
}
