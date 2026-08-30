import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { BUILTIN_DRAWING_ASSETS, loadDrawingCatalog } from './drawingCatalog.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

assert.equal(BUILTIN_DRAWING_ASSETS.length, 11);
assert.equal(new Set(BUILTIN_DRAWING_ASSETS.map((asset) => asset.id)).size, 11);

for (const asset of BUILTIN_DRAWING_ASSETS) {
  assert.equal(asset.builtin, true);
  assert.match(asset.id, /^builtin-/);
  assert.match(asset.src, /^\/drawings\/.+\.png$/);
  const path = resolve(root, 'public', asset.src.replace(/^\//, ''));
  assert.equal(existsSync(path), true, `${asset.src} must exist`);
  assert.deepEqual([...readFileSync(path).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${asset.src} must be PNG`);
}

const offline = await loadDrawingCatalog(async () => {
  throw new Error('offline');
});
assert.equal(offline.length, BUILTIN_DRAWING_ASSETS.length);
assert.deepEqual(offline.map((asset) => asset.id), BUILTIN_DRAWING_ASSETS.map((asset) => asset.id));

const remote = await loadDrawingCatalog(async () => ({
  ok: true,
  json: async () => ({ assets: [{ id: 'remote-1', name: 'Мой PNG', src: '/api/drawing-assets/1', width: 50, height: 60 }] }),
}));
assert.equal(remote.length, BUILTIN_DRAWING_ASSETS.length + 1);
assert.equal(remote.at(-1).id, 'remote-1');

console.log('Built-in drawing catalog tests passed.');
