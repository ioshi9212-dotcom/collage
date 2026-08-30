import assert from 'node:assert/strict';
import { createPublicAlbumToken, publicPhotoId, referencedPublicPhotoKey, rewritePublicAlbumProject } from './publicAlbumModel.js';

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
console.log('publicAlbumModel tests passed');
