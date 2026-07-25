import {
  buildCloudProject,
  cloudKeyFromPhoto,
  cloudLibraryItem,
  normalizeCloudPhoto,
} from './cloudPhotoModel.js';

const PHOTO_ASSET_DB_NAME = 'collage-photo-assets-v1';
const PHOTO_ASSET_STORE_NAME = 'assets';
export const DEFAULT_CLOUD_PHOTO_CONCURRENCY = 2;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.max(1, Math.floor(number)) : fallback;
}

async function mapWithConcurrency(items, limit, mapper) {
  const source = Array.from(items ?? []);
  const results = new Array(source.length);
  let nextIndex = 0;
  const workerCount = Math.min(source.length || 1, positiveInteger(limit, DEFAULT_CLOUD_PHOTO_CONCURRENCY));

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

function openPhotoDatabase(indexedDb = globalThis.indexedDB) {
  if (!indexedDb) return Promise.reject(new Error('IndexedDB недоступен'));
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(PHOTO_ASSET_DB_NAME, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Не удалось открыть локальные фотографии'));
  });
}

async function defaultReadLocalPhotoBlob(assetId, options = {}) {
  if (!assetId) return null;
  const database = await openPhotoDatabase(options.indexedDB);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(PHOTO_ASSET_STORE_NAME, 'readonly');
      const request = transaction.objectStore(PHOTO_ASSET_STORE_NAME).get(assetId);
      request.onsuccess = () => resolve(request.result?.blob instanceof Blob ? request.result.blob : null);
      request.onerror = () => reject(request.error || new Error('Не удалось прочитать фотографию'));
    });
  } finally {
    database.close();
  }
}

async function defaultResolvePhotoBlob(photo, options = {}) {
  const readLocalPhotoBlob = options.readLocalPhotoBlob ?? ((assetId) => defaultReadLocalPhotoBlob(assetId, options));
  const localBlob = await readLocalPhotoBlob(photo?.assetId).catch(() => null);
  if (localBlob) return localBlob;

  const src = String(photo?.src || '');
  if (!src || src.startsWith('/api/photo-assets/file')) return null;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(src);
  if (!response.ok) throw new Error(`Не удалось прочитать «${photo?.name || 'Фото'}»`);
  return response.blob();
}

export function uploadCloudPhotoBlob(blob, name, options = {}) {
  const createRequest = options.createRequest ?? (() => new XMLHttpRequest());
  return new Promise((resolve, reject) => {
    const request = createRequest();
    request.open('PUT', `/api/photo-assets/upload?name=${encodeURIComponent(name || 'Фото')}`);
    request.withCredentials = true;
    request.setRequestHeader('Content-Type', blob.type || 'image/jpeg');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded, event.total);
    };
    request.onerror = () => reject(new Error('Соединение с облачным хранилищем прервано'));
    request.onabort = () => reject(new Error('Загрузка фотографии отменена'));
    request.onload = () => {
      let payload = {};
      try { payload = JSON.parse(request.responseText || '{}'); } catch { /* handled below */ }
      if (request.status < 200 || request.status >= 300 || !payload?.asset) {
        reject(new Error(payload?.message || payload?.error || `Ошибка загрузки ${request.status}`));
        return;
      }
      resolve(payload.asset);
    };
    request.send(blob);
  });
}

export async function createCloudPhotoProject(project, options = {}) {
  const library = Array.isArray(project?.library) ? project.library : [];
  const resolvePhotoBlob = options.resolvePhotoBlob ?? ((photo) => defaultResolvePhotoBlob(photo, options));
  const uploadPhotoBlob = options.uploadPhotoBlob ?? ((blob, name, onProgress) => uploadCloudPhotoBlob(blob, name, { ...options, onProgress }));
  let finished = 0;

  const migrated = await mapWithConcurrency(
    library,
    options.maxConcurrent ?? DEFAULT_CLOUD_PHOTO_CONCURRENCY,
    async (photo) => {
      const existingKey = cloudKeyFromPhoto(photo);
      if (existingKey) {
        finished += 1;
        options.onProgress?.({ finished, total: library.length, name: photo?.name || 'Фото', reused: true });
        return normalizeCloudPhoto(photo);
      }

      const blob = await resolvePhotoBlob(photo);
      if (!(blob instanceof Blob)) {
        throw new Error(`Не найден оригинал фотографии «${photo?.name || 'Фото'}»`);
      }

      const asset = await uploadPhotoBlob(blob, photo?.name || 'Фото', (loaded, bytesTotal) => {
        options.onProgress?.({ finished, total: library.length, name: photo?.name || 'Фото', loaded, bytesTotal });
      });
      finished += 1;
      options.onProgress?.({ finished, total: library.length, name: photo?.name || 'Фото', loaded: blob.size, bytesTotal: blob.size });
      return normalizeCloudPhoto({
        ...photo,
        type: blob.type || photo?.type,
        size: blob.size,
      }, asset);
    },
  );

  return buildCloudProject(project, migrated.map(cloudLibraryItem));
}

function cloudMetadataById(cloudProject) {
  return new Map(
    (Array.isArray(cloudProject?.library) ? cloudProject.library : [])
      .filter((photo) => photo?.id != null && photo?.cloudKey)
      .map((photo) => [String(photo.id), photo]),
  );
}

function mergePhotoReference(photo, cloudById) {
  if (!photo || photo.id == null) return photo;
  const cloud = cloudById.get(String(photo.id));
  if (!cloud) return photo;
  return {
    ...photo,
    cloudKey: cloud.cloudKey,
    cloudSchema: cloud.cloudSchema,
    type: photo.type || cloud.type,
    size: Number(photo.size) || Number(cloud.size) || 0,
  };
}

export function mergeCloudPhotoMetadata(localProject, cloudProject) {
  const cloudById = cloudMetadataById(cloudProject);
  return {
    ...localProject,
    library: (Array.isArray(localProject?.library) ? localProject.library : [])
      .map((photo) => mergePhotoReference(photo, cloudById)),
    pages: (Array.isArray(localProject?.pages) ? localProject.pages : [])
      .map((page) => ({
        ...page,
        frames: (Array.isArray(page?.frames) ? page.frames : [])
          .map((frame) => ({ ...frame, photo: mergePhotoReference(frame?.photo, cloudById) })),
      })),
  };
}

export function mergeCloudMetadataIntoLibrary(library, cloudProject) {
  const cloudById = cloudMetadataById(cloudProject);
  return (Array.isArray(library) ? library : []).map((photo) => mergePhotoReference(photo, cloudById));
}
