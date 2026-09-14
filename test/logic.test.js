const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

const mk = (over = {}) => L.createItem({ id: 'a', name: 'Jeans', category: 'pants', washEvery: 3, ...over });

test('createItem sets defaults and sanitizes', () => {
  const i = L.createItem({ name: '  ', category: '', washEvery: 'abc' });
  assert.equal(i.name, 'Unnamed');
  assert.equal(i.category, 'misc');
  assert.equal(i.washEvery, 1);
  assert.equal(i.wearsSinceWash, 0);
  assert.deepEqual(i.wearLog, []);
});

test('addWear increments counts and ignores same-day duplicates', () => {
  let i = L.addWear(mk(), '2026-09-01');
  i = L.addWear(i, '2026-09-01');
  assert.equal(i.totalWears, 1);
  assert.equal(i.wearsSinceWash, 1);
  assert.equal(i.lastWorn, '2026-09-01');
});

test('needsWash triggers at threshold', () => {
  let items = [mk()];
  items = L.setWornOn(items, ['a'], '2026-09-01');
  items = L.setWornOn(items, ['a'], '2026-09-02');
  assert.equal(L.needsWashList(items).length, 0);
  items = L.setWornOn(items, ['a'], '2026-09-03');
  assert.equal(L.needsWashList(items).length, 1);
});

test('markWashed resets counter but keeps total', () => {
  let items = [mk({ washEvery: 1 })];
  items = L.setWornOn(items, ['a'], '2026-09-01');
  items = L.markWashed(items, ['a'], '2026-09-02');
  assert.equal(items[0].wearsSinceWash, 0);
  assert.equal(items[0].totalWears, 1);
  assert.equal(L.needsWashList(items).length, 0);
});

test('setWornOn removes wears for unchecked items', () => {
  let items = [mk(), mk({ id: 'b' })];
  items = L.setWornOn(items, ['a', 'b'], '2026-09-01');
  items = L.setWornOn(items, ['a'], '2026-09-01');
  assert.deepEqual(L.wornOn(items, '2026-09-01'), ['a']);
  assert.equal(items[1].totalWears, 0);
  assert.equal(items[1].wearsSinceWash, 0);
  assert.equal(items[1].lastWorn, null);
});

test('backfilled wear before last wash does not count toward wash', () => {
  let items = [mk()];
  items = L.markWashed(items, ['a'], '2026-09-05');
  items = L.setWornOn(items, ['a'], '2026-09-01');
  assert.equal(items[0].totalWears, 1);
  assert.equal(items[0].wearsSinceWash, 0);
  items = L.setWornOn(items, [], '2026-09-01');
  assert.equal(items[0].wearsSinceWash, 0);
  assert.equal(items[0].totalWears, 0);
});

test('lastWorn tracks latest date when removing', () => {
  let i = mk();
  i = L.addWear(i, '2026-09-03');
  i = L.addWear(i, '2026-09-01');
  assert.equal(i.lastWorn, '2026-09-03');
  i = L.removeWear(i, '2026-09-03');
  assert.equal(i.lastWorn, '2026-09-01');
});

test('updateItem validates numbers', () => {
  let items = [mk()];
  items = L.updateItem(items, 'a', { washEvery: 0, wearsSinceWash: -2, name: 'Black jeans' });
  assert.equal(items[0].washEvery, 3);
  assert.equal(items[0].wearsSinceWash, 0);
  assert.equal(items[0].name, 'Black jeans');
});

test('addItem does not duplicate ids (safe to retry)', () => {
  const item = mk();
  assert.equal(L.addItem(L.addItem([], item), item).length, 1);
});

test('todayStr is local YYYY-MM-DD', () => {
  assert.equal(L.todayStr(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
});
