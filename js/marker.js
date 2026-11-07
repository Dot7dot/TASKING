// 麥克筆風的線條：每個框都是四筆畫出來的線，兩端會稍微超出轉角，像手畫的一樣
import { mulberry32, hashStr } from './util.js';

export const INK = '#1c1c1e';
const f = (n) => Math.round(n * 10) / 10;
const NS = 'http://www.w3.org/2000/svg';

/** 一筆從 (x1,y1) 到 (x2,y2) 的線：微微彎曲、兩端可能超出一點或沒碰到 */
export function stroke(rng, x1, y1, x2, y2, { bow = 1.4, over = 5, jit = 1.1 } = {}) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const nx = -uy, ny = ux;
  const o1 = rng() * over - over * 0.35, o2 = rng() * over - over * 0.35;
  const sx = x1 - ux * o1 + nx * (rng() - 0.5) * 2 * jit, sy = y1 - uy * o1 + ny * (rng() - 0.5) * 2 * jit;
  const ex = x2 + ux * o2 + nx * (rng() - 0.5) * 2 * jit, ey = y2 + uy * o2 + ny * (rng() - 0.5) * 2 * jit;
  const b = (rng() - 0.5) * 2 * bow * Math.min(1.6, len / 70);
  const t = 0.3 + rng() * 0.4;
  const cx = sx + (ex - sx) * t + nx * b * 2, cy = sy + (ey - sy) * t + ny * b * 2;
  return `M${f(sx)} ${f(sy)}Q${f(cx)} ${f(cy)} ${f(ex)} ${f(ey)}`;
}

const path = (d, w = 2.4, extra = '') =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;

/** 四筆畫成的框 */
export function boxStrokes(rng, x, y, w, h, { width = 2.4, over = 6 } = {}) {
  const k = Math.min(1, Math.min(w, h) / 60);
  const o = { over: over * (0.4 + k * 0.6), jit: 0.6 + k * 0.6, bow: 0.6 + k };
  const wv = () => width * (0.85 + rng() * 0.3);
  return path(stroke(rng, x, y, x + w, y, o), wv())
    + path(stroke(rng, x + w, y, x + w, y + h, o), wv())
    + path(stroke(rng, x + w, y + h, x, y + h, o), wv())
    + path(stroke(rng, x, y + h, x, y, o), wv());
}

/** 在一個格子裡來回塗（麥克筆塗滿） */
function zigzag(rng, x, y, w, h, gap = 4.5) {
  let d = `M${f(x + 1)} ${f(y + h - 1)}`;
  let up = true;
  for (let sx = x + 1; sx < x + w; sx += gap) {
    const nx = Math.min(x + w - 1, sx + gap * 0.5 + rng() * 1.2);
    d += `L${f(nx)} ${f(up ? y + 1 + rng() * 1.5 : y + h - 1 - rng() * 1.5)}`;
    up = !up;
  }
  return d;
}

/** 手畫的圓（頭尾會重疊一點） */
export function circleStroke(rng, cx, cy, r, { turns = 1.08, n = 14 } = {}) {
  const a0 = rng() * Math.PI * 2;
  const total = Math.PI * 2 * turns;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (total * i) / n;
    const rr = r * (1 + (rng() - 0.5) * 0.06) + (i / n) * r * 0.05;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
    d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(m[0])} ${f(m[1])}`;
  }
  return d;
}

// ───────── 會跟著大小重畫的框（資料夾、備註框、能量條） ─────────
const ro = typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver((entries) => { for (const e of entries) e.target._mkDraw?.(); })
  : null;

const KINDS = {
  box(rng, w, h) { return boxStrokes(rng, 0, 0, w, h, { width: 2.6 }); },
  thin(rng, w, h) { return boxStrokes(rng, 0, 0, w, h, { width: 1.8, over: 4 }); },
  energy(rng, w, h, el) {
    const level = Number(el.dataset.level) || 0;
    const cell = w / 10;
    let out = '';
    for (let i = 0; i < level; i++) {
      if (h < 16) { // 小的能量條：直接塗滿
        out += `<path d="M${f(i * cell + 1)} 1.5H${f((i + 1) * cell - 1)}V${f(h - 1.5)}H${f(i * cell + 1)}Z" fill="${INK}" fill-opacity=".8"/>`;
        continue;
      }
      out += path(zigzag(rng, i * cell + 1.5, 2.5, cell - 3, h - 5, 2.4), Math.max(1.6, h / 11), 'stroke-opacity=".8"');
    }
    out += boxStrokes(rng, 0, 0, w, h, { width: h < 16 ? 1.6 : 2.2, over: h < 16 ? 2.5 : 5 });
    for (let i = 1; i < 10; i++) {
      const x = i * cell + (rng() - 0.5) * 1.2;
      out += path(stroke(rng, x, 0, x, h, { over: h < 16 ? 0.6 : 1.5, jit: 0.5, bow: 0.3 }), h < 16 ? 1.1 : 1.6);
    }
    return out;
  },
};

/** 幫元素畫上麥克筆框；data-mk="種子" data-mk-kind="box|thin|energy" */
export function mark(el) {
  if (el._mkDraw) { el._mkDraw(true); return; }
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('mk');
  svg.setAttribute('aria-hidden', 'true');
  el.prepend(svg);
  let lw = 0, lh = 0, lsig = '';
  el._mkDraw = (force = false) => {
    const w = el.offsetWidth, h = el.offsetHeight;
    const sig = el.dataset.level ?? '';
    if (!w || !h || (!force && w === lw && h === lh && sig === lsig)) return;
    lw = w; lh = h; lsig = sig;
    const pad = 8;
    svg.setAttribute('viewBox', `${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`);
    svg.style.cssText = `left:${-pad}px;top:${-pad}px;width:${w + pad * 2}px;height:${h + pad * 2}px`;
    const rng = mulberry32(hashStr(el.dataset.mk || 'x'));
    svg.innerHTML = (KINDS[el.dataset.mkKind] || KINDS.box)(rng, w, h, el);
  };
  el._mkDraw();
  ro?.observe(el);
}

export function markAll(root = document) {
  for (const el of root.querySelectorAll('[data-mk]')) mark(el);
}

/** 重新渲染前呼叫，讓 ResizeObserver 放掉舊的元素 */
export function unmarkAll(root = document) {
  if (!ro) return;
  for (const el of root.querySelectorAll('[data-mk]')) if (el._mkDraw) ro.unobserve(el);
}

// ───────── 固定大小的小圖示（直接是 SVG 字串） ─────────
const svg = (vb, body, cls = '', extra = '') => `<svg class="${cls}" viewBox="${vb}" ${extra} aria-hidden="true">${body}</svg>`;

/** 勾選框（勾勾會超出框，像草圖一樣） */
export function checkboxSVG(seed, checked) {
  const rng = mulberry32(hashStr(seed) + 11);
  let body = boxStrokes(rng, 5, 7, 20, 20, { width: 2.4, over: 4 });
  if (checked) {
    body += path(`M${f(8 + rng())} ${f(16 + rng())}Q12 ${f(21 + rng())} ${f(14 + rng())} ${f(24 + rng())}Q${f(19 + rng() * 2)} 10 ${f(27 + rng() * 2)} ${f(1 + rng() * 2)}`, 3, 'class="tick"');
  }
  return svg('0 0 32 32', body, 'cb-svg');
}

export function bulletSVG(seed) {
  const rng = mulberry32(hashStr(seed) + 5);
  const r = 3.4 + rng() * 0.6;
  return svg('0 0 32 32', `<path d="${circleStroke(rng, 16, 17, r, { turns: 2.2, n: 18 })}" fill="${INK}" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`, 'bl-svg');
}

export function pencilSVG() {
  const rng = mulberry32(77);
  return svg('0 0 32 32',
    path(`M7 25 L9.5 18.5 L22 6 Q24 4.4 25.8 6.2 Q27.6 8 26 10 L13.5 22.5 Z`, 2.2)
    + path('M7 25 L13.5 22.5', 2.2)
    + path('M19.8 8.3 L23.7 12.2', 2)
    + path(stroke(rng, 10.5, 19.5, 21.8, 8.2, { over: 0, jit: 0.4, bow: 0.3 }), 1.4)
    + path(stroke(rng, 12.5, 21.5, 23.8, 10.2, { over: 0, jit: 0.4, bow: 0.3 }), 1.4)
    + path('M7 25 L8 22.5 L9.6 24 Z', 2, `fill="${INK}"`),
    'pencil');
}

export function doneSVG() {
  return svg('0 0 32 32', path('M6 17 Q10 20 13 25 Q18 13 27 6', 3.2), 'pencil');
}

export function backSVG() {
  const rng = mulberry32(5);
  return svg('0 0 32 32',
    path(stroke(rng, 26, 16, 6, 16, { over: 1, jit: 0.6 }), 2.6)
    + path('M13.5 8 Q9 12.5 5.5 16 Q9.5 19.5 13.5 24', 2.6), 'back-svg');
}

export function plusSVG(seed = 'fab') {
  const rng = mulberry32(hashStr(seed));
  return svg('0 0 72 72',
    `<path d="${circleStroke(rng, 36, 36, 29)}" fill="#fff" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`
    + path(stroke(rng, 36, 17, 36, 55, { over: 2, jit: 1, bow: 0.8 }), 8.5)
    + path(stroke(rng, 17, 36, 55, 36, { over: 2, jit: 1, bow: 0.8 }), 8.5), 'plus-svg');
}

export function smallPlusSVG(seed) {
  const rng = mulberry32(hashStr(seed));
  return svg('0 0 24 24',
    path(stroke(rng, 12, 4, 12, 20, { over: 1, jit: 0.6 }), 2.6)
    + path(stroke(rng, 4, 12, 20, 12, { over: 1, jit: 0.6 }), 2.6), 'sp-svg');
}

export function crossSVG(seed) {
  const rng = mulberry32(hashStr(seed) + 3);
  return svg('0 0 24 24',
    path(stroke(rng, 6, 6, 18, 18, { over: 1, jit: 0.5 }), 2.4)
    + path(stroke(rng, 18, 6, 6, 18, { over: 1, jit: 0.5 }), 2.4), 'x-svg');
}

export function handleSVG() {
  const rng = mulberry32(31);
  return svg('0 0 24 24', [8, 12, 16].map((y) => path(stroke(rng, 5, y, 19, y, { over: 1, jit: 0.4 }), 2)).join(''), 'h-svg');
}

/** 卡包圖示（上方鋸齒的袋子） */
export function packIconSVG() {
  const rng = mulberry32(9);
  let top = 'M7 9';
  for (let x = 7, i = 0; x <= 25; x += 3, i++) top += `L${x} ${i % 2 ? 6.5 : 9}`;
  return svg('0 0 32 32',
    path(top, 2)
    + path(stroke(rng, 7, 8, 7.5, 28, { over: 1, jit: 0.4 }), 2.3)
    + path(stroke(rng, 25, 8, 24.5, 28, { over: 1, jit: 0.4 }), 2.3)
    + path(stroke(rng, 6.5, 27.5, 25.5, 27.5, { over: 1.5, jit: 0.4 }), 2.3)
    + path(stroke(rng, 8, 12.5, 24, 12.5, { over: 0, jit: 0.3 }), 1.3, 'stroke-dasharray="2 2.4"')
    + `<path d="${circleStroke(rng, 16, 19.5, 4.3)}" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`,
    'pk-svg');
}

/** 標題下的長底線 */
export function underlineSVG(seed) {
  const rng = mulberry32(hashStr(seed));
  return svg('0 0 300 12', path(stroke(rng, 4, 6, 296, 6, { over: 3, jit: 1.6, bow: 1.2 }), 2.6, 'vector-effect="non-scaling-stroke"'), 'ul-svg', 'preserveAspectRatio="none"');
}

/** 完成項目的刪除線 */
export function strikeSVG(seed) {
  const rng = mulberry32(hashStr(seed) + 99);
  return svg('0 0 100 10', path(stroke(rng, 0, 5.5, 100, 4.5, { over: 1, jit: 1.5, bow: 1 }), 2, 'vector-effect="non-scaling-stroke"'), 'strike', 'preserveAspectRatio="none"');
}

/** 能量條的小圖示（閃電） */
export function boltSVG(seed) {
  const rng = mulberry32(hashStr(seed) + 21);
  const j = () => (rng() - 0.5) * 1.2;
  return svg('0 0 32 32', path(`M${f(18 + j())} 5 L${f(10 + j())} ${f(18 + j())} L${f(16 + j())} 18 L${f(13 + j())} 28 L${f(23 + j())} ${f(13 + j())} L${f(17 + j())} 13 Z`, 2.2, 'stroke-linejoin="round"'), 'bolt-svg');
}

/** 複製（兩個重疊的框） */
export function copySVG() {
  const rng = mulberry32(41);
  return svg('0 0 32 32',
    boxStrokes(rng, 11, 11, 15, 15, { width: 2.3, over: 2.5 })
    + path(stroke(rng, 6, 21, 6, 6, { over: 1.5, jit: 0.4, bow: 0.4 }), 2.2)
    + path(stroke(rng, 6, 6, 21, 6, { over: 1.5, jit: 0.4, bow: 0.4 }), 2.2),
    'copy-svg');
}
