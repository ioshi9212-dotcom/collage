import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import sharp from 'sharp';
import { verifySessionToken } from './bucketGateway.js';

export const DEFAULT_MAX_HEIC_BYTES = 25 * 1024 * 1024;
const HEIC_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
const HEIC_EXTENSION = /\.(?:heic|heif)$/i;

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
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
      const error = new Error('HEIC больше допустимого лимита 25 МБ');
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

export async function convertHeicBuffer(input, options = {}) {
  const sharpImpl = options.sharpImpl || sharp;
  const quality = Number.isFinite(Number(options.quality)) ? Number(options.quality) : 94;
  const image = sharpImpl(input, {
    failOn: 'none',
    limitInputPixels: 120_000_000,
    sequentialRead: true,
  });
  return image
    .rotate()
    .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

export function createHeicConversionHandler({ env = process.env, sharpImpl = sharp } = {}) {
  const sessionSecret = String(env.SESSION_SECRET || '');
  const maxBytes = Math.max(1, Number(env.MAX_HEIC_FILE_BYTES || DEFAULT_MAX_HEIC_BYTES));

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
      sendJson(response, 413, { error: 'heic_too_large', message: 'HEIC больше допустимого лимита 25 МБ.' });
      return true;
    }

    try {
      const input = await readBody(request, maxBytes);
      const output = await convertHeicBuffer(input, { sharpImpl, quality: 94 });
      response.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(output.length),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(jpegNameForHeicUpload(name))}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(output);
    } catch (error) {
      console.error('HEIC conversion failed', error);
      sendJson(response, Number(error?.status) || 422, {
        error: 'heic_conversion_failed',
        message: `Не удалось преобразовать HEIC: ${String(error?.message || 'неподдерживаемый файл').slice(0, 220)}`,
      });
    }

    return true;
  };
}

export function installHeicConversionPreload(options = {}) {
  const originalCreateServer = http.createServer;
  const handleHeicConversion = createHeicConversionHandler(options);

  http.createServer = function createServerWithHeicConversion(...args) {
    const listenerIndex = typeof args[0] === 'function' ? 0 : 1;
    const originalListener = args[listenerIndex];
    if (typeof originalListener !== 'function') return originalCreateServer.apply(this, args);

    args[listenerIndex] = function wrappedRequestListener(request, response) {
      Promise.resolve(handleHeicConversion(request, response))
        .then((handled) => {
          if (!handled) originalListener(request, response);
        })
        .catch((error) => {
          console.error('HEIC route failed', error);
          if (!response.headersSent) {
            sendJson(response, 500, { error: 'heic_route_failed', message: 'Не удалось обработать HEIC.' });
          } else {
            response.destroy(error);
          }
        });
    };

    return originalCreateServer.apply(this, args);
  };

  syncBuiltinESMExports();
}
