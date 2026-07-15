import assert from 'node:assert/strict';
import {
  getBookletVisiblePageNumbers,
  getPreviewScale,
  getStablePreviewViewport,
  isBookletPageActive,
} from './previewFit.js';

assert.deepEqual(getStablePreviewViewport({
  containerWidth: 900,
  viewportHeight: 900,
  horizontalPadding: 24,
}), { width: 852, height: 630 });

assert.deepEqual(getStablePreviewViewport({
  containerWidth: 900,
  viewportHeight: 400,
  horizontalPadding: 24,
}), { width: 852, height: 360 });

assert.deepEqual(getStablePreviewViewport({
  containerWidth: 2000,
  viewportHeight: 1600,
  horizontalPadding: 24,
}), { width: 1220, height: 780 });

assert.equal(getPreviewScale({
  stageWidth: 2960,
  stageHeight: 2100,
  viewportWidth: 820,
  viewportHeight: 560,
}), 560 / 2100);

assert.equal(getPreviewScale({
  stageWidth: 1480,
  stageHeight: 2100,
  viewportWidth: 2000,
  viewportHeight: 3000,
}), 1);

const side = {
  slots: [
    { pageNumber: 2, isBlank: false },
    { pageNumber: 7, isBlank: false },
  ],
};

assert.deepEqual([...getBookletVisiblePageNumbers(side)], [2, 7]);
assert.equal(isBookletPageActive(side, 2), true);
assert.equal(isBookletPageActive(side, 7), true);
assert.equal(isBookletPageActive(side, 3), false);
assert.deepEqual([...getBookletVisiblePageNumbers({ slots: [{ pageNumber: null, isBlank: true }] })], []);

console.log('stable preview fit and booklet pair checks passed');
