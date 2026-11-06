// 存檔：資料夾、任務、卡包、卡牌收藏（都存在這支手機的 localStorage）
const SAVE_KEY = 'tasking.save.v1';

export const uid = () => Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 8);

export let save;

/**
 * 任務項目：
 *  check  勾選框：done 為 true 代表完成
 *  energy 能量條：level 0–10，滿 10 格代表完成
 *  bullet 筆記：沒有完成狀態
 * 每個項目都可以有 note（備註框）。rewarded：已經送過卡包（取消再勾不會重送）
 */
const item = (type, text, extra = {}) => ({ id: uid(), type, text, note: '', done: false, level: 0, doneAt: 0, rewarded: false, ...extra });

function freshSave() {
  return {
    folders: [
      { id: uid(), name: 'LONG TERM', items: [
        item('energy', '讀完一本書', { level: 3 }),
        item('check', '存下第一筆旅行基金'),
      ] },
      { id: uid(), name: 'WEEKLY', items: [
        item('check', 'Drink water', { note: "It's important to drink water!" }),
        item('check', 'Wake up', { done: true, doneAt: Date.now(), rewarded: true }),
      ] },
      { id: uid(), name: 'REMINDER', items: [
        item('bullet', '星期五記得倒垃圾'),
      ] },
    ],
    packs: [],      // [{ id, set, from, at }]
    col: {},        // { [cardId]: { v: ['normal', 'holo'], t: 首次取得時間, n: 抽到幾次 } }
    stats: { opened: 0, done: 0 },
    sound: true,
  };
}

export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    save = s && typeof s === 'object' && Array.isArray(s.folders) ? { ...freshSave(), ...s } : freshSave();
  } catch {
    save = freshSave();
  }
  save.stats = { opened: 0, done: 0, ...save.stats };
  return save;
}

export function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* 無痕模式等 */ }
}

let timer = 0;
/** 打字時用：停下來 400ms 才存 */
export function persistSoon() {
  clearTimeout(timer);
  timer = setTimeout(persist, 400);
}

export const newItem = item;

export const isDone = (it) => it.type === 'check' ? !!it.done : it.type === 'energy' ? it.level >= 10 : false;

/** 顯示順序：未完成在上（保持使用者排的順序），完成的沉到下面 */
export const sortedItems = (folder) => [...folder.items.filter((i) => !isDone(i)), ...folder.items.filter(isDone)];

export const folderById = (id) => save.folders.find((f) => f.id === id);
