import assert from 'node:assert/strict';
import {
  PHOTO_ASSET_SCHEMA,
  MissingPhotoAssetError,
  createLocalPhotoProject,
  createPortablePhotoProject,
  dataUrlToBlob,
  hydratePhotoProject,
  persistPhotoFiles,
  releaseUnusedPhotoRuntimeUrls,
} from './photoAssets.js';

const tinyDataUrl = 'data:image/png;base64,aGVsbG8=';
assert.equal(await dataUrlToBlob(tinyDataUrl).text(), 'hello');

{
  const records = new Map();
  const urls = new Map();
  const prepared = {
    library: [{ id: 'photo-1', name: 'Первое', src: tinyDataUrl }],
    pages: [{ id: 'page-1', frames: [{ id: 'frame-1', photo: { id: 'photo-1', name: 'Первое' } }] }],
  };
  const runtime = await hydratePhotoProject(prepared, {
    idFactory: () => 'generated',
    putAsset: async (record) => records.set(record.id, record),
    getAsset: async (id) => records.get(id),
    runtimeUrlCache: urls,
    createObjectURL: () => 'blob:runtime-1',
  });
  assert.equal(records.size, 1);
  assert.equal(runtime.library[0].assetId, 'asset-photo-1');
  assert.equal(runtime.library[0].assetSchema, PHOTO_ASSET_SCHEMA);
  assert.equal(runtime.library[0].src, 'blob:runtime-1');
  assert.equal(runtime.pages[0].frames[0].photo.src, 'blob:runtime-1');
  assert.equal(runtime.pages[0].frames[0].photo.assetId, 'asset-photo-1');

  const local = createLocalPhotoProject(runtime);
  assert.equal(local.library[0].src, undefined);
  assert.equal(local.photoAssetSchema, PHOTO_ASSET_SCHEMA);
  const portable = await createPortablePhotoProject(runtime, {
    getAsset: async (id) => records.get(id),
    createFileReader: () => null,
  });
  assert.equal(portable.library[0].src, tinyDataUrl);
}

{
  const fallback = createLocalPhotoProject({
    library: [{ id: 'legacy', name: 'Legacy', src: tinyDataUrl }],
    pages: [],
  });
  assert.equal(fallback.library[0].src, tinyDataUrl, 'data URL must survive when IndexedDB persistence was unavailable');
}

{
  const active = { count: 0, max: 0 };
  const urls = new Map();
  let serial = 0;
  const files = Array.from({ length: 6 }, (_, index) => new Blob([`file-${index}`], { type: 'image/png' }));
  files.forEach((file, index) => Object.defineProperty(file, 'name', { value: `file-${index}.png` }));
  const result = await persistPhotoFiles(files, {
    maxConcurrent: 2,
    idFactory: () => `id-${serial += 1}`,
    runtimeUrlCache: urls,
    createObjectURL: () => `blob:${serial}`,
    putAsset: async () => {
      active.count += 1;
      active.max = Math.max(active.max, active.count);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active.count -= 1;
    },
  });
  assert.equal(result.loaded.length, 6);
  assert.equal(result.failed.length, 0);
  assert.ok(active.max <= 2, `expected at most 2 concurrent writes, got ${active.max}`);
  assert.ok(result.loaded.every((photo) => photo.assetId && photo.src.startsWith('blob:')));
}

{
  const file = new Blob(['fallback'], { type: 'image/jpeg' });
  Object.defineProperty(file, 'name', { value: 'fallback.jpg' });
  const result = await persistPhotoFiles([file], {
    idFactory: () => 'fallback-id',
    putAsset: async () => { throw new Error('quota'); },
    createFileReader: () => null,
  });
  assert.equal(result.loaded.length, 1);
  assert.equal(result.loaded[0].assetId, undefined);
  assert.match(result.loaded[0].src, /^data:image\/jpeg;base64,/);
  assert.equal(result.loaded[0].persistenceFallback, true);
}

{
  await assert.rejects(
    createPortablePhotoProject({ library: [{ id: 'missing', assetId: 'asset-missing', name: 'Пропавшее' }], pages: [] }, {
      getAsset: async () => null,
    }),
    (error) => error instanceof MissingPhotoAssetError && error.code === 'missing_photo_asset',
  );
}

{
  const cache = new Map([['keep', 'blob:keep'], ['remove', 'blob:remove']]);
  const revoked = [];
  releaseUnusedPhotoRuntimeUrls(['keep'], { runtimeUrlCache: cache, revokeObjectURL: (url) => revoked.push(url) });
  assert.deepEqual([...cache.keys()], ['keep']);
  assert.deepEqual(revoked, ['blob:remove']);
}

console.log('photo asset persistence checks passed');
