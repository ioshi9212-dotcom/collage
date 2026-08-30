import assert from 'node:assert/strict';
import { parseHexColor } from './drawingColorization.js';
assert.deepEqual(parseHexColor('#abc'), [170,187,204]);
assert.deepEqual(parseHexColor('#102030'), [16,32,48]);
assert.deepEqual(parseHexColor('broken'), [0,0,0]);
console.log('drawing colorization checks passed');
