import assert from 'node:assert/strict';
import {
  buildPrintPhotoReferences,
  printPhotoIdentity,
  printPhotoNodesReady,
} from './printPhotoReadiness.js';

const page = {
  id: 'page-2',
  frames: [
    { id: 'frame_1', photo: { name: 'A.jpg', src: 'photo-a' } },
    { id: 'frame_2', photo: { name: 'B.jpg', src: 'photo-b' } },
    { id: 'frame_3', photo: null },
  ],
};

const references = buildPrintPhotoReferences(page);
assert.deepEqual(references, [
  { identity: 'page-2:frame_1', name: 'A.jpg', src: 'photo-a' },
  { identity: 'page-2:frame_2', name: 'B.jpg', src: 'photo-b' },
]);
assert.equal(printPhotoIdentity(page, page.frames[0]), 'page-2:frame_1');

assert.equal(printPhotoNodesReady(references, [
  { identity: 'page-2:frame_1', src: 'photo-a', ready: true },
  { identity: 'page-2:frame_2', src: 'photo-b', ready: true },
]), true);

assert.equal(printPhotoNodesReady(references, [
  { identity: 'page-2:frame_1', src: 'photo-b', ready: true },
  { identity: 'page-2:frame_2', src: 'photo-a', ready: true },
]), false, 'photos swapped between windows must not be accepted');

assert.equal(printPhotoNodesReady(references, [
  { identity: 'page-2:frame_1', src: 'photo-from-previous-page', ready: true },
  { identity: 'page-2:frame_2', src: 'photo-b', ready: true },
]), false, 'a stale photo from the previous page must not be accepted');

assert.equal(printPhotoNodesReady(references, [
  { identity: 'page-2:frame_1', src: 'photo-a', ready: false },
  { identity: 'page-2:frame_2', src: 'photo-b', ready: true },
]), false);

assert.equal(printPhotoNodesReady(references, [
  { identity: 'page-2:frame_1', src: 'photo-a', ready: true },
]), false);

console.log('print photo readiness checks passed');
