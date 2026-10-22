// Look Up · dashboard 和书页共用的小动画：黑色方块把字拉出来、缓动曲线

export const EASE = 'cubic-bezier(.65,0,.35,1)';
export const EASE_OUT = 'cubic-bezier(.16,.7,.25,1)';
export const EASE_IN = 'cubic-bezier(.55,0,.75,.2)';

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 一行字：文字 + 一条盖在上面的方块
export const rv = (text) => `<span class="rv"><span class="rv-t">${esc(text)}</span><span class="rv-bar"></span></span>`;
export const quiet = (p) => p.catch(() => {});     // 动画被取消时不报错
export const setText = (e, text) => { e.querySelector('.rv-t').textContent = text; };

// 黑色方块把字拉出来：方块从左边伸出来盖住这一行 → 字出现 → 方块收向右边
export function reveal(scope, { delay = 0, stagger = 110, dur = 300 } = {}) {
  const lines = scope.classList && scope.classList.contains('rv') ? [scope] : [...scope.querySelectorAll('.rv')];
  lines.forEach((line, i) => {
    const t = line.querySelector('.rv-t');
    const bar = line.querySelector('.rv-bar');
    if (!t.textContent) return;
    bar.getAnimations().forEach((a) => a.cancel());
    t.style.visibility = 'hidden';
    bar.style.transformOrigin = '0 50%';
    const a1 = bar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      { duration: dur, delay: delay + i * stagger, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'both' });
    quiet(a1.finished.then(() => {
      t.style.visibility = '';
      bar.style.transformOrigin = '100% 50%';
      const a2 = bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
        { duration: dur, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'both' });
      a1.cancel();
      return a2.finished.then(() => a2.cancel());
    }));
  });
}
