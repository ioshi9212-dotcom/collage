import { readFileSync, writeFileSync } from 'node:fs';

function read(path) { return readFileSync(path, 'utf8'); }
function write(path, value) { writeFileSync(path, value, 'utf8'); }
function replaceOnce(path, from, to, label) {
  const source = read(path);
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing ${label} in ${path}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous ${label} in ${path}`);
  write(path, source.slice(0, first) + to + source.slice(first + from.length));
}
function replaceSection(path, startMarker, endMarker, replacement, label) {
  const source = read(path);
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Missing start ${label} in ${path}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`Missing end ${label} in ${path}`);
  write(path, source.slice(0, start) + replacement + source.slice(end));
}

write('server/publicAlbumModel.js', `import { createHash, randomBytes } from 'node:crypto';

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
`);

write('server/publicAlbumModel.test.mjs', `import assert from 'node:assert/strict';
import {
  createPublicAlbumToken,
  publicPhotoId,
  referencedPublicPhotoKey,
  restorePublicAlbumPhotoMetadata,
  rewritePublicAlbumProject,
} from './publicAlbumModel.js';

const token = createPublicAlbumToken();
assert.match(token, /^[A-Za-z0-9_-]{20,}$/);
const key = 'users/7/photos/abc/original.jpg';
const photoId = publicPhotoId(key);
assert.equal(photoId.length, 24);
assert.equal(referencedPublicPhotoKey([key], photoId), key);
assert.equal(referencedPublicPhotoKey([key], 'missing'), null);

const rewritten = rewritePublicAlbumProject({ pages: [{ frames: [{ photo: { id: 'p1', cloudKey: key, cloudSchema: 'railway-bucket-v1', src: '/private' } }] }] }, 'share123');
assert.equal(rewritten.pages[0].frames[0].photo.cloudKey, undefined);
assert.equal(rewritten.pages[0].frames[0].photo.cloudSchema, undefined);
assert.equal(rewritten.pages[0].frames[0].photo.src, '/api/public-albums/share123/photos/' + photoId);

const brokenPublishedSnapshot = {
  library: [{ id: 'p1', name: 'Фото', src: 'blob:https://local.invalid/abc' }],
  pages: [{
    id: 'page-1',
    frames: [{ id: 'frame-1', x: 10, y: 20, width: 300, height: 400, photo: { id: 'p1', src: 'blob:https://local.invalid/abc', positionX: 0.4 } }],
  }],
};
const canonicalCloudProject = {
  library: [{ id: 'p1', name: 'Фото', cloudKey: key, cloudSchema: 'railway-bucket-v1', src: '/api/photo-assets/file?key=private', type: 'image/jpeg', size: 12345 }],
  pages: [],
};
const repaired = restorePublicAlbumPhotoMetadata(brokenPublishedSnapshot, canonicalCloudProject);
assert.equal(repaired.pages[0].frames[0].x, 10);
assert.equal(repaired.pages[0].frames[0].photo.positionX, 0.4);
assert.equal(repaired.pages[0].frames[0].photo.cloudKey, key);
assert.equal(repaired.library[0].cloudKey, key);
assert.equal(brokenPublishedSnapshot.pages[0].frames[0].photo.cloudKey, undefined);
const repairedPublic = rewritePublicAlbumProject(repaired, 'existing-link');
assert.equal(repairedPublic.pages[0].frames[0].photo.src, '/api/public-albums/existing-link/photos/' + photoId);
assert.equal(repairedPublic.library[0].src, '/api/public-albums/existing-link/photos/' + photoId);

console.log('publicAlbumModel tests passed');
`);

replaceOnce(
  'server.js',
  "import { createPublicAlbumToken, referencedPublicPhotoKey, rewritePublicAlbumProject } from './server/publicAlbumModel.js';",
  "import {\n  createPublicAlbumToken,\n  referencedPublicPhotoKey,\n  restorePublicAlbumPhotoMetadata,\n  rewritePublicAlbumProject,\n} from './server/publicAlbumModel.js';",
  'public album model import',
);

replaceSection(
  'server.js',
  "  const publicPhotoMatch = path.match(/^\\/api\\/public-albums\\/([^/]+)\\/photos\\/([^/]+)$/);",
  "\n  const publicAlbumMatch = path.match(/^\\/api\\/public-albums\\/([^/]+)$/);",
  `  const publicPhotoMatch = path.match(/^\\/api\\/public-albums\\/([^/]+)\\/photos\\/([^/]+)$/);\n  if (method === 'GET' && publicPhotoMatch) {\n    const shareToken = decodeURIComponent(publicPhotoMatch[1]);\n    const photoId = decodeURIComponent(publicPhotoMatch[2]);\n    const result = await pool.query(\n      \`SELECT pa.user_id, pa.data_json AS data, p.data_json AS project_data\n         FROM public_albums pa\n         LEFT JOIN projects p ON p.id = pa.project_id AND p.user_id = pa.user_id\n        WHERE pa.share_token = $1\`,\n      [shareToken],\n    );\n    const album = result.rows[0];\n    if (!album) {\n      sendJson(response, 404, { error: 'public_album_not_found', message: 'Альбом недоступен' });\n      return true;\n    }\n    const resolvedData = restorePublicAlbumPhotoMetadata(album.data, album.project_data);\n    const key = referencedPublicPhotoKey(extractCloudPhotoKeys(resolvedData, album.user_id), photoId);\n    if (!key) {\n      sendJson(response, 404, { error: 'public_photo_not_found', message: 'Фотография недоступна' });\n      return true;\n    }\n    await photoAssetGateway.servePublicPhoto({ response, userId: album.user_id, key });\n    return true;\n  }\n`,
  'public photo route',
);

replaceSection(
  'server.js',
  "  const publicAlbumMatch = path.match(/^\\/api\\/public-albums\\/([^/]+)$/);",
  "\n  if (method === 'POST' && path === '/api/public-albums') {",
  `  const publicAlbumMatch = path.match(/^\\/api\\/public-albums\\/([^/]+)$/);\n  if (method === 'GET' && publicAlbumMatch) {\n    const shareToken = decodeURIComponent(publicAlbumMatch[1]);\n    const result = await pool.query(\n      \`SELECT pa.title, pa.data_json AS data, pa.updated_at, p.data_json AS project_data\n         FROM public_albums pa\n         LEFT JOIN projects p ON p.id = pa.project_id AND p.user_id = pa.user_id\n        WHERE pa.share_token = $1\`,\n      [shareToken],\n    );\n    const album = result.rows[0];\n    if (!album) {\n      sendJson(response, 404, { error: 'public_album_not_found', message: 'Альбом недоступен' });\n      return true;\n    }\n    const resolvedData = restorePublicAlbumPhotoMetadata(album.data, album.project_data);\n    sendJson(response, 200, {\n      album: {\n        title: album.title,\n        updatedAt: album.updated_at,\n        data: rewritePublicAlbumProject(resolvedData, shareToken),\n      },\n    });\n    return true;\n  }\n`,
  'public album GET route',
);

replaceSection(
  'server.js',
  "  if (method === 'POST' && path === '/api/public-albums') {",
  "\n  if (method === 'DELETE' && publicAlbumMatch) {",
  `  if (method === 'POST' && path === '/api/public-albums') {\n    const user = await requireUser(request, response);\n    if (!user) return true;\n    const body = await readBody(request);\n    let data = body.data || {};\n    const title = String(body.title || 'Фотоальбом').trim().slice(0, 120) || 'Фотоальбом';\n    const projectId = body.projectId ? String(body.projectId) : null;\n    let shareToken = body.shareToken ? String(body.shareToken) : '';\n\n    if (projectId) {\n      const ownedProject = await pool.query(\n        'SELECT id, data_json AS data FROM projects WHERE id = $1 AND user_id = $2',\n        [projectId, user.id],\n      );\n      if (!ownedProject.rows[0]) {\n        sendJson(response, 404, { error: 'project_not_found', message: 'Сначала сохрани проект в облако' });\n        return true;\n      }\n      // Publishing happens immediately after a successful cloud save. The database copy is\n      // therefore the canonical snapshot with durable photo keys; browser blob: URLs are not.\n      data = ownedProject.rows[0].data || data;\n      const existing = await pool.query(\n        'SELECT share_token FROM public_albums WHERE user_id = $1 AND project_id = $2',\n        [user.id, projectId],\n      );\n      if (existing.rows[0]?.share_token) shareToken = existing.rows[0].share_token;\n    }\n\n    if (!Array.isArray(data.pages) || !data.pages.length) {\n      sendJson(response, 400, { error: 'invalid_album', message: 'В альбоме нет страниц для публикации' });\n      return true;\n    }\n\n    if (shareToken) {\n      const updated = await pool.query(\n        \`UPDATE public_albums\n            SET project_id = $3, title = $4, data_json = $5, updated_at = NOW()\n          WHERE share_token = $1 AND user_id = $2\n          RETURNING share_token, title, updated_at\`,\n        [shareToken, user.id, projectId, title, data],\n      );\n      if (updated.rows[0]) {\n        await touchProjectPhotoAssets(user.id, data);\n        sendJson(response, 200, { album: { token: shareToken, url: '/album/' + shareToken, title, updatedAt: updated.rows[0].updated_at } });\n        return true;\n      }\n    }\n\n    shareToken = createPublicAlbumToken();\n    const created = await pool.query(\n      \`INSERT INTO public_albums(share_token, user_id, project_id, title, data_json)\n       VALUES ($1, $2, $3, $4, $5)\n       RETURNING share_token, title, updated_at\`,\n      [shareToken, user.id, projectId, title, data],\n    );\n    await touchProjectPhotoAssets(user.id, data);\n    sendJson(response, 200, { album: { token: shareToken, url: '/album/' + shareToken, title, updatedAt: created.rows[0].updated_at } });\n    return true;\n  }\n`,
  'public album POST route',
);

console.log('public album photo fix applied');
