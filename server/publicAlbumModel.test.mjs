import assert from 'node:assert/strict';
import { createPublicAlbumToken, publicPhotoId, referencedPublicPhotoKey, rewritePublicAlbumProject } from './publicAlbumModel.js';

const token = createPublicAlbumToken();
assert.match(token, /^[A-Za-z0-9_-]{20,}$/);
const key = 'users/7/photos/abc/original.jpg';
const photoId = publicPhotoId(key);
assert.equal(photoId.length, 24);
assert.equal(referencedPublicPhotoKey([key], photoId), key);
assert.equal(referencedPublicPhotoKey([key], 'missing'), null);

const direct = rewritePublicAlbumProject({
  pages: [{ frames: [{ photo: { id: 'p1', cloudKey: key, cloudSchema: 'railway-bucket-v1', src: '/private' } }] }],
}, 'share123');
assert.equal(direct.pages[0].frames[0].photo.cloudKey, undefined);
assert.equal(direct.pages[0].frames[0].photo.cloudSchema, undefined);
assert.equal(direct.pages[0].frames[0].photo.src, '/api/public-albums/share123/photos/' + photoId);

const libraryBacked = rewritePublicAlbumProject({
  library: [{ id: 'p2', cloudKey: key, cloudSchema: 'railway-bucket-v1', src: '/api/photo-assets/file?key=private' }],
  pages: [{ frames: [{ photo: { id: 'p2', name: 'Фото', src: 'blob:local-preview' } }] }],
}, 'share456');
assert.equal(
  libraryBacked.pages[0].frames[0].photo.src,
  '/api/public-albums/share456/photos/' + photoId,
);
assert.equal(libraryBacked.pages[0].frames[0].photo.cloudKey, undefined);

console.log('publicAlbumModel tests passed');
