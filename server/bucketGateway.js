import http from 'node:http';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { Readable } from 'node:stream';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

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
  const maxPhotoBytes = Math.max(1, Number(env.MAX_PHOTO_FILE_BYTES || DEFAULT_MAX_PHOTO_BYTES));
  const configured = Boolean(endpoint && bucket && accessKeyId && secretAccessKey);
  return { endpoint, region, bucket, accessKeyId, secretAccessKey, urlStyle, maxPhotoBytes, configured };
}

export function buildS3ClientOptions(config) {
  if (!config?.configured) throw new Error('Bucket is not configured');
  return {
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.urlStyle === 'path',
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  };
}

export function createBucketS3Client(config) {
  return new S3Client(buildS3ClientOptions(config));
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

function storageError(error, operation) {
  const name = String(error?.name || error?.Code || 'S3Error').slice(0, 80);
  const detail = String(error?.message || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  const wrapped = new Error(`Bucket ${operation} failed: ${name}${detail ? ` · ${detail}` : ''}`, { cause: error });
  wrapped.safeMessage = operation === 'upload'
    ? `Bucket отклонил загрузку (${name}).`
    : `Не удалось получить фотографию из Bucket (${name}).`;
  return wrapped;
}

async function proxyUpload({ request, response, user, config, s3Client }) {
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
  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: request,
      ContentType: type,
      ContentLength: size,
      CacheControl: 'private, max-age=31536000, immutable',
    }));
  } catch (error) {
    throw storageError(error, 'upload');
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

function pipeObjectBody(body, response) {
  if (typeof body?.pipe === 'function') {
    body.pipe(response);
    return true;
  }
  if (typeof body?.transformToWebStream === 'function') {
    Readable.fromWeb(body.transformToWebStream()).pipe(response);
    return true;
  }
  if (body instanceof ReadableStream) {
    Readable.fromWeb(body).pipe(response);
    return true;
  }
  return false;
}

async function proxyDownload({ request, response, user, config, s3Client }) {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const key = String(requestUrl.searchParams.get('key') || '');
  if (!isOwnedPhotoKey(user.id, key)) {
    sendBucketError(response, 403, 'photo_access_denied', 'Нет доступа к этой фотографии.');
    return;
  }

  let object;
  try {
    object = await s3Client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
  } catch (error) {
    const status = Number(error?.$metadata?.httpStatusCode) === 404 || error?.name === 'NoSuchKey' ? 404 : 502;
    if (status === 404) {
      sendBucketError(response, 404, 'photo_unavailable', 'Фотография не найдена в облачном хранилище.');
      return;
    }
    throw storageError(error, 'download');
  }

  if (!object?.Body) {
    sendBucketError(response, 502, 'photo_unavailable', 'Фотография недоступна в облачном хранилище.');
    return;
  }

  const headers = {
    'Content-Type': object.ContentType || 'application/octet-stream',
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  };
  if (Number.isFinite(Number(object.ContentLength))) headers['Content-Length'] = String(object.ContentLength);
  if (object.ETag) headers.ETag = object.ETag;
  if (object.LastModified instanceof Date) headers['Last-Modified'] = object.LastModified.toUTCString();
  response.writeHead(200, headers);
  if (!pipeObjectBody(object.Body, response)) {
    response.destroy(new Error('Unsupported S3 response body'));
  }
}

export function createPhotoAssetRequestHandler({ env = process.env, s3ClientFactory = createBucketS3Client } = {}) {
  const config = resolveBucketConfig(env);
  const sessionSecret = String(env.SESSION_SECRET || '');
  const s3Client = config.configured ? s3ClientFactory(config) : null;

  return async function handlePhotoAssetRequest(request, response) {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (!requestUrl.pathname.startsWith('/api/photo-assets/')) return false;

    if (request.method === 'GET' && requestUrl.pathname === '/api/photo-assets/status') {
      sendJson(response, 200, { configured: config.configured, urlStyle: config.urlStyle });
      return true;
    }

    if (!config.configured || !s3Client) {
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
      await proxyUpload({ request, response, user, config, s3Client });
      return true;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/photo-assets/file') {
      await proxyDownload({ request, response, user, config, s3Client });
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
            sendBucketError(response, 502, 'photo_storage_error', error?.safeMessage || 'Не удалось обработать фотографию.');
          } else {
            response.destroy(error);
          }
        });
    };

    return originalCreateServer.apply(this, args);
  };

  syncBuiltinESMExports();
}
