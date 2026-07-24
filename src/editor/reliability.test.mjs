import assert from 'node:assert/strict';
import {
  MAX_LIBRARY_PHOTOS,
  MAX_PHOTO_FILE_BYTES,
  MAX_PHOTO_UPLOAD_BATCH,
  MAX_PROJECT_JSON_BYTES,
  createPreparedProjectSnapshot,
  describeSaveResult,
  filterDuplicatePhotoUploads,
  photoUploadIdentity,
  projectJsonFileError,
  selectPhotoUploads,
} from './reliability.js';

function file(name, type, size) {
  return { name, type, size };
}

{
  const selected = selectPhotoUploads([
    file('good.jpg', 'image/jpeg', 1000),
    file('large.png', 'image/png', MAX_PHOTO_FILE_BYTES + 1),
    file('notes.txt', 'text/plain', 10),
  ], 0);
  assert.deepEqual(selected.accepted.map((item) => item.name), ['good.jpg']);
  assert.equal(selected.rejectedType, 1);
  assert.equal(selected.rejectedSize, 1);
  assert.equal(selected.rejectedLimit, 0);
}

{
  const many = Array.from({ length: MAX_PHOTO_UPLOAD_BATCH + 20 }, (_, index) => file(`photo-${index}.jpg`, 'image/jpeg', 1000));
  const selected = selectPhotoUploads(many, 0);
  assert.equal(selected.accepted.length, MAX_PHOTO_UPLOAD_BATCH);
  assert.equal(selected.rejectedLimit, 20);
}

{
  const selected = selectPhotoUploads([
    file('one.jpg', 'image/jpeg', 1000),
    file('two.jpg', 'image/jpeg', 1000),
  ], MAX_LIBRARY_PHOTOS - 1);
  assert.equal(selected.accepted.length, 1);
  assert.equal(selected.rejectedLimit, 1);
}


{
  const existing = [{ name: 'family.jpg', size: 1200 }];
  const filtered = filterDuplicatePhotoUploads([
    file('family.jpg', 'image/jpeg', 1200),
    file('family.jpg', 'image/jpeg', 1400),
    file('new.jpg', 'image/jpeg', 900),
    file('new.jpg', 'image/jpeg', 900),
  ], existing);
  assert.deepEqual(filtered.accepted.map((item) => [item.name, item.size]), [
    ['family.jpg', 1400],
    ['new.jpg', 900],
  ]);
  assert.equal(filtered.duplicates.length, 2, 'same name and same size must be skipped, including repeats within one selection');
}

assert.equal(
  photoUploadIdentity({ name: 'IMG_1001.jpg', size: 5000, sourceName: 'IMG_1001.HEIC', sourceSize: 3200 }),
  photoUploadIdentity({ name: 'IMG_1001.HEIC', size: 3200 }),
  'converted HEIC must retain the original identity for duplicate detection',
);

assert.deepEqual(
  describeSaveResult({ cloud: { id: 'project' }, local: { ok: false }, indexedDb: { ok: false } }),
  { ok: true, message: 'Альбом сохранён в аккаунт', target: 'cloud' },
);
assert.deepEqual(
  describeSaveResult({ cloudError: new Error('offline'), local: { ok: false }, indexedDb: { ok: true } }),
  { ok: true, message: 'Сохранено в браузере. Облако недоступно', target: 'browser' },
);
assert.equal(describeSaveResult({ local: { ok: false }, indexedDb: { ok: false }, cloudError: new Error('offline') }).ok, false);

assert.equal(projectJsonFileError(file('project.json', 'application/json', MAX_PROJECT_JSON_BYTES)), '');
assert.match(projectJsonFileError(file('huge.json', 'application/json', MAX_PROJECT_JSON_BYTES + 1)), /60 МБ/);

{
  const source = 'data:image/jpeg;base64,AAA';
  const prepared = {
    canvas: { width: 1000, height: 1400 },
    settings: { frameMode: 'free' },
    library: [{ id: 'photo', name: 'photo.jpg', src: source }],
    pages: [{ id: 'page', frames: [{ id: 'frame', photo: { id: 'photo', name: 'photo.jpg', src: source, zoom: 1 } }] }],
    currentPageId: 'page',
    viewMode: 'single',
    bookletSheetsPerBlock: 2,
    bookletPrintSettings: { showFoldLine: false },
    extraLayers: { version: 1, pages: {} },
    albumEditorMode: 'collage',
  };
  const snapshot = createPreparedProjectSnapshot(prepared, '2026-07-14T00:00:00.000Z');
  assert.equal(snapshot.pages[0].frames[0].photo.src, undefined, 'prepared snapshots must not duplicate embedded photo data');
  assert.equal(snapshot.library[0].src, source);
  assert.equal(snapshot.savedAt, '2026-07-14T00:00:00.000Z');
}

assert.throws(() => createPreparedProjectSnapshot({ pages: [] }), /не содержит страниц/);

console.log('editor reliability checks passed');
