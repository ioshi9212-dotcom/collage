import assert from 'node:assert/strict';
import {
  normalizePublicAlbumToken,
  publicAlbumTokenFromPath,
  publicAlbumUrl,
} from './publicAlbum.js';

const token = 'AbCdEfGhIjKlMnOpQrStUvWxYz_12345';
assert.equal(normalizePublicAlbumToken(token), token);
assert.equal(normalizePublicAlbumToken('short'), '');
assert.equal(publicAlbumTokenFromPath(`/album/${token}`), token);
assert.equal(publicAlbumTokenFromPath(`/album/${token}/`), token);
assert.equal(publicAlbumTokenFromPath('/editor'), '');
assert.equal(publicAlbumUrl(token, 'https://example.test/'), `https://example.test/album/${token}`);

console.log('public album client checks passed');
