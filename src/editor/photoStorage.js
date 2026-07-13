function clonePhotoReference(photo) {
  if (!photo || typeof photo !== 'object') return photo ?? null;
  const { src: _embeddedSource, ...reference } = photo;
  return reference;
}

function cloneLibrary(library) {
  return Array.isArray(library)
    ? library.filter((item) => item && typeof item === 'object').map((item) => ({ ...item }))
    : [];
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

              if (photo.id != null && photo.src && !libraryById.has(String(photo.id))) {
                const recovered = {
                  id: photo.id,
                  name: photo.name || 'Фото',
                  src: photo.src,
                };
                nextLibrary.push(recovered);
                libraryById.set(String(photo.id), recovered);
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
