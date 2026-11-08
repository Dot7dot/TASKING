// 主程式：任務清單（資料夾、項目、編輯模式）＋ 卡包區（開包、欣賞卡牌）
import {
  save, loadSave, persist, persistSoon, uid, newItem, isDone, sortedItems, folderById, isRewarded, markRewarded,
  isArchived, isDaily, archiveFolder, restoreFolder, checkDailyReset, nextDailyReset, DAILY_RESET_HOUR,
} from './store.js';
import {
  lib, RULES, VARIANTS, VARIANT_ORDER, apiBase, loadCachedLibrary, fetchLibrary,
  addPack, assignPackSets, openPack, ownedCards, unlockedIn, setColor, packPool,
} from './data.js';
import { cardHTML, packHTML } from './crayon.js';
import { playOpening } from './opening.js';
import { Particles } from './particles.js';
import { sfx, setSound, unlockAudio } from './sfx.js';
import {
  markAll, unmarkAll, checkboxSVG, bulletSVG, boltSVG, pencilSVG, doneSVG, backSVG, plusSVG,
  crossSVG, handleSVG, packIconSVG, underlineSVG, strikeSVG, copySVG, pinSVG, boxIconSVG, undoSVG,
} from './marker.js';
import { sortable } from './sortable.js';
import { swipeable } from './swipe.js';
import { $, $$, esc, htmlToEl, clamp, done } from './util.js';

const screen = $('#screen');
const top = $('#top');
const fab = $('#fab');

let route = { name: 'home' };
let editing = false;
let opening = false;
let cardsFilter = 'all';
let libState = 'loading'; // loading | slow | ok | error
let libError = '';
const openNotes = new Set(); // 編輯模式中打開了備註框（但還沒打字）的項目
let editOnOpen = null;        // 新建立的資料夾：打開時直接進編輯模式

// ───────── 路由 ─────────
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, id] = h.split('/');
  if (name === 'folder' && id && folderById(id)) return { name: 'folder', id };
  if (name === 'packs' || name === 'cards' || name === 'archive') return { name };
  return { name: 'home' };
}

function go() {
  $('#modal-root').replaceChildren();
  const next = parseHash();
  const changed = next.name !== route.name || next.id !== route.id;
  if (changed && editing) finishEdit();
  if (changed) editing = next.name === 'folder' && next.id === editOnOpen;
  editOnOpen = null;
  route = next;
  render();
  if (changed) {
    scrollTo(0, 0);
    screen.firstElementChild?.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' });
  }
}

// ───────── 小工具 ─────────
function toast(msg, ms = 2400) {
  const el = htmlToEl(`<div class="toast" data-mk="t${Math.random()}" data-mk-kind="thin">${msg}</div>`);
  $('#toasts').append(el);
  markAll($('#toasts'));
  el.animate([{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' });
  setTimeout(() => {
    el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: 240, fill: 'forwards' }).finished.then(() => el.remove());
  }, ms);
}

function modal(html, { cls = '', plain = false } = {}) {
  const el = htmlToEl(`<div class="modal ${cls}"><div class="modal-bg" data-close></div>
    <div class="modal-box ${plain ? '' : 'mbox'}" ${plain ? '' : `data-mk="m${Math.random()}"`}>${html}</div></div>`);
  $('#modal-root').append(el);
  markAll(el);
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
  $('.modal-box', el).animate([{ transform: 'scale(.92) translateY(14px)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,1.3,.4,1)' });
  const close = () => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }).finished.then(() => el.remove());
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) { sfx.tap(); close(); } });
  el.close = close;
  return el;
}

/** 重新渲染時，讓位置改變的元素從舊位置滑到新位置 */
function flip(container, sel, renderFn) {
  const before = new Map($$(sel, container).map((el) => [el.dataset.sortId, el.getBoundingClientRect().top]));
  renderFn();
  for (const el of $$(sel, container)) {
    const y0 = before.get(el.dataset.sortId);
    if (y0 == null) continue;
    const dy = y0 - el.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.3,1.1,.4,1)' });
  }
}

let particles = null;
function confetti(x, y) {
  if (!particles) particles = new Particles($('#fx'));
  particles.burst(x, y, { colors: ['#1c1c1e', '#f2c84b', '#e5533d', '#3d7fe0', '#5bb04f'], count: 26, power: 7, gravity: 0.25, life: 0.7 });
}
addEventListener('resize', () => particles?.resize());

// ───────── 上方列 ─────────
function packBtnHTML() {
  const n = save.packs.length;
  return `<a class="pk-btn ${n ? 'has' : ''}" href="#packs" aria-label="卡包區">${packIconSVG()}${n ? `<b class="pk-n">${n}</b>` : ''}</a>`;
}

function renderTop() {
  const f = curFolder();
  const backTo = route.name === 'cards' ? '#packs' : f && isArchived(f) ? '#archive' : '#';
  const back = route.name === 'home' || route.name === 'archive' ? '<span></span>' : `<a class="ic-btn" href="${backTo}" data-back aria-label="返回">${backSVG()}</a>`;
  const right = route.name === 'packs' || route.name === 'cards'
    ? `<button class="ic-btn snd" data-act="sound" aria-label="音效開關">${save.sound ? '🔊' : '🔇'}</button>`
    : packBtnHTML();
  const mid = route.name !== 'folder' ? '' : f && isArchived(f) ? 'ARCHIVE' : 'TASK LIST';
  top.innerHTML = `${back}<span class="top-mid">${mid ? `<small>${mid}</small>` : ''}</span>${right}`;
}

function bumpPackBtn() {
  renderTop();
  $('.pk-btn')?.animate([{ transform: 'none' }, { transform: 'scale(1.35) rotate(-10deg)' }, { transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.3,1.6,.5,1)' });
}

// ───────── 首頁：資料夾列表 ─────────
function enHTML(it, cls = '') {
  return `<span class="en ${cls}" data-mk="${it.id}e" data-mk-kind="energy" data-level="${it.level}"></span>`;
}

function previewRow(it) {
  const d = isDone(it);
  const icon = it.type === 'check' ? checkboxSVG(it.id, d) : it.type === 'bullet' ? bulletSVG(it.id) : boltSVG(it.id);
  return `<li class="pv-row ${d ? 'done' : ''}">
    <span class="ico">${icon}</span>
    <span class="pv-txt">${esc(it.text) || '<i class="ph">（未命名）</i>'}</span>
    ${it.type === 'energy' ? enHTML(it, 'mini') : ''}
  </li>`;
}

const DAILY_INK = '#d39a93'; // 每日任務：淡淡的紅色
const resetLabel = `${String(DAILY_RESET_HOUR).padStart(2, '0')}:00`;

function folderCard(f) {
  const items = sortedItems(f);
  const total = items.filter((i) => i.type !== 'bullet').length;
  const dn = items.filter(isDone).length;
  const daily = isDaily(f);
  return `<article class="folder ${daily ? 'daily' : ''}" data-folder="${f.id}" data-mk="${f.id}" ${daily ? `data-mk-color="${DAILY_INK}"` : ''} tabindex="0">
    <h2 class="f-name">${daily ? `<span class="pin">${pinSVG()}</span>` : ''}${esc(f.name)}${daily ? `<small class="f-sub">每天 ${resetLabel} 重置</small>` : ''}</h2>
    ${total ? `<span class="f-count">${dn}/${total}</span>` : ''}
    ${items.length ? `<ul class="pv">${items.slice(0, 3).map(previewRow).join('')}</ul>` : '<p class="pv-empty">還沒有任務，點進來新增 ✎</p>'}
    ${items.length > 3 ? `<p class="pv-more">還有 ${items.length - 3} 項 …</p>` : ''}
  </article>`;
}

/** 主畫面的一列：卡片後面藏著「封存／復原」，往左滑才看得到 */
function folderRow(f, mode) {
  const bg = mode === 'archive' ? `${undoSVG()}<span>復原</span>` : `${boxIconSVG()}<span>封存</span>`;
  return `<div class="frow" data-sort-id="${f.id}">
    <div class="swipe-bg">${bg}</div>
    ${folderCard(f)}
  </div>`;
}

function viewTabs(active) {
  const n = save.archive.length;
  const tab = (key, href, label) => `<a href="${href}" class="${active === key ? 'on' : ''}">${label}${active === key ? `<span class="tab-ul">${underlineSVG(`tab-${key}`)}</span>` : ''}</a>`;
  return `<nav class="vtabs">${tab('home', '#', '資料夾')}${tab('archive', '#archive', `封存${n ? ` <small>${n}</small>` : ''}`)}</nav>`;
}

function viewHome() {
  return `<section class="home">
    <h1 class="big">TASK LIST<span class="ul">${underlineSVG('title')}</span></h1>
    ${viewTabs('home')}
    <div class="pinned">${folderCard(save.daily)}</div>
    <div class="folders">${save.folders.map((f) => folderRow(f, 'home')).join('')}</div>
    ${save.folders.length ? '<p class="tipl">點資料夾看內容 · 長按拖曳排序 · 往左滑封存</p>' : '<p class="tipl big-hint">按右下角的 ＋ 新增資料夾</p>'}
  </section>`;
}

function viewArchive() {
  const list = save.archive;
  return `<section class="home archive">
    <h1 class="big">TASK LIST<span class="ul">${underlineSVG('title')}</span></h1>
    ${viewTabs('archive')}
    ${list.length
      ? `<div class="folders">${list.map((f) => folderRow(f, 'archive')).join('')}</div>
        <p class="tipl">點資料夾看內容 · 往左滑就能復原到主畫面</p>`
      : `<div class="lib-msg"><div class="empty-box">${boxIconSVG()}</div><p>還沒有封存的資料夾。<br>在主畫面把資料夾往左滑就能封存。</p></div>`}
  </section>`;
}

function bindArchive() {
  const list = $('.folders', screen);
  if (!list) return;
  swipeable(list, {
    row: '.frow',
    card: '.folder',
    onSwipe: (r) => {
      const f = folderById(r.dataset.sortId);
      if (!f) return;
      restoreFolder(f);
      sfx.coin();
      render();
      toast(`已復原「${esc(f.name)}」到主畫面`);
    },
  });
}

function bindHome() {
  const list = $('.folders', screen);
  if (!list) return;
  swipeable(list, {
    row: '.frow',
    card: '.folder',
    onSwipe: (r) => {
      const f = folderById(r.dataset.sortId);
      if (!f) return;
      archiveFolder(f);
      sfx.whoosh();
      render();
      toast(`已封存「${esc(f.name)}」 <button class="t-link" data-act="undo-archive" data-id="${f.id}">復原</button>`, 3500);
    },
  });
  sortable(list, {
    item: '.frow',
    onStart: () => sfx.tap(),
    onDrop: (ids, moved) => {
      if (!moved) return;
      const byId = new Map(save.folders.map((f) => [f.id, f]));
      save.folders = ids.map((id) => byId.get(id)).filter(Boolean);
      persist();
      sfx.flip();
    },
  });
}

// ───────── 資料夾頁 ─────────
function itemHTML(it) {
  const d = isDone(it);
  const ed = editing;
  let icon;
  if (it.type === 'check') icon = `<button class="cb ico" data-toggle aria-label="${d ? '取消完成' : '完成'}">${checkboxSVG(it.id, d)}</button>`;
  else if (it.type === 'bullet') icon = `<span class="ico">${bulletSVG(it.id)}</span>`;
  else icon = `<span class="ico">${boltSVG(it.id)}</span>`;
  const text = ed
    ? `<textarea class="txt-in" rows="1" maxlength="200" placeholder="${it.type === 'bullet' ? '寫點什麼…' : '任務名稱…'}">${esc(it.text)}</textarea>`
    : `<span class="txt"><span class="tw">${esc(it.text) || '<i class="ph">（未命名）</i>'}${d ? strikeSVG(it.id) : ''}</span></span>`;
  const energy = it.type === 'energy' ? `<div class="en-row">
      <div class="en" data-mk="${it.id}e" data-mk-kind="energy" data-level="${it.level}">
        ${Array.from({ length: 10 }, (_, i) => `<button class="ecell" data-cell="${i + 1}" aria-label="${i + 1} 格"></button>`).join('')}
      </div>
      <span class="en-n">${it.level}/10</span>
    </div>` : '';
  const showNote = it.note || (ed && openNotes.has(it.id));
  const note = showNote
    ? `<div class="note" data-mk="${it.id}n" data-mk-kind="thin"><b>NOTE:</b>${ed
      ? `<textarea class="note-in" rows="1" maxlength="1000" placeholder="備註…">${esc(it.note)}</textarea>`
      : `<p>${esc(it.note)}</p>`}</div>`
    : ed ? '<button class="add-note" data-addnote>＋ 備註</button>' : '';
  return `<div class="item it-${it.type} ${d ? 'done' : ''}" data-item="${it.id}" data-sort-id="${it.id}">
    <div class="row">
      ${ed ? `<span class="drag" data-handle aria-label="拖曳排序">${handleSVG()}</span>` : ''}
      ${icon}${text}
      ${ed ? `<button class="x" data-del aria-label="刪除">${crossSVG(it.id)}</button>` : ''}
    </div>
    ${energy}${note}
  </div>`;
}

function itemsHTML(f) {
  const items = sortedItems(f);
  if (!items.length) return `<p class="empty-items">${editing ? '用下面的按鈕新增項目 ↓' : '這裡還是空的，<br>點右上角的鉛筆 ✎ 新增項目'}</p>`;
  return items.map(itemHTML).join('');
}

function nextResetText() {
  const next = new Date(nextDailyReset());
  const today = new Date();
  return `${next.getDate() === today.getDate() ? '今天' : '明天'} ${resetLabel}`;
}

function viewFolder() {
  const f = folderById(route.id);
  const arch = isArchived(f), daily = isDaily(f);
  if (arch) editing = false;
  const buttons = arch
    ? `<button class="pen" data-act="restore" aria-label="復原到主畫面" title="復原到主畫面">${undoSVG()}</button>`
    : `${daily ? '' : `<button class="pen" data-act="dup-folder" aria-label="複製這個資料夾" title="複製這個資料夾">${copySVG()}</button>`}
      <button class="pen ${editing ? 'on' : ''}" data-act="edit" aria-label="${editing ? '完成編輯' : '編輯'}">${editing ? doneSVG() : pencilSVG()}</button>`;
  const tip = arch
    ? `<p class="tipl">這是封存的資料夾，只能看不能改。<br>按右上角的復原，或在封存區往左滑，就能放回主畫面。</p>
      <button class="del-folder" data-act="del-folder">永久刪除這個資料夾</button>`
    : daily && !editing
      ? `<p class="tipl">每天早上 ${resetLabel} 進度會歸零（下次：${nextResetText()}）<br>每天完成都會再送一包卡包 🎁</p>`
      : '';
  return `<section class="fpage ${editing ? 'editing' : ''} ${arch ? 'readonly' : ''} ${daily ? 'daily' : ''}">
    <div class="fp-head">
      ${editing
        ? `<input class="title-in" value="${esc(f.name)}" maxlength="40" placeholder="資料夾名稱" aria-label="資料夾名稱">`
        : `<h1 class="big">${daily ? `<span class="pin">${pinSVG()}</span>` : ''}${esc(f.name)}</h1>`}
      ${buttons}
    </div>
    <div class="items" data-handle-only="${editing ? 1 : 0}">${itemsHTML(f)}</div>
    ${editing ? `<div class="add-bar">
        <button class="add-btn" data-add="check" data-mk="ab1" data-mk-kind="thin">${checkboxSVG('add', false)}<span>勾選框</span></button>
        <button class="add-btn" data-add="bullet" data-mk="ab2" data-mk-kind="thin">${bulletSVG('add')}<span>筆記</span></button>
        <button class="add-btn" data-add="energy" data-mk="ab3" data-mk-kind="thin">${boltSVG('add')}<span>能量條</span></button>
      </div>
      <p class="tipl">按住 ≡ 可以拖曳排序 · 完成的項目會自動移到下面</p>
      ${daily ? '' : '<button class="del-folder" data-act="del-folder">刪除這個資料夾</button>'}`
      : tip || '<p class="tipl">勾選或把能量條填滿 10 格就算完成，每完成一項送一包卡包 🎁</p>'}
  </section>`;
}

/** 新項目；每日任務的項目帶上今天的獎勵鍵（每天完成都送一次卡包） */
function newItemIn(f, type) {
  const it = newItem(type, '');
  if (isDaily(f)) it.rk = `${it.id}@${f.period}`;
  return it;
}

function curFolder() { return route.name === 'folder' ? folderById(route.id) : null; }
const findItem = (f, id) => f.items.find((i) => i.id === id);

function renderItems(animate = true) {
  const f = curFolder();
  const box = $('.items', screen);
  if (!f || !box) return;
  const draw = () => {
    unmarkAll(box);
    box.innerHTML = itemsHTML(f);
    markAll(box);
    if (editing) $$('textarea', box).forEach(autoGrow);
  };
  if (animate) flip(box, '.item', draw); else draw();
}

function setStrike(itemEl, it) {
  const tw = $('.tw', itemEl);
  if (!tw) return;
  $('.strike', tw)?.remove();
  if (isDone(it)) tw.insertAdjacentHTML('beforeend', strikeSVG(it.id));
}

function autoGrow(t) {
  t.style.height = 'auto';
  t.style.height = `${t.scrollHeight}px`;
}

function bindFolder() {
  const box = $('.items', screen);
  if (!box || isArchived(curFolder())) return;
  if (editing) $$('textarea', screen).forEach(autoGrow);
  sortable(box, {
    item: '.item',
    handle: '[data-handle]',
    onStart: () => sfx.tap(),
    onDrop: (ids, moved) => {
      if (!moved) return;
      const f = curFolder();
      const byId = new Map(f.items.map((i) => [i.id, i]));
      f.items = ids.map((id) => byId.get(id)).filter(Boolean);
      persist();
      sfx.flip();
      // 如果把未完成的拖到已完成的下面，自動歸位
      const want = sortedItems(f).map((i) => i.id).join();
      if (want !== ids.join()) setTimeout(() => renderItems(true), 80);
    },
  });
}

/** 離開編輯模式：清掉沒有內容的項目 */
function finishEdit() {
  const f = curFolder();
  if (!f) return;
  f.items = f.items.filter((i) => i.text.trim() || i.note.trim());
  for (const i of f.items) { i.text = i.text.trim(); i.note = i.note.trim(); }
  if (!f.name.trim()) f.name = '未命名';
  openNotes.clear();
  persist();
}

// 完成 / 取消完成
function changed(f, it, wasDone, srcEl) {
  const nowDone = isDone(it);
  if (nowDone === wasDone) { persist(); return; }
  if (nowDone) {
    it.doneAt = Date.now();
    save.stats.done++;
    const r = srcEl.getBoundingClientRect();
    confetti(r.left + r.width / 2, r.top + r.height / 2);
    if (!isRewarded(it)) {
      markRewarded(it);
      addPack(f.name);
      reward(srcEl);
    } else {
      sfx.reveal('base');
    }
  } else {
    it.doneAt = 0;
    sfx.tap();
  }
  persist();
  setTimeout(() => { if (curFolder() === f) renderItems(true); }, 520);
}

/** 一包卡包從完成的項目飛到右上角 */
async function reward(srcEl) {
  sfx.coin();
  const from = srcEl.getBoundingClientRect();
  const to = $('.pk-btn')?.getBoundingClientRect();
  const fly = htmlToEl(`<div class="fly-pack">${packIconSVG()}</div>`);
  document.body.append(fly);
  const x0 = from.left + from.width / 2 - 22, y0 = from.top + from.height / 2 - 22;
  const x1 = to ? to.left + to.width / 2 - 22 : innerWidth - 50, y1 = to ? to.top + to.height / 2 - 22 : 20;
  await done(fly.animate([
    { transform: `translate(${x0}px,${y0}px) scale(.4) rotate(0deg)`, opacity: 0 },
    { transform: `translate(${x0 + (x1 - x0) * 0.3}px,${Math.min(y0, y1) - 60}px) scale(1.5) rotate(-12deg)`, opacity: 1, offset: 0.4 },
    { transform: `translate(${x1}px,${y1}px) scale(.8) rotate(8deg)`, opacity: 1 },
  ], { duration: 900, easing: 'cubic-bezier(.4,0,.3,1)' }));
  fly.remove();
  bumpPackBtn();
  toast(`完成！得到一包卡包 🎁 <a href="#packs" class="t-link">去開包</a>`);
}

// ───────── 卡包區 ─────────
function packTabs(active) {
  const owned = ownedCards().length;
  return `<div class="mtabs">
    <a href="#packs" class="${active === 'packs' ? 'on' : ''}" data-mk="tab1" data-mk-kind="${active === 'packs' ? 'box' : 'thin'}">我的卡包 <b>${save.packs.length}</b></a>
    <a href="#cards" class="${active === 'cards' ? 'on' : ''}" data-mk="tab2" data-mk-kind="${active === 'cards' ? 'box' : 'thin'}">我的卡牌 <b>${lib.ready ? `${owned}/${lib.cards.length}` : owned}</b></a>
  </div>`;
}

function libStatusHTML() {
  if (libState === 'error' && !lib.ready) {
    return `<div class="lib-msg"><p>連不到卡牌資料庫 😢<br><small>${esc(libError)}</small></p>
      <button class="mbtn" data-act="retry" data-mk="retry">重試</button><p class="foot">${esc(apiBase())}</p></div>`;
  }
  if (!lib.ready) {
    return `<div class="lib-msg"><div class="spinner">${packIconSVG()}</div>
      <p>${libState === 'slow' ? '正在喚醒卡牌伺服器…<br><small>免費伺服器第一次啟動約需 30–60 秒</small>' : '連接卡牌資料庫…'}</p></div>`;
  }
  if (!lib.cards.length) {
    return `<div class="lib-msg"><p>卡牌資料庫裡還沒有任何卡牌。<br>先到卡牌製造機新增卡牌吧！</p>
      <a class="mbtn" href="${esc(apiBase())}" target="_blank" rel="noopener" data-mk="cu">打開卡牌製造機</a></div>`;
  }
  return '';
}

function viewPacks() {
  const status = libStatusHTML();
  let body = status;
  if (!status) {
    const groups = new Map();
    for (const p of save.packs) groups.set(p.set, (groups.get(p.set) || 0) + 1);
    body = groups.size
      ? `${packPool().length ? `<p class="tipl">點一下卡包就會開包 ✨　每包 ${RULES.cardsPerPack} 張</p>`
        : `<p class="tipl warn">卡牌資料庫裡還沒有「${RULES.packSet}」系列的卡牌，<br>卡包先幫你留著，新增卡牌後就能開。</p>`}
        <div class="pack-grid">${[...groups].map(([set, n]) => `<button class="pack-cell ${n > 1 ? 'stacked' : ''}" data-open="${esc(set)}" style="--c:${setColor(set)}">
          ${n > 2 ? '<span class="pack-shadow s2"></span>' : ''}${n > 1 ? '<span class="pack-shadow s1"></span>' : ''}
          ${packHTML(set)}${n > 1 ? `<span class="pack-n">×${n}</span>` : ''}</button>`).join('')}</div>`
      : `<div class="lib-msg"><div class="ghost-pack">${packHTML(RULES.packSet)}</div>
        <p>還沒有卡包。<br>每完成一個任務，就會得到一包卡包（${RULES.cardsPerPack} 張）！</p>
        <a class="mbtn" href="#" data-mk="gohome">回到任務清單</a></div>`;
  }
  return `<section class="page">
    <h1 class="big">卡包區</h1>
    ${packTabs('packs')}
    ${body}
  </section>`;
}

const bestVariant = (vs) => ['holo', 'gold', 'matte', 'normal'].find((v) => vs.includes(v)) || 'normal';

function viewCards() {
  const status = libStatusHTML();
  let body = status;
  if (!status) {
    const owned = ownedCards();
    const list = cardsFilter === 'all' ? owned : owned.filter((c) => c._set === cardsFilter);
    body = `<div class="chips">
        <button class="chip ${cardsFilter === 'all' ? 'on' : ''}" data-filter="all">全部</button>
        ${lib.sets.map((s) => `<button class="chip ${cardsFilter === s.name ? 'on' : ''}" data-filter="${esc(s.name)}" style="--c:${s.color}">${esc(s.name)} <small>${unlockedIn(s)}/${s.cards.length}</small></button>`).join('')}
      </div>
      ${list.length ? `<div class="grid">${list.map((c) => {
        const e = save.col[c.id];
        return `<button class="cell" data-card="${c.id}">${cardHTML(c, bestVariant(e.v))}
          <span class="vdots">${VARIANT_ORDER.map((v) => `<i class="vd vd-${v} ${e.v.includes(v) ? 'on' : ''}" title="${VARIANTS[v].label}"></i>`).join('')}</span>
          ${e.n > 1 ? `<span class="cnt">×${e.n}</span>` : ''}</button>`;
      }).join('')}</div>`
      : `<div class="lib-msg"><p>${owned.length ? '這個系列還沒有收集到卡牌' : '還沒有卡牌，<br>去開卡包吧！'}</p>${owned.length ? '' : '<a class="mbtn" href="#packs" data-mk="gopk">前往卡包</a>'}</div>`}`;
  }
  return `<section class="page">
    <h1 class="big">卡包區</h1>
    ${packTabs('cards')}
    ${body}
  </section>`;
}

/** 卡牌詳情（可以拖曳傾斜看反光） */
function showCard(id) {
  const card = lib.byId.get(id);
  if (!card) return;
  const vs = save.col[id]?.v ?? [];
  let cur = bestVariant(vs);
  const m = modal(`<div class="detail">
    <div class="detail-card"></div>
    <div class="var-tabs">${VARIANT_ORDER.map((v) => `<button class="var-tab ${vs.includes(v) ? '' : 'missing'}" data-v="${v}" ${vs.includes(v) ? '' : 'disabled'}>${VARIANTS[v].label}</button>`).join('')}</div>
    <p class="detail-note">已收集型態 ${vs.length} / 4　·　按住卡片拖曳可以看反光</p>
    <button class="btn" data-close>關閉</button>
  </div>`, { cls: 'card-modal', plain: true });
  const holder = $('.detail-card', m);
  const draw = () => {
    holder.innerHTML = cardHTML(card, cur, { eager: true });
    $$('.var-tab', m).forEach((b) => b.classList.toggle('on', b.dataset.v === cur));
  };
  draw();
  m.addEventListener('click', (e) => {
    const b = e.target.closest('.var-tab');
    if (b && !b.disabled) { cur = b.dataset.v; sfx.flip(); draw(); }
  });
  const tilt = (e) => {
    const r = holder.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp((e.clientY - r.top) / r.height, 0, 1);
    const c = $('.card', holder);
    c.classList.add('tilting');
    c.style.transform = `rotateY(${(x - 0.5) * 26}deg) rotateX(${(0.5 - y) * 26}deg)`;
    c.style.setProperty('--tx', (x - 0.5).toFixed(3));
    c.style.setProperty('--ty', (y - 0.5).toFixed(3));
  };
  holder.addEventListener('pointermove', tilt);
  holder.addEventListener('pointerdown', (e) => { holder.setPointerCapture?.(e.pointerId); tilt(e); });
  const reset = () => {
    const c = $('.card', holder);
    if (!c) return;
    c.classList.remove('tilting');
    c.style.transform = '';
  };
  holder.addEventListener('pointerup', reset);
  holder.addEventListener('pointerleave', reset);
  holder.addEventListener('pointercancel', reset);
}

async function openFromSet(setName, packEl) {
  if (opening) return;
  const pack = save.packs.find((p) => p.set === setName);
  if (!pack) return;
  const outcome = openPack(pack.id);
  if (!outcome) { toast(`卡牌資料庫裡還沒有「${RULES.packSet}」系列的卡牌`); return; }
  opening = true;
  const more = save.packs.filter((p) => p.set === setName).length;
  const act = await playOpening(packEl, outcome, { morePacks: more });
  opening = false;
  render();
  if (act === 'again') {
    const next = $(`.pack-cell[data-open="${CSS.escape(setName)}"] .pack`);
    if (next) openFromSet(setName, next);
  }
}

// ───────── 新增 / 刪除資料夾 ─────────
function newFolderModal() {
  const m = modal(`<form class="form">
    <h2>新增資料夾</h2>
    <div class="field" data-mk="nf-in" data-mk-kind="thin"><input name="name" maxlength="40" placeholder="例如：MONTHLY、讀書計畫…" autocomplete="off" required></div>
    <div class="form-btns">
      <button type="button" class="mbtn ghost" data-close>取消</button>
      <button class="mbtn primary" data-mk="nf-ok">建立</button>
    </div>
  </form>`);
  const input = $('input', m);
  setTimeout(() => input.focus(), 60);
  $('form', m).addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    const f = { id: uid(), name, items: [] };
    save.folders.push(f);
    persist();
    sfx.coin();
    m.close();
    editOnOpen = f.id; // 新的資料夾直接進編輯模式
    location.hash = `#folder/${f.id}`;
  });
}

function deleteFolderModal() {
  const f = curFolder();
  if (!f) return;
  const m = modal(`<div class="form">
    <h2>刪除「${esc(f.name)}」？</h2>
    <p class="muted">裡面的 ${f.items.length} 個項目會一起刪除，無法復原。<br>已經拿到的卡包和卡牌不會不見。</p>
    <div class="form-btns">
      <button class="mbtn ghost" data-close>取消</button>
      <button class="mbtn danger" data-act="confirm-del" data-mk="del-ok">刪除</button>
    </div>
  </div>`);
  $('[data-act="confirm-del"]', m).addEventListener('click', () => {
    const arch = isArchived(f);
    save.folders = save.folders.filter((x) => x.id !== f.id);
    save.archive = save.archive.filter((x) => x.id !== f.id);
    editing = false;
    persist();
    m.close();
    location.hash = arch ? '#archive' : '#';
  });
}

/** 複製資料夾：內容一模一樣（文字、備註、勾選、能量條進度、順序），放在原本的資料夾後面 */
function duplicateFolder() {
  const f = curFolder();
  if (!f) return;
  if (editing) finishEdit();
  const name = `${f.name}（複製）`.slice(0, 40);
  // 複製出來的項目和原本的共用獎勵鍵（rk）：同一個任務的卡包只送一次，不會因為複製而重複領取
  const copy = { id: uid(), name, items: f.items.map((it) => ({ ...it, id: uid(), rk: it.rk || it.id })) };
  save.folders.splice(save.folders.indexOf(f) + 1, 0, copy);
  persist();
  sfx.coin();
  editOnOpen = copy.id; // 直接進編輯模式，方便修改
  location.hash = `#folder/${copy.id}`;
  setTimeout(() => {
    const t = $('.title-in', screen);
    t?.focus();
    t?.select();
  }, 60);
  toast(`已複製「${esc(f.name)}」，可以直接修改 ✎`);
}

// ───────── 渲染 ─────────
const VIEWS = { home: viewHome, archive: viewArchive, folder: viewFolder, packs: viewPacks, cards: viewCards };

function render() {
  const keepScroll = screen.dataset.route === route.name + (route.id || '') ? scrollY : 0;
  document.body.dataset.route = route.name;
  screen.dataset.route = route.name + (route.id || '');
  renderTop();
  unmarkAll(screen);
  screen.innerHTML = VIEWS[route.name]();
  markAll(screen);
  fab.hidden = route.name !== 'home';
  if (route.name === 'home') bindHome();
  if (route.name === 'archive') bindArchive();
  if (route.name === 'folder') bindFolder();
  scrollTo(0, keepScroll);
}

// ───────── 事件 ─────────
document.addEventListener('click', (e) => {
  unlockAudio();
  const t = e.target;
  if (t.closest('a[href^="#"]')) sfx.tap();
  const act = t.closest('[data-act]')?.dataset.act;

  if (act === 'sound') {
    save.sound = !save.sound;
    setSound(save.sound);
    persist();
    renderTop();
    if (save.sound) sfx.tap();
    return;
  }
  if (act === 'new-folder') { sfx.tap(); newFolderModal(); return; }
  if (act === 'retry') { startLibrary(); render(); return; }
  if (act === 'undo-archive') {
    const af = folderById(t.closest('[data-id]').dataset.id);
    if (af && isArchived(af)) { restoreFolder(af); sfx.tap(); t.closest('.toast')?.remove(); if (route.name === 'home' || route.name === 'archive') render(); }
    return;
  }

  // 首頁：點資料夾
  const folderEl = t.closest('.folder[data-folder]');
  if (folderEl && (route.name === 'home' || route.name === 'archive')) { sfx.tap(); location.hash = `#folder/${folderEl.dataset.folder}`; return; }

  // 資料夾頁
  const f = curFolder();
  if (f && isArchived(f)) {
    // 封存的資料夾只能看：只有復原和刪除
    if (act === 'restore') {
      restoreFolder(f);
      sfx.coin();
      toast(`已復原「${esc(f.name)}」到主畫面`);
      location.hash = '#';
    }
    if (act === 'del-folder') { sfx.tap(); deleteFolderModal(); }
    return;
  }
  if (f) {
    if (act === 'edit') {
      sfx.tap();
      if (editing) finishEdit();
      editing = !editing;
      render();
      if (editing && !f.items.length) $('.add-btn')?.animate([{ transform: 'none' }, { transform: 'translateY(-6px)' }, { transform: 'none' }], { duration: 400, iterations: 2 });
      return;
    }
    if (act === 'del-folder') { sfx.tap(); deleteFolderModal(); return; }
    if (act === 'dup-folder') { duplicateFolder(); return; }

    const add = t.closest('[data-add]');
    if (add) {
      const it = newItemIn(f, add.dataset.add);
      f.items.push(it);
      persist();
      sfx.tap();
      renderItems(false);
      const el = $(`.item[data-item="${it.id}"]`, screen);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.animate([{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'ease-out' });
      $('.txt-in', el)?.focus();
      return;
    }

    const itemEl = t.closest('[data-item]');
    const it = itemEl && findItem(f, itemEl.dataset.item);
    if (!it) return;

    if (t.closest('[data-toggle]')) {
      const was = isDone(it);
      it.done = !it.done;
      const cb = t.closest('[data-toggle]');
      cb.innerHTML = checkboxSVG(it.id, it.done);
      cb.classList.add('anim');
      itemEl.classList.toggle('done', isDone(it));
      setStrike(itemEl, it);
      changed(f, it, was, cb);
      return;
    }

    const cell = t.closest('[data-cell]');
    if (cell) {
      const was = isDone(it);
      const n = Number(cell.dataset.cell);
      it.level = it.level === n ? n - 1 : n; // 再點一次同一格 = 退一格
      const bar = cell.closest('.en');
      bar.dataset.level = it.level;
      bar._mkDraw?.();
      $('.en-n', itemEl).textContent = `${it.level}/10`;
      itemEl.classList.toggle('done', isDone(it));
      setStrike(itemEl, it);
      if (!isDone(it)) sfx.tap();
      changed(f, it, was, bar);
      return;
    }

    if (t.closest('[data-del]')) {
      sfx.tap();
      done(itemEl.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(30px)' }], { duration: 180, fill: 'forwards' })).then(() => {
        f.items = f.items.filter((x) => x !== it);
        openNotes.delete(it.id);
        persist();
        renderItems(true);
      });
      return;
    }

    if (t.closest('[data-addnote]')) {
      sfx.tap();
      openNotes.add(it.id);
      renderItems(false);
      $(`.item[data-item="${it.id}"] .note-in`, screen)?.focus();
      return;
    }
  }

  // 卡包區
  const flt = t.closest('[data-filter]');
  if (flt) { cardsFilter = flt.dataset.filter; sfx.tap(); render(); return; }
  const c = t.closest('[data-card]');
  if (c) { sfx.flip(); showCard(Number(c.dataset.card)); return; }
  const o = t.closest('[data-open]');
  if (o) { openFromSet(o.dataset.open, $('.pack', o)); return; }
});

// 編輯模式打字
document.addEventListener('input', (e) => {
  const f = curFolder();
  if (!f || !editing) return;
  const t = e.target;
  if (t.matches('.title-in')) { f.name = t.value; persistSoon(); return; }
  const itemEl = t.closest('[data-item]');
  const it = itemEl && findItem(f, itemEl.dataset.item);
  if (!it) return;
  if (t.matches('.txt-in')) { it.text = t.value.replace(/\n/g, ' '); if (t.value !== it.text) t.value = it.text; }
  if (t.matches('.note-in')) it.note = t.value;
  autoGrow(t);
  persistSoon();
});

document.addEventListener('keydown', (e) => {
  const f = curFolder();
  if (e.key === 'Enter' && f && editing && e.target.matches('.txt-in') && !e.isComposing) {
    // Enter：在下面新增一個同類型的項目
    e.preventDefault();
    const cur = findItem(f, e.target.closest('[data-item]').dataset.item);
    const it = newItemIn(f, cur.type === 'energy' ? 'check' : cur.type);
    f.items.splice(f.items.indexOf(cur) + 1, 0, it);
    persist();
    renderItems(false);
    $(`.item[data-item="${it.id}"] .txt-in`, screen)?.focus();
  }
  if (e.key === 'Enter' && e.target.matches('.title-in')) { e.preventDefault(); e.target.blur(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.folder[data-folder]')) { e.preventDefault(); e.target.click(); }
});

addEventListener('hashchange', go);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
addEventListener('pagehide', persist);

// ───────── 啟動 ─────────
function startLibrary() {
  if (!lib.ready) libState = 'loading';
  fetchLibrary({ onSlow: () => { if (!lib.ready) { libState = 'slow'; if (route.name === 'packs' || route.name === 'cards') render(); } } })
    .then(() => { libState = 'ok'; })
    .catch((e) => {
      libError = e.name === 'AbortError' ? '等太久了' : e.message;
      libState = 'error';
      if (lib.ready) toast('連不到卡牌伺服器，先用上次的卡牌資料');
    })
    .finally(() => { if ((route.name === 'packs' || route.name === 'cards') && !opening) render(); });
}

/** 早上 8 點過後重置每日任務（開著 App 跨過 8 點、或隔天打開時都會檢查） */
function dailyTick() {
  if (!checkDailyReset()) return;
  toast('☀️ 早安！每日任務已經重置');
  const f = curFolder();
  if (!editing && !opening && (route.name === 'home' || (f && isDaily(f)))) render();
}

// ───────── 自動更新 ─────────
// GitHub Pages 會讓手機快取檔案約 10 分鐘。打開 App（或從背景切回來）時看一下 version.json，
// 有比較新的版本就換到帶新版本號的網址，所有檔案都會重新下載。
const APP_VERSION = $('meta[name="app-version"]')?.content || '';
async function checkUpdate() {
  if (!APP_VERSION || opening || editing) return; // 開包或編輯到一半不要打斷
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { version } = await res.json();
    if (!version || Number(version) <= Number(APP_VERSION)) return;
    if (sessionStorage.getItem('tasking.updatedTo') === version) return; // 防止重複重新載入
    sessionStorage.setItem('tasking.updatedTo', version);
    persist();
    const url = new URL(location.href);
    url.searchParams.set('v', version);
    location.replace(url.href);
  } catch { /* 離線就先用現在的版本 */ }
}

function boot() {
  loadSave();
  checkDailyReset();
  setInterval(dailyTick, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { dailyTick(); checkUpdate(); } });
  setSound(save.sound);
  fab.innerHTML = plusSVG();
  if (loadCachedLibrary()) libState = 'ok';
  assignPackSets();
  route = parseHash();
  render();
  startLibrary();
  checkUpdate();
}

boot();
