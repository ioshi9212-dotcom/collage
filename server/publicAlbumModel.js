import { createHash, randomBytes } from 'node:crypto';

export function createPublicAlbumToken() {
  return randomBytes(18).toString('base64url');
}

export function publicPhotoId(key) {
  return createHash('sha256').update(String(key || '')).digest('base64url').slice(0, 24);
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
      value.src =         '/api/public-albums/' + encodeURIComponent(shareToken) + '/photos/' + publicPhotoId(value.cloudKey);
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
