import assert from 'node:assert/strict';
import {
  commitProjectHistory,
  createProjectHistory,
  createProjectHistorySnapshot,
  redoProjectHistory,
  sameProjectHistorySnapshot,
  undoProjectHistory,
} from './projectHistory.js';

const shared = {
  library: [],
  hiddenLibraryPhotoIds: new Set(),
  canvas: { width: 100, height: 200 },
  settings: { padding: 10 },
  extraLayers: { pages: {} },
  bookletSheetsPerBlock: 4,
  bookletPrintSettings: { margin: 0 },
};

const first = createProjectHistorySnapshot({
  ...shared,
  pages: [{ id: 'a' }, { id: 'b' }],
  currentPageId: 'a',
});
const navigationOnly = createProjectHistorySnapshot({
  ...shared,
  pages: first.pages,
  currentPageId: 'b',
});
assert.equal(sameProjectHistorySnapshot(first, navigationOnly), true, 'page navigation must not create an undo step');

const second = createProjectHistorySnapshot({
  ...shared,
  pages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  currentPageId: 'c',
});
let history = createProjectHistory(first);
history = commitProjectHistory(history, second);
assert.equal(history.past.length, 1);
assert.equal(history.current, second);
assert.equal(history.future.length, 0);

const undone = undoProjectHistory(history);
assert.equal(undone.target, first);
assert.equal(undone.history.current, first);
assert.equal(undone.history.future[0], second);

const redone = redoProjectHistory(undone.history);
assert.equal(redone.target, second);
assert.equal(redone.history.current, second);

const changedSettings = createProjectHistorySnapshot({
  ...shared,
  pages: second.pages,
  currentPageId: 'c',
  settings: { padding: 40 },
});
history = commitProjectHistory(redone.history, changedSettings);
assert.equal(history.future.length, 0, 'new edits after redo must clear future history');

let limited = createProjectHistory(first);
for (let index = 0; index < 80; index += 1) {
  limited = commitProjectHistory(limited, createProjectHistorySnapshot({
    ...shared,
    pages: [{ id: 'page-' + index }],
    currentPageId: 'page-' + index,
  }));
}
assert.equal(limited.past.length, 60, 'history should stay bounded');

console.log('project history checks passed');
