export const DEFAULT_PHOTO_READ_CONCURRENCY = 2;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.max(1, Math.floor(number)) : fallback;
}

function readOneFile(file, createFileReader) {
  return new Promise((resolve, reject) => {
    let reader;
    try {
      reader = createFileReader();
    } catch (error) {
      reject(error);
      return;
    }

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Фотография прочитана в неподдерживаемом формате'));
        return;
      }
      resolve({ file, dataUrl: reader.result });
    };
    reader.onerror = () => reject(reader.error || new Error('Не удалось прочитать фотографию'));
    reader.onabort = () => reject(new Error('Чтение фотографии отменено'));
    reader.readAsDataURL(file);
  });
}

export async function readPhotoFilesAsDataUrls(files, {
  maxConcurrent = DEFAULT_PHOTO_READ_CONCURRENCY,
  createFileReader = () => new globalThis.FileReader(),
} = {}) {
  const source = Array.from(files ?? []);
  const concurrency = Math.min(source.length || 1, positiveInteger(maxConcurrent, DEFAULT_PHOTO_READ_CONCURRENCY));
  const loadedByIndex = new Array(source.length);
  const failed = [];
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= source.length) return;
      const file = source[index];
      try {
        loadedByIndex[index] = await readOneFile(file, createFileReader);
      } catch (error) {
        failed.push({ file, error });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { loaded: loadedByIndex.filter(Boolean), failed };
}
