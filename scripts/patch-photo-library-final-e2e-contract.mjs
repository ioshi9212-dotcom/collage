import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'e2e/photo-duplicate-upload.spec.js';
let source = readFileSync(path, 'utf8');
const before = "  await expect(page.locator('.editor-left-panel-v2')).toContainText('В списке: 2');";
const after = "  await expect(page.getByRole('tab', { name: /Не использованы/ })).toContainText('2');";
assert.ok(source.includes(before), 'old duplicate upload panel counter expectation not found');
source = source.replace(before, after);
writeFileSync(path, source);
console.log('Final photo panel browser contract updated');
