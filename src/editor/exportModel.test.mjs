import assert from 'node:assert/strict';
import { buildBookletExportSummary, bookletSideFilename, canExportBooklet } from './exportModel.js';

assert.equal(bookletSideFilename(null), 'booklet-side.png');
assert.equal(bookletSideFilename({ blockNumber: 1, sheetNumber: 2, side: 'front' }), 'booklet-block-01-sheet-02-front.png');
assert.equal(canExportBooklet({ sides: [{}] }), true);
assert.equal(canExportBooklet({ sides: [] }), false);
assert.deepEqual(buildBookletExportSummary({ pageCount: 12, blockCount: 3, sides: [{}, {}], blankPageCount: 1 }, 2), { pages: 12, blocks: 3, sheets: 6, sides: 2, blanks: 1 });

console.log('export model tests passed');
