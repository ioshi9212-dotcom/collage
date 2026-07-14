import assert from 'node:assert/strict';
import { createThumbnailLoader, thumbnailDimensions } from './photoThumbnails.js';

assert.deepEqual(thumbnailDimensions(4000, 2000, 320), { width: 320, height: 160 });
assert.deepEqual(thumbnailDimensions(120, 80, 320), { width: 120, height: 80 });
assert.throws(() => thumbnailDimensions(0, 100), /размер/);

function immediateEnvironment({ width = 4000, height = 2000 } = {}) {
  const canvases = [];
  let imageCount = 0;
  return {
    canvases,
    get imageCount() { return imageCount; },
    createImage() {
      imageCount += 1;
      return {
        naturalWidth: width,
        naturalHeight: height,
        onload: null,
        onerror: null,
        set src(value) {
          if (value) queueMicrotask(() => this.onload?.());
        },
      };
    },
    createCanvas() {
      const draws = [];
      const canvas = {
        width: 0,
        height: 0,
        draws,
        getContext() {
          return { drawImage: (...args) => draws.push(args) };
        },
        toDataURL(type, quality) {
          return `data:${type};quality=${quality};size=${this.width}x${this.height}`;
        },
      };
      canvases.push(canvas);
      return canvas;
    },
  };
}

{
  const env = immediateEnvironment();
  const loader = createThumbnailLoader({
    createImage: env.createImage,
    createCanvas: env.createCanvas,
    maxEntries: 2,
  });
  const first = await loader.load('photo-a');
  assert.match(first, /size=320x160/);
  assert.equal(env.canvases[0].draws.length, 1);
  assert.equal(env.imageCount, 1);
  assert.equal(await loader.load('photo-a'), first, 'cached thumbnail must be reused');
  assert.equal(env.imageCount, 1);
  await loader.load('photo-b');
  await loader.load('photo-a');
  await loader.load('photo-c');
  assert.deepEqual(loader.stats().keys, ['photo-a', 'photo-c'], 'least recently used thumbnail must be evicted');
}

{
  const images = [];
  const loader = createThumbnailLoader({
    maxConcurrent: 2,
    createImage() {
      const image = {
        naturalWidth: 1000,
        naturalHeight: 1000,
        onload: null,
        onerror: null,
        set src(value) { if (value) images.push(this); },
      };
      return image;
    },
    createCanvas() {
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage() {} }),
        toDataURL: () => 'data:image/webp;base64,thumb',
      };
    },
  });

  const one = loader.load('one');
  const duplicate = loader.load('one');
  const two = loader.load('two');
  const three = loader.load('three');
  assert.equal(one, duplicate, 'same in-flight source must share one promise');
  assert.equal(loader.stats().active, 2);
  assert.equal(loader.stats().queued, 1);
  assert.equal(images.length, 2);

  images[0].onload();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(images.length, 3, 'third decode starts only after a slot is released');
  images[1].onload();
  images[2].onload();
  await Promise.all([one, duplicate, two, three]);
  assert.equal(loader.stats().active, 0);
  assert.equal(loader.stats().pending, 0);
}

console.log('photo thumbnail checks passed');
