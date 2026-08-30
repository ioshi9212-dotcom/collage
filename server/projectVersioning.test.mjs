import assert from 'node:assert/strict';
import { getNextVersionTitle, getTitleBase, isSameFamily, parseTitleVersion } from './projectVersioning.js';

assert.deepEqual(parseTitleVersion('Фотоальбом'), { base: 'Фотоальбом', version: null });
assert.deepEqual(parseTitleVersion('Фотоальбом.2'), { base: 'Фотоальбом', version: 2 });
assert.equal(getTitleBase('Фотоальбом.7'), 'Фотоальбом');
assert.equal(isSameFamily('Фотоальбом', 'Фотоальбом.3'), true);
assert.equal(isSameFamily('Фотоальбом', 'Другой'), false);
assert.equal(getNextVersionTitle('Фотоальбом', []), 'Фотоальбом');
assert.equal(getNextVersionTitle('Фотоальбом', ['Фотоальбом']), 'Фотоальбом.2');
assert.equal(getNextVersionTitle('Фотоальбом.2', ['Фотоальбом', 'Фотоальбом.2']), 'Фотоальбом.3');
assert.equal(getNextVersionTitle('Фотоальбом', ['Фотоальбом', 'Фотоальбом.2', 'Фотоальбом.4']), 'Фотоальбом.5');
console.log('project versioning checks passed');
