import assert from 'node:assert/strict';
import { compactProjectPhotos, hydrateProjectPhotos } from './photoStorage.js';

const source = `data:image/jpeg;base64,${'A'.repeat(12_000)}`;
const library = [{ id: 'photo-1', name: 'family.jpg', src: source }];
const pages = [
  {
    id: 'page-1',
    frames: [
      {
        id: 'frame-1',
        photo: { id: 'photo-1', name: 'family.jpg', src: source, zoom: 1.7, offsetX: 42, offsetY: -18 },
      },
      {
        id: 'frame-2',
        photo: { id: 'photo-1', name: 'family.jpg', src: source, zoom: 0.9, offsetX: -7, offsetY: 11 },
      },
    ],
  },
];

const compacted = compactProjectPhotos(library, pages);
assert.equal(compacted.library.length, 1, 'canonical library entry must stay single');
assert.equal(compacted.library[0].src, source);
assert.equal(compacted.pages[0].frames[0].photo.src, undefined, 'frame must not embed base64');
assert.equal(compacted.pages[0].frames[1].photo.src, undefined, 'reused frame must not embed base64');
assert.deepEqual(
  compacted.pages[0].frames.map((frame) => ({ zoom: frame.photo.zoom, offsetX: frame.photo.offsetX, offsetY: frame.photo.offsetY })),
  [
    { zoom: 1.7, offsetX: 42, offsetY: -18 },
    { zoom: 0.9, offsetX: -7, offsetY: 11 },
  ],
  'crop transforms must be preserved',
);
assert.equal((JSON.stringify(compacted).match(/data:image\/jpeg;base64/g) || []).length, 1, 'base64 must occur once in stored project');
assert.equal(pages[0].frames[0].photo.src, source, 'compaction must not mutate live editor state');

const hydrated = hydrateProjectPhotos(compacted.library, compacted.pages);
assert.equal(hydrated[0].frames[0].photo.src, source, 'opening compact project must restore source');
assert.equal(hydrated[0].frames[1].photo.src, source, 'all references must restore source');
assert.equal(hydrated[0].frames[0].photo.zoom, 1.7);

const legacy = compactProjectPhotos([], [{
  id: 'legacy-page',
  frames: [
    { id: 'legacy-frame-1', photo: { id: 'legacy-photo', name: 'old.png', src: source, zoom: 2 } },
    { id: 'legacy-frame-2', photo: { id: 'legacy-photo', name: 'old.png', src: source, offsetX: 5 } },
  ],
}]);
assert.equal(legacy.library.length, 1, 'legacy embedded photo must be recovered into library');
assert.equal(legacy.library[0].id, 'legacy-photo');
assert.equal(legacy.pages[0].frames[0].photo.src, undefined);
assert.equal(legacy.pages[0].frames[1].photo.src, undefined);
assert.equal((JSON.stringify(legacy).match(/data:image\/jpeg;base64/g) || []).length, 1);

const legacyHydrated = hydrateProjectPhotos(legacy.library, legacy.pages);
assert.equal(legacyHydrated[0].frames[0].photo.src, source);
assert.equal(legacyHydrated[0].frames[1].photo.src, source);

const idless = compactProjectPhotos([], [{
  id: 'idless-page',
  frames: [
    { id: 'idless-frame-1', photo: { name: 'old-no-id.jpg', src: source, zoom: 1.25 } },
    { id: 'idless-frame-2', photo: { name: 'old-no-id.jpg', src: source, offsetX: 8 } },
  ],
}]);
assert.equal(idless.library.length, 1, 'idless embedded copies of the same source must recover into one library item');
assert.ok(idless.library[0].id, 'recovered idless photo must receive a stable project ID');
assert.equal(idless.pages[0].frames[0].photo.id, idless.library[0].id);
assert.equal(idless.pages[0].frames[1].photo.id, idless.library[0].id);
assert.equal(idless.pages[0].frames[0].photo.src, undefined);
assert.equal(idless.pages[0].frames[1].photo.src, undefined);
const idlessHydrated = hydrateProjectPhotos(idless.library, idless.pages);
assert.equal(idlessHydrated[0].frames[0].photo.src, source, 'recovered idless photo must survive a save/open round-trip');
assert.equal(idlessHydrated[0].frames[1].photo.src, source);

const repaired = compactProjectPhotos(
  [{ id: 'damaged-photo', name: 'damaged.jpg', src: '' }],
  [{ frames: [{ id: 'frame', photo: { id: 'damaged-photo', name: 'damaged.jpg', src: source, zoom: 1.2 } }] }],
);
assert.equal(repaired.library.length, 1, 'damaged library record must not be duplicated');
assert.equal(repaired.library[0].src, source, 'embedded source must repair damaged library record');
assert.equal(repaired.pages[0].frames[0].photo.src, undefined);

const duplicateLibrary = compactProjectPhotos([
  { id: 'duplicate-photo', name: '', src: '' },
  { id: 'duplicate-photo', name: 'kept.jpg', src: source },
], []);
assert.equal(duplicateLibrary.library.length, 1, 'duplicate library IDs must collapse to one record');
assert.equal(duplicateLibrary.library[0].name, 'kept.jpg');
assert.equal(duplicateLibrary.library[0].src, source);

const malformed = hydrateProjectPhotos(
  [{ id: 'malformed-photo', name: 'malformed.jpg', src: source }],
  [{ frames: [{
    id: 'malformed-frame',
    photo: {
      id: 'malformed-photo',
      name: null,
      zoom: 'not-a-number',
      offsetX: Number.POSITIVE_INFINITY,
      offsetY: '-12.7',
    },
  }] }],
);
assert.equal(malformed[0].frames[0].photo.src, source);
assert.equal(malformed[0].frames[0].photo.name, 'Фото');
assert.equal(malformed[0].frames[0].photo.zoom, 1, 'broken zoom must become a safe numeric default');
assert.equal(malformed[0].frames[0].photo.offsetX, 0);
assert.equal(malformed[0].frames[0].photo.offsetY, -13);
assert.doesNotThrow(() => malformed[0].frames[0].photo.zoom.toFixed(2));

const unresolved = hydrateProjectPhotos([], [{ frames: [{ id: 'frame', photo: { id: 'missing', zoom: 1 } }] }]);
assert.equal(unresolved[0].frames[0].photo.src, undefined, 'missing library source must fail safely');

console.log('photo storage checks passed');
