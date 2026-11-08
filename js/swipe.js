// 往左滑（手機、滑鼠都可以）：滑超過一定距離放開就觸發 onSwipe，不夠遠就彈回去
// 和長按拖曳排序並存：橫向移動先開始就是滑動，按住不動 380ms 就是拖曳
import { vibrate } from './util.js';

const START = 10;    // 橫向移動超過這個距離才算開始滑
/**
 * @param {HTMLElement} list 容器
 * @param {object} o
 *   row:  每一列的 selector（裡面有 .swipe-bg 和要移動的卡片）
 *   card: 會跟著手指移動的元素 selector
 *   onSwipe(row) 滑到底放開後呼叫（卡片已經滑出畫面）
 */
export function swipeable(list, { row, card, onSwipe }) {
  let s = null;

  list.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || document.body.classList.contains('sorting')) return;
    const r = e.target.closest(row);
    if (!r || !list.contains(r)) return;
    s = { r, c: r.querySelector(card), x: e.clientX, y: e.clientY, id: e.pointerId, on: false, dx: 0, t: performance.now(), vx: 0 };
  });

  list.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    if (document.body.classList.contains('sorting')) { s = null; return; }
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.on) {
      if (Math.abs(dy) > START && Math.abs(dy) > Math.abs(dx)) { s = null; return; } // 是在捲動
      if (dx < -START && Math.abs(dx) > Math.abs(dy) * 1.2) {
        s.on = true;
        s.r.classList.add('swiping');
        s.c.classList.remove('pressing');
        try { s.c.setPointerCapture(e.pointerId); } catch { /* 沒關係 */ }
      } else return;
    }
    const now = performance.now();
    const nx = Math.min(0, dx + START);
    s.vx = (nx - s.dx) / Math.max(1, now - s.t);
    s.t = now;
    s.dx = nx;
    s.c.style.transform = `translateX(${nx}px) rotate(${nx / 90}deg)`;
    const k = Math.min(1, -nx / threshold(s.r));
    s.r.style.setProperty('--k', k.toFixed(3));
    s.r.classList.toggle('armed', k >= 1);
    if (k >= 1 && !s.buzzed) { vibrate(10); s.buzzed = true; }
    if (k < 1) s.buzzed = false;
  });

  const end = (e) => {
    if (!s || e.pointerId !== s.id) return;
    const { r, c, on, dx, vx } = s;
    s = null;
    if (!on) return;
    // 放開後的 click 不要當成「點開」
    const swallow = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
    addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', swallow, { capture: true }), 60);
    const go = e.type !== 'pointercancel' && (-dx >= threshold(r) || (vx < -0.9 && -dx > 40));
    const from = c.style.transform;
    if (go) {
      const w = r.offsetWidth + 40;
      c.animate([{ transform: from }, { transform: `translateX(${-w}px) rotate(-4deg)` }], { duration: 200, easing: 'ease-in', fill: 'forwards' })
        .finished.then(() => {
          const h = r.offsetHeight;
          return r.animate([{ height: `${h}px`, opacity: 1 }, { height: '0px', marginTop: '-30px', opacity: 0 }], { duration: 220, easing: 'ease-in-out', fill: 'forwards' }).finished;
        })
        .then(() => onSwipe(r));
    } else {
      c.style.transform = '';
      r.classList.remove('swiping', 'armed');
      r.style.removeProperty('--k');
      c.animate([{ transform: from }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.3,1.4,.5,1)' });
    }
  };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);
}

const threshold = (r) => Math.min(130, r.offsetWidth * 0.38);
