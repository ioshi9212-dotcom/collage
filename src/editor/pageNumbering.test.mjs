import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
assert.equal(pageNumberValue(0, { enabled: true, firstPage: 1, firstNumber: 0 }), 0, 'zero is a valid page number');

// Missing and virtual spread pages must never produce a decorative number without a digit.
const enabledNumbering = { enabled: true, firstPage: 1, firstNumber: 1 };
assert.equal(pageNumberValue(undefined, enabledNumbering), null, 'a missing page index must not render an empty ornament');
assert.equal(pageNumberValue(null, enabledNumbering), null);
assert.equal(pageNumberValue('', enabledNumbering), null);
assert.equal(pageNumberValue(Number.NaN, enabledNumbering), null);
assert.equal(pageNumberValue(-1, enabledNumbering), null);

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

const safeFallbackPlacement = pageNumberPlacement(undefined, { width: 1480, height: 2100 }, {
  enabled: true,
  position: 'bottom-outer',
  edgeOffset: 60,
});
assert.equal(safeFallbackPlacement.x, 1420, 'invalid indexes use a stable placement fallback');

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

const appSource = readFileSync(resolve(process.cwd(), 'src/AppLive.jsx'), 'utf8');
assert.match(
  appSource,
  /\{entry\.page && \(\s*<PageNumberLayer/,
  'the empty half of an odd spread must not render a page-number ornament',
);
assert.match(
  appSource,
  /\{showPageLabel && pageIndex >= 0 && <Text/,
  'the empty half of an odd spread must not show a fake guide page number',
);

console.log('page numbering checks passed');
