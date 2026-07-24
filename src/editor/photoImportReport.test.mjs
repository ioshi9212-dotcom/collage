import assert from 'node:assert/strict';
import { buildPhotoImportReport } from './photoImportReport.js';

const duplicate = { name: 'same.jpg', size: 1000 };
const tooLarge = { name: 'large.jpg', size: 30 * 1024 * 1024 };
const badHeic = { name: 'broken.HEIC', size: 2000 };
const storageFailure = { name: 'quota.jpg', size: 3000 };

const report = buildPhotoImportReport({
  selectedFiles: [duplicate, tooLarge, badHeic, storageFailure, { name: 'ok.jpg', size: 500 }],
  added: 1,
  duplicates: [duplicate],
  initialSelection: { rejectedSizeFiles: [tooLarge] },
  prepared: { converted: 0, failed: [{ file: badHeic, error: new Error('HEIC не читается') }] },
  storageFailures: [{ file: storageFailure, error: new Error('Недостаточно места') }],
});

assert.equal(report.selected, 5);
assert.equal(report.added, 1);
assert.equal(report.notAdded, 4);
assert.equal(report.duplicates, 1);
assert.equal(report.failed, 3);
assert.equal(report.issues.length, 4);
assert.deepEqual(report.issues.map((item) => item.name), ['same.jpg', 'large.jpg', 'broken.HEIC', 'quota.jpg']);
assert.match(report.issues[2].reason, /HEIC не читается/);
assert.match(report.issues[3].reason, /Недостаточно места/);

console.log('photo import report checks passed');
