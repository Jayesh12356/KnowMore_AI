const express = require('express');
const db = require('../db/client');
const redis = require('../services/redis');
const { chatJSON } = require('../services/llm');
const { EXPLANATION_SYSTEM_PROMPT } = require('../prompts');
const { makeSeed } = require('../utils/seed');
const authMiddleware = require('../middleware/auth');
const { getDefaultProviderName } = require('../services/providers');

const router = express.Router();

const CTX_TTL = 3600; // 1 hour
const LOCK_TTL = 30;  // 30 seconds

// POST /api/v1/context/generate
router.post('/generate', authMiddleware, async (req, res, next) => {
  try {
    const { topic_id, randomize = false, provider: reqProvider } = req.body;
    if (!topic_id) return res.status(400).json({ error: 'topic_id required' });

    const provider = reqProvider || getDefaultProviderName();

    // Fetch topic from Postgres
    const topicResult = await db.query('SELECT * FROM topics WHERE id = $1', [topic_id]);
    const topic = topicResult.rows[0];
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    const seed = makeSeed(topic_id, randomize);
    const cacheKey = `ctx:${provider}:${topic_id}:${seed}`;

    // 1. Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      const ttl = await redis.ttl(cacheKey);
      return res.json({
        topic_id, seed, provider, cache_status: 'hit',
        context: JSON.parse(cached),
        redis_key: cacheKey, ttl_remaining_s: ttl,
      });
    }

    // 2. Acquire dedup lock
    const lockKey = `lock:ctx:${provider}:${topic_id}`;
    const locked = await redis.set(lockKey, '1', 'EX', LOCK_TTL, 'NX');
    if (!locked) {
      return res.status(429).json({ error: 'Generation in progress. Retry in a few seconds.' });
    }

    try {
      // 3. Call LLM with selected provider
      const userPrompt = `Generate an educational explanation for the following topic.\n\nTopic: ${topic.title}\nDescription: ${topic.short_description}\nSeed: ${seed}`;
      const context = await chatJSON(EXPLANATION_SYSTEM_PROMPT, userPrompt, 0, provider);

      // 4. Cache with TTL
      await redis.setex(cacheKey, CTX_TTL, JSON.stringify(context));

      res.json({
        topic_id, seed, provider, cache_status: 'miss',
        context, redis_key: cacheKey, ttl_remaining_s: CTX_TTL,
      });
    } finally {
      await redis.del(lockKey);
    }
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/context/topics — list user's own topics
router.get('/topics', authMiddleware, async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, title, short_description, category FROM topics WHERE created_by = $1 ORDER BY id',
      [req.user.id]
    );
    res.json({ topics: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
