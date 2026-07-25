import assert from 'node:assert/strict';
import {
  PhotoAssetQuotaError,
  assertPhotoAssetQuota,
  createPostgresPhotoAssetStore,
  extractCloudPhotoAssets,
  extractCloudPhotoKeys,
  getPhotoAssetLimits,
} from './photoAssetStore.js';

const limits = getPhotoAssetLimits({
  MAX_USER_PHOTO_STORAGE_BYTES: '1000',
  MAX_PHOTO_ASSETS_PER_USER: '2',
});
assert.deepEqual(limits, { maxStorageBytes: 1000, maxAssets: 2 });

assert.deepEqual(
  assertPhotoAssetQuota({
    assetCount: 1,
    storageBytes: 400,
    newAssetBytes: 500,
    limits,
  }),
  { assetCount: 2, storageBytes: 900 },
);

assert.throws(
  () => assertPhotoAssetQuota({
    assetCount: 2,
    storageBytes: 400,
    newAssetBytes: 10,
    limits,
  }),
  (error) => error instanceof PhotoAssetQuotaError && error.code === 'photo_asset_limit_reached',
);

assert.throws(
  () => assertPhotoAssetQuota({
    assetCount: 1,
    storageBytes: 900,
    newAssetBytes: 101,
    limits,
  }),
  (error) => error instanceof PhotoAssetQuotaError && error.code === 'photo_storage_quota_exceeded',
);

const repeated = { cloudKey: 'users/7/photos/one/original.jpg' };
const project = {
  library: [
    repeated,
    { cloudKey: '/users/7/photos/two/original.png' },
    { cloudKey: 'users/8/photos/not-owned/original.jpg' },
  ],
  pages: [{ frames: [{ photo: repeated }] }],
};
assert.deepEqual(
  extractCloudPhotoKeys(project, 7).sort(),
  [
    'users/7/photos/one/original.jpg',
    'users/7/photos/two/original.png',
  ],
);
assert.deepEqual(
  extractCloudPhotoAssets(project, 7).find((asset) => asset.key.includes('/one/')),
  {
    key: 'users/7/photos/one/original.jpg',
    name: 'Фото',
    type: 'application/octet-stream',
    size: 0,
  },
);

class FakePool {
  constructor(usage = { asset_count: 1, storage_bytes: 400 }) {
    this.usage = usage;
    this.logs = [];
    this.released = 0;
  }

  async connect() {
    const pool = this;
    return {
      async query(sql, params = []) {
        const normalized = String(sql).replace(/\s+/g, ' ').trim();
        pool.logs.push({ sql: normalized, params });
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(normalized)) return { rows: [] };
        if (normalized.startsWith('SELECT id FROM users')) return { rows: [{ id: params[0] }] };
        if (normalized.startsWith('SELECT COUNT(*)::integer AS asset_count')) {
          return { rows: [pool.usage] };
        }
        if (normalized.startsWith('INSERT INTO photo_assets')) return { rows: [] };
        throw new Error(`Unexpected transaction query: ${normalized}`);
      },
      release() {
        pool.released += 1;
      },
    };
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    this.logs.push({ sql: normalized, params });
    return { rows: [] };
  }
}

const fakePool = new FakePool();
const store = createPostgresPhotoAssetStore({ pool: fakePool, limits });
const reserved = await store.reserve({
  id: 'asset-id',
  userId: 7,
  key: 'users/7/photos/asset-id/original.jpg',
  name: 'Фото.jpg',
  type: 'image/jpeg',
  size: 500,
});
assert.deepEqual(reserved, {
  assetCount: 2,
  storageBytes: 900,
  maxStorageBytes: 1000,
  maxAssets: 2,
});
assert.equal(fakePool.logs[0].sql, 'BEGIN');
assert.equal(fakePool.logs.at(-1).sql, 'COMMIT');
assert.equal(fakePool.released, 1);

await store.markReady({ id: 'asset-id', userId: 7 });
assert.match(fakePool.logs.at(-1).sql, /SET status = 'ready'/);

await store.registerLegacy({
  userId: 7,
  key: 'users/7/photos/legacy/original.jpg',
  name: 'Фото',
  type: 'image/jpeg',
  size: 123,
});
assert.match(fakePool.logs.at(-1).sql, /GREATEST\(photo_assets\.size_bytes, EXCLUDED\.size_bytes\)/);
assert.match(fakePool.logs.at(-1).sql, /photo_assets\.user_id = EXCLUDED\.user_id/);

console.log('photoAssetStore tests passed');
