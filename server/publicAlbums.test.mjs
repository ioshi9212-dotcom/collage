import assert from 'node:assert/strict';
import {
  createPublicAlbumToken,
  normalizePublicAlbumToken,
  publicAlbumPath,
  publicAlbumPhotoKeys,
  publicAlbumUsesPhotoKey,
  sanitizePublicAlbumData,
} from './publicAlbums.js';

const token = createPublicAlbumToken((size) => Buffer.alloc(size, 7));
assert.equal(token.length, 32);
assert.equal(normalizePublicAlbumToken(token), token);
assert.equal(normalizePublicAlbumToken('bad token'), '');
assert.equal(publicAlbumPath(token), `/album/${token}`);

const usedKey = 'users/12/photos/a/original.jpg';
const unusedKey = 'users/12/photos/b/original.jpg';
const source = {
  canvas: { width: 1480, height: 2100 },
  settings: { borderColor: '#ffffff' },
  library: [
    { id: 'used', cloudKey: usedKey, src: '/api/photo-assets/file?key=used' },
    { id: 'unused', cloudKey: unusedKey, src: '/api/photo-assets/file?key=unused' },
  ],
  pages: [
    {
      id: 'page-1',
      frames: [
        {
          id: 'frame-1',
          photo: {
            id: 'used',
            name: 'Used',
            cloudKey: usedKey,
            src: 'blob:private',
            assetId: 'local-only',
          },
        },
      ],
    },
  ],
  extraLayers: { pages: { 1: { texts: [{ id: 'text-1', text: 'Hello' }] } } },
};

assert.deepEqual([...publicAlbumPhotoKeys(source)], [usedKey]);
assert.equal(publicAlbumUsesPhotoKey(source, usedKey), true);
assert.equal(publicAlbumUsesPhotoKey(source, unusedKey), false);

const publicData = sanitizePublicAlbumData(source, token);
assert.equal(publicData.library, undefined, 'unused library must never be exposed');
assert.equal(publicData.pages[0].frames[0].photo.cloudKey, undefined);
assert.equal(publicData.pages[0].frames[0].photo.assetId, undefined);
assert.equal(
  publicData.pages[0].frames[0].photo.src,
  `/api/public-albums/${token}/photo?key=${encodeURIComponent(usedKey)}`,
);
assert.equal(publicData.extraLayers.pages[1].texts[0].text, 'Hello');

console.log('public album server checks passed');
