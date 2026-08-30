import { randomBytes } from 'node:crypto';

const PUBLIC_ALBUM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,96}$/;

export function createPublicAlbumToken(randomBytesImpl = randomBytes) {
  return randomBytesImpl(24).toString('base64url');
}

export function normalizePublicAlbumToken(value) {
  const token = String(value || '').trim();
  return PUBLIC_ALBUM_TOKEN_PATTERN.test(token) ? token : '';
}

export function publicAlbumPath(token) {
  const normalized = normalizePublicAlbumToken(token);
  return normalized ? `/album/${encodeURIComponent(normalized)}` : '';
}

function cleanCloudKey(value) {
  return String(value || '').replace(/^\/+/, '');
}

export function publicAlbumPhotoKeys(data) {
  const keys = new Set();
  for (const page of Array.isArray(data?.pages) ? data.pages : []) {
    for (const frame of Array.isArray(page?.frames) ? page.frames : []) {
      const key = cleanCloudKey(frame?.photo?.cloudKey);
      if (key && !key.includes('..')) keys.add(key);
    }
  }
  return keys;
}

export function publicAlbumUsesPhotoKey(data, key) {
  const normalized = cleanCloudKey(key);
  return Boolean(normalized && publicAlbumPhotoKeys(data).has(normalized));
}

function publicPhotoUrl(token, key) {
  return `/api/public-albums/${encodeURIComponent(token)}/photo?key=${encodeURIComponent(key)}`;
}

function publicFrame(frame, token) {
  const next = { ...(frame || {}) };
  const photo = frame?.photo;
  if (!photo || typeof photo !== 'object') return next;

  const key = cleanCloudKey(photo.cloudKey);
  const safePhoto = { ...photo };
  delete safePhoto.assetId;
  delete safePhoto.assetSchema;
  delete safePhoto.persistenceFallback;
  delete safePhoto.src;
  delete safePhoto.cloudKey;
  if (key && !key.includes('..')) safePhoto.src = publicPhotoUrl(token, key);
  next.photo = safePhoto;
  return next;
}

export function sanitizePublicAlbumData(data, token) {
  const normalizedToken = normalizePublicAlbumToken(token);
  if (!normalizedToken) throw new Error('Invalid public album token');

  const pages = (Array.isArray(data?.pages) ? data.pages : []).map((page) => ({
    ...page,
    frames: (Array.isArray(page?.frames) ? page.frames : []).map((frame) => publicFrame(frame, normalizedToken)),
  }));

  return {
    version: 'public-album-v1',
    canvas: data?.canvas || { width: 1480, height: 2100 },
    settings: data?.settings || {},
    pages,
    currentPageId: data?.currentPageId || pages[0]?.id || null,
    extraLayers: data?.extraLayers || { pages: {} },
  };
}
