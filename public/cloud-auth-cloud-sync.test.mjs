import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./cloud-auth.js', import.meta.url), 'utf8');
assert.match(source, /typeof bridge\.getCloudProject === 'function'/, 'account save must request a bucket-backed project');
assert.doesNotMatch(source, /typeof bridge\.getPortableProject === 'function'/, 'account save must not build a Base64 portable project');
assert.match(source, /фотографии — отдельно в защищённое хранилище/);

console.log('cloud auth bucket save checks passed');
