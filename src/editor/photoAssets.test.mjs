import assert from 'node:assert/strict';
import './photoRecovery.test.mjs';
import {
  PHOTO_ASSET_SCHEMA,
  MissingPhotoAssetError,
  MissingFramePhotoLinksError,
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
  const cloudKey = 'users/7/photos/recovered/original.jpg';
  const runtime = await hydratePhotoProject({
    library: [{
      id: 'cloud-photo',
      name: 'Cloud',
      cloudKey,
      cloudSchema: 'railway-bucket-v1',
    }],
    pages: [{
      id: 'cloud-page',
      frames: [{
        id: 'cloud-frame',
        photo: { id: 'cloud-photo', name: 'Cloud', cloudKey },
      }],
    }],
  });
  const expectedUrl = `/api/photo-assets/file?key=${encodeURIComponent(cloudKey)}`;
  assert.equal(runtime.library[0].src, expectedUrl, 'cloud metadata must restore a missing library source');
  assert.equal(runtime.pages[0].frames[0].photo.src, expectedUrl, 'cloud metadata must restore the photo inside a frame');
}

{
  const cloudKey = 'users/7/photos/frame-only/original.jpg';
  const runtime = await hydratePhotoProject({
    library: [],
    pages: [{
      id: 'frame-only-cloud-page',
      frames: [{
        id: 'frame-only-cloud-frame',
        photo: { id: 'frame-only-cloud-photo', name: 'Frame Cloud', cloudKey },
      }],
    }],
  });
  assert.equal(runtime.library.length, 0);
  assert.equal(
    runtime.pages[0].frames[0].photo.src,
    `/api/photo-assets/file?key=${encodeURIComponent(cloudKey)}`,
    'a frame must recover directly from its own cloud metadata',
  );
}

{
  const records = new Map([
    ['asset-kept', { id: 'asset-kept', blob: new Blob(['kept'], { type: 'image/jpeg' }) }],
  ]);
  const runtime = await hydratePhotoProject({
    library: [{
      id: 'new-library-id',
      assetId: 'asset-kept',
      name: 'family.jpg',
      size: 4,
    }],
    pages: [{
      id: 'relinked-page',
      frames: [{
        id: 'relinked-frame',
        photo: {
          id: 'stale-frame-id',
          assetId: 'asset-kept',
          name: 'family.jpg',
          size: 4,
          zoom: 1.6,
        },
      }],
    }],
  }, {
    getAsset: async (id) => records.get(id),
    runtimeUrlCache: new Map(),
    createObjectURL: () => 'blob:relinked',
  });
  assert.equal(runtime.pages[0].frames[0].photo.id, 'new-library-id');
  assert.equal(runtime.pages[0].frames[0].photo.src, 'blob:relinked');
  assert.equal(runtime.pages[0].frames[0].photo.zoom, 1.6);
  assert.equal(runtime.recoveredFramePhotoCount, 1);
  assert.equal(runtime.missingFramePhotoCount, 0);
}

{
  const records = new Map([
    ['asset-working', { id: 'asset-working', blob: new Blob(['kept'], { type: 'image/jpeg' }) }],
  ]);
  const runtime = await hydratePhotoProject({
    library: [
      {
        id: 'stale-library-id',
        assetId: 'asset-missing',
        name: '2025-07-21 18.45.35.JPG',
        size: 4,
      },
      {
        id: 'working-library-id',
        assetId: 'asset-working',
        name: '2025-07-21 18.45.35.JPG',
        size: 4,
      },
    ],
    pages: [{
      id: 'duplicate-recovery-page',
      frames: [{
        id: 'duplicate-recovery-frame',
        photo: {
          id: 'stale-library-id',
          assetId: 'asset-missing',
          name: '2025-07-21 18.45.35.JPG',
          size: 4,
          zoom: 1.35,
        },
      }],
    }],
  }, {
    getAsset: async (id) => records.get(id),
    runtimeUrlCache: new Map(),
    createObjectURL: () => 'blob:working-duplicate',
  });
  assert.equal(runtime.pages[0].frames[0].photo.id, 'working-library-id');
  assert.equal(runtime.pages[0].frames[0].photo.assetId, 'asset-working');
  assert.equal(runtime.pages[0].frames[0].photo.src, 'blob:working-duplicate');
  assert.equal(runtime.pages[0].frames[0].photo.zoom, 1.35);
  assert.equal(runtime.recoveredFramePhotoCount, 1);
  assert.equal(runtime.missingFramePhotoCount, 0);
}

{
  await assert.rejects(
    hydratePhotoProject({
      library: [{ id: 'available', name: 'available.jpg', src: tinyDataUrl }],
      pages: [{
        id: 'broken-page',
        frames: [{ id: 'broken-frame', photo: { id: 'missing', name: 'missing.jpg' } }],
      }],
    }, {
      putAsset: async () => {},
      runtimeUrlCache: new Map(),
      createObjectURL: () => 'blob:available',
    }),
    (error) => error instanceof MissingFramePhotoLinksError && error.code === 'missing_frame_photo_links',
  );
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
