import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createImageLoader } from './imageCache.js';

function createFakeImages({ dimensions = {}, failOnce = [] } = {}) {
  const created = [];
  const attempts = new Map();
  const oneTimeFailures = new Set(failOnce);

  function createImage() {
    const image = {
      decoding: '',
      naturalWidth: 0,
      naturalHeight: 0,
      onload: null,
      onerror: null,
      _src: '',
      get src() {
        return this._src;
      },
      set src(value) {
        this._src = value;
        const attempt = (attempts.get(value) || 0) + 1;
        attempts.set(value, attempt);
        queueMicrotask(() => {
          if (oneTimeFailures.has(value) && attempt === 1) {
            this.onerror?.(new Error(`failed: ${value}`));
            return;
          }
          const [width, height] = dimensions[value] || [10, 10];
          this.naturalWidth = width;
          this.naturalHeight = height;
          this.onload?.();
        });
      },
    };
    created.push(image);
    return image;
  }

  return { createImage, created, attempts };
}

const concurrentFactory = createFakeImages();
const concurrent = createImageLoader({ createImage: concurrentFactory.createImage });
const firstPromise = concurrent.load('same');
const secondPromise = concurrent.load('same');
assert.strictEqual(firstPromise, secondPromise, 'parallel requests for one source must share a promise');
const [firstImage, secondImage] = await Promise.all([firstPromise, secondPromise]);
assert.strictEqual(firstImage, secondImage, 'parallel requests must resolve to one Image instance');
assert.equal(concurrentFactory.created.length, 1, 'one source must create one Image while loading');
assert.equal(concurrent.stats().pending, 0);

const lruFactory = createFakeImages();
const lru = createImageLoader({ maxEntries: 2, maxDecodedBytes: 1024 * 1024, createImage: lruFactory.createImage });
await lru.load('a');
const imageB = await lru.load('b');
await lru.load('a');
await lru.load('c');
assert.deepEqual(lru.stats().keys, ['a', 'c'], 'recent access must protect an entry from LRU eviction');
assert.equal(lru.has('b'), false);
assert.equal(imageB.src, 'b', 'eviction must not blank an image that may still be mounted');

const byteFactory = createFakeImages({ dimensions: { x: [4, 4], y: [4, 4], huge: [10, 10], tiny: [1, 1] } });
const bytes = createImageLoader({ maxEntries: 10, maxDecodedBytes: 100, createImage: byteFactory.createImage });
await bytes.load('x');
await bytes.load('y');
assert.deepEqual(bytes.stats().keys, ['y'], 'decoded-byte budget must evict the oldest image');
assert.equal(bytes.stats().decodedBytes, 64);
await bytes.load('huge');
assert.equal(bytes.has('huge'), true, 'an oversized newest image must remain usable by itself');
await bytes.load('tiny');
assert.deepEqual(bytes.stats().keys, ['tiny'], 'a newer small image may replace an oversized cached image');

const retryFactory = createFakeImages({ failOnce: ['retry'] });
const retry = createImageLoader({ createImage: retryFactory.createImage });
await assert.rejects(retry.load('retry'), /failed: retry/);
assert.equal(retry.stats().pending, 0, 'failed loads must leave the in-flight map');
const retriedImage = await retry.load('retry');
assert.equal(retriedImage.src, 'retry');
assert.equal(retryFactory.created.length, 2, 'a failed source must be retryable');

retry.clear();
assert.equal(retry.stats().size, 0);
assert.equal(retry.stats().decodedBytes, 0);

const appSource = readFileSync(resolve(process.cwd(), 'src/AppLive.jsx'), 'utf8');
assert.match(appSource, /import \{ loadCachedImage as loadImage \} from '\.\/editor\/imageCache';/);
assert.doesNotMatch(appSource, /const imageCache = new Map\(\)/, 'unbounded cache must be removed from AppLive');
assert.doesNotMatch(appSource, /function loadImage\(src\)/, 'AppLive must use the tested loader module');

console.log('bounded image cache checks passed');
// final CI trigger
