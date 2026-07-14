import { compactProjectPhotos } from './photoStorage.js';

export const MAX_PHOTO_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_PHOTO_UPLOAD_BATCH = 100;
export const MAX_LIBRARY_PHOTOS = 1000;
export const MAX_PROJECT_JSON_BYTES = 60 * 1024 * 1024;

export function selectPhotoUploads(files, currentLibraryCount = 0) {
  const source = Array.from(files ?? []);
  const imageFiles = source.filter((file) => String(file?.type || '').startsWith('image/'));
  const withinSize = imageFiles.filter((file) => Number(file?.size) <= MAX_PHOTO_FILE_BYTES);
  const availableSlots = Math.max(0, MAX_LIBRARY_PHOTOS - Math.max(0, Number(currentLibraryCount) || 0));
  const accepted = withinSize.slice(0, Math.min(MAX_PHOTO_UPLOAD_BATCH, availableSlots));

  return {
    accepted,
    rejectedType: source.length - imageFiles.length,
    rejectedSize: imageFiles.length - withinSize.length,
    rejectedLimit: withinSize.length - accepted.length,
  };
}

export function describeSaveResult({ local, indexedDb, cloud, cloudError } = {}) {
  if (cloud?.id) {
    return { ok: true, message: 'Альбом сохранён в аккаунт', target: 'cloud' };
  }

  const browserSaved = Boolean(local?.ok || indexedDb?.ok);
  if (browserSaved) {
    return {
      ok: true,
      message: cloudError ? 'Сохранено в браузере. Облако недоступно' : 'Альбом сохранён в браузере',
      target: 'browser',
    };
  }

  return {
    ok: false,
    message: 'Не удалось сохранить проект. Скачай JSON, чтобы не потерять работу.',
    target: 'none',
  };
}

export function projectJsonFileError(file) {
  if (!file) return 'Файл не выбран';
  if (Number(file.size) > MAX_PROJECT_JSON_BYTES) {
    return 'JSON слишком большой. Максимальный размер — 60 МБ.';
  }
  return '';
}

export function createPreparedProjectSnapshot(prepared, savedAt = new Date().toISOString()) {
  if (!prepared || !Array.isArray(prepared.pages) || prepared.pages.length === 0) {
    throw new Error('Подготовленный проект не содержит страниц');
  }

  const compactedPhotos = compactProjectPhotos(prepared.library, prepared.pages);
  return {
    version: 'live-23-photo-library-references',
    canvas: prepared.canvas,
    settings: prepared.settings,
    library: compactedPhotos.library,
    pages: compactedPhotos.pages,
    currentPageId: prepared.currentPageId,
    viewMode: prepared.viewMode,
    bookletSheetsPerBlock: prepared.bookletSheetsPerBlock,
    bookletPrintSettings: prepared.bookletPrintSettings,
    extraLayers: prepared.extraLayers,
    albumEditorMode: prepared.albumEditorMode,
    savedAt,
  };
}
