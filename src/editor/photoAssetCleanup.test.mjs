import assert from 'node:assert/strict';
import {
  PHOTO_ASSET_CLEANUP_GRACE_MS,
  PHOTO_ASSET_CLEANUP_LAST_RUN_KEY,
  cleanupOrphanedPhotoAssets,
  collectProjectAssetIds,
  selectOrphanedPhotoAssets,
} from './photoAssetCleanup.js';
import { PHOTO_ASSET_SCHEMA } from './photoAssets.js';

class FakeStorage {
  constructor(entries = {}) {
    this.map = new Map(Object.entries(entries));
  }

  get length() {
    return this.map.size;
  }

  key(index) {
    return Array.from(this.map.keys())[index] ?? null;
  }

  getItem(key) {
    return this.map.has(String(key)) ? this.map.get(String(key)) : null;
  }

  setItem(key, value) {
    this.map.set(String(key), String(value));
  }
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-07-14T12:00:00.000Z');
const oldDate = new Date(NOW - PHOTO_ASSET_CLEANUP_GRACE_MS - DAY).toISOString();
const recentDate = new Date(NOW - PHOTO_ASSET_CLEANUP_GRACE_MS + DAY).toISOString();

{
  const ids = collectProjectAssetIds([
    {
      library: [
        { assetId: 'asset-library' },
        { assetId: ' asset-shared ' },
        { assetId: '' },
      ],
      pages: [{ frames: [
        { photo: { assetId: 'asset-frame' } },
        { photo: { assetId: 'asset-shared' } },
      ] }],
    },
    { pages: [{ frames: [{ photo: { assetId: 'asset-second-project' } }] }] },
    null,
  ]);

  assert.deepEqual(Array.from(ids).sort(), [
    'asset-frame',
    'asset-library',
    'asset-second-project',
    'asset-shared',
  ]);
}

{
  const records = [
    { id: 'active-old', schema: PHOTO_ASSET_SCHEMA, updatedAt: oldDate, size: 10 },
    { id: 'orphan-recent', schema: PHOTO_ASSET_SCHEMA, updatedAt: recentDate, size: 20 },
    { id: 'orphan-old-b', schema: PHOTO_ASSET_SCHEMA, updatedAt: oldDate, size: 30 },
    { id: 'orphan-old-a', schema: PHOTO_ASSET_SCHEMA, updatedAt: new Date(NOW - PHOTO_ASSET_CLEANUP_GRACE_MS - (2 * DAY)).toISOString(), size: 40 },
    { id: 'unknown-age', schema: PHOTO_ASSET_SCHEMA, updatedAt: '', size: 50 },
    { id: 'other-schema', schema: 'legacy', updatedAt: oldDate, size: 60 },
  ];
  const candidates = selectOrphanedPhotoAssets(records, new Set(['active-old']), {
    now: NOW,
    maxDelete: 1,
  });
  assert.deepEqual(candidates.map((record) => record.id), ['orphan-old-a']);
}

{
  const storage = new FakeStorage();
  const deleted = [];
  const result = await cleanupOrphanedPhotoAssets({
    now: NOW,
    force: true,
    storage,
    currentProject: {
      library: [{ assetId: 'active-current' }],
      pages: [{ frames: [{ photo: { assetId: 'active-frame-only' } }] }],
    },
    readStoredProjects: async () => [
      { library: [{ assetId: 'active-saved' }], pages: [] },
      { pages: [{ frames: [{ photo: { assetId: 'active-legacy' } }] }] },
    ],
    listAssets: async () => [
      { id: 'active-current', schema: PHOTO_ASSET_SCHEMA, updatedAt: oldDate, size: 10 },
      { id: 'active-frame-only', schema: PHOTO_ASSET_SCHEMA, updatedAt: oldDate, size: 20 },
      { id: 'active-saved', schema: PHOTO_ASSET_SCHEMA, updatedAt: oldDate, size: 30 },
      { id: 'active-legacy', schema: PHOTO_ASSET_SCHEMA, updatedAt: oldDate, size: 40 },
      { id: 'orphan-old', schema: PHOTO_ASSET_SCHEMA, updatedAt: oldDate, size: 50 },
      { id: 'orphan-recent', schema: PHOTO_ASSET_SCHEMA, updatedAt: recentDate, size: 60 },
    ],
    deleteAssets: async (ids) => deleted.push(...ids),
  });

  assert.deepEqual(deleted, ['orphan-old']);
  assert.equal(result.deletedCount, 1);
  assert.equal(result.deletedBytes, 50);
  assert.deepEqual(new Set(result.activeAssetIds), new Set([
    'active-current',
    'active-frame-only',
    'active-saved',
    'active-legacy',
  ]));
  assert.equal(storage.getItem(PHOTO_ASSET_CLEANUP_LAST_RUN_KEY), String(NOW));
}

{
  const storage = new FakeStorage({
    [PHOTO_ASSET_CLEANUP_LAST_RUN_KEY]: String(NOW - 1000),
  });
  let scanned = false;
  const result = await cleanupOrphanedPhotoAssets({
    now: NOW,
    storage,
    currentProject: { pages: [] },
    readStoredProjects: async () => {
      scanned = true;
      return [];
    },
  });
  assert.equal(result.skipped, 'throttled');
  assert.equal(scanned, false, 'daily throttle must avoid opening IndexedDB');
}

{
  const storage = new FakeStorage();
  let deleteCalled = false;
  await assert.rejects(
    cleanupOrphanedPhotoAssets({
      now: NOW,
      force: true,
      storage,
      currentProject: { pages: [] },
      readStoredProjects: async () => {
        throw new Error('project scan failed');
      },
      listAssets: async () => [{ id: 'orphan', schema: PHOTO_ASSET_SCHEMA, updatedAt: oldDate }],
      deleteAssets: async () => {
        deleteCalled = true;
      },
    }),
    /project scan failed/,
  );
  assert.equal(deleteCalled, false, 'cleanup must fail closed when project references cannot be read');
  assert.equal(storage.getItem(PHOTO_ASSET_CLEANUP_LAST_RUN_KEY), null, 'failed scans must not throttle the next safe retry');
}

{
  const result = await cleanupOrphanedPhotoAssets({
    now: NOW,
    force: true,
    storage: new FakeStorage(),
    currentProject: null,
    readStoredProjects: async () => [],
    listAssets: async () => {
      throw new Error('must not list assets without a trusted project snapshot');
    },
  });
  assert.equal(result.skipped, 'no-trusted-projects');
}

console.log('photo asset cleanup checks passed');
