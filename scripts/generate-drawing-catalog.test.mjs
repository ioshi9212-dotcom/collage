import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildDrawingCatalog } from './generate-drawing-catalog.mjs';

const payload = await buildDrawingCatalog();
assert.ok(payload.assets.length >= 5, 'existing built-in drawings should be discovered automatically');
assert.equal(new Set(payload.assets.map((asset) => asset.id)).size, payload.assets.length, 'drawing ids must be unique');
for (const asset of payload.assets) {
  assert.equal(asset.builtin, true);
  assert.match(asset.src, /^\/drawings\/.+\.(?:png|svg)$/i);
  assert.ok(asset.width > 0);
  assert.ok(asset.height > 0);
}

const saved = JSON.parse(await readFile(resolve('public/drawings/catalog.json'), 'utf8'));
assert.deepEqual(saved.assets, payload.assets);
console.log(`Automatic drawing catalog test passed: ${payload.assets.length} asset(s).`);
