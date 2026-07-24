import assert from 'node:assert/strict';
import {
  convertHeicWithFallback,
  isHeicFileLike,
  jpegNameForUpload,
  prepareLocalPhotoFiles,
} from './localHeicUploadBridge.js';

assert.equal(isHeicFileLike({ name: 'IMG_1001.HEIC', type: '' }), true);
assert.equal(isHeicFileLike({ name: 'IMG_1002', type: 'image/heif' }), true);
assert.equal(isHeicFileLike({ name: 'photo.jpg', type: 'image/jpeg' }), false);
assert.equal(jpegNameForUpload('IMG_1001.HEIC'), 'IMG_1001.jpg');
assert.equal(jpegNameForUpload('portrait.heif'), 'portrait.jpg');

{
  const ordinary = new File([new Uint8Array([1, 2, 3])], 'same.jpg', { type: 'image/jpeg' });
  const result = await prepareLocalPhotoFiles([ordinary]);
  assert.equal(result.files[0].sourceName, 'same.jpg');
  assert.equal(result.files[0].sourceSize, 3);
}

{
  const heic = new File([new Uint8Array([1, 2, 3, 4])], 'iphone.HEIC', { type: 'image/heic' });
  let fallbackCalled = 0;
  let browserCalled = 0;
  const jpeg = await convertHeicWithFallback(heic, {
    fetchImpl: async () => new Response(JSON.stringify({
      message: 'Support for this compression format has not been built in',
    }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    }),
    loadBrowserConverter: async () => ({
      heicTo: async ({ blob, type, quality }) => {
        browserCalled += 1;
        assert.equal(blob, heic);
        assert.equal(type, 'image/jpeg');
        assert.equal(quality, 0.92);
        return new Blob([new Uint8Array([9, 8, 7])], { type: 'image/jpeg' });
      },
    }),
    onFallback: ({ serverError }) => {
      fallbackCalled += 1;
      assert.match(serverError.message, /compression format/);
    },
  });

  assert.equal(fallbackCalled, 1);
  assert.equal(browserCalled, 1);
  assert.equal(jpeg.name, 'iphone.jpg');
  assert.equal(jpeg.type, 'image/jpeg');
  assert.equal(jpeg.size, 3);
}

{
  const heic = new File([new Uint8Array([5, 6])], 'server.HEIC', { type: 'image/heic' });
  let browserCalled = 0;
  const jpeg = await convertHeicWithFallback(heic, {
    fetchImpl: async () => new Response(new Blob([new Uint8Array([1, 1])], { type: 'image/jpeg' }), {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg' },
    }),
    loadBrowserConverter: async () => {
      browserCalled += 1;
      return { heicTo: async () => new Blob() };
    },
  });
  assert.equal(browserCalled, 0);
  assert.equal(jpeg.name, 'server.jpg');
}

console.log('local HEIC upload bridge tests passed');
