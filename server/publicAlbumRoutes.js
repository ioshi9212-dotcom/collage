import { Readable } from 'node:stream';
import {
  createPresignedObjectUrl,
  isOwnedPhotoKey,
} from './bucketGateway.js';
import {
  createPublicAlbumToken,
  normalizePublicAlbumToken,
  publicAlbumPath,
  publicAlbumUsesPhotoKey,
  sanitizePublicAlbumData,
} from './publicAlbums.js';

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

export async function ensurePublicAlbumSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS album_shares (
      token TEXT PRIMARY KEY,
      project_id TEXT UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS album_shares_user_updated_idx
      ON album_shares(user_id, updated_at DESC);
  `);
}

async function sendSharedPhoto({ response, share, key, photoAssetGateway }) {
  if (
    !key
    || !isOwnedPhotoKey(share.user_id, key)
    || !publicAlbumUsesPhotoKey(share.data, key)
  ) {
    sendJson(response, 404, { error: 'public_photo_not_found', message: 'Фотография недоступна.' });
    return;
  }

  if (!photoAssetGateway?.config?.configured) {
    sendJson(response, 503, {
      error: 'photo_storage_unavailable',
      message: 'Хранилище фотографий временно недоступно.',
    });
    return;
  }

  const downloadUrl = createPresignedObjectUrl({
    config: photoAssetGateway.config,
    method: 'GET',
    key,
    expiresSeconds: 900,
  });
  const upstream = await fetch(downloadUrl, { method: 'GET' });
  if (!upstream.ok || !upstream.body) {
    sendJson(response, upstream.status === 404 ? 404 : 502, {
      error: 'public_photo_unavailable',
      message: 'Фотография временно недоступна.',
    });
    return;
  }

  const headers = {
    'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
  };
  const contentLength = upstream.headers.get('content-length');
  const etag = upstream.headers.get('etag');
  if (contentLength) headers['Content-Length'] = contentLength;
  if (etag) headers.ETag = etag;

  response.writeHead(200, headers);
  const bodyStream = Readable.fromWeb(upstream.body);
  bodyStream.on('error', (error) => {
    console.error('Public album photo stream failed', error);
    response.destroy?.(error);
  });
  response.once?.('close', () => {
    if (!response.writableEnded) bodyStream.destroy();
  });
  bodyStream.pipe(response);
}

export async function handlePublicAlbumRequest({
  request,
  response,
  pool,
  photoAssetGateway,
  requireUser,
  readBody,
  authJsonLimitBytes,
}) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const path = url.pathname;
  if (!path.startsWith('/api/public-albums')) return false;

  const method = request.method || 'GET';
  const photoMatch = path.match(/^\/api\/public-albums\/([^/]+)\/photo$/);
  if (method === 'GET' && photoMatch) {
    const token = normalizePublicAlbumToken(photoMatch[1]);
    if (!token) {
      sendJson(response, 404, { error: 'public_album_not_found', message: 'Ссылка на альбом недоступна.' });
      return true;
    }

    const result = await pool.query(
      `SELECT p.user_id, p.data_json AS data
         FROM album_shares s
         JOIN projects p ON p.id = s.project_id
        WHERE s.token = $1`,
      [token],
    );
    const share = result.rows[0];
    if (!share) {
      sendJson(response, 404, { error: 'public_album_not_found', message: 'Ссылка на альбом больше не работает.' });
      return true;
    }

    const key = String(url.searchParams.get('key') || '').replace(/^\/+/, '');
    await sendSharedPhoto({ response, share, key, photoAssetGateway });
    return true;
  }

  const tokenMatch = path.match(/^\/api\/public-albums\/([^/]+)$/);
  if (method === 'GET' && tokenMatch) {
    const token = normalizePublicAlbumToken(tokenMatch[1]);
    if (!token) {
      sendJson(response, 404, { error: 'public_album_not_found', message: 'Ссылка на альбом больше не работает.' });
      return true;
    }

    const result = await pool.query(
      `SELECT p.title, p.data_json AS data, p.updated_at
         FROM album_shares s
         JOIN projects p ON p.id = s.project_id
        WHERE s.token = $1`,
      [token],
    );
    const row = result.rows[0];
    if (!row) {
      sendJson(response, 404, { error: 'public_album_not_found', message: 'Ссылка на альбом больше не работает.' });
      return true;
    }

    sendJson(response, 200, {
      album: {
        title: row.title,
        updatedAt: row.updated_at,
        data: sanitizePublicAlbumData(row.data, token),
      },
    }, {
      'X-Robots-Tag': 'noindex, nofollow',
    });
    return true;
  }

  if (method === 'POST' && path === '/api/public-albums') {
    const user = await requireUser(request, response);
    if (!user) return true;
    const body = await readBody(request, authJsonLimitBytes);
    const projectId = String(body.projectId || '').trim();
    if (!projectId) {
      sendJson(response, 400, { error: 'project_id_required', message: 'Сначала сохрани проект.' });
      return true;
    }

    const project = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, user.id],
    );
    if (!project.rows[0]) {
      sendJson(response, 404, { error: 'project_not_found', message: 'Облачный проект не найден.' });
      return true;
    }

    const candidateToken = createPublicAlbumToken();
    const shared = await pool.query(
      `INSERT INTO album_shares(token, project_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id) DO UPDATE
         SET updated_at = NOW()
       RETURNING token, project_id, created_at, updated_at`,
      [candidateToken, projectId, user.id],
    );
    const row = shared.rows[0];
    sendJson(response, 200, {
      share: {
        token: row.token,
        projectId: row.project_id,
        url: publicAlbumPath(row.token),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
    return true;
  }

  if (method === 'DELETE' && tokenMatch) {
    const user = await requireUser(request, response);
    if (!user) return true;
    const token = normalizePublicAlbumToken(tokenMatch[1]);
    if (!token) {
      sendJson(response, 404, { error: 'public_album_not_found' });
      return true;
    }

    const deleted = await pool.query(
      'DELETE FROM album_shares WHERE token = $1 AND user_id = $2 RETURNING project_id',
      [token, user.id],
    );
    if (!deleted.rows[0]) {
      sendJson(response, 404, { error: 'public_album_not_found', message: 'Публичная ссылка уже закрыта.' });
      return true;
    }

    sendJson(response, 200, { ok: true, projectId: deleted.rows[0].project_id });
    return true;
  }

  sendJson(response, 404, { error: 'public_album_api_not_found' });
  return true;
}
