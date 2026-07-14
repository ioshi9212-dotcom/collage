function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePhoto(photo) {
  if (!photo || typeof photo !== 'object') return photo ?? null;
  return {
    ...photo,
    name: String(photo.name || 'Фото').slice(0, 500),
    zoom: Math.min(10, Math.max(0.1, finiteNumber(photo.zoom, 1))),
    offsetX: Math.round(finiteNumber(photo.offsetX, 0)),
    offsetY: Math.round(finiteNumber(photo.offsetY, 0)),
  };
}

function clonePhotoReference(photo) {
  const normalized = normalizePhoto(photo);
  if (!normalized || typeof normalized !== 'object') return normalized;
  const { src: _embeddedSource, ...reference } = normalized;
  return reference;
}

const PHOTO_ASSET_METADATA_KEYS = ['assetId', 'assetSchema', 'type', 'size', 'persistenceFallback'];

function copyPhotoAssetMetadata(target, source) {
  for (const key of PHOTO_ASSET_METADATA_KEYS) {
    if (target[key] == null && source?.[key] != null) target[key] = source[key];
  }
  return target;
}

function libraryPhotoFromReference(photo, id) {
  const item = {
    id,
    name: photo?.name,
    src: photo?.src,
  };
  return copyPhotoAssetMetadata(item, photo);
}

function cloneLibrary(library) {
  if (!Array.isArray(library)) return [];

  const next = [];
  const byId = new Map();
  for (const item of library) {
    if (!item || typeof item !== 'object') continue;
    const copy = {
      ...item,
      name: typeof item.name === 'string' ? item.name.slice(0, 500) : '',
    };
    if (copy.id == null) {
      next.push(copy);
      continue;
    }

    const key = String(copy.id);
    const existing = byId.get(key);
    if (!existing) {
      next.push(copy);
      byId.set(key, copy);
      continue;
    }

    if (!existing.src && copy.src) existing.src = copy.src;
    if (!existing.name && copy.name) existing.name = copy.name;
    copyPhotoAssetMetadata(existing, copy);
  }
  next.forEach((item) => {
    if (!item.name) item.name = 'Фото';
  });
  return next;
}

function makeRecoveredPhotoId(libraryById, startIndex) {
  let index = Math.max(1, Number(startIndex) || 1);
  let id = `recovered-photo-${index}`;
  while (libraryById.has(id)) {
    index += 1;
    id = `recovered-photo-${index}`;
  }
  return id;
}

export function compactProjectPhotos(library = [], pages = []) {
  const nextLibrary = cloneLibrary(library);
  const libraryById = new Map(
    nextLibrary
      .filter((item) => item.id != null)
      .map((item) => [String(item.id), item]),
  );
  const libraryBySource = new Map(
    nextLibrary
      .filter((item) => item.id != null && item.src)
      .map((item) => [String(item.src), item]),
  );

  const nextPages = Array.isArray(pages)
    ? pages.map((page) => ({
        ...page,
        frames: Array.isArray(page?.frames)
          ? page.frames.map((frame) => {
              const photo = normalizePhoto(frame?.photo);
              if (!photo || typeof photo !== 'object') return { ...frame, photo: photo ?? null };

              let normalizedPhoto = photo;
              if (photo.id == null && photo.src) {
                let recovered = libraryBySource.get(String(photo.src));
                if (!recovered) {
                  const id = makeRecoveredPhotoId(libraryById, nextLibrary.length + 1);
                  recovered = libraryPhotoFromReference(photo, id);
                  nextLibrary.push(recovered);
                  libraryById.set(String(id), recovered);
                  libraryBySource.set(String(photo.src), recovered);
                } else {
                  copyPhotoAssetMetadata(recovered, photo);
                }
                normalizedPhoto = {
                  ...photo,
                  id: recovered.id,
                  name: photo.name || recovered.name,
                  assetId: photo.assetId || recovered.assetId,
                  assetSchema: photo.assetSchema || recovered.assetSchema,
                };
              }

              if (normalizedPhoto.id != null && normalizedPhoto.src) {
                const key = String(normalizedPhoto.id);
                const existing = libraryById.get(key);
                if (existing) {
                  if (!existing.src) {
                    existing.src = normalizedPhoto.src;
                    if ((!existing.name || existing.name === 'Фото') && normalizedPhoto.name && normalizedPhoto.name !== 'Фото') {
                      existing.name = normalizedPhoto.name;
                    }
                    libraryBySource.set(String(normalizedPhoto.src), existing);
                  }
                  copyPhotoAssetMetadata(existing, normalizedPhoto);
                } else {
                  const recovered = libraryPhotoFromReference(normalizedPhoto, normalizedPhoto.id);
                  nextLibrary.push(recovered);
                  libraryById.set(key, recovered);
                  libraryBySource.set(String(normalizedPhoto.src), recovered);
                }
              }

              return { ...frame, photo: clonePhotoReference(normalizedPhoto) };
            })
          : [],
      }))
    : [];

  return { library: nextLibrary, pages: nextPages };
}

export function hydrateProjectPhotos(library = [], pages = []) {
  const sourceById = new Map(
    cloneLibrary(library)
      .filter((item) => item.id != null && item.src)
      .map((item) => [String(item.id), item.src]),
  );

  return Array.isArray(pages)
    ? pages.map((page) => ({
        ...page,
        frames: Array.isArray(page?.frames)
          ? page.frames.map((frame) => {
              const photo = normalizePhoto(frame?.photo);
              if (!photo || typeof photo !== 'object') return { ...frame, photo: photo ?? null };
              if (photo.src || photo.id == null) return { ...frame, photo };
              const src = sourceById.get(String(photo.id));
              return src ? { ...frame, photo: { ...photo, src } } : { ...frame, photo };
            })
          : [],
      }))
    : [];
}
