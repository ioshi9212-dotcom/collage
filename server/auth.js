import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.max(1, Math.floor(number)) : fallback;
}

export function validateAuthInput(email, password) {
  const normalizedEmail = String(email || '');
  const normalizedPassword = String(password || '');
  if (normalizedEmail.length > 254) return 'Email слишком длинный';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return 'Введите нормальный email';
  if (normalizedPassword.length < 8) return 'Пароль минимум 8 символов';
  if (normalizedPassword.length > 200) return 'Пароль слишком длинный';
  return '';
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(String(password), salt, 64);
  return `scrypt:${salt}:${Buffer.from(derivedKey).toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [method, salt, hash] = String(stored || '').split(':');
  if (method !== 'scrypt' || !salt || !hash) return false;

  try {
    const actual = Buffer.from(await scrypt(String(password), salt, 64));
    const expected = Buffer.from(hash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function clientIp(request, { trustProxy = false } = {}) {
  if (trustProxy) {
    const forwarded = String(request?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return request?.socket?.remoteAddress || 'unknown';
}

export function createAuthRateLimiter(options = {}) {
  const windowMs = positiveInteger(options.windowMs, 15 * 60 * 1000);
  const maxAttempts = positiveInteger(options.maxAttempts, 20);
  const blockMs = positiveInteger(options.blockMs, 15 * 60 * 1000);
  const maxTrackedKeys = positiveInteger(options.maxTrackedKeys, 10_000);
  const trustProxy = options.trustProxy === true;
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const attempts = new Map();

  function keysFor(request, email) {
    return [`ip:${clientIp(request, { trustProxy })}`, `email:${String(email || 'unknown').toLowerCase()}`];
  }

  function cleanup() {
    const currentTime = now();
    for (const [key, value] of attempts.entries()) {
      const expiredBlock = value.blockedUntil > 0 && value.blockedUntil <= currentTime;
      const expiredWindow = currentTime - value.firstAt > windowMs + blockMs;
      if (expiredBlock || expiredWindow) attempts.delete(key);
    }
  }

  function ensureCapacity() {
    cleanup();
    while (attempts.size >= maxTrackedKeys) {
      const oldestKey = attempts.keys().next().value;
      if (oldestKey === undefined) break;
      attempts.delete(oldestKey);
    }
  }

  function isBlocked(request, email) {
    const currentTime = now();
    return keysFor(request, email).some((key) => {
      const entry = attempts.get(key);
      return Boolean(entry?.blockedUntil && entry.blockedUntil > currentTime);
    });
  }

  function recordFailure(request, email) {
    const currentTime = now();
    for (const key of keysFor(request, email)) {
      let entry = attempts.get(key);
      if (!entry || currentTime - entry.firstAt > windowMs) {
        ensureCapacity();
        entry = { firstAt: currentTime, count: 0, blockedUntil: 0 };
        attempts.set(key, entry);
      }

      entry.count += 1;
      if (entry.count >= maxAttempts) entry.blockedUntil = currentTime + blockMs;
    }
    return isBlocked(request, email);
  }

  function clearEmail(email) {
    attempts.delete(`email:${String(email || 'unknown').toLowerCase()}`);
  }

  return {
    isBlocked,
    recordFailure,
    clearEmail,
    cleanup,
    size: () => attempts.size,
  };
}
