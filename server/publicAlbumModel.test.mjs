import assert from 'node:assert/strict';
import {
  createPublicAlbumToken,
  publicPhotoId,
  referencedPublicPhotoKey,
  restorePublicAlbumPhotoMetadata,
  rewritePublicAlbumProject,
} from './publicAlbumModel.js';

const token = createPublicAlbumToken();
assert.match(token, /^[A-Za-z0-9_-]{20,}$/);
const key = 'users/7/photos/abc/original.jpg';
const photoId = publicPhotoId(key);
assert.equal(photoId.length, 24);
assert.equal(referencedPublicPhotoKey([key], photoId), key);
assert.equal(referencedPublicPhotoKey([key], 'missing'), null);

const rewritten = rewritePublicAlbumProject({ pages: [{ frames: [{ photo: { id: 'p1', cloudKey: key, cloudSchema: 'railway-bucket-v1', src: '/private' } }] }] }, 'share123');
assert.equal(rewritten.pages[0].frames[0].photo.cloudKey, undefined);
assert.equal(rewritten.pages[0].frames[0].photo.cloudSchema, undefined);
assert.equal(rewritten.pages[0].frames[0].photo.src, '/api/public-albums/share123/photos/' + photoId);

const brokenPublishedSnapshot = {
  library: [{ id: 'p1', name: 'Фото', src: 'blob:https://local.invalid/abc' }],
  pages: [{
    id: 'page-1',
    frames: [{ id: 'frame-1', x: 10, y: 20, width: 300, height: 400, photo: { id: 'p1', src: 'blob:https://local.invalid/abc', positionX: 0.4 } }],
  }],
};
const canonicalCloudProject = {
  library: [{ id: 'p1', name: 'Фото', cloudKey: key, cloudSchema: 'railway-bucket-v1', src: '/api/photo-assets/file?key=private', type: 'image/jpeg', size: 12345 }],
  pages: [],
};
const repaired = restorePublicAlbumPhotoMetadata(brokenPublishedSnapshot, canonicalCloudProject);
assert.equal(repaired.pages[0].frames[0].x, 10);
assert.equal(repaired.pages[0].frames[0].photo.positionX, 0.4);
assert.equal(repaired.pages[0].frames[0].photo.cloudKey, key);
assert.equal(repaired.library[0].cloudKey, key);
assert.equal(brokenPublishedSnapshot.pages[0].frames[0].photo.cloudKey, undefined);
const repairedPublic = rewritePublicAlbumProject(repaired, 'existing-link');
assert.equal(repairedPublic.pages[0].frames[0].photo.src, '/api/public-albums/existing-link/photos/' + photoId);
assert.equal(repairedPublic.library[0].src, '/api/public-albums/existing-link/photos/' + photoId);

console.log('publicAlbumModel tests passed');
