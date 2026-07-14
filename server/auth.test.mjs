import assert from 'node:assert/strict';
import {
  clientIp,
  createAuthRateLimiter,
  hashPassword,
  validateAuthInput,
  verifyPassword,
} from './auth.js';

assert.equal(validateAuthInput('person@example.com', 'password123'), '');
assert.equal(validateAuthInput(`${'a'.repeat(250)}@x.io`, 'password123'), 'Email слишком длинный');
assert.equal(validateAuthInput('broken', 'password123'), 'Введите нормальный email');
assert.equal(validateAuthInput('person@example.com', 'short'), 'Пароль минимум 8 символов');
assert.equal(validateAuthInput('person@example.com', 'x'.repeat(201)), 'Пароль слишком длинный');

const stored = await hashPassword('correct horse battery staple');
assert.match(stored, /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
assert.equal(await verifyPassword('correct horse battery staple', stored), true);
assert.equal(await verifyPassword('wrong password', stored), false);
assert.equal(await verifyPassword('anything', 'broken'), false);

const directRequest = {
  headers: { 'x-forwarded-for': '203.0.113.20, 10.0.0.1' },
  socket: { remoteAddress: '10.0.0.5' },
};
assert.equal(clientIp(directRequest), '10.0.0.5', 'forwarded headers must be ignored unless the deployment explicitly trusts its proxy');
assert.equal(clientIp(directRequest, { trustProxy: true }), '203.0.113.20');

let currentTime = 1_000;
const limiter = createAuthRateLimiter({
  windowMs: 100,
  maxAttempts: 3,
  blockMs: 200,
  maxTrackedKeys: 4,
  now: () => currentTime,
});
const requestA = { headers: {}, socket: { remoteAddress: '10.0.0.1' } };
const requestB = { headers: {}, socket: { remoteAddress: '10.0.0.2' } };

assert.equal(limiter.isBlocked(requestA, 'a@example.com'), false);
assert.equal(limiter.recordFailure(requestA, 'a@example.com'), false);
assert.equal(limiter.recordFailure(requestA, 'a@example.com'), false);
assert.equal(limiter.recordFailure(requestA, 'a@example.com'), true, 'third failure must block both the IP and email keys');
assert.equal(limiter.isBlocked(requestA, 'other@example.com'), true, 'changing email must not bypass the IP limit');
assert.equal(limiter.isBlocked(requestB, 'a@example.com'), true, 'changing IP must not bypass the email limit');

limiter.clearEmail('a@example.com');
assert.equal(limiter.isBlocked(requestB, 'a@example.com'), false, 'successful login may clear the account key');
assert.equal(limiter.isBlocked(requestA, 'a@example.com'), true, 'successful login must not erase the shared IP protection');

currentTime += 250;
limiter.cleanup();
assert.equal(limiter.isBlocked(requestA, 'a@example.com'), false, 'expired blocks must be removed');

for (let index = 0; index < 20; index += 1) {
  limiter.recordFailure(
    { headers: {}, socket: { remoteAddress: `192.0.2.${index}` } },
    `person-${index}@example.com`,
  );
}
assert.ok(limiter.size() <= 4, 'tracked auth keys must stay within the configured memory bound');

console.log('auth security checks passed');
