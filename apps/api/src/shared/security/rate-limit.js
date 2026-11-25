class InMemoryRateLimiter {
  constructor({ maxAttempts = 10, windowSeconds = 60 } = {}) {
    this.maxAttempts = maxAttempts;
    this.windowSeconds = windowSeconds;
    this.attempts = new Map();
  }

  consume(key, options = {}) {
    const limit = options.maxAttempts || this.maxAttempts;
    const windowMs = (options.windowSeconds || this.windowSeconds) * 1000;
    const now = Date.now();
    const existing = (this.attempts.get(key) || []).filter(
      (timestamp) => timestamp > now - windowMs,
    );

    if (existing.length >= limit) {
      const oldest = existing[0];
      this.attempts.set(key, existing);
      return {
        allowed: false,
        limit,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      };
    }

    existing.push(now);
    this.attempts.set(key, existing);
    return { allowed: true, limit, retryAfterSeconds: 0, remaining: limit - existing.length };
  }

  reset(key) {
    this.attempts.delete(key);
  }

  clear() {
    this.attempts.clear();
  }
}

// Redis-backed deployments can provide an adapter with this same consume/reset contract.
function createRateLimiter(env) {
  return new InMemoryRateLimiter({
    maxAttempts: env.AUTH_RATE_LIMIT_MAX_ATTEMPTS,
    windowSeconds: env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
  });
}

module.exports = { InMemoryRateLimiter, createRateLimiter };
