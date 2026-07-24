const HEIC_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const HEIC_EXTENSION = /\.(?:heic|heif)$/i;
let browserHeicModulePromise = null;

function cleanType(value) {
  return String(value || '').trim().toLowerCase().split(';')[0];
}

function shortError(error, fallback) {
  const message = String(error?.message || '').replace(/\s+/g, ' ').trim();
  return (message || fallback).slice(0, 320);
}

export function isHeicFileLike(file) {
  return HEIC_TYPES.has(cleanType(file?.type)) || HEIC_EXTENSION.test(String(file?.name || ''));
}

export function jpegNameForUpload(name) {
  const source = String(name || 'Фото').slice(0, 500);
  return HEIC_EXTENSION.test(source) ? source.replace(HEIC_EXTENSION, '.jpg') : `${source}.jpg`;
}

function withSourceIdentity(file, source) {
  const sourceName = String(source?.name || file?.name || 'Фото').slice(0, 500);
  const sourceSize = Math.max(0, Number(source?.size ?? file?.size) || 0);
  try {
    Object.defineProperties(file, {
      sourceName: { value: sourceName, configurable: true },
      sourceSize: { value: sourceSize, configurable: true },
    });
    return file;
  } catch {
    const copy = new File([file], file?.name || sourceName, {
      type: file?.type || 'application/octet-stream',
      lastModified: Number(file?.lastModified) || Date.now(),
    });
    Object.defineProperties(copy, {
      sourceName: { value: sourceName, configurable: true },
      sourceSize: { value: sourceSize, configurable: true },
    });
    return copy;
  }
}

async function parseErrorResponse(response) {
  const payload = await response.json().catch(() => ({}));
  return payload?.message || payload?.error || `Ошибка преобразования ${response.status}`;
}

function jpegFileFromBlob(blob, sourceFile) {
  if (!(blob instanceof Blob) || !blob.size) {
    throw new Error('Конвертер не вернул готовый JPEG');
  }
  return new File([blob], jpegNameForUpload(sourceFile?.name), {
    type: 'image/jpeg',
    lastModified: Number(sourceFile?.lastModified) || Date.now(),
  });
}

async function loadBrowserHeicModule(options = {}) {
  if (typeof options.loadBrowserConverter === 'function') return options.loadBrowserConverter();
  if (!browserHeicModulePromise) {
    browserHeicModulePromise = import('heic-to/csp').catch((error) => {
      browserHeicModulePromise = null;
      throw error;
    });
  }
  return browserHeicModulePromise;
}

export async function convertHeicThroughServer(file, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(`/api/heic/convert?name=${encodeURIComponent(file?.name || 'Фото.HEIC')}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': cleanType(file?.type) || 'image/heic',
    },
    body: file,
  });

  if (!response.ok) throw new Error(await parseErrorResponse(response));
  const blob = await response.blob();
  if (!blob.size || cleanType(blob.type) !== 'image/jpeg') {
    throw new Error('Сервер не вернул готовый JPEG');
  }
  return jpegFileFromBlob(blob, file);
}

export async function convertHeicInBrowser(file, options = {}) {
  const module = await loadBrowserHeicModule(options);
  const heicTo = module?.heicTo || module?.default?.heicTo || module?.default;
  if (typeof heicTo !== 'function') throw new Error('Локальный HEIC-конвертер не загрузился');

  const converted = await heicTo({
    blob: file,
    type: 'image/jpeg',
    quality: Number(options.browserQuality) || 0.92,
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  return jpegFileFromBlob(blob, file);
}

export async function convertHeicWithFallback(file, options = {}) {
  try {
    return await convertHeicThroughServer(file, options);
  } catch (serverError) {
    options.onFallback?.({ file, serverError });
    try {
      return await convertHeicInBrowser(file, options);
    } catch (browserError) {
      console.warn('Both HEIC converters failed', { serverError, browserError });
      throw new Error(
        `Не удалось прочитать HEIC даже запасным конвертером: ${shortError(browserError, 'формат файла не поддерживается')}`,
        { cause: browserError },
      );
    }
  }
}

export async function prepareLocalPhotoFiles(files, options = {}) {
  const source = Array.from(files || []);
  const prepared = [];
  const failed = [];
  let converted = 0;

  for (let index = 0; index < source.length; index += 1) {
    const file = source[index];
    if (!isHeicFileLike(file)) {
      prepared.push(withSourceIdentity(file, file));
      continue;
    }

    options.onProgress?.({ index, total: source.length, name: file?.name || 'Фото' });
    try {
      const jpeg = await convertHeicWithFallback(file, {
        ...options,
        onFallback: ({ serverError }) => options.onFallback?.({
          index,
          total: source.length,
          name: file?.name || 'Фото',
          serverError,
        }),
      });
      prepared.push(withSourceIdentity(jpeg, file));
      converted += 1;
    } catch (error) {
      failed.push({ file, error });
    }
  }

  return { files: prepared, failed, converted };
}
