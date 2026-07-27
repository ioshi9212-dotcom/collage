import assert from 'node:assert/strict';
import {
  DEFAULT_PAGE_NUMBERING,
  normalizePageNumbering,
  pageNumberPlacement,
  pageNumberValue,
} from './pageNumbering.js';

assert.equal(pageNumberValue(0, DEFAULT_PAGE_NUMBERING), null, 'numbering is opt-in');
assert.equal(pageNumberValue(0, { enabled: true, firstPage: 2, firstNumber: 1 }), null);
assert.equal(pageNumberValue(1, { enabled: true, firstPage: 2, firstNumber: 1 }), 1);
assert.equal(pageNumberValue(9, { enabled: true, firstPage: 3, firstNumber: 7 }), 14);

const leftPage = pageNumberPlacement(1, { width: 1480, height: 2100 }, {
  enabled: true,
  position: 'bottom-outer',
  edgeOffset: 60,
});
const rightPage = pageNumberPlacement(2, { width: 1480, height: 2100 }, {
  enabled: true,
  position: 'bottom-outer',
  edgeOffset: 60,
});
assert.equal(leftPage.x, 60, 'even physical pages use the left outer edge');
assert.equal(rightPage.x, 1420, 'odd physical pages use the right outer edge');
assert.equal(leftPage.y, 2040);

const unsafe = normalizePageNumbering({
  enabled: 1,
  style: 'unknown',
  position: 'somewhere',
  color: 'red',
  fontSize: 900,
  opacity: -1,
  firstPage: -20,
});
assert.equal(unsafe.enabled, true);
assert.equal(unsafe.style, DEFAULT_PAGE_NUMBERING.style);
assert.equal(unsafe.position, DEFAULT_PAGE_NUMBERING.position);
assert.equal(unsafe.color, DEFAULT_PAGE_NUMBERING.color);
assert.equal(unsafe.fontSize, 120);
assert.equal(unsafe.opacity, 0.1);
assert.equal(unsafe.firstPage, 1);

console.log('page numbering checks passed');
