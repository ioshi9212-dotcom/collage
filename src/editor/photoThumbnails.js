export const DEFAULT_THUMBNAIL_MAX_DIMENSION = 320;
export const DEFAULT_THUMBNAIL_MAX_ENTRIES = 160;
export const DEFAULT_THUMBNAIL_MAX_CONCURRENT = 2;
export const DEFAULT_THUMBNAIL_MIME_TYPE = 'image/webp';
export const DEFAULT_THUMBNAIL_QUALITY = 0.82;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.max(1, Math.floor(number)) : fallback;
}

function normalizedQuality(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_THUMBNAIL_QUALITY;
  return Math.min(1, Math.max(0.1, number));
}

export function thumbnailDimensions(width, height, maxDimension = DEFAULT_THUMBNAIL_MAX_DIMENSION) {
  const sourceWidth = Number(width);
  const sourceHeight = Number(height);
  const limit = positiveInteger(maxDimension, DEFAULT_THUMBNAIL_MAX_DIMENSION);
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('Не удалось определить размер фотографии');
  }

  const scale = Math.min(1, limit / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export function createThumbnailLoader({
  maxEntries = DEFAULT_THUMBNAIL_MAX_ENTRIES,
  maxConcurrent = DEFAULT_THUMBNAIL_MAX_CONCURRENT,
  maxDimension = DEFAULT_THUMBNAIL_MAX_DIMENSION,
  mimeType = DEFAULT_THUMBNAIL_MIME_TYPE,
  quality = DEFAULT_THUMBNAIL_QUALITY,
  createImage = () => new globalThis.Image(),
  createCanvas = () => globalThis.document.createElement('canvas'),
} = {}) {
  const entryLimit = positiveInteger(maxEntries, DEFAULT_THUMBNAIL_MAX_ENTRIES);
  const concurrencyLimit = positiveInteger(maxConcurrent, DEFAULT_THUMBNAIL_MAX_CONCURRENT);
  const dimensionLimit = positiveInteger(maxDimension, DEFAULT_THUMBNAIL_MAX_DIMENSION);
  const outputQuality = normalizedQuality(quality);
  const cache = new Map();
  const inFlight = new Map();
  const queue = [];
  let active = 0;

  function touch(src, value) {
    cache.delete(src);
    cache.set(src, value);
  }

  function store(src, value) {
    touch(src, value);
    while (cache.size > entryLimit) cache.delete(cache.keys().next().value);
    return value;
  }

  function render(src) {
    return new Promise((resolve, reject) => {
      let image;
      try {
        image = createImage();
      } catch (error) {
        reject(error);
        return;
      }

      const cleanup = () => {
        image.onload = null;
        image.onerror = null;
      };

      image.onload = () => {
        try {
          const size = thumbnailDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height, dimensionLimit);
          const canvas = createCanvas();
          canvas.width = size.width;
          canvas.height = size.height;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Браузер не поддерживает создание миниатюр');
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = 'high';
          context.drawImage(image, 0, 0, size.width, size.height);
          const dataUrl = canvas.toDataURL(mimeType, outputQuality);
          if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
            throw new Error('Не удалось создать миниатюру');
          }
          cleanup();
          resolve(dataUrl);
        } catch (error) {
          cleanup();
          reject(error);
        }
      };
      image.onerror = () => {
        cleanup();
        reject(new Error('Не удалось прочитать фотографию для миниатюры'));
      };

      if ('decoding' in image) image.decoding = 'async';
      image.src = src;
    });
  }

  function pump() {
    while (active < concurrencyLimit && queue.length > 0) {
      const task = queue.shift();
      active += 1;
      render(task.src)
        .then((value) => task.resolve(store(task.src, value)), task.reject)
        .finally(() => {
          active -= 1;
          inFlight.delete(task.src);
          pump();
        });
    }
  }

  function load(src) {
    if (!src) return Promise.reject(new Error('Не указан источник фотографии'));
    const cached = cache.get(src);
    if (cached) {
      touch(src, cached);
      return Promise.resolve(cached);
    }
    const pending = inFlight.get(src);
    if (pending) return pending;

    const promise = new Promise((resolve, reject) => {
      queue.push({ src, resolve, reject });
      pump();
    });
    inFlight.set(src, promise);
    return promise;
  }

  function clear() {
    cache.clear();
  }

  function stats() {
    return {
      cached: cache.size,
      pending: inFlight.size,
      queued: queue.length,
      active,
      maxEntries: entryLimit,
      maxConcurrent: concurrencyLimit,
      keys: [...cache.keys()],
    };
  }

  return { load, clear, stats, has: (src) => cache.has(src) };
}

const defaultThumbnailLoader = createThumbnailLoader();

export function loadPhotoThumbnail(src) {
  return defaultThumbnailLoader.load(src);
}
