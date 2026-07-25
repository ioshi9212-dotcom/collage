import assert from 'node:assert/strict';
import {
  COLLAGE_PRESET_CATALOG,
  COLLAGE_PRESET_COUNTS,
  applyCollagePresetToPage,
  collagePresetById,
  collagePresetsFor,
} from './collagePresetCatalog.js';

assert.deepEqual(COLLAGE_PRESET_COUNTS, [3, 4, 5, 6]);
assert.equal(COLLAGE_PRESET_CATALOG.length, 23);
assert.equal(new Set(COLLAGE_PRESET_CATALOG.map((preset) => preset.id)).size, 23, 'preset ids must be unique');
assert.equal(collagePresetsFor({ count: 3 }).length, 5);
assert.equal(collagePresetsFor({ count: 4 }).length, 6);
assert.equal(collagePresetsFor({ count: 5 }).length, 6);
assert.equal(collagePresetsFor({ count: 6 }).length, 6);
assert.equal(collagePresetsFor({ count: 5, category: 'overlay' }).length, 1);

for (const preset of COLLAGE_PRESET_CATALOG) {
  assert.equal(preset.frames.length, preset.count, `${preset.id} must contain exactly ${preset.count} frames`);
  for (const item of preset.frames) {
    assert.ok(item.x >= 0 && item.y >= 0, `${preset.id} frame origin must be inside the page`);
    assert.ok(item.width > 0 && item.height > 0, `${preset.id} frame size must be positive`);
    assert.ok(item.x + item.width <= 1.000001, `${preset.id} frame must fit horizontally`);
    assert.ok(item.y + item.height <= 1.000001, `${preset.id} frame must fit vertically`);
  }
}

const photos = [
  { id: 'photo-a', name: 'A', zoom: 1.3, offsetX: 7, offsetY: -2 },
  { id: 'photo-b', name: 'B', zoom: 1, offsetX: 0, offsetY: 0 },
  { id: 'photo-c', name: 'C', zoom: 1.1, offsetX: -4, offsetY: 3 },
];
const sourcePage = {
  id: 'page-1',
  frameCount: 4,
  layout: { rows: [] },
  frames: [
    { id: 'old-1', x: 1, y: 2, width: 3, height: 4, photo: photos[0] },
    { id: 'old-empty', x: 4, y: 5, width: 6, height: 7, photo: null },
    { id: 'old-2', x: 8, y: 9, width: 10, height: 11, photo: photos[1] },
    { id: 'old-3', x: 12, y: 13, width: 14, height: 15, photo: photos[2] },
  ],
};
let nextId = 0;
const preset = collagePresetById('five-background-four-overlay');
const result = applyCollagePresetToPage(sourcePage, preset, { width: 1480, height: 2100 }, () => `new-${++nextId}`);

assert.equal(result.frameCount, 5);
assert.equal(result.layout, null);
assert.equal(result.collagePresetId, preset.id);
assert.equal(result.frames.length, 5);
assert.equal(result.frames[0].id, 'old-1');
assert.equal(result.frames[1].id, 'old-empty');
assert.equal(result.frames[4].id, 'new-1');
assert.deepEqual(result.frames.slice(0, 3).map((item) => item.photo), photos, 'filled photos must be packed into new frames in order');
assert.equal(result.frames[3].photo, null);
assert.equal(result.frames[4].photo, null);
assert.deepEqual(result.frames[0], {
  id: 'old-1',
  x: 0,
  y: 0,
  width: 1480,
  height: 2100,
  zIndex: 0,
  photo: photos[0],
});
assert.ok(result.frames.slice(1).every((item) => item.zIndex > result.frames[0].zIndex));
assert.notEqual(result, sourcePage);
assert.deepEqual(sourcePage.frames[0].photo, photos[0], 'source page must stay unchanged');

console.log('mixed collage preset catalog checks passed');
