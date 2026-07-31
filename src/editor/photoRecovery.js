function cleanName(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

function sourceName(photo) {
  return cleanName(photo?.sourceName || photo?.name);
}

function sourceSize(photo) {
  const value = Number(photo?.sourceSize ?? photo?.size);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function candidateFor(reference, photosByName) {
  const candidates = (photosByName.get(sourceName(reference)) || []).filter((photo) => photo?.src);
  if (!candidates.length) return { photo: null, ambiguous: false };
  if (candidates.length === 1) return { photo: candidates[0], ambiguous: false };
  const size = sourceSize(reference);
  const sameSize = size ? candidates.filter((photo) => sourceSize(photo) === size) : [];
  if (sameSize.length && sameSize.every((photo) => sourceSize(photo) === sourceSize(sameSize[0]))) {
    return { photo: sameSize[0], ambiguous: false };
  }
  const candidateSizes = new Set(candidates.map(sourceSize).filter(Boolean));
  if (candidateSizes.size === 1) return { photo: candidates[0], ambiguous: false };
  return { photo: null, ambiguous: true };
}

function recoveredReference(reference, photo) {
  return {
    ...reference,
    id: photo.id,
    name: reference?.name || photo.name,
    sourceName: photo.sourceName || photo.name,
    sourceSize: photo.sourceSize ?? photo.size,
    sourceLastModified: photo.sourceLastModified,
    assetId: photo.assetId,
    assetSchema: photo.assetSchema,
    cloudKey: photo.cloudKey,
    cloudSchema: photo.cloudSchema,
    type: photo.type,
    size: photo.size,
    src: photo.src,
  };
}

export function recoverMissingFramePhotos(pages = [], importedPhotos = []) {
  const photosByName = new Map();
  for (const photo of Array.from(importedPhotos || [])) {
    const names = new Set([sourceName(photo), cleanName(photo?.name)].filter(Boolean));
    for (const name of names) photosByName.set(name, [...(photosByName.get(name) || []), photo]);
  }

  let missing = 0;
  let recovered = 0;
  let ambiguous = 0;
  const usedPhotoIds = new Set();
  const nextPages = Array.from(pages || []).map((page) => ({
    ...page,
    frames: Array.from(page?.frames || []).map((frame) => {
      const reference = frame?.photo;
      if (!reference || reference.src) return frame;
      missing += 1;
      const match = candidateFor(reference, photosByName);
      if (!match.photo) {
        if (match.ambiguous) ambiguous += 1;
        return frame;
      }
      recovered += 1;
      if (match.photo.id != null) usedPhotoIds.add(String(match.photo.id));
      return { ...frame, photo: recoveredReference(reference, match.photo) };
    }),
  }));

  return { pages: nextPages, missing, recovered, ambiguous, unresolved: Math.max(0, missing - recovered), usedPhotoIds };
}
