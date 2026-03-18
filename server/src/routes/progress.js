const express = require('express');
const db = require('../db/client');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/v1/progress — global progress stats + per-topic status ───
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Total topics count — scoped to this user's topics
    const totalResult = await db.query('SELECT COUNT(*) as total FROM topics WHERE created_by = $1', [userId]);
    const totalTopics = parseInt(totalResult.rows[0].total);

    // Per-topic progress for this user — ONLY for topics they own
    const progressResult = await db.query(
      `SELECT tp.topic_id, tp.status, tp.opened_at, tp.completed_at
       FROM topic_progress tp
       JOIN topics t ON t.id = tp.topic_id AND t.created_by = $1
       WHERE tp.user_id = $1`,
      [userId]
    );

    const progressMap = {};
    let completed = 0;
    let inProgress = 0;

    for (const row of progressResult.rows) {
      progressMap[row.topic_id] = {
        status: row.status,
        opened_at: row.opened_at,
        completed_at: row.completed_at,
      };
      if (row.status === 'completed') completed++;
      else if (row.status === 'in_progress') inProgress++;
    }

    const newCount = totalTopics - completed - inProgress;
    const percentage = totalTopics > 0 ? parseFloat(((completed / totalTopics) * 100).toFixed(1)) : 0;

    res.json({
      total_topics: totalTopics,
      completed,
      in_progress: inProgress,
      new_count: newCount,
      percentage,
      topics: progressMap,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/progress/:topicId/open — mark topic as in_progress ───
router.post('/:topicId/open', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const topicId = parseInt(req.params.topicId);

    // Upsert: only set in_progress if currently new or doesn't exist
    // If already in_progress or completed, don't downgrade
    await db.query(
      `INSERT INTO topic_progress (user_id, topic_id, status, opened_at)
       VALUES ($1, $2, 'in_progress', NOW())
       ON CONFLICT (user_id, topic_id) DO UPDATE SET
         status = CASE
           WHEN topic_progress.status = 'new' THEN 'in_progress'
           ELSE topic_progress.status
         END,
         opened_at = COALESCE(topic_progress.opened_at, NOW())`,
      [userId, topicId]
    );

    res.json({ topic_id: topicId, status: 'in_progress' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/progress/:topicId/complete — mark topic as completed ───
router.post('/:topicId/complete', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const topicId = parseInt(req.params.topicId);

    await db.query(
      `INSERT INTO topic_progress (user_id, topic_id, status, opened_at, completed_at)
       VALUES ($1, $2, 'completed', NOW(), NOW())
       ON CONFLICT (user_id, topic_id) DO UPDATE SET
         status = 'completed',
         completed_at = NOW()`,
      [userId, topicId]
    );

    res.json({ topic_id: topicId, status: 'completed' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/progress/:topicId/uncomplete — revert to in_progress ───
router.post('/:topicId/uncomplete', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const topicId = parseInt(req.params.topicId);

    await db.query(
      `UPDATE topic_progress SET status = 'in_progress', completed_at = NULL
       WHERE user_id = $1 AND topic_id = $2`,
      [userId, topicId]
    );

    res.json({ topic_id: topicId, status: 'in_progress' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
