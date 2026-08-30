import { createHash, randomBytes } from 'node:crypto';

export function createPublicAlbumToken() {
  return randomBytes(18).toString('base64url');
}

export function publicPhotoId(key) {
  return createHash('sha256').update(String(key || '')).digest('base64url').slice(0, 24);
}

function cloudKeysByPhotoId(project) {
  return new Map(
    (Array.isArray(project?.library) ? project.library : [])
      .filter((photo) => photo?.id != null && typeof photo?.cloudKey === 'string' && photo.cloudKey)
      .map((photo) => [String(photo.id), photo.cloudKey]),
  );
}

export function rewritePublicAlbumProject(project, shareToken) {
  const root = structuredClone(project || {});
  const keyByPhotoId = cloudKeysByPhotoId(root);
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const directKey = typeof value.cloudKey === 'string' ? value.cloudKey : '';
    const libraryKey = value.id != null && typeof value.src === 'string'
      ? keyByPhotoId.get(String(value.id)) || ''
      : '';
    const cloudKey = directKey || libraryKey;

    if (cloudKey) {
      value.src = '/api/public-albums/' + encodeURIComponent(shareToken) + '/photos/' + publicPhotoId(cloudKey);
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
