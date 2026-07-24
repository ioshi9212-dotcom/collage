import assert from 'node:assert/strict';
import { isHeicFileLike, jpegNameForUpload, prepareLocalPhotoFiles } from './localHeicUploadBridge.js';

assert.equal(isHeicFileLike({ name: 'IMG_1001.HEIC', type: '' }), true);
assert.equal(isHeicFileLike({ name: 'IMG_1002', type: 'image/heif' }), true);
assert.equal(isHeicFileLike({ name: 'photo.jpg', type: 'image/jpeg' }), false);
assert.equal(jpegNameForUpload('IMG_1001.HEIC'), 'IMG_1001.jpg');
assert.equal(jpegNameForUpload('portrait.heif'), 'portrait.jpg');

console.log('local HEIC upload bridge tests passed');


{
  const ordinary = new File([new Uint8Array([1, 2, 3])], 'same.jpg', { type: 'image/jpeg' });
  const result = await prepareLocalPhotoFiles([ordinary]);
  assert.equal(result.files[0].sourceName, 'same.jpg');
  assert.equal(result.files[0].sourceSize, 3);
}
