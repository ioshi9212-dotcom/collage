import sharp from 'sharp';
import { verifySessionToken } from './bucketGateway.js';
import { createFixedWindowRateLimiter } from './rateLimit.js';

export const DEFAULT_MAX_HEIC_BYTES = 25 * 1024 * 1024;
export const DEFAULT_MAX_HEIC_PIXELS = 50_000_000;
const HEIC_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
const HEIC_EXTENSION = /\.(?:heic|heif)$/i;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function nonNegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
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

function cleanType(value) {
  return String(value || '').trim().toLowerCase().split(';')[0];
}

export function isHeicUpload({ type, name } = {}) {
  return HEIC_TYPES.has(cleanType(type)) || HEIC_EXTENSION.test(String(name || ''));
}

export function jpegNameForHeicUpload(name) {
  const source = String(name || 'Фото').slice(0, 500);
  return HEIC_EXTENSION.test(source) ? source.replace(HEIC_EXTENSION, '.jpg') : `${source}.jpg`;
}

async function readBody(request, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) {
      const error = new Error('HEIC больше допустимого лимита');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!total) {
    const error = new Error('Файл HEIC пустой');
    error.status = 400;
    throw error;
  }
  return Buffer.concat(chunks, total);
}

export function createConcurrencyGate({ maxConcurrent = 1, maxQueued = 2 } = {}) {
  const concurrency = Math.max(1, Math.floor(Number(maxConcurrent) || 1));
  const queueLimit = Math.max(0, Math.floor(Number(maxQueued) || 0));
  const queue = [];
  let active = 0;

  function release() {
    active = Math.max(0, active - 1);
    const next = queue.shift();
    if (next) {
      active += 1;
      next.resolve();
    }
  }

  async function acquire() {
    if (active < concurrency) {
      active += 1;
      return;
    }
    if (queue.length >= queueLimit) {
      const error = new Error('Сервер уже обрабатывает другие HEIC-файлы');
      error.code = 'heic_server_busy';
      error.status = 503;
      error.retryAfterSeconds = 10;
      throw error;
    }
    await new Promise((resolve) => queue.push({ resolve }));
  }

  async function run(operation) {
    await acquire();
    try {
      return await operation();
    } finally {
      release();
    }
  }

  return {
    run,
    stats: () => ({ active, queued: queue.length, maxConcurrent: concurrency, maxQueued: queueLimit }),
  };
}

export async function convertHeicBuffer(input, options = {}) {
  const sharpImpl = options.sharpImpl || sharp;
  const quality = Number.isFinite(Number(options.quality)) ? Number(options.quality) : 92;
  const maxPixels = positiveInteger(options.maxPixels, DEFAULT_MAX_HEIC_PIXELS);
  const timeoutSeconds = positiveInteger(options.timeoutSeconds, 30);
  const image = sharpImpl(input, {
    failOn: 'error',
    limitInputPixels: maxPixels,
    sequentialRead: true,
  });

  if (typeof image.timeout === 'function') image.timeout({ seconds: timeoutSeconds });
  if (typeof image.metadata === 'function') {
    const metadata = await image.metadata();
    const pixels = Math.max(0, Number(metadata?.width) || 0)
      * Math.max(0, Number(metadata?.height) || 0);
    if (pixels > maxPixels) {
      const error = new Error(`Изображение слишком большое: ${pixels} пикселей`);
      error.code = 'heic_too_many_pixels';
      error.status = 413;
      throw error;
    }
  }

  return image
    .rotate()
    .jpeg({
      quality,
      chromaSubsampling: '4:2:0',
      optimiseScans: true,
    })
    .toBuffer();
}

export function createHeicConversionHandler({
  env = process.env,
  sharpImpl = sharp,
  sessionSecret: sessionSecretOverride,
} = {}) {
  const sessionSecret = String(sessionSecretOverride ?? env.SESSION_SECRET ?? '');
  const maxBytes = positiveInteger(env.MAX_HEIC_FILE_BYTES, DEFAULT_MAX_HEIC_BYTES);
  const maxPixels = positiveInteger(env.MAX_HEIC_INPUT_PIXELS, DEFAULT_MAX_HEIC_PIXELS);
  const timeoutSeconds = positiveInteger(env.HEIC_CONVERSION_TIMEOUT_SECONDS, 30);
  const conversionGate = createConcurrencyGate({
    maxConcurrent: positiveInteger(env.HEIC_MAX_CONCURRENT, 1),
    maxQueued: nonNegativeInteger(env.HEIC_MAX_QUEUED, 2),
  });
  const conversionLimiter = createFixedWindowRateLimiter({
    windowMs: positiveInteger(env.HEIC_RATE_WINDOW_MS, 60 * 60 * 1000),
    maxRequests: positiveInteger(env.HEIC_RATE_MAX_REQUESTS, 30),
    maxTrackedKeys: positiveInteger(env.HEIC_RATE_MAX_TRACKED_USERS, 10_000),
  });

  return async function handleHeicConversion(request, response) {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (requestUrl.pathname !== '/api/heic/convert') return false;

    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'method_not_allowed', message: 'Для HEIC требуется POST-запрос.' });
      return true;
    }

    const user = verifySessionToken(request.headers.cookie || '', sessionSecret);
    if (!user) {
      request.resume?.();
      sendJson(response, 401, { error: 'not_authenticated', message: 'Сначала войди в аккаунт.' });
      return true;
    }

    const name = String(requestUrl.searchParams.get('name') || 'Фото.HEIC').slice(0, 500);
    const type = cleanType(request.headers['content-type']);
    if (!isHeicUpload({ type, name })) {
      request.resume?.();
      sendJson(response, 415, { error: 'not_heic', message: 'Выбранный файл не похож на HEIC или HEIF.' });
      return true;
    }

    const announcedSize = Number(request.headers['content-length']);
    if (Number.isFinite(announcedSize) && announcedSize > maxBytes) {
      request.resume?.();
      sendJson(response, 413, { error: 'heic_too_large', message: 'HEIC больше допустимого лимита.' });
      return true;
    }

    const rateLimit = conversionLimiter.consume(`user:${user.id}`);
    if (!rateLimit.allowed) {
      request.resume?.();
      sendJson(
        response,
        429,
        { error: 'heic_rate_limited', message: 'Слишком много HEIC-конвертаций. Подожди и повтори.' },
        { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      );
      return true;
    }

    try {
      const output = await conversionGate.run(async () => {
        const input = await readBody(request, maxBytes);
        return convertHeicBuffer(input, {
          sharpImpl,
          quality: 92,
          maxPixels,
          timeoutSeconds,
        });
      });
      response.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(output.length),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(jpegNameForHeicUpload(name))}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(output);
    } catch (error) {
      request.resume?.();
      if (error?.code !== 'heic_server_busy') console.error('HEIC conversion failed', error);
      sendJson(response, Number(error?.status) || 422, {
        error: error?.code || 'heic_conversion_failed',
        message: `Не удалось преобразовать HEIC: ${String(error?.message || 'неподдерживаемый файл').slice(0, 220)}`,
      }, error?.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : {});
    }

    return true;
  };
}
