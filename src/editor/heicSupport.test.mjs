import assert from 'node:assert/strict';
import {
  isHeicPhoto,
  jpegNameForHeic,
  loadHeicConverter,
  prepareHeicPhotoFiles,
  preparePhotoForWeb,
} from './heicSupport.js';

function namedBlob(name, type = '', bytes = [1, 2, 3]) {
  const blob = new Blob([new Uint8Array(bytes)], { type });
  Object.defineProperty(blob, 'name', { value: name, configurable: true });
  Object.defineProperty(blob, 'lastModified', { value: 12345, configurable: true });
  return blob;
}

function createTestFile(parts, name, options = {}) {
  const blob = new Blob(parts, { type: options.type });
  Object.defineProperty(blob, 'name', { value: name, configurable: true });
  Object.defineProperty(blob, 'lastModified', { value: options.lastModified, configurable: true });
  return blob;
}

assert.equal(isHeicPhoto(namedBlob('IMG_1001.HEIC')), true);
assert.equal(isHeicPhoto(namedBlob('IMG_1002', 'image/heif')), true);
assert.equal(isHeicPhoto(namedBlob('photo.jpg', 'image/jpeg')), false);
assert.equal(jpegNameForHeic('IMG_1001.HEIC'), 'IMG_1001.jpg');

const converter = await loadHeicConverter({
  urls: ['first', 'second'],
  importModule: async (url) => {
    if (url === 'first') throw new Error('first unavailable');
    return { heicTo: async () => new Blob(['jpeg'], { type: 'image/jpeg' }) };
  },
});
assert.equal(typeof converter, 'function');

const converted = await preparePhotoForWeb(namedBlob('portrait.heic', 'image/heic'), {
  converter: async ({ type, quality }) => {
    assert.equal(type, 'image/jpeg');
    assert.equal(quality, 0.94);
    return new Blob(['converted'], { type: 'image/jpeg' });
  },
  createFile: createTestFile,
});
assert.equal(converted.converted, true);
assert.equal(converted.name, 'portrait.jpg');
assert.equal(converted.blob.name, 'portrait.jpg');
assert.equal(converted.blob.type, 'image/jpeg');
assert.equal(converted.blob.lastModified, 12345);

let active = 0;
let maxActive = 0;
const batch = await prepareHeicPhotoFiles([
  namedBlob('one.heic', 'image/heic'),
  namedBlob('ordinary.png', 'image/png'),
  namedBlob('two.heif', ''),
], {
  converter: async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return new Blob(['jpeg'], { type: 'image/jpeg' });
  },
  createFile: createTestFile,
});
assert.equal(batch.converted, 2);
assert.equal(batch.failed.length, 0);
assert.equal(batch.files.length, 3);
assert.equal(batch.files[0].name, 'one.jpg');
assert.equal(batch.files[1].name, 'ordinary.png');
assert.equal(batch.files[2].name, 'two.jpg');
assert.equal(maxActive, 1, 'HEIC conversion must remain sequential on mobile');

const partial = await prepareHeicPhotoFiles([
  namedBlob('broken.heic', 'image/heic'),
  namedBlob('works.jpg', 'image/jpeg'),
], {
  converter: async () => { throw new Error('decode failed'); },
  createFile: createTestFile,
});
assert.equal(partial.files.length, 1);
assert.equal(partial.files[0].name, 'works.jpg');
assert.equal(partial.failed.length, 1);

console.log('heicSupport tests passed');
