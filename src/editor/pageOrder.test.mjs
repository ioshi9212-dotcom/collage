import assert from 'node:assert/strict';
import {
  moveArrayItem,
  movePageOrder,
  normalizePageOrderTitles,
  pageNumberToIndex,
  swapArrayItems,
  swapPageOrder,
} from './pageOrder.js';

assert.equal(pageNumberToIndex('1', 54), 0);
assert.equal(pageNumberToIndex('54', 54), 53);
assert.equal(pageNumberToIndex(' 20 ', 54), 19);
assert.equal(pageNumberToIndex('20.5', 54), null);
assert.equal(pageNumberToIndex('0', 54), null);
assert.equal(pageNumberToIndex('55', 54), null);
assert.equal(pageNumberToIndex('', 54), null);

{
  const items = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveArrayItem(items, 3, 1), ['a', 'd', 'b', 'c']);
  assert.deepEqual(items, ['a', 'b', 'c', 'd'], 'moving must not mutate source array');
  assert.equal(moveArrayItem(items, 1, 1), items, 'no-op move should preserve array identity');
  assert.equal(moveArrayItem(items, -1, 2), items, 'invalid move should preserve array identity');
}

{
  const items = ['a', 'b', 'c', 'd'];
  assert.deepEqual(swapArrayItems(items, 0, 3), ['d', 'b', 'c', 'a']);
  assert.deepEqual(items, ['a', 'b', 'c', 'd'], 'swap must not mutate source array');
  assert.equal(swapArrayItems(items, 2, 2), items, 'no-op swap should preserve array identity');
}

{
  const photo = { id: 'photo-54' };
  const pages = [
    { id: 'p1', title: 'Страница 1', frames: [] },
    { id: 'p2', title: 'Страница 2', frames: [] },
    { id: 'p3', title: 'Страница 3', frames: [{ id: 'frame-3', photo }] },
    { id: 'p4', title: 'Моя подпись', frames: [] },
  ];
  const moved = movePageOrder(pages, 2, 0);
  assert.deepEqual(moved.map((page) => page.id), ['p3', 'p1', 'p2', 'p4']);
  assert.equal(moved[0].title, 'Страница 1');
  assert.equal(moved[1].title, 'Страница 2');
  assert.equal(moved[2].title, 'Страница 3');
  assert.equal(moved[3].title, 'Моя подпись', 'custom page titles must be preserved');
  assert.equal(moved[0].frames[0].photo, photo, 'moving must preserve page contents and photo references');
  assert.equal(pages[2].title, 'Страница 3', 'moving must not mutate source pages');
}

{
  const pages = [
    { id: 'p1', title: 'Страница 1' },
    { id: 'p2', title: 'Пустая страница 2', isBlankPage: true },
    { id: 'p3', title: 'Страница 3' },
  ];
  const swapped = swapPageOrder(pages, 0, 2);
  assert.deepEqual(swapped.map((page) => page.id), ['p3', 'p2', 'p1']);
  assert.equal(swapped[0].title, 'Страница 1');
  assert.equal(swapped[1].title, 'Пустая страница 2');
  assert.equal(swapped[2].title, 'Страница 3');
}

{
  const pages = [{ id: 'custom', title: 'Обложка' }];
  assert.equal(normalizePageOrderTitles(pages), pages, 'already valid custom titles should preserve array identity');
}

console.log('page order checks passed');
