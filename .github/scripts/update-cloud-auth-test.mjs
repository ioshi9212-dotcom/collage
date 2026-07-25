import { readFileSync, writeFileSync } from 'node:fs';

const path = 'public/cloud-auth.test.mjs';
let source = readFileSync(path, 'utf8');
const before = `assert.match(source, /typeof bridge\\.getPortableProject === 'function'/);
assert.match(source, /await bridge\\.getPortableProject\\(\\)/);`;
const after = `assert.match(source, /typeof bridge\\.getCloudProject === 'function'/);
assert.match(source, /await bridge\\.getCloudProject\\(\\)/);
assert.doesNotMatch(source, /typeof bridge\\.getPortableProject === 'function'/);`;
if (!source.includes(before)) throw new Error('Old portable-project assertions not found');
source = source.replace(before, after);
writeFileSync(path, source);
console.log('Updated cloud auth save contract test');
