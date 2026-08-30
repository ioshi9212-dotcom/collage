import { createHmac, createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { createFixedWindowRateLimiter } from './rateLimit.js';

export const CLOUD_PHOTO_SCHEMA = 'railway-bucket-v1';
export const DEFAULT_MAX_PHOTO_BYTES = 25 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
]);

const EXTENSION_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function base64urlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    String(cookieHeader)
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) return [part, ''];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function hmac(key, value, encoding) {
  return createHmac('sha256', key).update(value).digest(encoding);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function encodeRfc3986(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
}

function canonicalObjectPath(config, key) {
  const parts = config.urlStyle === 'virtual'
    ? String(key).split('/')
    : [config.bucket, ...String(key).split('/')];
  return `/${parts.map(encodeRfc3986).join('/')}`;
}

function objectEndpoint(config) {
  const endpoint = new URL(config.endpoint);
  if (config.urlStyle === 'virtual') endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
  return endpoint;
}

function formatAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

export function resolveBucketConfig(env = process.env) {
  const endpoint = String(env.AWS_ENDPOINT_URL || '').trim().replace(/\/+$/, '');
  const region = String(env.AWS_DEFAULT_REGION || 'auto').trim() || 'auto';
  const bucket = String(env.AWS_S3_BUCKET_NAME || '').trim();
  const accessKeyId = String(env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(env.AWS_SECRET_ACCESS_KEY || '').trim();
  const requestedUrlStyle = String(env.AWS_S3_URL_STYLE || '').trim().toLowerCase();
  const urlStyle = requestedUrlStyle === 'path' || requestedUrlStyle === 'virtual'
    ? requestedUrlStyle
    : 'virtual';
  const maxPhotoBytes = positiveInteger(env.MAX_PHOTO_FILE_BYTES, DEFAULT_MAX_PHOTO_BYTES);
  const configured = Boolean(endpoint && bucket && accessKeyId && secretAccessKey);
  return { endpoint, region, bucket, accessKeyId, secretAccessKey, urlStyle, maxPhotoBytes, configured };
}

export function verifySessionToken(cookieHeader, secret, now = Date.now()) {
  if (!secret) return null;
  const token = parseCookies(cookieHeader).collage_session;
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = hmac(secret, payload, 'base64url');
  try {
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
    const parsed = JSON.parse(base64urlDecode(payload));
    if (!parsed?.id || !parsed?.email || now > Number(parsed.exp)) return null;
    return { id: Number(parsed.id), email: String(parsed.email) };
  } catch {
    return null;
  }
}

export function normalizeImageType(value) {
  const type = String(value || '').trim().toLowerCase().split(';')[0];
  return ALLOWED_IMAGE_TYPES.has(type) ? type : '';
}

export function buildPhotoObjectKey(userId, type, id = randomUUID()) {
  const extension = EXTENSION_BY_TYPE[normalizeImageType(type)] || 'bin';
  return `users/${Number(userId)}/photos/${id}/original.${extension}`;
}

export function isOwnedPhotoKey(userId, key) {
  const normalized = String(key || '').replace(/^\/+/, '');
  return normalized.startsWith(`users/${Number(userId)}/photos/`) && !normalized.includes('..');
}

export function createPresignedObjectUrl({
  config,
  method,
  key,
  expiresSeconds = 900,
  now = new Date(),
}) {
  if (!config?.configured) throw new Error('Bucket is not configured');
  const endpoint = objectEndpoint(config);
  const canonicalUri = canonicalObjectPath(config, key);
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const query = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(Math.max(1, Math.min(604800, Number(expiresSeconds) || 900))),
    'X-Amz-SignedHeaders': 'host',
  });
  const canonicalQuery = [...query.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${encodeRfc3986(name)}=${encodeRfc3986(value)}`)
    .join('&');
  const canonicalHeaders = `host:${endpoint.host}\n`;
  const canonicalRequest = [
    String(method || 'GET').toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');
  const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');
  return `${endpoint.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function sendBucketError(response, status, error, message, options = {}) {
  sendJson(
    response,
    status,
    {
      error,
      message,
      ...(options.details ? { quota: options.details } : {}),
    },
    options.headers,
  );
}

async function deleteBucketObject({ config, key, fetchImpl }) {
  const deleteUrl = createPresignedObjectUrl({ config, method: 'DELETE', key });
  const upstream = await fetchImpl(deleteUrl, { method: 'DELETE' });
  if (!upstream.ok && upstream.status !== 404) {
    const detail = (await upstream.text().catch(() => '')).slice(0, 500);
    throw new Error(`Bucket delete failed: ${upstream.status} ${detail}`.trim());
  }
}

async function proxyUpload({
  request,
  response,
  user,
  config,
  fetchImpl,
  assetStore,
  uploadLimiter,
}) {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const type = normalizeImageType(request.headers['content-type']);
  const size = Number(request.headers['content-length']);
  const name = String(requestUrl.searchParams.get('name') || 'Фото').slice(0, 500);
  if (!type) {
    request.resume?.();
    sendBucketError(response, 415, 'unsupported_photo_type', 'Поддерживаются JPEG, PNG, WebP, GIF, AVIF и HEIC.');
    return;
  }
  if (!Number.isFinite(size) || size <= 0) {
    request.resume?.();
    sendBucketError(response, 411, 'content_length_required', 'Не удалось определить размер фотографии.');
    return;
  }
  if (size > config.maxPhotoBytes) {
    request.resume?.();
    sendBucketError(response, 413, 'photo_too_large', `Фотография больше допустимого лимита ${config.maxPhotoBytes} байт.`);
    return;
  }

  const rateLimit = uploadLimiter?.consume(`user:${user.id}`);
  if (rateLimit && !rateLimit.allowed) {
    request.resume?.();
    sendBucketError(
      response,
      429,
      'photo_upload_rate_limited',
      'Слишком много загрузок подряд. Подожди немного и повтори.',
      { headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    );
    return;
  }

  const id = randomUUID();
  const key = buildPhotoObjectKey(user.id, type, id);
  let reserved = false;
  let uploaded = false;

  try {
    if (assetStore) {
      await assetStore.reserve({
        id,
        userId: user.id,
        key,
        name,
        type,
        size,
      });
      reserved = true;
    }

    const uploadUrl = createPresignedObjectUrl({ config, method: 'PUT', key });
    const upstream = await fetchImpl(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': type,
        'Content-Length': String(size),
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
      body: request,
      duplex: 'half',
    });

    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => '')).slice(0, 500);
      throw new Error(`Bucket upload failed: ${upstream.status} ${detail}`.trim());
    }

    uploaded = true;
    if (assetStore) await assetStore.markReady({ id, userId: user.id });
  } catch (error) {
    let rollbackDeleted = !uploaded;
    if (uploaded) {
      try {
        await deleteBucketObject({ config, key, fetchImpl });
        rollbackDeleted = true;
      } catch (cleanupError) {
        console.error('Bucket rollback failed', cleanupError);
      }
    }
    if (reserved && rollbackDeleted) {
      await assetStore.release({ id, userId: user.id })
        .catch((cleanupError) => console.error('Photo reservation rollback failed', cleanupError));
    }
    throw error;
  }

  const src = `/api/photo-assets/file?key=${encodeURIComponent(key)}`;
  sendJson(response, 200, {
    asset: {
      id,
      name,
      type,
      size,
      cloudKey: key,
      cloudSchema: CLOUD_PHOTO_SCHEMA,
      src,
    },
  });
}

async function proxyDownload({ request, response, user, config, fetchImpl, assetStore }) {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const key = String(requestUrl.searchParams.get('key') || '');
  if (!isOwnedPhotoKey(user.id, key)) {
    sendBucketError(response, 403, 'photo_access_denied', 'Нет доступа к этой фотографии.');
    return;
  }

  const downloadUrl = createPresignedObjectUrl({ config, method: 'GET', key, expiresSeconds: 3600 });
  const upstream = await fetchImpl(downloadUrl, { method: 'GET' });
  if (!upstream.ok || !upstream.body) {
    sendBucketError(response, upstream.status === 404 ? 404 : 502, 'photo_unavailable', 'Фотография недоступна в облачном хранилище.');
    return;
  }

  const headers = {
    'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  };
  const contentLength = upstream.headers.get('content-length');
  const etag = upstream.headers.get('etag');
  const lastModified = upstream.headers.get('last-modified');
  if (contentLength) headers['Content-Length'] = contentLength;
  if (etag) headers.ETag = etag;
  if (lastModified) headers['Last-Modified'] = lastModified;

  if (assetStore) {
    await assetStore.registerLegacy({
      userId: user.id,
      key,
      name: 'Фото',
      type: headers['Content-Type'],
      size: contentLength,
    }).catch((error) => console.warn('Legacy photo accounting skipped', error));
  }

  response.writeHead(200, headers);
  const bodyStream = Readable.fromWeb(upstream.body);
  bodyStream.on('error', (error) => {
    console.error('Bucket download stream failed', error);
    response.destroy?.(error);
  });
  response.once?.('close', () => {
    if (!response.writableEnded) bodyStream.destroy();
  });
  bodyStream.pipe(response);
}

export function createPhotoAssetGateway({
  env = process.env,
  fetchImpl = globalThis.fetch,
  sessionSecret: sessionSecretOverride,
  assetStore = null,
  requireAssetStore = false,
} = {}) {
  const config = resolveBucketConfig(env);
  const sessionSecret = String(sessionSecretOverride ?? env.SESSION_SECRET ?? '');
  const uploadLimiter = createFixedWindowRateLimiter({
    windowMs: positiveInteger(env.PHOTO_UPLOAD_WINDOW_MS, 60 * 60 * 1000),
    maxRequests: positiveInteger(env.PHOTO_UPLOAD_MAX_REQUESTS, 240),
    maxTrackedKeys: positiveInteger(env.PHOTO_UPLOAD_MAX_TRACKED_USERS, 10_000),
  });
  const deleteConcurrency = positiveInteger(env.PHOTO_DELETE_MAX_CONCURRENT, 4);

  async function deleteOwnedPhoto(userId, key, { requireUnreferenced = true } = {}) {
    if (!isOwnedPhotoKey(userId, key)) {
      return { deleted: false, reason: 'not_owned' };
    }
    if (!assetStore) {
      return { deleted: false, reason: 'accounting_unavailable' };
    }
    if (requireUnreferenced && await assetStore.isReferenced({ userId, key })) {
      return { deleted: false, reason: 'referenced' };
    }

    await deleteBucketObject({ config, key, fetchImpl });
    await assetStore.remove({ userId, key });
    return { deleted: true };
  }

  async function cleanupUnreferenced({ userId, keys }) {
    const uniqueKeys = [...new Set(keys || [])].filter((key) => isOwnedPhotoKey(userId, key));
    const result = { checked: uniqueKeys.length, deleted: 0, retained: 0, failed: 0 };
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < uniqueKeys.length) {
        const key = uniqueKeys[nextIndex];
        nextIndex += 1;
        try {
          const deletion = await deleteOwnedPhoto(userId, key);
          if (deletion.deleted) result.deleted += 1;
          else result.retained += 1;
        } catch (error) {
          result.failed += 1;
          console.error('Unreferenced photo cleanup failed', { key, error });
        }
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(uniqueKeys.length, deleteConcurrency) },
        () => worker(),
      ),
    );
    return result;
  }

  async function handle(request, response) {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (!requestUrl.pathname.startsWith('/api/photo-assets/')) return false;

    if (request.method === 'GET' && requestUrl.pathname === '/api/photo-assets/status') {
      sendJson(response, 200, {
        configured: config.configured,
        quotaEnforced: Boolean(assetStore),
        ...(assetStore?.limits ? { quota: assetStore.limits } : {}),
      });
      return true;
    }

    if (!config.configured) {
      request.resume?.();
      sendBucketError(response, 503, 'bucket_not_configured', 'Облачное хранилище фотографий не подключено.');
      return true;
    }

    if (
      requireAssetStore
      && !assetStore
      && (request.method === 'PUT' || request.method === 'DELETE')
    ) {
      request.resume?.();
      sendBucketError(
        response,
        503,
        'photo_accounting_unavailable',
        'Учёт фотографий временно недоступен.',
      );
      return true;
    }

    const user = verifySessionToken(request.headers.cookie || '', sessionSecret);
    if (!user) {
      request.resume?.();
      sendBucketError(response, 401, 'not_authenticated', 'Сначала войди в аккаунт.');
      return true;
    }

    if (request.method === 'PUT' && requestUrl.pathname === '/api/photo-assets/upload') {
      try {
        await proxyUpload({
          request,
          response,
          user,
          config,
          fetchImpl,
          assetStore,
          uploadLimiter,
        });
      } catch (error) {
        if (error?.name === 'PhotoAssetQuotaError') {
          request.resume?.();
          sendBucketError(
            response,
            Number(error.status) || 409,
            error.code,
            error.message,
            { details: error.details },
          );
          return true;
        }
        throw error;
      }
      return true;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/photo-assets/file') {
      await proxyDownload({ request, response, user, config, fetchImpl, assetStore });
      return true;
    }

    if (request.method === 'DELETE' && requestUrl.pathname === '/api/photo-assets/file') {
      const key = String(requestUrl.searchParams.get('key') || '');
      if (!isOwnedPhotoKey(user.id, key)) {
        sendBucketError(response, 403, 'photo_access_denied', 'Нет доступа к этой фотографии.');
        return true;
      }
      if (!assetStore) {
        sendBucketError(response, 503, 'photo_accounting_unavailable', 'Учёт фотографий временно недоступен.');
        return true;
      }

      const deletion = await deleteOwnedPhoto(user.id, key);
      if (deletion.reason === 'referenced') {
        sendBucketError(response, 409, 'photo_in_use', 'Фотография используется в облачном проекте.');
        return true;
      }
      sendJson(response, 200, { ok: deletion.deleted });
      return true;
    }

    sendBucketError(response, 404, 'photo_api_not_found', 'Маршрут фотографий не найден.');
    return true;
  }

  async function servePublicPhoto({ response, userId, key }) {
    if (!config.configured) {
      sendBucketError(response, 503, 'bucket_not_configured', 'Облачное хранилище фотографий не подключено.');
      return;
    }
    if (!isOwnedPhotoKey(userId, key)) {
      sendBucketError(response, 403, 'photo_access_denied', 'Нет доступа к этой фотографии.');
      return;
    }
    const request = { url: '/api/photo-assets/file?key=' + encodeURIComponent(key) };
    await proxyDownload({ request, response, user: { id: Number(userId) }, config, fetchImpl, assetStore });
  }

  return {
    handle,
    cleanupUnreferenced,
    servePublicPhoto,
    config,
  };
}

export function createPhotoAssetRequestHandler(options = {}) {
  return createPhotoAssetGateway(options).handle;
}
