// 長按拖曳排序（手機、滑鼠都可以）
// 長按 380ms 後項目會「拿起來」，跟著手指移動；放開後呼叫 onDrop(新的 id 順序)
import { vibrate } from './util.js';

const LONG_MS = 380;
const MOVE_CANCEL = 9;

let dragging = null;

// 拖曳中擋住頁面捲動（必須是 non-passive 的 touchmove 才能擋）
document.addEventListener('touchmove', (e) => { if (dragging) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', (e) => { if (dragging || e.target.closest?.('[data-sort-id]')) e.preventDefault(); });

/**
 * @param {HTMLElement} list 容器
 * @param {object} o
 *   item:   項目的 selector（項目要有 data-sort-id）
 *   handle: 有給的話，從這個 selector 按下就立刻拖曳（不用長按）
 *   ignore: 從這些元素按下不會啟動長按（例如輸入框）
 *   onStart / onDrop(ids)
 */
export function sortable(list, { item, handle, ignore = 'input, textarea, [contenteditable="true"]', onStart, onDrop }) {
  let pending = null;

  list.addEventListener('pointerdown', (e) => {
    if (dragging || e.button > 0) return;
    const el = e.target.closest(item);
    if (!el || !list.contains(el)) return;
    const viaHandle = handle && e.target.closest(handle);
    if (!viaHandle && (handle && list.dataset.handleOnly === '1')) return;
    if (!viaHandle && e.target.closest(ignore)) return;
    const start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    if (viaHandle) {
      e.preventDefault();
      begin(el, e);
      return;
    }
    const timer = setTimeout(() => { pending = null; begin(el, { clientX: start.x, clientY: start.y, pointerId: start.id }); }, LONG_MS);
    pending = { timer, start, el };
    el.classList.add('pressing');
  });

  const cancelPending = () => {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.el.classList.remove('pressing');
    pending = null;
  };
  list.addEventListener('pointermove', (e) => {
    if (pending && Math.hypot(e.clientX - pending.start.x, e.clientY - pending.start.y) > MOVE_CANCEL) cancelPending();
  });
  list.addEventListener('pointerup', cancelPending);
  list.addEventListener('pointercancel', cancelPending);
  list.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') cancelPending(); });

  function begin(el, e) {
    el.classList.remove('pressing');
    const items = () => [...list.querySelectorAll(item)].filter((x) => x.parentElement === el.parentElement);
    const startY = e.clientY;
    const startTop = el.offsetTop;
    const startScroll = scrollY;
    let lastY = e.clientY;
    let moved = false;
    dragging = { el };
    vibrate(18);
    onStart?.();
    el.classList.add('lifted');
    document.body.classList.add('sorting');

    const place = () => {
      const visualTop = startTop + (lastY - startY) + (scrollY - startScroll);
      const mid = visualTop + el.offsetHeight / 2;
      const sibs = items();
      const i = sibs.indexOf(el);
      const prev = sibs[i - 1], next = sibs[i + 1];
      let target = null, before = true;
      if (next && mid > next.offsetTop + next.offsetHeight / 2) { target = next; before = false; }
      else if (prev && mid < prev.offsetTop + prev.offsetHeight / 2) { target = prev; before = true; }
      if (target) {
        moved = true;
        const r0 = target.getBoundingClientRect().top;
        // 移動的是旁邊那個，不是被拖的那個：被拖的元素一離開 DOM，iOS 就收不到後續的觸控事件
        if (before) el.after(target); else el.before(target);
        const r1 = target.getBoundingClientRect().top;
        target.animate([{ transform: `translateY(${r0 - r1}px)` }, { transform: 'none' }], { duration: 180, easing: 'ease-out' });
        vibrate(6);
      }
      el.style.transform = `translateY(${visualTop - el.offsetTop}px) scale(1.03) rotate(-.8deg)`;
    };

    let raf = 0;
    const loop = () => {
      // 拖到畫面邊緣時自動捲動
      const edge = 70;
      if (lastY < edge) scrollBy(0, -Math.ceil((edge - lastY) / 6));
      else if (lastY > innerHeight - edge) scrollBy(0, Math.ceil((lastY - innerHeight + edge) / 6));
      place();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const move = (ev) => { if (ev.pointerId === e.pointerId || e.pointerId == null) lastY = ev.clientY; };
    const end = () => {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      const cur = el.style.transform;
      el.style.transform = '';
      el.classList.remove('lifted');
      el.animate([{ transform: cur }, { transform: 'none' }], { duration: 160, easing: 'ease-out' });
      document.body.classList.remove('sorting');
      // 放開後的 click 不要當成「點開」
      const swallow = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
      addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => removeEventListener('click', swallow, { capture: true }), 60);
      dragging = null;
      onDrop?.(items().map((x) => x.dataset.sortId), moved);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  }
}
