const PUBLIC_ALBUM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,96}$/;

export function normalizePublicAlbumToken(value) {
  const token = String(value || '').trim();
  return PUBLIC_ALBUM_TOKEN_PATTERN.test(token) ? token : '';
}

export function publicAlbumTokenFromPath(pathname = globalThis.location?.pathname || '') {
  const match = String(pathname || '').match(/^\/album\/([^/?#]+)\/?$/);
  if (!match) return '';
  try {
    return normalizePublicAlbumToken(decodeURIComponent(match[1]));
  } catch {
    return '';
  }
}

export function publicAlbumUrl(token, origin = globalThis.location?.origin || '') {
  const normalized = normalizePublicAlbumToken(token);
  if (!normalized) return '';
  const path = `/album/${encodeURIComponent(normalized)}`;
  return origin ? `${String(origin).replace(/\/+$/, '')}${path}` : path;
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Ошибка ${response.status}`);
  }
  return payload;
}

export async function publishPublicAlbum(projectId, options = {}) {
  const id = String(projectId || '').trim();
  if (!id) throw new Error('Сначала сохрани проект в аккаунте');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl('/api/public-albums', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: id }),
  });
  const payload = await parseResponse(response);
  return payload?.share || payload;
}

export async function revokePublicAlbum(token, options = {}) {
  const normalized = normalizePublicAlbumToken(token);
  if (!normalized) throw new Error('Публичная ссылка не найдена');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(`/api/public-albums/${encodeURIComponent(normalized)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return parseResponse(response);
}

export async function fetchPublicAlbum(token, options = {}) {
  const normalized = normalizePublicAlbumToken(token);
  if (!normalized) throw new Error('Ссылка на альбом повреждена');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(`/api/public-albums/${encodeURIComponent(normalized)}`, {
    method: 'GET',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });
  const payload = await parseResponse(response);
  return payload?.album || payload;
}
