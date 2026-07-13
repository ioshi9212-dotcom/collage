const DEFAULT_MAX_ENTRIES = 24;
const DEFAULT_MAX_DECODED_BYTES = 160 * 1024 * 1024;

function positiveLimit(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.max(1, Math.floor(number)) : fallback;
}

function estimateDecodedBytes(image) {
  const width = Number(image?.naturalWidth || image?.width || 0);
  const height = Number(image?.naturalHeight || image?.height || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 0;
  return Math.round(width * height * 4);
}

export function createImageLoader({
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxDecodedBytes = DEFAULT_MAX_DECODED_BYTES,
  createImage = () => new globalThis.Image(),
} = {}) {
  const entryLimit = positiveLimit(maxEntries, DEFAULT_MAX_ENTRIES);
  const byteLimit = positiveLimit(maxDecodedBytes, DEFAULT_MAX_DECODED_BYTES);
  const cache = new Map();
  const inFlight = new Map();
  let decodedBytes = 0;

  function touch(src, entry) {
    cache.delete(src);
    cache.set(src, entry);
  }

  function evictIfNeeded() {
    while ((cache.size > entryLimit || decodedBytes > byteLimit) && cache.size > 1) {
      const oldestKey = cache.keys().next().value;
      const oldest = cache.get(oldestKey);
      cache.delete(oldestKey);
      decodedBytes = Math.max(0, decodedBytes - (oldest?.decodedBytes || 0));
    }
  }

  function store(src, image) {
    const previous = cache.get(src);
    if (previous) decodedBytes = Math.max(0, decodedBytes - (previous.decodedBytes || 0));

    const entry = { image, decodedBytes: estimateDecodedBytes(image) };
    decodedBytes += entry.decodedBytes;
    touch(src, entry);
    evictIfNeeded();
    return image;
  }

  function load(src) {
    if (!src) return Promise.reject(new Error('Не указан источник изображения'));

    const cached = cache.get(src);
    if (cached) {
      touch(src, cached);
      return Promise.resolve(cached.image);
    }

    const pending = inFlight.get(src);
    if (pending) return pending;

    let resolveLoad;
    let rejectLoad;
    const promise = new Promise((resolve, reject) => {
      resolveLoad = resolve;
      rejectLoad = reject;
    });
    inFlight.set(src, promise);

    let image;
    try {
      image = createImage();
    } catch (error) {
      inFlight.delete(src);
      rejectLoad(error);
      return promise;
    }

    if ('decoding' in image) image.decoding = 'async';
    image.onload = () => {
      image.onload = null;
      image.onerror = null;
      inFlight.delete(src);
      resolveLoad(store(src, image));
    };
    image.onerror = (event) => {
      image.onload = null;
      image.onerror = null;
      inFlight.delete(src);
      rejectLoad(event instanceof Error ? event : new Error('Не удалось загрузить изображение'));
    };
    image.src = src;
    return promise;
  }

  function clear() {
    cache.clear();
    decodedBytes = 0;
  }

  function stats() {
    return {
      size: cache.size,
      pending: inFlight.size,
      decodedBytes,
      maxEntries: entryLimit,
      maxDecodedBytes: byteLimit,
      keys: [...cache.keys()],
    };
  }

  return {
    load,
    clear,
    has: (src) => cache.has(src),
    stats,
  };
}

const defaultImageLoader = createImageLoader();

export function loadCachedImage(src) {
  return defaultImageLoader.load(src);
}
