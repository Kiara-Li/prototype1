// Look Up · 折羽毛的教程：Kiara 扫描的 12 步（assets/fold/step1–12.png，已经抠成透明底），排成格子，只标号码不写字
// 从 dashboard 的羽毛卡片、最后那张纸的按钮打开

import { EASE_OUT, rv, quiet, reveal } from './motion.js';

const STEPS = 12;

export function openFold(T) {
  let root = document.getElementById('fd');
  if (root) root.remove();
  root = document.createElement('div');
  root.id = 'fd';
  const cells = Array.from({ length: STEPS }, (_, i) => `
    <figure class="fd-cell">
      <span class="fd-n">${String(i + 1).padStart(2, '0')}</span>
      <img src="assets/fold/step${i + 1}.png" alt="" draggable="false">
    </figure>`).join('');
  root.innerHTML = `<div class="fd-grid">${cells}</div>
    <div class="fd-btns"><button class="sh-btn sh-quiet" data-act="close">${rv(T.close)}</button></div>`;
  document.body.appendChild(root);
  root.querySelectorAll('.rv-t').forEach((t) => { t.style.visibility = 'hidden'; });
  root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: EASE_OUT, fill: 'both' });
  // 一格一格按顺序出现
  root.querySelectorAll('.fd-cell').forEach((c, i) => {
    c.animate([{ opacity: 0, transform: 'translateY(0.8em)' }, { opacity: 1, transform: 'none' }],
      { duration: 700, delay: 200 + i * 70, easing: EASE_OUT, fill: 'both' });
  });
  reveal(root.querySelector('.fd-btns'), { delay: 400 });
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!act || act.dataset.act !== 'close') return;
    const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: EASE_OUT, fill: 'forwards' });
    quiet(a.finished).then(() => root.remove());
  });
}
