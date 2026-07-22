import assert from 'node:assert/strict';
import { isHeicFileLike, jpegNameForUpload } from './localHeicUploadBridge.js';

assert.equal(isHeicFileLike({ name: 'IMG_1001.HEIC', type: '' }), true);
assert.equal(isHeicFileLike({ name: 'IMG_1002', type: 'image/heif' }), true);
assert.equal(isHeicFileLike({ name: 'photo.jpg', type: 'image/jpeg' }), false);
assert.equal(jpegNameForUpload('IMG_1001.HEIC'), 'IMG_1001.jpg');
assert.equal(jpegNameForUpload('portrait.heif'), 'portrait.jpg');

console.log('local HEIC upload bridge tests passed');
