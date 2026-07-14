import {
  PHOTO_ASSET_DB_NAME,
  PHOTO_ASSET_DB_VERSION,
  PHOTO_ASSET_SCHEMA,
  PHOTO_ASSET_STORE_NAME,
} from './photoAssets.js';

export const PHOTO_ASSET_CLEANUP_GRACE_MS = 14 * 24 * 60 * 60 * 1000;
export const PHOTO_ASSET_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const PHOTO_ASSET_CLEANUP_MAX_DELETE = 50;
export const PHOTO_ASSET_CLEANUP_LAST_RUN_KEY = 'collage-photo-asset-cleanup-last-run-v1';

const CURRENT_STORAGE_KEY = 'collage-creator-album-live-v11-preserve-mode-layout';
const LEGACY_STORAGE_PREFIX = 'collage-creator-album';
let cleanupDatabasePromise = null;

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function isTrustedProjectSnapshot(value) {
  const source = objectValue(value);
  return Boolean(source && (Array.isArray(source.pages) || Array.isArray(source.frames)));
}

function cleanAssetId(value) {
  if (value == null) return '';
  return String(value).trim().slice(0, 240);
}

function positiveInteger(value, fallback, maximum = 500) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(maximum, Math.max(1, Math.floor(number)));
}

function finiteTimestamp(value) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

function storageKeys(storage) {
  if (!storage) return [];
  if (Number.isFinite(Number(storage.length)) && typeof storage.key === 'function') {
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key != null) keys.push(String(key));
    }
    return keys;
  }
  return Object.keys(storage);
}

function collectFrameAssetIds(frames, target) {
  Array.from(frames ?? []).forEach((frame) => {
    const assetId = cleanAssetId(frame?.photo?.assetId);
    if (assetId) target.add(assetId);
  });
}

function projectAssetIds(project, target) {
  const source = objectValue(project);
  if (!source) return;

  const library = Array.isArray(source.library) ? source.library : [];
  library.forEach((photo) => {
    const assetId = cleanAssetId(photo?.assetId);
    if (assetId) target.add(assetId);
  });

  if (Array.isArray(source.frames)) collectFrameAssetIds(source.frames, target);

  const pages = Array.isArray(source.pages) ? source.pages : [];
  pages.forEach((page) => {
    if (Array.isArray(page?.frames)) collectFrameAssetIds(page.frames, target);
  });
}

export function collectProjectAssetIds(projects = []) {
  const assetIds = new Set();
  Array.from(projects ?? []).forEach((project) => projectAssetIds(project, assetIds));
  return assetIds;
}

export function selectOrphanedPhotoAssets(records, activeAssetIds, options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const graceMs = Math.max(0, Number(options.graceMs ?? PHOTO_ASSET_CLEANUP_GRACE_MS) || 0);
  const maxDelete = positiveInteger(options.maxDelete, PHOTO_ASSET_CLEANUP_MAX_DELETE);
  const active = activeAssetIds instanceof Set
    ? new Set(Array.from(activeAssetIds, cleanAssetId).filter(Boolean))
    : new Set(Array.from(activeAssetIds ?? [], cleanAssetId).filter(Boolean));
  const cutoff = now - graceMs;

  return Array.from(records ?? [])
    .filter((record) => {
      if (!objectValue(record) || record.schema !== PHOTO_ASSET_SCHEMA) return false;
      const assetId = cleanAssetId(record.id);
      if (!assetId || active.has(assetId)) return false;
      const updatedAt = finiteTimestamp(record.updatedAt);
      return updatedAt != null && updatedAt <= cutoff;
    })
    .sort((left, right) => finiteTimestamp(left.updatedAt) - finiteTimestamp(right.updatedAt))
    .slice(0, maxDelete);
}

function openCleanupDatabase(indexedDb = globalThis.indexedDB) {
  if (!indexedDb) return Promise.reject(new Error('IndexedDB недоступен для очистки фотографий'));
  if (indexedDb === globalThis.indexedDB && cleanupDatabasePromise) return cleanupDatabasePromise;

  const promise = new Promise((resolve, reject) => {
    const request = indexedDb.open(PHOTO_ASSET_DB_NAME, PHOTO_ASSET_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PHOTO_ASSET_STORE_NAME)) {
        database.createObjectStore(PHOTO_ASSET_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        if (indexedDb === globalThis.indexedDB) cleanupDatabasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => reject(request.error || new Error('Не удалось открыть хранилище фотографий для очистки'));
  });

  if (indexedDb === globalThis.indexedDB) {
    cleanupDatabasePromise = promise.catch((error) => {
      cleanupDatabasePromise = null;
      throw error;
    });
    return cleanupDatabasePromise;
  }
  return promise;
}

async function defaultListAssets(options = {}) {
  const database = await openCleanupDatabase(options.indexedDB);
  return new Promise((resolve, reject) => {
    const records = [];
    const transaction = database.transaction(PHOTO_ASSET_STORE_NAME, 'readonly');
    const request = transaction.objectStore(PHOTO_ASSET_STORE_NAME).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(records);
        return;
      }
      const value = objectValue(cursor.value);
      if (value) {
        const metadata = { ...value };
        delete metadata.blob;
        records.push(metadata);
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error || new Error('Не удалось прочитать список фотографий'));
    transaction.onerror = () => reject(transaction.error || new Error('Не удалось прочитать хранилище фотографий'));
    transaction.onabort = () => reject(transaction.error || new Error('Чтение фотографий отменено'));
  });
}

async function defaultDeleteAssets(assetIds, options = {}) {
  const ids = Array.from(assetIds ?? []).map(cleanAssetId).filter(Boolean);
  if (!ids.length) return;
  const database = await openCleanupDatabase(options.indexedDB);
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(PHOTO_ASSET_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(PHOTO_ASSET_STORE_NAME);
    ids.forEach((assetId) => store.delete(assetId));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Не удалось удалить старые фотографии'));
    transaction.onabort = () => reject(transaction.error || new Error('Очистка фотографий отменена'));
  });
}

async function defaultReadStoredProjects(options = {}) {
  const bridge = options.projectStorageBridge ?? globalThis.window?.__collageProjectStorage;
  if (!bridge || typeof bridge.readLatest !== 'function') {
    throw new Error('Хранилище проектов ещё не готово для безопасной очистки');
  }

  const projects = [];
  const latest = await bridge.readLatest();
  if (latest?.data != null) {
    if (!isTrustedProjectSnapshot(latest.data)) {
      throw new Error('Последнее IndexedDB-сохранение имеет неизвестный формат');
    }
    projects.push(latest.data);
  }

  const storage = options.storage ?? globalThis.localStorage;
  const keys = storageKeys(storage)
    .filter((key) => key === CURRENT_STORAGE_KEY || key.startsWith(LEGACY_STORAGE_PREFIX));

  for (const key of keys) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Не удалось проверить локальный проект «${key}»`);
    }
    if (!isTrustedProjectSnapshot(parsed)) {
      throw new Error(`Локальный проект «${key}» имеет неизвестный формат`);
    }
    projects.push(parsed);
  }

  return projects;
}

function readLastRun(storage) {
  const value = Number(storage?.getItem?.(PHOTO_ASSET_CLEANUP_LAST_RUN_KEY));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function writeLastRun(storage, now) {
  storage?.setItem?.(PHOTO_ASSET_CLEANUP_LAST_RUN_KEY, String(now));
}

export async function cleanupOrphanedPhotoAssets(options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const intervalMs = Math.max(0, Number(options.intervalMs ?? PHOTO_ASSET_CLEANUP_INTERVAL_MS) || 0);
  const storage = options.storage ?? globalThis.localStorage;
  const force = options.force === true;
  const lastRun = readLastRun(storage);

  if (!force && lastRun && now - lastRun < intervalMs) {
    return {
      ok: true,
      skipped: 'throttled',
      activeAssetIds: [],
      deletedIds: [],
      deletedCount: 0,
      deletedBytes: 0,
    };
  }

  const readStoredProjects = options.readStoredProjects ?? (() => defaultReadStoredProjects({ ...options, storage }));
  const listAssets = options.listAssets ?? (() => defaultListAssets(options));
  const deleteAssets = options.deleteAssets ?? ((ids) => defaultDeleteAssets(ids, options));

  const storedProjects = await readStoredProjects();
  const projects = [options.currentProject, ...Array.from(storedProjects ?? [])].filter(isTrustedProjectSnapshot);
  if (!projects.length) {
    return {
      ok: true,
      skipped: 'no-trusted-projects',
      activeAssetIds: [],
      deletedIds: [],
      deletedCount: 0,
      deletedBytes: 0,
    };
  }

  const active = collectProjectAssetIds(projects);
  const records = await listAssets();
  const candidates = selectOrphanedPhotoAssets(records, active, {
    now,
    graceMs: options.graceMs,
    maxDelete: options.maxDelete,
  });
  const deletedIds = candidates.map((record) => cleanAssetId(record.id)).filter(Boolean);

  if (deletedIds.length) await deleteAssets(deletedIds);
  writeLastRun(storage, now);

  return {
    ok: true,
    skipped: '',
    activeAssetIds: Array.from(active),
    deletedIds,
    deletedCount: deletedIds.length,
    deletedBytes: candidates.reduce((sum, record) => {
      const size = Number(record?.size);
      return sum + (Number.isFinite(size) && size > 0 ? size : 0);
    }, 0),
  };
}
