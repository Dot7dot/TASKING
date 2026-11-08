// 卡牌：連線卡牌製造機（card-uploader）、抽卡規則、開卡包
// 抽卡規則和 CardKing 一樣，只是一包 3 張、沒有金幣
import { hashStr } from './util.js';
import { save, persist } from './store.js';

export const RULES = {
  cardsPerPack: 2,  // 每包幾張
  packSet: 'B00',   // 卡包統一是這個系列（卡牌製造機裡的 set）
  goldTier: 3,      // 稀有度 >= 3：開包時黃金光
  rainbowTier: 4,   // 稀有度 >= 4：開包時彩虹光
};

// 抽到某個稀有度的權重（數字越大越容易抽到）
const RARITY_WEIGHT = { 1: 100, 2: 40, 3: 12, 4: 4, 5: 1.5 };
const rarityWeight = (r) => RARITY_WEIGHT[r] ?? Math.max(0.2, 1.5 * 0.4 ** (r - 5));

// 四種型態：三種變體各 15%，一般 55%
export const VARIANTS = {
  normal: { label: '一般', chance: 0.55 },
  holo: { label: '金光亮面', chance: 0.15 },
  matte: { label: '霧面', chance: 0.15 },
  gold: { label: '金色邊框', chance: 0.15 },
};
export const VARIANT_ORDER = ['normal', 'holo', 'matte', 'gold'];

const DEFAULT_API = 'https://card-uploader.onrender.com';
const CACHE_KEY = 'tasking.cards.v1';
const UNSORTED = '未分類';

// ───────── 稀有度 ─────────
const RARITY_WORDS = [
  [/普通|common|^c$|^n$/i, 1], [/稀有|rare|^r$/i, 2], [/史詩|epic|^sr$/i, 3],
  [/傳說|legend|^ssr$|^ur$/i, 4], [/神話|myth/i, 5],
];
export function rarityNum(rarity) {
  if (rarity == null || rarity === '') return 0;
  const n = parseInt(String(rarity).replace(/[^\d-]/g, ''), 10);
  if (Number.isFinite(n)) return Math.max(0, n);
  for (const [re, v] of RARITY_WORDS) if (re.test(String(rarity))) return v;
  const stars = (String(rarity).match(/★/g) || []).length;
  return stars || 1;
}
export const tierOf = (r) => (r >= RULES.rainbowTier ? 'rainbow' : r >= RULES.goldTier ? 'gold' : 'base');

// ───────── 卡包系列 ─────────
// 卡包統一是 B00 系列：深藍色底、黃字
export const PACK_THEME = { fill: '#1d2a57', dark: '#131d42', text: '#f2c84b' };
export const isPackSet = (name) => String(name ?? '').trim().toUpperCase() === RULES.packSet;
/** B00 系列的卡（卡牌製造機裡的系列名稱大小寫、前後空白不影響） */
export const packPool = () => lib.sets.find((s) => isPackSet(s.name))?.cards ?? [];

// ───────── 系列顏色 ─────────
const PALETTE = ['#e5533d', '#3d7fe0', '#5bb04f', '#8a5cd6', '#f39a2b', '#2bb3a3', '#e46aa6', '#d4b21f', '#a8714a', '#4a5bd6', '#c0392b', '#16a085'];
const colorMap = new Map();
export function setColor(name) {
  if (isPackSet(name)) return PACK_THEME.fill;
  if (!colorMap.has(name)) colorMap.set(name, PALETTE[hashStr(name) % PALETTE.length]);
  return colorMap.get(name);
}
function assignColors(setNames) {
  colorMap.clear();
  const used = new Set();
  for (const name of [...setNames].sort()) {
    if (isPackSet(name)) continue;
    let i = hashStr(name) % PALETTE.length;
    for (let k = 0; k < PALETTE.length && used.has(i); k++) i = (i + 1) % PALETTE.length;
    used.add(i);
    colorMap.set(name, PALETTE[i]);
  }
}

// ───────── 卡牌資料庫 ─────────
export const lib = { cards: [], byId: new Map(), sets: [], setByName: new Map(), loadedAt: 0, fromCache: false, ready: false };

export function apiBase() {
  const q = new URLSearchParams(location.search).get('api');
  return (q || DEFAULT_API).replace(/\/+$/, '');
}

function setLibrary(cards, loadedAt, fromCache) {
  cards = cards.filter((c) => c && c.id != null && c.name);
  for (const c of cards) c._set = (c.set && String(c.set).trim()) || UNSORTED;
  const groups = new Map();
  for (const c of cards) {
    if (!groups.has(c._set)) groups.set(c._set, []);
    groups.get(c._set).push(c);
  }
  assignColors(groups.keys());
  lib.cards = cards.sort((a, b) => a._set.localeCompare(b._set) || a.id - b.id);
  lib.byId = new Map(cards.map((c) => [c.id, c]));
  lib.sets = [...groups].map(([name, list]) => ({ name, cards: list, color: setColor(name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  lib.setByName = new Map(lib.sets.map((s) => [s.name, s]));
  lib.loadedAt = loadedAt;
  lib.fromCache = fromCache;
  lib.ready = true;
  assignPackSets();
}

/** 先用快取（秒開），再向伺服器要最新的卡牌 */
export function loadCachedLibrary() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (raw?.api === apiBase() && Array.isArray(raw.cards) && raw.cards.length) {
      setLibrary(raw.cards, raw.at, true);
      return true;
    }
  } catch { /* 快取壞了就重新抓 */ }
  return false;
}

export async function fetchLibrary({ timeoutMs = 90000, onSlow } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const slow = setTimeout(() => onSlow?.(), 2500);
  try {
    const res = await fetch(`${apiBase()}/api/cards`, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`伺服器回應 ${res.status}`);
    const data = await res.json();
    const cards = Array.isArray(data) ? data : data.cards;
    if (!Array.isArray(cards)) throw new Error('資料格式不正確');
    setLibrary(cards, Date.now(), false);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ api: apiBase(), at: Date.now(), cards })); } catch { /* 空間不足 */ }
  } finally {
    clearTimeout(timer);
    clearTimeout(slow);
  }
}

// ───────── 卡包 ─────────
const uid = () => Math.random().toString(36).slice(2, 10);

/** 卡包統一是 B00 系列：以前拿到、還沒開的其他系列卡包也一起換成 B00 */
export function assignPackSets() {
  let changed = false;
  for (const p of save.packs) {
    if (p.set !== RULES.packSet) { p.set = RULES.packSet; changed = true; }
  }
  if (changed) persist();
}

/** 完成任務的獎勵：一包卡包 */
export function addPack(from = '') {
  const pack = { id: uid(), set: RULES.packSet, from, at: Date.now() };
  save.packs.push(pack);
  persist();
  return pack;
}

// ───────── 收藏 ─────────
export const ownedCards = () => lib.cards.filter((c) => save.col[c.id]);
export const unlockedIn = (set) => set.cards.filter((c) => save.col[c.id]).length;

// ───────── 抽卡 ─────────
function rollVariant() {
  let x = Math.random();
  for (const key of ['holo', 'matte', 'gold']) {
    x -= VARIANTS[key].chance;
    if (x < 0) return key;
  }
  return 'normal';
}

/** 每一張的抽法：先依權重決定稀有度，再從該稀有度的卡裡平均抽一張 */
function poolRows(pool) {
  const tiers = new Map();
  for (const c of pool) {
    const r = rarityNum(c.rarity);
    if (!tiers.has(r)) tiers.set(r, []);
    tiers.get(r).push(c);
  }
  const rows = [...tiers].map(([r, cards]) => ({ r, cards, w: rarityWeight(r || 1) })).sort((a, b) => a.r - b.r);
  const total = rows.reduce((s, x) => s + x.w, 0);
  for (const row of rows) row.p = row.w / total;
  return rows;
}

function drawCard(pool) {
  const rows = poolRows(pool);
  let x = Math.random();
  for (const row of rows) {
    x -= row.p;
    if (x < 0) return row.cards[Math.floor(Math.random() * row.cards.length)];
  }
  const last = rows[rows.length - 1].cards;
  return last[Math.floor(Math.random() * last.length)];
}

/**
 * 打開一包卡：決定內容、寫進收藏。
 * 「重複」= 同一張卡、同一種型態已經擁有；同一張卡的新型態會收進收藏。
 */
export function openPack(packId) {
  const idx = save.packs.findIndex((p) => p.id === packId);
  if (idx < 0) return null;
  const pack = save.packs[idx];
  const pool = packPool();
  if (!pool.length) return null; // 資料庫裡還沒有 B00 的卡：卡包先留著
  save.packs.splice(idx, 1);

  // 先抽好並排序（最稀有的留到最後翻），再依翻牌順序判斷新卡／重複
  const draws = [];
  for (let i = 0; i < RULES.cardsPerPack; i++) {
    const card = drawCard(pool);
    draws.push({ card, variant: rollVariant(), r: rarityNum(card.rarity) });
  }
  draws.sort((a, b) => a.r - b.r || (b.variant === 'normal') - (a.variant === 'normal'));

  const results = [];
  for (const { card, variant, r } of draws) {
    const entry = save.col[card.id];
    const isNew = !entry;
    const dup = !!entry && entry.v.includes(variant);
    if (entry) {
      entry.n = (entry.n || entry.v.length) + 1;
      if (!dup) entry.v.push(variant);
    } else {
      save.col[card.id] = { v: [variant], t: Date.now(), n: 1 };
    }
    results.push({ card, variant, isNew, dup, newVariant: !isNew && !dup, r, count: save.col[card.id].n });
  }
  save.stats.opened++;
  const best = Math.max(...results.map((x) => x.r));
  persist();
  return { pack: { ...pack, set: RULES.packSet }, results, tier: tierOf(best) };
}
