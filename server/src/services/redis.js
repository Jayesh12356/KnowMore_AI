/**
 * In-memory cache with TTL — drop-in replacement for Redis in local dev.
 * Uses a Map with automatic expiry. Compatible with the Redis API subset we use.
 */

class MemoryCache {
  constructor() {
    this._store = new Map(); // key -> { value, expiresAt }
  }

  _cleanup(key) {
    const entry = this._store.get(key);
    if (entry && entry.expiresAt && Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return null;
    }
    return entry || null;
  }

  async get(key) {
    const entry = this._cleanup(key);
    return entry ? entry.value : null;
  }

  async set(key, value, ...args) {
    // Supports: set(key, val, 'EX', ttlSecs, 'NX')
    let ttlMs = null;
    let nx = false;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === 'EX' && args[i + 1] !== undefined) {
        ttlMs = args[i + 1] * 1000;
        i++;
      } else if (args[i] === 'NX') {
        nx = true;
      }
    }

    if (nx) {
      const existing = this._cleanup(key);
      if (existing) return null; // key exists, NX fails
    }

    const expiresAt = ttlMs ? Date.now() + ttlMs : null;
    this._store.set(key, { value, expiresAt });
    return 'OK';
  }

  async setex(key, ttlSecs, value) {
    const expiresAt = Date.now() + ttlSecs * 1000;
    this._store.set(key, { value, expiresAt });
    return 'OK';
  }

  async ttl(key) {
    const entry = this._cleanup(key);
    if (!entry) return -2;
    if (!entry.expiresAt) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  async del(key) {
    this._store.delete(key);
    return 1;
  }

  on() {} // no-op for event compat
}

// Use real Redis if REDIS_URL is set and not localhost (when Redis is actually available)
let cache;
const redisUrl = process.env.REDIS_URL || '';

if (redisUrl && !redisUrl.includes('localhost') && !redisUrl.includes('127.0.0.1')) {
  try {
    const Redis = require('ioredis');
    const useTls = redisUrl.startsWith('rediss://');

    cache = new Redis(redisUrl, {
      tls: useTls ? { rejectUnauthorized: false } : undefined,
      maxRetriesPerRequest: null,       // never reject commands with "max retries" error
      enableOfflineQueue: true,         // queue commands during transient disconnects
      retryStrategy(times) {
        if (times > 10) return null;    // stop reconnecting after 10 attempts
        return Math.min(times * 500, 5000);
      },
      reconnectOnError(err) {
        return err.message.includes('READONLY');
      },
    });
    cache.on('error', (err) => console.error('[REDIS] Error:', err.message));
    cache.on('connect', () => console.log('[REDIS] Connected'));
  } catch (e) {
    console.log('[CACHE] Redis not available, using in-memory cache');
    cache = new MemoryCache();
  }
} else {
  console.log('[CACHE] Using in-memory cache (set REDIS_URL to a remote Redis for production)');
  cache = new MemoryCache();
}

module.exports = cache;
