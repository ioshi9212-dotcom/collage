export const CLOUD_PHOTO_SCHEMA = 'railway-bucket-v1';
export const CLOUD_PROJECT_VERSION = 'live-25-railway-bucket-photos';

export function photoAssetUrl(key) {
  return `/api/photo-assets/file?key=${encodeURIComponent(String(key || ''))}`;
}

export function cloudKeyFromPhoto(photo) {
  if (photo?.cloudKey) return String(photo.cloudKey);
  const src = String(photo?.src || '');
  if (!src) return '';
  try {
    const url = new URL(src, 'https://collage.local');
    if (url.pathname !== '/api/photo-assets/file') return '';
    return String(url.searchParams.get('key') || '');
  } catch {
    return '';
  }
}

export function normalizeCloudPhoto(photo, asset = null) {
  const cloudKey = String(asset?.cloudKey || cloudKeyFromPhoto(photo));
  if (!cloudKey) return photo;
  const id = asset?.id || photo?.id;
  const type = asset?.type || photo?.type;
  const size = Number(asset?.size ?? photo?.size) || 0;
  return {
    ...photo,
    id,
    name: String(asset?.name || photo?.name || 'Фото').slice(0, 500),
    type,
    size,
    cloudKey,
    cloudSchema: CLOUD_PHOTO_SCHEMA,
    src: photoAssetUrl(cloudKey),
  };
}

export function cloudLibraryItem(photo) {
  const normalized = normalizeCloudPhoto(photo);
  const {
    assetId: _assetId,
    assetSchema: _assetSchema,
    persistenceFallback: _persistenceFallback,
    ...cloud
  } = normalized;
  return cloud;
}

export function buildCloudProject(project, cloudLibrary) {
  const libraryById = new Map(cloudLibrary.filter((photo) => photo?.id != null).map((photo) => [String(photo.id), photo]));
  const pages = Array.isArray(project?.pages) ? project.pages.map((page) => ({
    ...page,
    frames: Array.isArray(page?.frames) ? page.frames.map((frame) => {
      const photo = frame?.photo;
      if (!photo?.id) return frame;
      const cloud = libraryById.get(String(photo.id));
      if (!cloud) return frame;
      const { src: _src, ...reference } = cloud;
      return { ...frame, photo: { ...photo, ...reference } };
    }) : [],
  })) : [];
  return {
    ...project,
    version: CLOUD_PROJECT_VERSION,
    photoAssetSchema: CLOUD_PHOTO_SCHEMA,
    library: cloudLibrary,
    pages,
    savedAt: new Date().toISOString(),
  };
}
