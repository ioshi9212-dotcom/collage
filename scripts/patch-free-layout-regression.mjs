import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/editor/layout.js';
let source = readFileSync(path, 'utf8');
const before = `    && previousFrames.length === requestedFrameCount
    && previousPadding !== padding;`;
const after = `    && previousFrames.length === requestedFrameCount
    && previousPadding !== null
    && previousPadding !== padding;`;
if (!source.includes(before)) throw new Error('Free layout padding condition not found');
source = source.replace(before, after);
writeFileSync(path, source);
console.log('Legacy free layout padding regression patched');
