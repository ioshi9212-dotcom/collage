const HEIC_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const HEIC_EXTENSION = /\.(?:heic|heif)$/i;
const DEFAULT_JPEG_QUALITY = 0.94;
const BUNDLED_CONVERTER_SOURCE = 'bundled:heic-to/csp';

let bundledConverterPromise = null;

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

async function defaultImportModule() {
  return import('heic-to/csp');
}

function converterFromModule(module) {
  const converter = module?.heicTo ?? module?.default?.heicTo ?? module?.default;
  if (typeof converter !== 'function') {
    throw new Error('Встроенный модуль HEIC не содержит функцию heicTo');
  }
  return converter;
}

async function importConverter(options = {}) {
  const importModule = options.importModule ?? defaultImportModule;
  const sources = Array.isArray(options.urls) && options.urls.length
    ? options.urls
    : [BUNDLED_CONVERTER_SOURCE];
  let lastError = null;

  for (const source of sources) {
    try {
      const module = await importModule(source);
      return converterFromModule(module);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Не удалось загрузить встроенный конвертер HEIC${lastError?.message ? `: ${lastError.message}` : ''}`,
    { cause: lastError ?? undefined },
  );
}

export async function loadHeicConverter(options = {}) {
  const customLoader = Boolean(options.importModule || options.urls);
  if (customLoader) return importConverter(options);
  if (!bundledConverterPromise) {
    bundledConverterPromise = importConverter(options).catch((error) => {
      bundledConverterPromise = null;
      throw error;
    });
  }
  return bundledConverterPromise;
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
  let output;
  try {
    output = await converter({
      blob,
      type: 'image/jpeg',
      quality: Number.isFinite(Number(options.quality)) ? Number(options.quality) : DEFAULT_JPEG_QUALITY,
    });
  } catch (error) {
    throw new Error(
      `Декодер не смог прочитать HEIC «${name}»${error?.message ? `: ${error.message}` : ''}`,
      { cause: error },
    );
  }
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
