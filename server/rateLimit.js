function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.max(1, Math.floor(number)) : fallback;
}

export function createFixedWindowRateLimiter(options = {}) {
  const windowMs = positiveInteger(options.windowMs, 60 * 60 * 1000);
  const maxRequests = positiveInteger(options.maxRequests, 60);
  const maxTrackedKeys = positiveInteger(options.maxTrackedKeys, 10_000);
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const entries = new Map();

  function cleanup() {
    const currentTime = now();
    for (const [key, entry] of entries.entries()) {
      if (currentTime - entry.startedAt >= windowMs) entries.delete(key);
    }
  }

  function ensureCapacity() {
    cleanup();
    while (entries.size >= maxTrackedKeys) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      entries.delete(oldestKey);
    }
  }

  function consume(key) {
    const normalizedKey = String(key || 'unknown');
    const currentTime = now();
    let entry = entries.get(normalizedKey);

    if (!entry || currentTime - entry.startedAt >= windowMs) {
      if (!entry) ensureCapacity();
      entry = { startedAt: currentTime, count: 0 };
      entries.set(normalizedKey, entry);
    }

    const resetAt = entry.startedAt + windowMs;
    if (entry.count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - currentTime) / 1000)),
      };
    }

    entry.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - entry.count),
      retryAfterSeconds: 0,
    };
  }

  return {
    consume,
    cleanup,
    size: () => entries.size,
  };
}
