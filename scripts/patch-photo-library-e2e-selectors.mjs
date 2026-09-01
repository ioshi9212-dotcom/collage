import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const files = [
  'e2e/helpers.mjs',
  'e2e/local-heic-upload.spec.js',
  'e2e/photo-import-report.spec.js',
  'e2e/photo-upload-progress.spec.js',
  'e2e/photo-duplicate-upload.spec.js',
];

const before = '.upload-box input[type="file"][accept="image/*"]';
const after = '.photo-panel-actions-v3 input[type="file"][accept="image/*"]';
let replacements = 0;

for (const path of files) {
  const source = readFileSync(path, 'utf8');
  assert.ok(source.includes(before), `${path}: old photo upload selector not found`);
  const next = source.split(before).join(after);
  replacements += source.split(before).length - 1;
  writeFileSync(path, next);
}

assert.ok(replacements >= files.length, 'expected all old photo upload selectors to be replaced');
console.log(`Updated ${replacements} photo upload selector(s)`);
