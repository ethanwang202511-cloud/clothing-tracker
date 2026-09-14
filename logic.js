// Pure data logic. No DOM, no network. Works in the browser (window.Logic) and Node (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const CATEGORIES = ['shirt', 'pants', 'sweater', 'jacket', 'shoes', 'misc'];

  // Local date as YYYY-MM-DD (not UTC, so "today" matches your wall clock).
  function todayStr(d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function toPositiveInt(v, fallback) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 1 ? n : fallback;
  }

  function toNonNegInt(v, fallback) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  function createItem({ id, name, category, washEvery, photo }) {
    return {
      id: id || newId(),
      name: String(name || '').trim() || 'Unnamed',
      category: String(category || 'misc').trim().toLowerCase() || 'misc',
      photo: photo || null,
      washEvery: toPositiveInt(washEvery, 1),
      wearsSinceWash: 0,
      totalWears: 0,
      lastWorn: null,
      lastWashed: null,
      wearLog: [],
    };
  }

  function addItem(items, item) {
    if (items.some((i) => i.id === item.id)) return items;
    return [...items, item];
  }

  function updateItem(items, id, patch) {
    return items.map((i) => {
      if (i.id !== id) return i;
      const next = { ...i, ...patch };
      if ('washEvery' in patch) next.washEvery = toPositiveInt(patch.washEvery, i.washEvery);
      if ('wearsSinceWash' in patch) next.wearsSinceWash = toNonNegInt(patch.wearsSinceWash, i.wearsSinceWash);
      if ('totalWears' in patch) next.totalWears = toNonNegInt(patch.totalWears, i.totalWears);
      if ('name' in patch) next.name = String(patch.name).trim() || i.name;
      if ('category' in patch) next.category = String(patch.category).trim().toLowerCase() || i.category;
      return next;
    });
  }

  function removeItem(items, id) {
    return items.filter((i) => i.id !== id);
  }

  // A wear counts toward the wash counter only if it happened on/after the last wash.
  function countsTowardWash(item, date) {
    return !item.lastWashed || date >= item.lastWashed;
  }

  function latest(dates) {
    return dates.length ? [...dates].sort().at(-1) : null;
  }

  function addWear(item, date) {
    if (item.wearLog.includes(date)) return item;
    const wearLog = [...item.wearLog, date].sort();
    return {
      ...item,
      wearLog,
      totalWears: item.totalWears + 1,
      wearsSinceWash: item.wearsSinceWash + (countsTowardWash(item, date) ? 1 : 0),
      lastWorn: latest(wearLog),
    };
  }

  function removeWear(item, date) {
    if (!item.wearLog.includes(date)) return item;
    const wearLog = item.wearLog.filter((d) => d !== date);
    return {
      ...item,
      wearLog,
      totalWears: Math.max(0, item.totalWears - 1),
      wearsSinceWash: Math.max(0, item.wearsSinceWash - (countsTowardWash(item, date) ? 1 : 0)),
      lastWorn: latest(wearLog),
    };
  }

  function wornOn(items, date) {
    return items.filter((i) => i.wearLog.includes(date)).map((i) => i.id);
  }

  // Make the set of items worn on `date` exactly `ids` (adds and removes wears as needed).
  function setWornOn(items, ids, date) {
    const want = new Set(ids);
    return items.map((i) => (want.has(i.id) ? addWear(i, date) : removeWear(i, date)));
  }

  function markWashed(items, ids, date) {
    const set = new Set(ids);
    return items.map((i) => (set.has(i.id) ? { ...i, wearsSinceWash: 0, lastWashed: date } : i));
  }

  function needsWash(item) {
    return item.wearsSinceWash >= item.washEvery;
  }

  function needsWashList(items) {
    return items.filter(needsWash);
  }

  function sortItems(items) {
    return [...items].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }

  function categoriesOf(items) {
    return [...new Set([...CATEGORIES, ...items.map((i) => i.category)])];
  }

  return {
    CATEGORIES, todayStr, newId, createItem, addItem, updateItem, removeItem,
    addWear, removeWear, wornOn, setWornOn, markWashed, needsWash, needsWashList,
    sortItems, categoriesOf,
  };
});
