import assert from 'node:assert/strict';
import { createFixedWindowRateLimiter } from './rateLimit.js';

let currentTime = 1_000;
const limiter = createFixedWindowRateLimiter({
  windowMs: 1_000,
  maxRequests: 2,
  maxTrackedKeys: 2,
  now: () => currentTime,
});

assert.deepEqual(limiter.consume('user:1'), {
  allowed: true,
  remaining: 1,
  retryAfterSeconds: 0,
});
assert.equal(limiter.consume('user:1').allowed, true);
assert.deepEqual(limiter.consume('user:1'), {
  allowed: false,
  remaining: 0,
  retryAfterSeconds: 1,
});

currentTime += 1_000;
assert.equal(limiter.consume('user:1').allowed, true, 'a new window must restore the allowance');

limiter.consume('user:2');
limiter.consume('user:3');
assert.equal(limiter.size(), 2, 'tracked keys must stay bounded');

console.log('rateLimit tests passed');
