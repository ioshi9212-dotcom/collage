import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RequestBodyError, readJsonBody } from './requestBody.js';

class FakeRequest extends EventEmitter {
  constructor(headers = {}) {
    super();
    this.headers = headers;
    this.resumeCount = 0;
    this.destroyCount = 0;
  }

  resume() {
    this.resumeCount += 1;
  }

  destroy() {
    this.destroyCount += 1;
  }
}

async function readChunks(chunks, limitBytes, headers = {}) {
  const request = new FakeRequest(headers);
  const promise = readJsonBody(request, limitBytes);
  for (const chunk of chunks) request.emit('data', chunk);
  request.emit('end');
  return { request, promise };
}

{
  const { promise } = await readChunks([], 100);
  assert.deepEqual(await promise, {});
}

{
  const json = Buffer.from('{"title":"Альбом","pages":2}', 'utf8');
  const { promise } = await readChunks([json.subarray(0, 7), json.subarray(7)], json.length);
  assert.deepEqual(await promise, { title: 'Альбом', pages: 2 }, 'a body exactly at the byte limit must be accepted');
}

{
  const unicodeJson = Buffer.from('{"emoji":"🌿🌿"}', 'utf8');
  assert.ok(unicodeJson.length > '{"emoji":"🌿🌿"}'.length, 'the fixture must contain multibyte UTF-8');
  const { promise } = await readChunks([unicodeJson], unicodeJson.length - 1);
  await assert.rejects(
    promise,
    (error) => error instanceof RequestBodyError && error.status === 413 && error.code === 'payload_too_large',
  );
}

{
  const request = new FakeRequest();
  const promise = readJsonBody(request, 5);
  request.emit('data', Buffer.from('1234'));
  request.emit('data', Buffer.from('56'));
  request.emit('data', Buffer.from('ignored'));
  request.emit('end');

  await assert.rejects(
    promise,
    (error) => error instanceof RequestBodyError
      && error.status === 413
      && error.code === 'payload_too_large'
      && /5 байт/.test(error.message),
  );
  assert.equal(request.resumeCount, 1, 'an oversized streaming body must be drained');
  assert.equal(request.destroyCount, 0, 'the connection must not be destroyed before the 413 response is sent');
}

{
  const request = new FakeRequest({ 'content-length': '101' });
  const promise = readJsonBody(request, 100);
  await assert.rejects(
    promise,
    (error) => error instanceof RequestBodyError && error.status === 413 && error.code === 'payload_too_large',
  );
  assert.equal(request.resumeCount, 1, 'an oversized declared body must be drained immediately');
  assert.equal(request.destroyCount, 0);
}

{
  const { promise } = await readChunks([Buffer.from('{broken json')], 100);
  await assert.rejects(
    promise,
    (error) => error instanceof RequestBodyError && error.status === 400 && error.code === 'invalid_json',
  );
}

{
  const request = new FakeRequest();
  const promise = readJsonBody(request, 100);
  const networkError = new Error('socket failed');
  request.emit('error', networkError);
  await assert.rejects(promise, (error) => error === networkError);
}

const serverSource = readFileSync(resolve(process.cwd(), 'server.js'), 'utf8');
assert.match(serverSource, /RequestBodyError/);
assert.match(serverSource, /function readBody\(request, limitBytes = jsonLimitBytes\)/);
assert.match(serverSource, /readJsonBody\(request, limitBytes\)/);
assert.match(serverSource, /readBody\(request, authJsonLimitBytes\)/, 'auth routes must use the smaller dedicated request limit');
assert.match(serverSource, /sendJson\(response, error\.status/);
assert.doesNotMatch(serverSource, /request\.destroy\(\)/, 'oversized JSON must not destroy the request socket');

console.log('request body limit checks passed');
