import assert from 'node:assert/strict';
import { readPhotoFilesAsDataUrls } from './photoImportQueue.js';

const pending = [];
let active = 0;
let maxActive = 0;
function createFileReader() {
  return {
    result: null,
    error: null,
    onload: null,
    onerror: null,
    onabort: null,
    readAsDataURL(file) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      pending.push({ reader: this, file });
    },
  };
}

const files = [
  { name: 'one.jpg' },
  { name: 'two.jpg' },
  { name: 'three.jpg' },
  { name: 'broken.jpg' },
];
const promise = readPhotoFilesAsDataUrls(files, { maxConcurrent: 2, createFileReader });
assert.equal(pending.length, 2);
assert.equal(maxActive, 2);

function finishNext({ fail = false } = {}) {
  const item = pending.shift();
  active -= 1;
  if (fail) {
    item.reader.error = new Error('broken');
    item.reader.onerror();
  } else {
    item.reader.result = `data:image/jpeg;base64,${item.file.name}`;
    item.reader.onload();
  }
}

finishNext();
await Promise.resolve();
await Promise.resolve();
assert.equal(pending.length, 2, 'next file should start after one reader completes');
finishNext();
await Promise.resolve();
await Promise.resolve();
finishNext();
await Promise.resolve();
await Promise.resolve();
finishNext({ fail: true });

const result = await promise;
assert.equal(maxActive, 2, 'reader concurrency must stay bounded');
assert.deepEqual(result.loaded.map((item) => item.file.name), ['one.jpg', 'two.jpg', 'three.jpg']);
assert.equal(result.failed.length, 1);
assert.equal(result.failed[0].file.name, 'broken.jpg');

console.log('photo import queue checks passed');
