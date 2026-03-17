/**
 * Simple in-memory rate limiter per user/IP.
 * Tracks request counts within a sliding window.
 * No Redis dependency — works standalone.
 */

class RateLimiter {
  constructor({ windowMs = 60000, max = 10, message = 'Too many requests' } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.message = message;
    this.hits = new Map(); // key -> [timestamps]
  }

  _cleanup(key) {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const timestamps = this.hits.get(key) || [];
    const valid = timestamps.filter(t => t > cutoff);
    if (valid.length === 0) {
      this.hits.delete(key);
      return [];
    }
    this.hits.set(key, valid);
    return valid;
  }

  middleware() {
    return (req, res, next) => {
      // Use user ID if authenticated, otherwise IP
      const key = req.user?.id || req.ip || 'anonymous';
      const timestamps = this._cleanup(key);

      if (timestamps.length >= this.max) {
        const retryAfter = Math.ceil((timestamps[0] + this.windowMs - Date.now()) / 1000);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({
          error: this.message,
          retry_after_seconds: retryAfter,
        });
      }

      timestamps.push(Date.now());
      this.hits.set(key, timestamps);
      next();
    };
  }
}

// ─── Pre-configured rate limiters ───

// LLM-heavy endpoints: 10 requests per minute per user
const llmLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'LLM rate limit exceeded. Please wait before generating more content.',
});

// Auth endpoints: 5 attempts per minute per IP
const authLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts. Please wait.',
});

// General API: 60 requests per minute per user
const generalLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'API rate limit exceeded.',
});

module.exports = { RateLimiter, llmLimiter, authLimiter, generalLimiter };
