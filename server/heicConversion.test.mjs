import assert from 'node:assert/strict';
import {
  convertHeicBuffer,
  isHeicUpload,
  jpegNameForHeicUpload,
} from './heicConversion.js';

assert.equal(isHeicUpload({ name: 'IMG_1001.HEIC', type: '' }), true);
assert.equal(isHeicUpload({ name: 'IMG_1002', type: 'image/heif' }), true);
assert.equal(isHeicUpload({ name: 'photo.jpg', type: 'image/jpeg' }), false);
assert.equal(jpegNameForHeicUpload('IMG_1001.HEIC'), 'IMG_1001.jpg');

const calls = [];
const fakeSharp = (input, options) => {
  calls.push(['create', Buffer.from(input).length, options]);
  return {
    rotate() {
      calls.push(['rotate']);
      return this;
    },
    jpeg(jpegOptions) {
      calls.push(['jpeg', jpegOptions]);
      return this;
    },
    async toBuffer() {
      calls.push(['toBuffer']);
      return Buffer.from('jpeg-result');
    },
  };
};

const output = await convertHeicBuffer(Buffer.from('heic-input'), { sharpImpl: fakeSharp, quality: 94 });
assert.equal(output.toString(), 'jpeg-result');
assert.equal(calls[0][0], 'create');
assert.equal(calls[1][0], 'rotate');
assert.equal(calls[2][0], 'jpeg');
assert.equal(calls[2][1].quality, 94);
assert.equal(calls[2][1].chromaSubsampling, '4:2:0');
assert.equal(calls[2][1].optimiseScans, true);
assert.equal(calls[3][0], 'toBuffer');

console.log('HEIC conversion server tests passed');
