import { createHash, randomBytes } from 'node:crypto';

export function createPublicAlbumToken() {
  return randomBytes(18).toString('base64url');
}

export function publicPhotoId(key) {
  return createHash('sha256').update(String(key || '')).digest('base64url').slice(0, 24);
}

function collectCloudPhotoMetadata(project) {
  const metadata = new Map();
  const collect = (photo) => {
    if (!photo || typeof photo !== 'object' || photo.id == null || !photo.cloudKey) return;
    metadata.set(String(photo.id), {
      cloudKey: String(photo.cloudKey),
      ...(photo.cloudSchema ? { cloudSchema: String(photo.cloudSchema) } : {}),
      ...(photo.type ? { type: photo.type } : {}),
      ...(Number(photo.size) > 0 ? { size: Number(photo.size) } : {}),
    });
  };
  (Array.isArray(project?.library) ? project.library : []).forEach(collect);
  for (const page of Array.isArray(project?.pages) ? project.pages : []) {
    for (const frame of Array.isArray(page?.frames) ? page.frames : []) collect(frame?.photo);
  }
  return metadata;
}

function restorePhotoMetadata(photo, metadata) {
  if (!photo || typeof photo !== 'object' || photo.id == null || photo.cloudKey) return photo;
  const cloud = metadata.get(String(photo.id));
  return cloud ? { ...photo, ...cloud } : photo;
}

export function restorePublicAlbumPhotoMetadata(snapshot, cloudProject) {
  const root = structuredClone(snapshot || {});
  const metadata = collectCloudPhotoMetadata(cloudProject);
  if (!metadata.size) return root;

  if (Array.isArray(root.library)) {
    root.library = root.library.map((photo) => restorePhotoMetadata(photo, metadata));
  }
  if (Array.isArray(root.pages)) {
    root.pages = root.pages.map((page) => ({
      ...page,
      frames: (Array.isArray(page?.frames) ? page.frames : []).map((frame) => ({
        ...frame,
        photo: restorePhotoMetadata(frame?.photo, metadata),
      })),
    }));
  }
  return root;
}

export function rewritePublicAlbumProject(project, shareToken) {
  const root = structuredClone(project || {});
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value.cloudKey === 'string' && value.cloudKey) {
      value.src = '/api/public-albums/' + encodeURIComponent(shareToken) + '/photos/' + publicPhotoId(value.cloudKey);
      delete value.cloudKey;
      delete value.cloudSchema;
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
  return root;
}

export function referencedPublicPhotoKey(keys, photoId) {
  const target = String(photoId || '');
  return [...new Set(keys || [])].find((key) => publicPhotoId(key) === target) || null;
}
