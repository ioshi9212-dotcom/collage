import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  buildPhotoObjectKey,
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

console.log('bucketGateway tests passed');
