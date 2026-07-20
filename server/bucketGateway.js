import http from 'node:http';
import { createHmac, createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { Readable } from 'node:stream';

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

function canonicalObjectPath(bucket, key) {
  const parts = [bucket, ...String(key).split('/')];
  return `/${parts.map(encodeRfc3986).join('/')}`;
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
  const maxPhotoBytes = Math.max(1, Number(env.MAX_PHOTO_FILE_BYTES || DEFAULT_MAX_PHOTO_BYTES));
  const configured = Boolean(endpoint && bucket && accessKeyId && secretAccessKey);
  return { endpoint, region, bucket, accessKeyId, secretAccessKey, maxPhotoBytes, configured };
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
  const endpoint = new URL(config.endpoint);
  const canonicalUri = canonicalObjectPath(config.bucket, key);
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

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

function sendBucketError(response, status, error, message) {
  sendJson(response, status, { error, message });
}

async function proxyUpload({ request, response, user, config, fetchImpl }) {
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

  const id = randomUUID();
  const key = buildPhotoObjectKey(user.id, type, id);
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

async function proxyDownload({ request, response, user, config, fetchImpl }) {
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
  response.writeHead(200, headers);
  Readable.fromWeb(upstream.body).pipe(response);
}

export function createPhotoAssetRequestHandler({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const config = resolveBucketConfig(env);
  const sessionSecret = String(env.SESSION_SECRET || '');

  return async function handlePhotoAssetRequest(request, response) {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (!requestUrl.pathname.startsWith('/api/photo-assets/')) return false;

    if (request.method === 'GET' && requestUrl.pathname === '/api/photo-assets/status') {
      sendJson(response, 200, { configured: config.configured });
      return true;
    }

    if (!config.configured) {
      request.resume?.();
      sendBucketError(response, 503, 'bucket_not_configured', 'Облачное хранилище фотографий не подключено.');
      return true;
    }

    const user = verifySessionToken(request.headers.cookie || '', sessionSecret);
    if (!user) {
      request.resume?.();
      sendBucketError(response, 401, 'not_authenticated', 'Сначала войди в аккаунт.');
      return true;
    }

    if (request.method === 'PUT' && requestUrl.pathname === '/api/photo-assets/upload') {
      await proxyUpload({ request, response, user, config, fetchImpl });
      return true;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/photo-assets/file') {
      await proxyDownload({ request, response, user, config, fetchImpl });
      return true;
    }

    sendBucketError(response, 404, 'photo_api_not_found', 'Маршрут фотографий не найден.');
    return true;
  };
}

export function installPhotoAssetServerPreload(options = {}) {
  const originalCreateServer = http.createServer;
  const handlePhotoAssetRequest = createPhotoAssetRequestHandler(options);

  http.createServer = function createServerWithPhotoAssets(...args) {
    const listenerIndex = typeof args[0] === 'function' ? 0 : 1;
    const originalListener = args[listenerIndex];
    if (typeof originalListener !== 'function') return originalCreateServer.apply(this, args);

    args[listenerIndex] = function wrappedRequestListener(request, response) {
      Promise.resolve(handlePhotoAssetRequest(request, response))
        .then((handled) => {
          if (!handled) originalListener(request, response);
        })
        .catch((error) => {
          console.error('Photo asset route failed', error);
          if (!response.headersSent) {
            sendBucketError(response, 500, 'photo_storage_error', 'Не удалось обработать фотографию.');
          } else {
            response.destroy(error);
          }
        });
    };

    return originalCreateServer.apply(this, args);
  };

  syncBuiltinESMExports();
}
