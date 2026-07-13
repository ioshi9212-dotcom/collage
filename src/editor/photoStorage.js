function clonePhotoReference(photo) {
  if (!photo || typeof photo !== 'object') return photo ?? null;
  const { src: _embeddedSource, ...reference } = photo;
  return reference;
}

function cloneLibrary(library) {
  if (!Array.isArray(library)) return [];

  const next = [];
  const byId = new Map();
  for (const item of library) {
    if (!item || typeof item !== 'object') continue;
    const copy = { ...item };
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

export function compactProjectPhotos(library = [], pages = []) {
  const nextLibrary = cloneLibrary(library);
  const libraryById = new Map(
    nextLibrary
      .filter((item) => item.id != null)
      .map((item) => [String(item.id), item]),
  );

  const nextPages = Array.isArray(pages)
    ? pages.map((page) => ({
        ...page,
        frames: Array.isArray(page?.frames)
          ? page.frames.map((frame) => {
              const photo = frame?.photo;
              if (!photo || typeof photo !== 'object') return { ...frame, photo: photo ?? null };

              if (photo.id != null && photo.src) {
                const key = String(photo.id);
                const existing = libraryById.get(key);
                if (existing && !existing.src) {
                  existing.src = photo.src;
                  if (!existing.name && photo.name) existing.name = photo.name;
                } else if (!existing) {
                  const recovered = {
                    id: photo.id,
                    name: photo.name || 'Фото',
                    src: photo.src,
                  };
                  nextLibrary.push(recovered);
                  libraryById.set(key, recovered);
                }
              }

              return { ...frame, photo: clonePhotoReference(photo) };
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
              const photo = frame?.photo;
              if (!photo || typeof photo !== 'object' || photo.src || photo.id == null) return { ...frame };
              const src = sourceById.get(String(photo.id));
              return src ? { ...frame, photo: { ...photo, src } } : { ...frame };
            })
          : [],
      }))
    : [];
}
