import assert from 'node:assert/strict';
import {
  applyFrameStylePropertyToPages,
  applyFrameStyleToPages,
  borderDashFor,
  normalizeFrameStyle,
} from './frameStyle.js';

const pages = [
  { id: 'page-1', frames: [{ id: 'a' }, { id: 'b' }] },
  { id: 'page-2', frames: [{ id: 'c' }] },
];
const patch = { borderStyle: 'dashed', borderWidth: 12, borderColor: '#123456', cornerRadius: 30 };

const one = applyFrameStyleToPages(pages, { scope: 'frame', pageId: 'page-1', frameId: 'b', patch });
assert.equal(one[0].frames[0].borderWidth, undefined);
assert.deepEqual(normalizeFrameStyle(one[0].frames[1]), patch);
assert.equal(one[1], pages[1]);

const page = applyFrameStyleToPages(pages, { scope: 'page', pageId: 'page-1', patch });
assert.equal(page[0].frames.every((frame) => frame.cornerRadius === 30), true);
assert.equal(page[1], pages[1]);

const album = applyFrameStyleToPages(pages, { scope: 'album', pageId: 'page-1', patch });
assert.equal(album.flatMap((item) => item.frames).every((frame) => frame.borderStyle === 'dashed'), true);
assert.deepEqual(borderDashFor('dotted', 4), [4, 7.2]);
assert.equal(normalizeFrameStyle({ borderWidth: -5, cornerRadius: 900 }).borderStyle, 'none');


const variedFrames = [
  { id: 'page-a', frames: [
    { id: 'one', borderStyle: 'double', borderWidth: 11, borderColor: '#111111', cornerRadius: 5 },
    { id: 'two', borderStyle: 'none', borderWidth: 0, borderColor: '#222222', cornerRadius: 15 },
  ] },
  { id: 'page-b', frames: [
    { id: 'three', borderStyle: 'dashed', borderWidth: 7, borderColor: '#333333', cornerRadius: 25 },
  ] },
];
const beforeOtherStyle = variedFrames.flatMap((item) => item.frames).map(({ borderStyle, borderWidth, borderColor }) => ({ borderStyle, borderWidth, borderColor }));
const roundedOnly = applyFrameStylePropertyToPages(variedFrames, { property: 'cornerRadius', value: 80 });
assert.equal(roundedOnly.flatMap((item) => item.frames).every((frame) => frame.cornerRadius === 80), true);
assert.deepEqual(
  roundedOnly.flatMap((item) => item.frames).map(({ borderStyle, borderWidth, borderColor }) => ({ borderStyle, borderWidth, borderColor })),
  beforeOtherStyle,
  'single-property apply must preserve every other frame style',
);
assert.throws(() => applyFrameStylePropertyToPages(variedFrames, { property: 'unknown', value: 1 }), /Unknown frame style property/);
