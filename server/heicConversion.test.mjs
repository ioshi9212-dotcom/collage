import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  createConcurrencyGate,
  createHeicConversionHandler,
  convertHeicBuffer,
  isHeicUpload,
  jpegNameForHeicUpload,
} from './heicConversion.js';

assert.equal(isHeicUpload({ name: 'IMG_1001.HEIC', type: '' }), true);
assert.equal(isHeicUpload({ name: 'IMG_1002', type: 'image/heif' }), true);
assert.equal(isHeicUpload({ name: 'photo.jpg', type: 'image/jpeg' }), false);
assert.equal(jpegNameForHeicUpload('IMG_1001.HEIC'), 'IMG_1001.jpg');

const calls = [];
const fakeSharp = (input, options) => {
  calls.push(['create', Buffer.from(input).length, options]);
  return {
    async metadata() {
      calls.push(['metadata']);
      return { width: 4_000, height: 3_000 };
    },
    timeout(timeoutOptions) {
      calls.push(['timeout', timeoutOptions]);
      return this;
    },
    rotate() {
      calls.push(['rotate']);
      return this;
    },
    jpeg(jpegOptions) {
      calls.push(['jpeg', jpegOptions]);
      return this;
    },
    async toBuffer() {
      calls.push(['toBuffer']);
      return Buffer.from('jpeg-result');
    },
  };
};

const output = await convertHeicBuffer(Buffer.from('heic-input'), { sharpImpl: fakeSharp, quality: 94 });
assert.equal(output.toString(), 'jpeg-result');
assert.equal(calls[0][0], 'create');
assert.equal(calls[0][2].failOn, 'error');
assert.equal(calls[0][2].limitInputPixels, 50_000_000);
assert.equal(calls[1][0], 'timeout');
assert.equal(calls[2][0], 'metadata');
assert.equal(calls[3][0], 'rotate');
assert.equal(calls[4][0], 'jpeg');
assert.equal(calls[4][1].quality, 94);
assert.equal(calls[4][1].chromaSubsampling, '4:2:0');
assert.equal(calls[4][1].optimiseScans, true);
assert.equal(calls[5][0], 'toBuffer');

const oversizedSharp = () => ({
  metadata: async () => ({ width: 10_000, height: 10_000 }),
});
await assert.rejects(
  convertHeicBuffer(Buffer.from('large'), { sharpImpl: oversizedSharp, maxPixels: 20_000_000 }),
  (error) => error.code === 'heic_too_many_pixels' && error.status === 413,
);

const gate = createConcurrencyGate({ maxConcurrent: 1, maxQueued: 1 });
let releaseFirst;
const first = gate.run(() => new Promise((resolve) => { releaseFirst = resolve; }));
await new Promise((resolve) => setImmediate(resolve));
const second = gate.run(async () => 'second');
await assert.rejects(
  gate.run(async () => 'third'),
  (error) => error.code === 'heic_server_busy' && error.status === 503,
);
releaseFirst('first');
assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);

const secret = 'database-backed-session-secret';
const payload = Buffer.from(JSON.stringify({
  id: 7,
  email: 'user@example.com',
  exp: Date.now() + 60_000,
})).toString('base64url');
const signature = createHmac('sha256', secret).update(payload).digest('base64url');
const handler = createHeicConversionHandler({
  env: {
    MAX_HEIC_FILE_BYTES: '1000',
    MAX_HEIC_INPUT_PIXELS: '20000000',
  },
  sessionSecret: secret,
  sharpImpl: fakeSharp,
});
const request = Readable.from([Buffer.from('heic-input')]);
request.method = 'POST';
request.url = '/api/heic/convert?name=photo.heic';
request.headers = {
  host: 'localhost',
  cookie: `collage_session=${payload}.${signature}`,
  'content-type': 'image/heic',
  'content-length': '10',
};
const response = {
  status: null,
  body: null,
  writeHead(status) { this.status = status; },
  end(body) { this.body = body; },
};
assert.equal(await handler(request, response), true);
assert.equal(response.status, 200, 'the effective server session secret override must authorize HEIC');
assert.equal(Buffer.from(response.body).toString(), 'jpeg-result');

console.log('HEIC conversion server tests passed');
