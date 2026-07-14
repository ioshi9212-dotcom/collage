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

function cloneLibrary(library) {
  if (!Array.isArray(library)) return [];

  const next = [];
  const byId = new Map();
  for (const item of library) {
    if (!item || typeof item !== 'object') continue;
    const copy = { ...item, name: String(item.name || 'Фото').slice(0, 500) };
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
  }
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
                  recovered = {
                    id,
                    name: photo.name,
                    src: photo.src,
                  };
                  nextLibrary.push(recovered);
                  libraryById.set(String(id), recovered);
                  libraryBySource.set(String(photo.src), recovered);
                }
                normalizedPhoto = {
                  ...photo,
                  id: recovered.id,
                  name: photo.name || recovered.name,
                };
              }

              if (normalizedPhoto.id != null && normalizedPhoto.src) {
                const key = String(normalizedPhoto.id);
                const existing = libraryById.get(key);
                if (existing && !existing.src) {
                  existing.src = normalizedPhoto.src;
                  if (!existing.name && normalizedPhoto.name) existing.name = normalizedPhoto.name;
                  libraryBySource.set(String(normalizedPhoto.src), existing);
                } else if (!existing) {
                  const recovered = {
                    id: normalizedPhoto.id,
                    name: normalizedPhoto.name,
                    src: normalizedPhoto.src,
                  };
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
