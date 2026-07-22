import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  buildPhotoObjectKey,
  buildS3ClientOptions,
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

const virtualOptions = buildS3ClientOptions(config);
assert.equal(virtualOptions.endpoint, 'https://t3.storageapi.dev');
assert.equal(virtualOptions.region, 'auto');
assert.equal(virtualOptions.forcePathStyle, false);
assert.equal(virtualOptions.requestChecksumCalculation, 'WHEN_REQUIRED');
assert.equal(virtualOptions.responseChecksumValidation, 'WHEN_REQUIRED');
assert.deepEqual(virtualOptions.credentials, {
  accessKeyId: 'test-access',
  secretAccessKey: 'test-secret',
});

const pathConfig = resolveBucketConfig({
  AWS_ENDPOINT_URL: 'https://legacy.storageapi.dev/',
  AWS_DEFAULT_REGION: 'auto',
  AWS_S3_BUCKET_NAME: 'legacy-bucket',
  AWS_ACCESS_KEY_ID: 'test-access',
  AWS_SECRET_ACCESS_KEY: 'test-secret',
  AWS_S3_URL_STYLE: 'path',
});
assert.equal(buildS3ClientOptions(pathConfig).forcePathStyle, true);
assert.throws(() => buildS3ClientOptions(resolveBucketConfig({})), /not configured/i);

const secret = 'session-secret';
const payload = Buffer.from(JSON.stringify({ id: 7, email: 'user@example.com', exp: Date.now() + 60_000 })).toString('base64url');
const signature = createHmac('sha256', secret).update(payload).digest('base64url');
assert.deepEqual(
  verifySessionToken(`other=1; collage_session=${payload}.${signature}`, secret),
  { id: 7, email: 'user@example.com' },
);
assert.equal(verifySessionToken(`collage_session=${payload}.broken`, secret), null);

console.log('bucketGateway tests passed');
