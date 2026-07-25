import assert from 'node:assert/strict';
import {
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
