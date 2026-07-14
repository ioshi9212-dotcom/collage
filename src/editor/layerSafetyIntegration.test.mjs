import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = readFileSync(resolve(process.cwd(), 'src/AppLive.jsx'), 'utf8');
const packageSource = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));

assert.match(appSource, /sanitizeExtraLayers/, 'AppLive must sanitize external and stored extra layers');
assert.match(appSource, /normalizeExtraLayers:\s*sanitizeExtraLayers/, 'project loading must use the strict layer sanitizer');
assert.match(appSource, /sanitizeTemplateRecords\(parsed\)/, 'stored templates must be sanitized before entering React state');
assert.match(appSource, /templateJsonFileError\(file\)/, 'template JSON must be size-checked before FileReader');
assert.match(appSource, /sanitizeTemplateRecord\(\{[\s\S]*?createdAt:/, 'newly saved templates must pass through the shared sanitizer');
assert.equal(packageSource.scripts.lint, 'eslint . --max-warnings=0', 'lint warnings must fail CI');

console.log('layer safety integration checks passed');
