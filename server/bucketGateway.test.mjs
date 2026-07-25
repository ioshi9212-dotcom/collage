import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  DEFAULT_MAX_PHOTO_BYTES,
  buildPhotoObjectKey,
  createPhotoAssetGateway,
  createPhotoAssetRequestHandler,
  createPresignedObjectUrl,
  isOwnedPhotoKey,
  normalizeImageType,
  resolveBucketConfig,
  verifySessionToken,
} from './bucketGateway.js';

const config = resolveBucketConfig({
  AWS_ENDPOINT_URL: 'https://t3.storageapi.dev/',
  AWS_DEFAULT_REGION: 'auto',
  AWS_S3_BUCKET_NAME: 'collage-photos-test',
  AWS_ACCESS_KEY_ID: 'test-access',
  AWS_SECRET_ACCESS_KEY: 'test-secret',
  AWS_S3_URL_STYLE: 'virtual',
});
assert.equal(config.configured, true);
assert.equal(config.endpoint, 'https://t3.storageapi.dev');
assert.equal(config.urlStyle, 'virtual');
assert.equal(
  resolveBucketConfig({ MAX_PHOTO_FILE_BYTES: 'not-a-number' }).maxPhotoBytes,
  DEFAULT_MAX_PHOTO_BYTES,
);
assert.equal(normalizeImageType('image/jpeg; charset=binary'), 'image/jpeg');
assert.equal(normalizeImageType('image/svg+xml'), '');
assert.equal(buildPhotoObjectKey(7, 'image/png', 'asset-id'), 'users/7/photos/asset-id/original.png');
assert.equal(isOwnedPhotoKey(7, 'users/7/photos/a/original.jpg'), true);
assert.equal(isOwnedPhotoKey(8, 'users/7/photos/a/original.jpg'), false);
assert.equal(isOwnedPhotoKey(7, 'users/7/photos/../secret'), false);

const url = new URL(createPresignedObjectUrl({
  config,
  method: 'PUT',
  key: 'users/7/photos/a/original.jpg',
  now: new Date('2026-07-20T00:00:00.000Z'),
}));
assert.equal(url.origin, 'https://collage-photos-test.t3.storageapi.dev');
assert.equal(url.pathname, '/users/7/photos/a/original.jpg');
assert.equal(url.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
assert.equal(url.searchParams.get('X-Amz-Date'), '20260720T000000Z');
assert.match(url.searchParams.get('X-Amz-Signature'), /^[a-f0-9]{64}$/);

const pathConfig = resolveBucketConfig({
  AWS_ENDPOINT_URL: 'https://legacy.storageapi.dev/',
  AWS_DEFAULT_REGION: 'auto',
  AWS_S3_BUCKET_NAME: 'legacy-bucket',
  AWS_ACCESS_KEY_ID: 'test-access',
  AWS_SECRET_ACCESS_KEY: 'test-secret',
  AWS_S3_URL_STYLE: 'path',
});
const pathUrl = new URL(createPresignedObjectUrl({
  config: pathConfig,
  method: 'GET',
  key: 'users/7/photos/a/original.jpg',
  now: new Date('2026-07-20T00:00:00.000Z'),
}));
assert.equal(pathUrl.origin, 'https://legacy.storageapi.dev');
assert.equal(pathUrl.pathname, '/legacy-bucket/users/7/photos/a/original.jpg');

const secret = 'session-secret';
const payload = Buffer.from(JSON.stringify({ id: 7, email: 'user@example.com', exp: Date.now() + 60_000 })).toString('base64url');
const signature = createHmac('sha256', secret).update(payload).digest('base64url');
assert.deepEqual(
  verifySessionToken(`other=1; collage_session=${payload}.${signature}`, secret),
  { id: 7, email: 'user@example.com' },
);
assert.equal(verifySessionToken(`collage_session=${payload}.broken`, secret), null);

function fakeResponse() {
  return {
    status: null,
    body: '',
    headers: {},
    writeHead(status, headers = {}) {
      this.status = status;
      this.headers = headers;
    },
    end(body = '') { this.body = String(body); },
  };
}

const handler = createPhotoAssetRequestHandler({
  env: {
    AWS_ENDPOINT_URL: 'https://t3.storageapi.dev/',
    AWS_DEFAULT_REGION: 'auto',
    AWS_S3_BUCKET_NAME: 'collage-photos-test',
    AWS_ACCESS_KEY_ID: 'test-access',
    AWS_SECRET_ACCESS_KEY: 'test-secret',
  },
  sessionSecret: secret,
});
const response = fakeResponse();
const handled = await handler({
  method: 'GET',
  url: '/api/photo-assets/unknown',
  headers: { host: 'localhost', cookie: `collage_session=${payload}.${signature}` },
  resume() {},
}, response);
assert.equal(handled, true);
assert.equal(response.status, 404, 'direct handler must accept the main server session secret override');
assert.match(response.body, /photo_api_not_found/);

let uploadFetchCalls = 0;
const quotaHandler = createPhotoAssetRequestHandler({
  env: {
    AWS_ENDPOINT_URL: 'https://t3.storageapi.dev/',
    AWS_DEFAULT_REGION: 'auto',
    AWS_S3_BUCKET_NAME: 'collage-photos-test',
    AWS_ACCESS_KEY_ID: 'test-access',
    AWS_SECRET_ACCESS_KEY: 'test-secret',
  },
  sessionSecret: secret,
  fetchImpl: async () => {
    uploadFetchCalls += 1;
    throw new Error('fetch must not run when the quota rejects an upload');
  },
  assetStore: {
    limits: { maxAssets: 1, maxStorageBytes: 10 },
    reserve: async () => {
      const error = new Error('Хранилище фотографий заполнено.');
      error.name = 'PhotoAssetQuotaError';
      error.code = 'photo_storage_quota_exceeded';
      error.status = 409;
      error.details = { maxStorageBytes: 10 };
      throw error;
    },
  },
});
const quotaResponse = fakeResponse();
await quotaHandler({
  method: 'PUT',
  url: '/api/photo-assets/upload?name=test.jpg',
  headers: {
    host: 'localhost',
    cookie: `collage_session=${payload}.${signature}`,
    'content-type': 'image/jpeg',
    'content-length': '11',
  },
  resume() {},
}, quotaResponse);
assert.equal(quotaResponse.status, 409);
assert.match(quotaResponse.body, /photo_storage_quota_exceeded/);
assert.equal(uploadFetchCalls, 0);

let deletedKey = '';
let removedKey = '';
const deleteHandler = createPhotoAssetRequestHandler({
  env: {
    AWS_ENDPOINT_URL: 'https://t3.storageapi.dev/',
    AWS_DEFAULT_REGION: 'auto',
    AWS_S3_BUCKET_NAME: 'collage-photos-test',
    AWS_ACCESS_KEY_ID: 'test-access',
    AWS_SECRET_ACCESS_KEY: 'test-secret',
  },
  sessionSecret: secret,
  fetchImpl: async (requestUrl, options) => {
    assert.equal(options.method, 'DELETE');
    deletedKey = new URL(requestUrl).pathname;
    return { ok: true, status: 204, text: async () => '' };
  },
  assetStore: {
    limits: { maxAssets: 500, maxStorageBytes: 500_000_000 },
    isReferenced: async () => false,
    remove: async ({ key }) => { removedKey = key; },
  },
});
const deleteResponse = fakeResponse();
const ownedKey = 'users/7/photos/delete-me/original.jpg';
await deleteHandler({
  method: 'DELETE',
  url: `/api/photo-assets/file?key=${encodeURIComponent(ownedKey)}`,
  headers: { host: 'localhost', cookie: `collage_session=${payload}.${signature}` },
  resume() {},
}, deleteResponse);
assert.equal(deleteResponse.status, 200);
assert.equal(deletedKey, `/${ownedKey}`);
assert.equal(removedKey, ownedKey);

let activeDeletes = 0;
let maximumActiveDeletes = 0;
const concurrentGateway = createPhotoAssetGateway({
  env: {
    AWS_ENDPOINT_URL: 'https://t3.storageapi.dev/',
    AWS_DEFAULT_REGION: 'auto',
    AWS_S3_BUCKET_NAME: 'collage-photos-test',
    AWS_ACCESS_KEY_ID: 'test-access',
    AWS_SECRET_ACCESS_KEY: 'test-secret',
    PHOTO_DELETE_MAX_CONCURRENT: '2',
  },
  sessionSecret: secret,
  fetchImpl: async () => {
    activeDeletes += 1;
    maximumActiveDeletes = Math.max(maximumActiveDeletes, activeDeletes);
    await new Promise((resolve) => setImmediate(resolve));
    activeDeletes -= 1;
    return { ok: true, status: 204, text: async () => '' };
  },
  assetStore: {
    limits: { maxAssets: 500, maxStorageBytes: 500_000_000 },
    isReferenced: async () => false,
    remove: async () => {},
  },
});
const cleanupResult = await concurrentGateway.cleanupUnreferenced({
  userId: 7,
  keys: Array.from(
    { length: 5 },
    (_, index) => `users/7/photos/concurrent-${index}/original.jpg`,
  ),
});
assert.deepEqual(cleanupResult, { checked: 5, deleted: 5, retained: 0, failed: 0 });
assert.equal(maximumActiveDeletes, 2);

console.log('bucketGateway tests passed');
