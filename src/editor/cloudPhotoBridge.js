import { saveCloudProject } from './cloudProjects.js';
import {
  buildCloudProject,
  cloudKeyFromPhoto,
  cloudLibraryItem,
  normalizeCloudPhoto,
} from './cloudPhotoModel.js';
import { isHeicPhoto, prepareHeicPhotoFiles, preparePhotoForWeb } from './heicSupport.js';
import { persistPhotoFiles } from './photoAssets.js';
import {
  MAX_LIBRARY_PHOTOS,
  MAX_PHOTO_FILE_BYTES,
  selectPhotoUploads,
} from './reliability.js';

const PHOTO_ASSET_DB_NAME = 'collage-photo-assets-v1';
const PHOTO_ASSET_STORE_NAME = 'assets';
const CLOUD_UPLOAD_CONCURRENCY = 2;

const state = {
  configured: false,
  checked: false,
  busy: false,
  timer: null,
};

function isAuthenticated() {
  return window.__collageCloudAuth?.isAuthenticated?.() === true;
}

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} КБ`;
  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}

function setStatus(message) {
  document.querySelectorAll('.cloud-auth-status').forEach((node) => {
    node.textContent = message;
  });
  let toast = document.querySelector('.cloud-photo-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'cloud-photo-toast';
    Object.assign(toast.style, {
      position: 'fixed',
      left: '50%',
      bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
      transform: 'translateX(-50%)',
      zIndex: '100001',
      maxWidth: 'min(560px, calc(100vw - 24px))',
      padding: '11px 16px',
      borderRadius: '12px',
      color: '#fff',
      background: '#2f6f52',
      font: '600 14px/1.35 Arial, sans-serif',
      boxShadow: '0 10px 30px rgba(0,0,0,.24)',
      pointerEvents: 'none',
    });
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.style.display = 'block';
  clearTimeout(setStatus.timer);
  setStatus.timer = setTimeout(() => { toast.style.display = 'none'; }, 3500);
}

async function detectBucket() {
  try {
    const response = await fetch('/api/photo-assets/status', { credentials: 'include', cache: 'no-store' });
    const payload = await response.json();
    state.configured = response.ok && payload?.configured === true;
  } catch {
    state.configured = false;
  } finally {
    state.checked = true;
  }
}

function openPhotoDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PHOTO_ASSET_DB_NAME, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Не удалось открыть локальные фотографии'));
  });
}

async function readLocalPhotoBlob(assetId) {
  if (!assetId) return null;
  const database = await openPhotoDatabase();
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

async function resolvePhotoBlob(photo) {
  const localBlob = await readLocalPhotoBlob(photo?.assetId).catch(() => null);
  if (localBlob) return localBlob;
  const src = String(photo?.src || '');
  if (!src || src.startsWith('/api/photo-assets/file')) return null;
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Не удалось прочитать «${photo?.name || 'Фото'}»`);
  return response.blob();
}

export function uploadPhotoBlob(blob, name, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', `/api/photo-assets/upload?name=${encodeURIComponent(name || 'Фото')}`);
    request.withCredentials = true;
    request.setRequestHeader('Content-Type', blob.type || 'image/jpeg');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
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

async function mapWithConcurrency(items, concurrency, mapper) {
  const source = Array.from(items || []);
  const results = new Array(source.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= source.length) return;
      results[index] = await mapper(source[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, source.length || 1) }, () => worker()));
  return results;
}

async function prepareSelectedPhotoFiles(files) {
  const source = Array.from(files || []);
  const candidates = [];
  let rejectedHeicSize = 0;

  for (const file of source) {
    if (isHeicPhoto(file) && Number(file?.size) > MAX_PHOTO_FILE_BYTES) {
      rejectedHeicSize += 1;
    } else {
      candidates.push(file);
    }
  }

  const prepared = await prepareHeicPhotoFiles(candidates, {
    onProgress: ({ index, total, name }) => {
      setStatus(`Преобразую HEIC: ${index + 1} из ${total} · ${name}`);
    },
  });

  return { ...prepared, rejectedHeicSize };
}

async function prepareStoredPhotoBlob(photo, blob) {
  if (!isHeicPhoto(photo, { name: photo?.name, type: photo?.type || blob?.type })) {
    return { blob, name: photo?.name || 'Фото', converted: false };
  }

  setStatus(`Преобразую HEIC: ${photo?.name || 'Фото'}`);
  try {
    return await preparePhotoForWeb(blob, {
      name: photo?.name,
      type: photo?.type || blob?.type,
    });
  } catch (error) {
    throw new Error(`Не удалось преобразовать HEIC «${photo?.name || 'Фото'}»: ${error?.message || 'ошибка конвертации'}`);
  }
}

async function migrateProjectPhotos(project, onProgress = () => {}) {
  const library = Array.isArray(project?.library) ? project.library : [];
  let finished = 0;
  const migrated = await mapWithConcurrency(library, CLOUD_UPLOAD_CONCURRENCY, async (photo) => {
    const existingKey = cloudKeyFromPhoto(photo);
    if (existingKey) {
      finished += 1;
      onProgress({ finished, total: library.length, name: photo.name, loaded: photo.size || 0, bytesTotal: photo.size || 0 });
      return normalizeCloudPhoto(photo);
    }
    const originalBlob = await resolvePhotoBlob(photo);
    if (!originalBlob) throw new Error(`Не найден оригинал фотографии «${photo?.name || 'Фото'}»`);
    const prepared = await prepareStoredPhotoBlob(photo, originalBlob);
    const uploadBlob = prepared.blob;
    const uploadName = prepared.name || photo?.name || 'Фото';
    const asset = await uploadPhotoBlob(uploadBlob, uploadName, (loaded, bytesTotal) => {
      onProgress({ finished, total: library.length, name: uploadName, loaded, bytesTotal });
    });
    finished += 1;
    onProgress({ finished, total: library.length, name: uploadName, loaded: uploadBlob.size, bytesTotal: uploadBlob.size });
    return normalizeCloudPhoto({
      ...photo,
      name: uploadName,
      type: uploadBlob.type || photo?.type,
      size: uploadBlob.size,
    }, asset);
  });
  return buildCloudProject(project, migrated.map(cloudLibraryItem));
}

async function persistCloudSnapshot(project) {
  localStorage.setItem('collage-creator-album-live-v11-preserve-mode-layout', JSON.stringify(project));
  await Promise.resolve(window.__collageProjectStorage?.storeSnapshot?.(project, { source: 'bucket-cloud-sync' }));
}

async function applyProject(project) {
  const bridge = window.__collageApp;
  if (typeof bridge?.openProject === 'function') await bridge.openProject(project);
  await persistCloudSnapshot(project).catch((error) => console.warn('Cloud photo snapshot save failed', error));
}

export async function prepareCloudProject() {
  const bridge = window.__collageApp;
  const project = bridge?.getProject?.();
  if (!project) throw new Error('Редактор ещё не готов');
  const total = Array.isArray(project.library) ? project.library.length : 0;
  const cloudProject = await migrateProjectPhotos(project, ({ finished, name, loaded, bytesTotal }) => {
    const detail = bytesTotal ? ` · ${formatBytes(loaded)} из ${formatBytes(bytesTotal)}` : '';
    setStatus(`Фото в облако: ${Math.min(finished + 1, total)} из ${total} · ${name || 'Фото'}${detail}`);
  });
  await applyProject(cloudProject);
  return cloudProject;
}

async function uploadNewPhotos(files) {
  const bridge = window.__collageApp;
  const project = bridge?.getProject?.();
  if (!project) throw new Error('Редактор ещё не готов');

  const preparation = await prepareSelectedPhotoFiles(files);
  const selection = selectPhotoUploads(preparation.files, project.library?.length || 0);
  const rejectedSize = selection.rejectedSize + preparation.rejectedHeicSize;
  if (!selection.accepted.length) {
    if (preparation.failed.length) {
      const first = preparation.failed[0];
      throw new Error(`Не удалось преобразовать HEIC «${first?.file?.name || 'Фото'}». Проверь интернет и повтори.`);
    }
    if (rejectedSize) throw new Error('Фото слишком большие. Максимум 25 МБ на файл.');
    if (selection.rejectedLimit) throw new Error(`В библиотеке можно хранить не больше ${MAX_LIBRARY_PHOTOS} фото`);
    throw new Error('Подходящих изображений не найдено');
  }

  let finished = 0;
  const additions = await mapWithConcurrency(selection.accepted, CLOUD_UPLOAD_CONCURRENCY, async (file) => {
    const asset = await uploadPhotoBlob(file, file.name, (loaded, bytesTotal) => {
      setStatus(`Загружаю ${finished + 1} из ${selection.accepted.length}: ${file.name} · ${formatBytes(loaded)} из ${formatBytes(bytesTotal)}`);
    });
    finished += 1;
    setStatus(`Загружено в облако: ${finished} из ${selection.accepted.length}`);
    return normalizeCloudPhoto({ id: asset.id, name: file.name, type: file.type, size: file.size }, asset);
  });

  const nextProject = buildCloudProject(project, [
    ...(project.library || []).map((photo) => cloudKeyFromPhoto(photo) ? cloudLibraryItem(photo) : photo),
    ...additions.map(cloudLibraryItem),
  ].slice(0, MAX_LIBRARY_PHOTOS));
  await applyProject(nextProject);
  const skipped = selection.rejectedType + rejectedSize + selection.rejectedLimit + preparation.failed.length;
  const converted = preparation.converted ? ` · HEIC → JPEG: ${preparation.converted}` : '';
  setStatus(`Фото в облаке: ${additions.length}${converted}${skipped ? ` · пропущено: ${skipped}` : ''}`);
}

async function fallbackLocalUpload(files) {
  const bridge = window.__collageApp;
  const project = bridge?.getProject?.();
  if (!project) return;
  const preparation = await prepareSelectedPhotoFiles(files);
  const selection = selectPhotoUploads(preparation.files, project.library?.length || 0);
  const result = await persistPhotoFiles(selection.accepted);
  const next = {
    ...project,
    library: [...(project.library || []), ...result.loaded].slice(0, MAX_LIBRARY_PHOTOS),
  };
  await bridge.openProject?.(next);
  const failed = preparation.failed.length + result.failed.length;
  setStatus(failed
    ? `Облако фото недоступно: локально сохранено ${result.loaded.length}, пропущено ${failed}`
    : 'Облако фото недоступно: фотографии сохранены только в этом браузере');
}

function isPhotoInput(input) {
  return input instanceof HTMLInputElement
    && input.type === 'file'
    && String(input.accept || '').toLowerCase().includes('image');
}

function handleFileChange(event) {
  const input = event.target;
  if (!isPhotoInput(input) || !state.configured || !isAuthenticated()) return;
  const files = Array.from(input.files || []);
  if (!files.length) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  input.value = '';
  if (state.busy) {
    setStatus('Дождись окончания текущей загрузки');
    return;
  }
  state.busy = true;
  uploadNewPhotos(files)
    .catch(async (error) => {
      console.warn('Cloud photo upload failed', error);
      setStatus(error.message || 'Не удалось загрузить фотографии в облако');
      await fallbackLocalUpload(files).catch(() => {});
    })
    .finally(() => { state.busy = false; });
}

async function saveFromHeader() {
  if (state.busy) return;
  state.busy = true;
  setStatus('Подготавливаю фотографии для облака…');
  try {
    const project = await prepareCloudProject();
    await saveCloudProject(project);
    setStatus('Альбом и фотографии сохранены в аккаунт');
  } catch (error) {
    console.warn('Bucket cloud save failed', error);
    setStatus(error.message || 'Не удалось сохранить проект');
  } finally {
    state.busy = false;
  }
}

function handleDocumentClick(event) {
  if (!state.configured || !isAuthenticated()) return;
  const button = event.target instanceof Element ? event.target.closest('button') : null;
  if (!button || !button.closest('.file-actions') || button.textContent?.trim() !== 'Сохранить') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void saveFromHeader();
}

function patchEditorBridge() {
  if (!state.configured) return;
  const bridge = window.__collageApp;
  if (!bridge || bridge.__bucketPhotoBridge) return;
  bridge.getPortableProject = prepareCloudProject;
  bridge.__bucketPhotoBridge = true;
}

export function installCloudPhotoBridge() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  void detectBucket().then(patchEditorBridge);
  document.addEventListener('change', handleFileChange, true);
  document.addEventListener('click', handleDocumentClick, true);
  state.timer = window.setInterval(patchEditorBridge, 300);
  window.addEventListener('beforeunload', () => window.clearInterval(state.timer), { once: true });
}
