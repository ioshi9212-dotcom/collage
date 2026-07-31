import assert from 'node:assert/strict';
import { recoverMissingFramePhotos } from './photoRecovery.js';

const imported = [
  { id: 'new-a', name: 'A.JPG', sourceName: 'A.JPG', sourceSize: 120, size: 100, assetId: 'asset-a', src: 'blob:a' },
  { id: 'new-a-duplicate', name: 'A.JPG', sourceName: 'A.JPG', sourceSize: 120, size: 100, assetId: 'asset-a-duplicate', src: 'blob:a-duplicate' },
  { id: 'new-b1', name: 'B.JPG', sourceName: 'B.JPG', sourceSize: 220, assetId: 'asset-b1', src: 'blob:b1' },
  { id: 'new-b2', name: 'B.JPG', sourceName: 'B.JPG', sourceSize: 221, assetId: 'asset-b2', src: 'blob:b2' },
];
const result = recoverMissingFramePhotos([{ id: 'page', frames: [
  { id: 'a', photo: { id: 'old-a', name: 'a.jpg', sourceSize: 120, zoom: 1.7, offsetX: 14 } },
  { id: 'b', photo: { id: 'old-b', name: 'B.JPG', sourceSize: 221, zoom: 1.3 } },
  { id: 'ambiguous', photo: { id: 'old-b-unknown', name: 'B.JPG', zoom: 2 } },
  { id: 'already-good', photo: { id: 'good', name: 'A.JPG', src: 'blob:old', zoom: 1.1 } },
  { id: 'empty', photo: null },
] }], imported);

assert.equal(result.missing, 3);
assert.equal(result.recovered, 2);
assert.equal(result.ambiguous, 1);
assert.equal(result.unresolved, 1);
assert.equal(result.pages[0].frames[0].photo.id, 'new-a');
assert.equal(result.pages[0].frames[0].photo.src, 'blob:a');
assert.equal(result.pages[0].frames[0].photo.zoom, 1.7, 'crop must stay unchanged');
assert.equal(result.pages[0].frames[0].photo.offsetX, 14);
assert.equal(result.pages[0].frames[1].photo.id, 'new-b2', 'size disambiguates duplicate names');
assert.equal(result.pages[0].frames[2].photo.src, undefined, 'ambiguous names must not be guessed');
assert.equal(result.pages[0].frames[3].photo.src, 'blob:old', 'working frames must not be changed');
assert.deepEqual([...result.usedPhotoIds].sort(), ['new-a', 'new-b2']);
console.log('photoRecovery tests passed');
