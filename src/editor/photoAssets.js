import { compactProjectPhotos } from './photoStorage.js';

export const PHOTO_ASSET_DB_NAME = 'collage-photo-assets-v1';
export const PHOTO_ASSET_DB_VERSION = 1;
export const PHOTO_ASSET_STORE_NAME = 'assets';
export const PHOTO_ASSET_SCHEMA = 'indexeddb-blob-v1';
export const DEFAULT_PHOTO_ASSET_CONCURRENCY = 2;

let databasePromise = null;
const runtimeUrls = new Map();

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `photo_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.max(1, Math.floor(number)) : fallback;
}

function cleanString(value, fallback = '', maxLength = 500) {
  const text = value == null ? fallback : String(value);
  return text.slice(0, maxLength);
}

function isDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:');
}

function isBlobUrl(value) {
  return typeof value === 'string' && value.startsWith('blob:');
}

export function dataUrlToBlob(dataUrl) {
  if (!isDataUrl(dataUrl)) throw new Error('Источник фотографии не является data URL');
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) throw new Error('Повреждённый data URL фотографии');
  const header = dataUrl.slice(5, commaIndex);
  const body = dataUrl.slice(commaIndex + 1);
  const base64 = /;base64(?:;|$)/i.test(header);
  const mimeType = header.split(';')[0] || 'application/octet-stream';
  let bytes;
  if (base64) {
    const binary = globalThis.atob(body);
    bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(body));
  }
  return new Blob([bytes], { type: mimeType });
}

export async function blobToDataUrl(blob, options = {}) {
  if (!(blob instanceof Blob)) throw new Error('Оригинал фотографии не является Blob');
  const createFileReader = options.createFileReader ?? (() => (
    typeof globalThis.FileReader === 'function' ? new globalThis.FileReader() : null
  ));
  const reader = createFileReader?.();
  if (reader) {
    return new Promise((resolve, reject) => {
      reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Не удалось сериализовать фотографию'));
      reader.onerror = () => reject(reader.error || new Error('Не удалось сериализовать фотографию'));
      reader.onabort = () => reject(new Error('Сериализация фотографии отменена'));
      reader.readAsDataURL(blob);
    });
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${globalThis.btoa(binary)}`;
}

function openDatabase(indexedDb = globalThis.indexedDB) {
  if (!indexedDb) return Promise.reject(new Error('IndexedDB недоступен'));
  if (indexedDb === globalThis.indexedDB && databasePromise) return databasePromise;

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
        if (indexedDb === globalThis.indexedDB) databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => reject(request.error || new Error('Не удалось открыть хранилище фотографий'));
  });

  if (indexedDb === globalThis.indexedDB) {
    databasePromise = promise.catch((error) => {
      databasePromise = null;
      throw error;
    });
    return databasePromise;
  }
  return promise;
}

async function defaultPutAsset(record, options = {}) {
  const database = await openDatabase(options.indexedDB);
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(PHOTO_ASSET_STORE_NAME, 'readwrite');
    transaction.objectStore(PHOTO_ASSET_STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Не удалось сохранить оригинал фотографии'));
    transaction.onabort = () => reject(transaction.error || new Error('Сохранение фотографии отменено'));
  });
  return record;
}

async function defaultGetAsset(assetId, options = {}) {
  const database = await openDatabase(options.indexedDB);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PHOTO_ASSET_STORE_NAME, 'readonly');
    const request = transaction.objectStore(PHOTO_ASSET_STORE_NAME).get(assetId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Не удалось прочитать оригинал фотографии'));
  });
}

function assetIdFor(photo, idFactory) {
  const existing = cleanString(photo?.assetId, '', 240);
  if (existing) return existing;
  const photoId = cleanString(photo?.id, '', 200);
  return `asset-${photoId || idFactory()}`;
}

function createRuntimeUrl(assetId, blob, options = {}) {
  const cache = options.runtimeUrlCache ?? runtimeUrls;
  const existing = cache.get(assetId);
  if (existing) return existing;
  const createObjectURL = options.createObjectURL ?? globalThis.URL?.createObjectURL?.bind(globalThis.URL);
  if (typeof createObjectURL !== 'function') throw new Error('Браузер не поддерживает Blob URL');
  const url = createObjectURL(blob);
  cache.set(assetId, url);
  return url;
}

async function mapWithConcurrency(items, limit, mapper) {
  const source = Array.from(items ?? []);
  const results = new Array(source.length);
  let nextIndex = 0;
  const workerCount = Math.min(source.length || 1, positiveInteger(limit, DEFAULT_PHOTO_ASSET_CONCURRENCY));
  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= source.length) return;
      results[index] = await mapper(source[index], index);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function assetRecord(assetId, blob, photo = {}) {
  return {
    id: assetId,
    schema: PHOTO_ASSET_SCHEMA,
    blob,
    name: cleanString(photo.name, 'Фото'),
    type: cleanString(photo.type || blob.type, blob.type || 'application/octet-stream', 200),
    size: Number.isFinite(Number(photo.size)) ? Number(photo.size) : blob.size,
    updatedAt: new Date().toISOString(),
  };
}

async function persistOnePhotoBlob(blob, photo, options) {
  const idFactory = options.idFactory ?? makeId;
  const putAsset = options.putAsset ?? ((record) => defaultPutAsset(record, options));
  const assetId = assetIdFor(photo, idFactory);
  const record = assetRecord(assetId, blob, photo);
  await putAsset(record);
  return {
    ...photo,
    id: photo.id ?? idFactory(),
    assetId,
    assetSchema: PHOTO_ASSET_SCHEMA,
    type: record.type,
    size: record.size,
    src: createRuntimeUrl(assetId, blob, options),
  };
}

export async function persistPhotoFiles(files, options = {}) {
  const source = Array.from(files ?? []);
  const loaded = [];
  const failed = [];
  const maxConcurrent = options.maxConcurrent ?? DEFAULT_PHOTO_ASSET_CONCURRENCY;
  const results = await mapWithConcurrency(source, maxConcurrent, async (file) => {
    const photoId = (options.idFactory ?? makeId)();
    const draft = {
      id: photoId,
      name: file?.name || 'Фото',
      type: file?.type,
      size: file?.size,
      sourceName: file?.sourceName || file?.name || 'Фото',
      sourceSize: Number(file?.sourceSize ?? file?.size) || 0,
    };
    try {
      return { ok: true, photo: await persistOnePhotoBlob(file, draft, options) };
    } catch (error) {
      try {
        return {
          ok: true,
          photo: { ...draft, src: await blobToDataUrl(file, options), persistenceFallback: true },
          warning: error,
        };
      } catch (fallbackError) {
        return { ok: false, file, error: fallbackError, persistenceError: error };
      }
    }
  });
  for (const result of results) {
    if (result?.ok) loaded.push(result.photo);
    else failed.push({ file: result?.file, error: result?.error, persistenceError: result?.persistenceError });
  }
  return { loaded, failed };
}

async function hydrateLibraryItem(item, options) {
  const source = item && typeof item === 'object' ? item : {};
  const idFactory = options.idFactory ?? makeId;
  const photo = { ...source, id: source.id ?? idFactory(), name: cleanString(source.name, 'Фото') };
  const putAsset = options.putAsset ?? ((record) => defaultPutAsset(record, options));
  const getAsset = options.getAsset ?? ((assetId) => defaultGetAsset(assetId, options));
  let assetId = cleanString(photo.assetId, '', 240);
  let blob = null;

  if (assetId) {
    try {
      const record = await getAsset(assetId);
      if (record?.blob instanceof Blob) blob = record.blob;
    } catch {
      // Fall back to a portable source when IndexedDB is unavailable.
    }
  }

  if (!blob && isDataUrl(photo.src)) {
    try {
      blob = dataUrlToBlob(photo.src);
      assetId = assetId || assetIdFor(photo, idFactory);
      await putAsset(assetRecord(assetId, blob, photo));
    } catch {
      return { ...photo, assetId: assetId || undefined };
    }
  }

  if (blob && assetId) {
    return {
      ...photo,
      assetId,
      assetSchema: PHOTO_ASSET_SCHEMA,
      type: cleanString(photo.type || blob.type, blob.type || 'application/octet-stream', 200),
      size: Number.isFinite(Number(photo.size)) ? Number(photo.size) : blob.size,
      src: createRuntimeUrl(assetId, blob, options),
    };
  }

  return photo;
}

export async function hydratePhotoProject(prepared, options = {}) {
  const compacted = compactProjectPhotos(prepared?.library, prepared?.pages);
  const library = await mapWithConcurrency(
    compacted.library,
    options.maxConcurrent ?? DEFAULT_PHOTO_ASSET_CONCURRENCY,
    (item) => hydrateLibraryItem(item, options),
  );
  const byId = new Map(library.filter((item) => item?.id != null).map((item) => [String(item.id), item]));
  const byAssetId = new Map(library.filter((item) => item?.assetId).map((item) => [String(item.assetId), item]));
  const pages = compacted.pages.map((page) => ({
    ...page,
    frames: Array.isArray(page?.frames) ? page.frames.map((frame) => {
      const photo = frame?.photo;
      if (!photo || typeof photo !== 'object') return frame;
      const runtime = photo.id != null ? byId.get(String(photo.id)) : byAssetId.get(String(photo.assetId || ''));
      return runtime ? { ...frame, photo: { ...photo, assetId: runtime.assetId, assetSchema: runtime.assetSchema, src: runtime.src, name: photo.name || runtime.name } } : frame;
    }) : [],
  }));
  const missingPhotoCount = library.filter((item) => !item?.src).length;
  return { ...prepared, library, pages, missingPhotoCount };
}

export function createLocalPhotoProject(project) {
  const compacted = compactProjectPhotos(project?.library, project?.pages);
  const library = compacted.library.map((item) => {
    if (!item || typeof item !== 'object') return item;
    if (item.assetId) {
      const { src: _runtimeSource, ...reference } = item;
      return { ...reference, assetSchema: PHOTO_ASSET_SCHEMA };
    }
    if (isBlobUrl(item.src)) {
      const { src: _temporarySource, ...reference } = item;
      return reference;
    }
    return item;
  });
  return {
    ...project,
    version: 'live-24-indexeddb-photo-assets',
    photoAssetSchema: PHOTO_ASSET_SCHEMA,
    library,
    pages: compacted.pages,
  };
}

export class MissingPhotoAssetError extends Error {
  constructor(photoName = 'Фото') {
    super(`Не найден оригинал фотографии «${photoName}». Открой проект в том браузере, где он был сохранён, или импортируй переносимый JSON.`);
    this.name = 'MissingPhotoAssetError';
    this.code = 'missing_photo_asset';
  }
}

export async function createPortablePhotoProject(project, options = {}) {
  const local = createLocalPhotoProject(project);
  const runtimeById = new Map((project?.library || []).filter((item) => item?.id != null).map((item) => [String(item.id), item]));
  const getAsset = options.getAsset ?? ((assetId) => defaultGetAsset(assetId, options));
  const fetchBlob = options.fetchBlob ?? (async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Не удалось прочитать Blob URL фотографии');
    return response.blob();
  });

  const library = await mapWithConcurrency(local.library, options.maxConcurrent ?? DEFAULT_PHOTO_ASSET_CONCURRENCY, async (item) => {
    if (!item || typeof item !== 'object') return item;
    if (isDataUrl(item.src)) return item;
    const runtime = item.id != null ? runtimeById.get(String(item.id)) : null;
    if (isDataUrl(runtime?.src)) return { ...item, src: runtime.src };

    let blob = null;
    if (item.assetId) {
      try {
        const record = await getAsset(item.assetId);
        if (record?.blob instanceof Blob) blob = record.blob;
      } catch {
        // Try the active Blob URL before reporting the asset as missing.
      }
    }
    if (!blob && isBlobUrl(runtime?.src)) {
      try { blob = await fetchBlob(runtime.src); } catch { /* handled below */ }
    }
    if (!blob) throw new MissingPhotoAssetError(item.name || runtime?.name || 'Фото');
    return { ...item, src: await blobToDataUrl(blob, options) };
  });

  return {
    ...local,
    version: 'live-24-portable-photo-data',
    library,
  };
}

export function releaseUnusedPhotoRuntimeUrls(activeAssetIds = [], options = {}) {
  const cache = options.runtimeUrlCache ?? runtimeUrls;
  const active = new Set(Array.from(activeAssetIds ?? []).filter(Boolean).map(String));
  const revokeObjectURL = options.revokeObjectURL ?? globalThis.URL?.revokeObjectURL?.bind(globalThis.URL);
  for (const [assetId, url] of cache) {
    if (active.has(String(assetId))) continue;
    try { revokeObjectURL?.(url); } catch { /* ignore URL cleanup errors */ }
    cache.delete(assetId);
  }
}

export function releaseAllPhotoRuntimeUrls(options = {}) {
  releaseUnusedPhotoRuntimeUrls([], options);
}
