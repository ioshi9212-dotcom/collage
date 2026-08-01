import assert from 'node:assert/strict';
import {
  COLLAGE_PRESET_CATALOG,
  COLLAGE_PRESET_CATEGORIES,
  COLLAGE_PRESET_COUNTS,
  applyCollagePresetToPage,
  collagePresetById,
  collagePresetsFor,
} from './collagePresetCatalog.js';

assert.deepEqual(COLLAGE_PRESET_COUNTS, [2, 3, 4, 5, 6, 7, 8, 9]);
assert.equal(COLLAGE_PRESET_CATALOG.length, 176);
assert.equal(new Set(COLLAGE_PRESET_CATALOG.map((preset) => preset.id)).size, 176, 'preset ids must be unique');
assert.ok(COLLAGE_PRESET_CATEGORIES.some((item) => item.id === 'text' && item.label === 'С текстом'));
assert.ok(COLLAGE_PRESET_CATEGORIES.some((item) => item.id === 'album' && item.label === 'Как в альбоме'));

const expectedCounts = new Map([
  [2, 22],
  [3, 22],
  [4, 22],
  [5, 22],
  [6, 22],
  [7, 22],
  [8, 22],
  [9, 22],
]);

for (const [count, expected] of expectedCounts) {
  assert.equal(collagePresetsFor({ count }).length, expected, `${count}-photo preset count must stay stable`);
}

assert.equal(collagePresetsFor({ count: 5, category: 'overlay' }).length, 1);
assert.equal(collagePresetsFor({ count: 2, category: 'text' }).length, 4);
assert.equal(collagePresetsFor({ count: 9, category: 'text' }).length, 3);
assert.equal(COLLAGE_PRESET_CATALOG.filter((preset) => preset.category === 'text').length, 19);
assert.equal(COLLAGE_PRESET_CATALOG.filter((preset) => preset.category === 'album').length, 80);
for (const count of COLLAGE_PRESET_COUNTS) {
  assert.equal(collagePresetsFor({ count, category: 'album' }).length, 10);
}

function assertNormalizedBox(box, label) {
  assert.ok(box.x >= 0 && box.y >= 0, `${label} origin must be inside the page`);
  assert.ok(box.width > 0 && box.height > 0, `${label} size must be positive`);
  assert.ok(box.x + box.width <= 1.000001, `${label} must fit horizontally`);
  assert.ok(box.y + box.height <= 1.000001, `${label} must fit vertically`);
}

const A5_PAGE_ASPECT = 148 / 210;
const MIN_PHOTO_ASPECT = 9 / 16;
const MAX_PHOTO_ASPECT = 16 / 9;

function assertPrintablePhotoAspect(box, label) {
  const physicalAspect = A5_PAGE_ASPECT * box.width / box.height;
  assert.ok(physicalAspect >= MIN_PHOTO_ASPECT - 0.000001, `${label} must not be narrower than 9:16`);
  assert.ok(physicalAspect <= MAX_PHOTO_ASPECT + 0.000001, `${label} must not be flatter than 16:9`);
}

for (const preset of COLLAGE_PRESET_CATALOG) {
  assert.equal(preset.frames.length, preset.count, `${preset.id} must contain exactly ${preset.count} frames`);
  preset.frames.forEach((item, index) => assertNormalizedBox(item, `${preset.id} frame ${index + 1}`));
  if (preset.category === 'album') {
    preset.frames.forEach((item, index) => assertPrintablePhotoAspect(item, `${preset.id} frame ${index + 1}`));
  }
  if (preset.textZone) assertNormalizedBox(preset.textZone, `${preset.id} text zone`);
  if (preset.category === 'text') assert.ok(preset.textZone, `${preset.id} must describe its reserved text space`);
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

const textPreset = collagePresetById('two-grid-vertical-text');
const textResult = applyCollagePresetToPage(sourcePage, textPreset, { width: 1480, height: 2100 }, () => `text-${++nextId}`);
assert.equal(textResult.frameCount, 2);
assert.equal(textResult.frames.length, 2);
assert.equal(textResult.collagePresetId, textPreset.id);
assert.deepEqual(textResult.frames.map((item) => item.photo), photos.slice(0, 2));
assert.ok(textPreset.textZone, 'text layout metadata must remain available to the picker');

console.log('extended mixed collage preset catalog checks passed');
