import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  albumMaxSpread,
  albumSpreadForPage,
  albumSpreadPages,
  albumVisiblePageLabel,
} from './albumFlipModel.js';

assert.equal(albumMaxSpread(0), 0);
assert.equal(albumMaxSpread(1), 0);
assert.equal(albumMaxSpread(2), 1);
assert.equal(albumMaxSpread(112), 56);

assert.deepEqual(albumSpreadPages(0, 112), { spreadIndex: 0, left: null, right: 0 });
assert.deepEqual(albumSpreadPages(1, 112), { spreadIndex: 1, left: 1, right: 2 });
assert.deepEqual(albumSpreadPages(56, 112), { spreadIndex: 56, left: 111, right: null });
assert.equal(albumSpreadForPage(0, 112), 0);
assert.equal(albumSpreadForPage(1, 112), 1);
assert.equal(albumSpreadForPage(2, 112), 1);
assert.equal(albumSpreadForPage(111, 112), 56);
assert.equal(albumVisiblePageLabel(0, 112), 'Страница 1');
assert.equal(albumVisiblePageLabel(1, 112), 'Страницы 2–3');

const hostSource = readFileSync(resolve(process.cwd(), 'src/editor/AlbumFlipPreviewHost.jsx'), 'utf8');
assert.match(hostSource, /Листать альбом/);
assert.match(hostSource, /<AlbumFlipPreview/);
assert.match(hostSource, /window\.__collageApp\?\.getProject/);
assert.match(hostSource, /<PreviewPageNumber/);

const mainSource = readFileSync(resolve(process.cwd(), 'src/main.jsx'), 'utf8');
assert.match(mainSource, /album-flip-preview\.css/);
assert.match(mainSource, /<AlbumFlipPreviewHost\s*\/>/);

console.log('album flip preview checks passed');
