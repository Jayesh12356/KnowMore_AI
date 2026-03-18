const express = require('express');
const db = require('../db/client');
const redis = require('../services/redis');
const { chatJSON } = require('../services/llm');
const { QUIZ_SYSTEM_PROMPT, GRADER_SYSTEM_PROMPT } = require('../prompts');
const { makeSeed } = require('../utils/seed');
const authMiddleware = require('../middleware/auth');
const { getDefaultProviderName } = require('../services/providers');

const router = express.Router();

const QUIZ_TTL = 1800;
const LOCK_TTL = 30;

function stripAnswers(quiz) {
  return {
    questions: quiz.questions.map((q) => ({
      id: q.id, type: q.type, text: q.text,
      options: q.options, max_words: q.max_words || null,
    })),
  };
}

// POST /api/v1/quiz/generate
router.post('/generate', authMiddleware, async (req, res, next) => {
  try {
    const { topic_id, seed: inputSeed, randomize = false, provider: reqProvider } = req.body;
    if (!topic_id) return res.status(400).json({ error: 'topic_id required' });

    const provider = reqProvider || getDefaultProviderName();

    // Enforce provider access for this user
    const userResult = await db.query('SELECT allowed_providers FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length) {
      const allowed = userResult.rows[0].allowed_providers.split(',').map(s => s.trim());
      if (!allowed.includes(provider)) {
        return res.status(403).json({ error: `You don't have access to ${provider}. Contact admin to enable it.` });
      }
    }

    // When randomize is true, use the client-provided seed (already unique)
    // or generate one server-side as fallback
    const seed = randomize
      ? (inputSeed || makeSeed(topic_id, true))
      : (inputSeed || makeSeed(topic_id, false));
    const quizKey = `quiz:${provider}:${topic_id}:${seed}`;

    // 1. Check quiz cache
    const cached = await redis.get(quizKey);
    if (cached) {
      const quiz = JSON.parse(cached);
      const ttl = await redis.ttl(quizKey);
      return res.json({
        topic_id, seed, provider, cache_status: 'hit',
        quiz: stripAnswers(quiz),
        redis_key: quizKey, ttl_remaining_s: ttl,
      });
    }

    // 2. Find context — try provider-specific context first, then any existing
    const ctxKey = `ctx:${provider}:${topic_id}:${seed}`;
    let ctxRaw = await redis.get(ctxKey);

    if (!ctxRaw) {
      // Try the daily seed for same provider
      const dailySeed = makeSeed(topic_id, false);
      const dailyCtxKey = `ctx:${provider}:${topic_id}:${dailySeed}`;
      ctxRaw = await redis.get(dailyCtxKey);

      if (!ctxRaw) {
        // Try any provider's context as last resort
        const fallbackCtxKey = `ctx:*:${topic_id}:${dailySeed}`;
        // Can't use wildcard with get, so try known providers
        for (const pName of ['openai', 'gemini', 'grok']) {
          ctxRaw = await redis.get(`ctx:${pName}:${topic_id}:${dailySeed}`);
          if (ctxRaw) break;
          ctxRaw = await redis.get(`ctx:${pName}:${topic_id}:${seed}`);
          if (ctxRaw) break;
        }
      }

      if (ctxRaw) {
        // Cache it under the new key too
        await redis.setex(ctxKey, 3600, ctxRaw);
      }
    }

    if (!ctxRaw) {
      // Auto-generate context inline for fresh quiz
      const topicResult = await db.query('SELECT * FROM topics WHERE id = $1', [topic_id]);
      const topic = topicResult.rows[0];
      if (!topic) return res.status(404).json({ error: 'Topic not found' });

      const { EXPLANATION_SYSTEM_PROMPT } = require('../prompts');
      const ctxPrompt = `Generate an educational explanation for the following topic.\n\nTopic: ${topic.title}\nDescription: ${topic.short_description}\nSeed: ${seed}`;
      const context = await chatJSON(EXPLANATION_SYSTEM_PROMPT, ctxPrompt, 0, provider);
      ctxRaw = JSON.stringify(context);
      await redis.setex(ctxKey, 3600, ctxRaw);
    }

    // 3. Acquire dedup lock
    const lockKey = `lock:quiz:${provider}:${topic_id}:${seed}`;
    const locked = await redis.set(lockKey, '1', 'EX', LOCK_TTL, 'NX');
    if (!locked) {
      return res.status(429).json({ error: 'Quiz generation in progress. Retry in a few seconds.' });
    }

    try {
      const userPrompt = `Generate a quiz based on this context. Do not add information beyond what is provided.\n\nContext:\n${ctxRaw}\n\nSeed: ${seed}`;
      const quizFull = await chatJSON(QUIZ_SYSTEM_PROMPT, userPrompt, 0, provider);
      await redis.setex(quizKey, QUIZ_TTL, JSON.stringify(quizFull));

      res.json({
        topic_id, seed, provider, cache_status: 'miss',
        quiz: stripAnswers(quizFull),
        redis_key: quizKey, ttl_remaining_s: QUIZ_TTL,
      });
    } finally {
      await redis.del(lockKey);
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/quiz/submit
router.post('/submit', authMiddleware, async (req, res, next) => {
  try {
    const { topic_id, seed, answers, provider: reqProvider } = req.body;
    const userId = req.user.id;
    const provider = reqProvider || getDefaultProviderName();

    if (!topic_id || !seed || !answers) {
      return res.status(400).json({ error: 'topic_id, seed, and answers required' });
    }

    // Try provider-specific quiz key first, then legacy key
    const quizKey = `quiz:${provider}:${topic_id}:${seed}`;
    const ctxKey = `ctx:${provider}:${topic_id}:${seed}`;

    // 1. Fetch full quiz from cache
    const quizRaw = await redis.get(quizKey);
    if (!quizRaw) {
      return res.status(410).json({ error: 'Quiz expired. Please regenerate.' });
    }
    const quiz = JSON.parse(quizRaw);

    // 2. Grade MCQs
    const results = [];
    let mcqCorrect = 0, mcqTotal = 0, shortTotal = 0;
    const shortAnswersToGrade = [];

    for (const q of quiz.questions) {
      const ans = answers.find((a) => a.question_id === q.id);
      if (q.type === 'mcq') {
        mcqTotal++;
        const correct = ans?.selected === q.correct_answer;
        if (correct) mcqCorrect++;
        results.push({
          question_id: q.id, correct,
          your_answer: ans?.selected || null,
          correct_answer: q.correct_answer,
        });
      } else if (q.type === 'short_answer') {
        shortTotal++;
        shortAnswersToGrade.push({
          question_id: q.id, question_text: q.text,
          correct_answer: q.correct_answer, student_answer: ans?.text || '',
        });
      }
    }

    // 3. Grade short answers via LLM
    let shortCorrect = 0;
    if (shortAnswersToGrade.length > 0) {
      const userPrompt = `Grade these short-answer responses:\n${JSON.stringify(shortAnswersToGrade)}`;
      const grading = await chatJSON(GRADER_SYSTEM_PROMPT, userPrompt, 0, provider);

      for (const gr of grading.results) {
        if (gr.score >= 0.7) shortCorrect++;
        const idealAnswer = shortAnswersToGrade.find((s) => s.question_id === gr.question_id);
        results.push({
          question_id: gr.question_id, score: gr.score,
          feedback: gr.feedback,
          correct_answer_summary: idealAnswer?.correct_answer || '',
        });
      }
    }

    // 4. Calculate score
    const total = mcqTotal + shortTotal;
    const scorePct = total > 0 ? parseFloat(((mcqCorrect + shortCorrect) / total * 100).toFixed(2)) : 0;

    // 5. Check if retake
    const prevAttempt = await db.query(
      'SELECT id FROM quiz_attempts_meta WHERE user_id = $1 AND topic_id = $2 AND seed = $3 LIMIT 1',
      [userId, topic_id, seed]
    );
    const isRetake = prevAttempt.rows.length > 0;

    // 6. Persist attempt
    const attempt = await db.query(
      `INSERT INTO quiz_attempts_meta
        (user_id, topic_id, redis_ctx_key, redis_quiz_key, seed, total_questions,
         mcq_correct, mcq_total, short_correct, short_total, score_pct, is_retake, grading_meta, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
       RETURNING id`,
      [userId, topic_id, ctxKey, quizKey, seed, total,
       mcqCorrect, mcqTotal, shortCorrect, shortTotal, scorePct, isRetake, JSON.stringify(results)]
    );

    // 7. Upsert user_scores
    await db.query(
      `INSERT INTO user_scores (user_id, topic_id, best_score_pct, attempts_count, avg_score_pct, last_attempt_at)
       VALUES ($1, $2, $3, 1, $3, NOW())
       ON CONFLICT (user_id, topic_id) DO UPDATE SET
         best_score_pct = GREATEST(user_scores.best_score_pct, $3),
         attempts_count = user_scores.attempts_count + 1,
         avg_score_pct = ((user_scores.avg_score_pct * user_scores.attempts_count) + $3) / (user_scores.attempts_count + 1),
         last_attempt_at = NOW()`,
      [userId, topic_id, scorePct]
    );

    res.json({
      attempt_id: attempt.rows[0].id,
      score_pct: scorePct,
      breakdown: {
        mcq: { correct: mcqCorrect, total: mcqTotal },
        short_answer: { correct: shortCorrect, partial: shortTotal - shortCorrect, total: shortTotal },
      },
      results,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
