const HEIC_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const HEIC_EXTENSION = /\.(?:heic|heif)$/i;
const DEFAULT_JPEG_QUALITY = 0.94;
const CONVERTER_URLS = [
  'https://cdn.jsdelivr.net/npm/heic-to@1.5.2/dist/csp/heic-to.js',
  'https://unpkg.com/heic-to@1.5.2/dist/csp/heic-to.js',
];

function cleanType(value) {
  return String(value || '').trim().toLowerCase().split(';')[0];
}

function cleanName(value) {
  return String(value || 'Фото').slice(0, 500);
}

export function isHeicPhoto(value, options = {}) {
  const type = cleanType(options.type ?? value?.type);
  const name = cleanName(options.name ?? value?.name);
  return HEIC_TYPES.has(type) || HEIC_EXTENSION.test(name);
}

export function jpegNameForHeic(value) {
  const name = cleanName(value);
  if (HEIC_EXTENSION.test(name)) return name.replace(HEIC_EXTENSION, '.jpg');
  return `${name || 'Фото'}.jpg`;
}

async function defaultImportModule(url) {
  return import(/* @vite-ignore */ url);
}

export async function loadHeicConverter(options = {}) {
  const importModule = options.importModule ?? defaultImportModule;
  const urls = options.urls ?? CONVERTER_URLS;
  let lastError = null;

  for (const url of urls) {
    try {
      const module = await importModule(url);
      const converter = module?.heicTo ?? module?.default?.heicTo ?? module?.default;
      if (typeof converter === 'function') return converter;
      lastError = new Error('Модуль конвертации HEIC не содержит функцию heicTo');
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Не удалось загрузить конвертер HEIC${lastError?.message ? `: ${lastError.message}` : ''}`);
}

function firstBlob(value) {
  const result = Array.isArray(value) ? value[0] : value;
  if (!(result instanceof Blob)) throw new Error('Конвертер HEIC не вернул изображение');
  return result;
}

function createJpegFile(blob, name, lastModified, options = {}) {
  const createFile = options.createFile ?? ((parts, filename, fileOptions) => new File(parts, filename, fileOptions));
  return createFile([blob], name, {
    type: 'image/jpeg',
    lastModified: Number(lastModified) || Date.now(),
  });
}

export async function preparePhotoForWeb(blob, options = {}) {
  if (!(blob instanceof Blob)) throw new Error('Фотография не является Blob');
  const name = cleanName(options.name ?? blob.name);
  const type = cleanType(options.type ?? blob.type);
  if (!isHeicPhoto(blob, { name, type })) {
    return { blob, name, type: type || blob.type || 'application/octet-stream', converted: false };
  }

  const converter = options.converter ?? await loadHeicConverter(options);
  const output = await converter({
    blob,
    type: 'image/jpeg',
    quality: Number.isFinite(Number(options.quality)) ? Number(options.quality) : DEFAULT_JPEG_QUALITY,
  });
  const jpegBlob = firstBlob(output);
  const jpegName = jpegNameForHeic(name);
  const jpegFile = createJpegFile(jpegBlob, jpegName, blob.lastModified, options);
  return {
    blob: jpegFile,
    name: jpegName,
    type: 'image/jpeg',
    converted: true,
    originalName: name,
    originalType: type,
  };
}

export async function prepareHeicPhotoFiles(files, options = {}) {
  const source = Array.from(files ?? []);
  const prepared = [];
  const failed = [];
  let converted = 0;

  for (let index = 0; index < source.length; index += 1) {
    const file = source[index];
    if (!isHeicPhoto(file)) {
      prepared.push(file);
      continue;
    }

    options.onProgress?.({ index, total: source.length, name: cleanName(file?.name) });
    try {
      const result = await preparePhotoForWeb(file, options);
      prepared.push(result.blob);
      if (result.converted) converted += 1;
    } catch (error) {
      failed.push({ file, error });
    }
  }

  return { files: prepared, failed, converted };
}
