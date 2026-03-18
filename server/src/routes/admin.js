const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/client');
const redis = require('../services/redis');
const { adminAuth } = require('../middleware/adminAuth');

const router = express.Router();

// ═══════════════════════════════════════
//  AUTH — Admin Login
// ═══════════════════════════════════════

router.post('/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const result = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
    const admin = result.rows[0];
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      admin: { id: admin.id, email: admin.email, display_name: admin.display_name },
      token,
    });
  } catch (err) {
    next(err);
  }
});

// All routes below require admin auth
router.use(adminAuth);

// ═══════════════════════════════════════
//  AUTH — Change Password
// ═══════════════════════════════════════

router.put('/auth/change-password', async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    if (current_password === new_password) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    // Fetch admin
    const adminResult = await db.query('SELECT * FROM admins WHERE id = $1', [req.admin.id]);
    const admin = adminResult.rows[0];
    if (!admin) return res.status(404).json({ error: 'Admin not found' });

    // Verify current password
    const valid = await bcrypt.compare(current_password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    // Hash and update
    const newHash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [newHash, req.admin.id]);

    // Audit log
    await db.query(
      `INSERT INTO admin_audit_log (admin_id, action, details)
       VALUES ($1, 'change_password', $2)`,
      [req.admin.id, JSON.stringify({ email: admin.email })]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════
//  DASHBOARD — Global Stats
// ═══════════════════════════════════════

router.get('/dashboard', async (req, res, next) => {
  try {
    // Total users
    const usersResult = await db.query('SELECT COUNT(*) as total FROM users');
    const totalUsers = parseInt(usersResult.rows[0].total);

    // Active users (had activity in last 24h)
    const activeResult = await db.query(
      `SELECT COUNT(DISTINCT user_id) as active FROM quiz_attempts_meta WHERE started_at > NOW() - INTERVAL '24 hours'`
    );
    const activeToday = parseInt(activeResult.rows[0].active);

    // Banned users
    const bannedResult = await db.query(`SELECT COUNT(*) as total FROM users WHERE status = 'banned'`);
    const bannedUsers = parseInt(bannedResult.rows[0].total);

    // Quizzes attempted today
    const quizzesTodayResult = await db.query(
      `SELECT COUNT(*) as total FROM quiz_attempts_meta WHERE started_at > NOW() - INTERVAL '24 hours'`
    );
    const quizzesToday = parseInt(quizzesTodayResult.rows[0].total);

    // Total quizzes all time
    const quizzesTotalResult = await db.query('SELECT COUNT(*) as total FROM quiz_attempts_meta');
    const quizzesTotal = parseInt(quizzesTotalResult.rows[0].total);

    // Most popular topics (top 5)
    const popularResult = await db.query(
      `SELECT t.id, t.title, t.category, COUNT(q.id) as attempt_count
       FROM topics t
       JOIN quiz_attempts_meta q ON q.topic_id = t.id
       GROUP BY t.id, t.title, t.category
       ORDER BY attempt_count DESC
       LIMIT 5`
    );

    // Recent activity (last 10)
    const recentResult = await db.query(
      `SELECT q.id, q.user_id, u.display_name, u.email, q.topic_id, t.title as topic_title,
              q.score_pct, q.started_at, q.submitted_at
       FROM quiz_attempts_meta q
       JOIN users u ON u.id = q.user_id
       JOIN topics t ON t.id = q.topic_id
       ORDER BY q.started_at DESC
       LIMIT 10`
    );

    res.json({
      stats: {
        total_users: totalUsers,
        active_today: activeToday,
        banned_users: bannedUsers,
        quizzes_today: quizzesToday,
        quizzes_total: quizzesTotal,
      },
      popular_topics: popularResult.rows,
      recent_activity: recentResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════
//  USERS — Paginated List
// ═══════════════════════════════════════

router.get('/users', async (req, res, next) => {
  try {
    const {
      search = '',
      status = 'all',
      sort = 'created_at',
      order = 'desc',
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Build query
    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(u.email ILIKE $${params.length} OR u.display_name ILIKE $${params.length})`);
    }
    if (status !== 'all') {
      params.push(status);
      conditions.push(`u.status = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Valid sort columns
    const sortMap = {
      created_at: 'u.created_at',
      email: 'u.email',
      display_name: 'u.display_name',
      activity: 'last_active',
      score: 'avg_score',
      attempts: 'total_attempts',
    };
    const sortCol = sortMap[sort] || 'u.created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    // Count total
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM users u ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Fetch users with aggregate stats
    const usersResult = await db.query(
      `SELECT u.id, u.email, u.display_name, u.status, u.created_at,
              COALESCE(stats.total_attempts, 0) as total_attempts,
              COALESCE(stats.avg_score, 0) as avg_score,
              stats.last_active
       FROM users u
       LEFT JOIN (
         SELECT user_id,
                COUNT(*) as total_attempts,
                ROUND(AVG(score_pct), 2) as avg_score,
                MAX(started_at) as last_active
         FROM quiz_attempts_meta
         GROUP BY user_id
       ) stats ON stats.user_id = u.id
       ${whereClause}
       ORDER BY ${sortCol} ${sortOrder} NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      users: usersResult.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        total_pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════
//  USER DETAIL
// ═══════════════════════════════════════

router.get('/users/:id', async (req, res, next) => {
  try {
    const userId = req.params.id;

    // Basic user info
    const userResult = await db.query(
      'SELECT id, email, display_name, status, created_at FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userResult.rows[0];

    // Topics studied with stats
    const topicsResult = await db.query(
      `SELECT us.topic_id, t.title, t.category,
              us.best_score_pct, us.avg_score_pct, us.attempts_count, us.last_attempt_at
       FROM user_scores us
       JOIN topics t ON t.id = us.topic_id
       WHERE us.user_id = $1
       ORDER BY us.last_attempt_at DESC`,
      [userId]
    );

    // Recent activity (last 20 actions)
    const activityResult = await db.query(
      `(SELECT 'quiz_attempt' as action_type, q.topic_id, t.title as topic_title,
              q.score_pct, q.started_at as action_time, NULL as status
       FROM quiz_attempts_meta q
       JOIN topics t ON t.id = q.topic_id
       WHERE q.user_id = $1
       ORDER BY q.started_at DESC
       LIMIT 20)
       UNION ALL
       (SELECT 'topic_' || tp.status as action_type, tp.topic_id, t.title as topic_title,
              NULL as score_pct, COALESCE(tp.completed_at, tp.opened_at) as action_time, tp.status
       FROM topic_progress tp
       JOIN topics t ON t.id = tp.topic_id
       WHERE tp.user_id = $1
       ORDER BY COALESCE(tp.completed_at, tp.opened_at) DESC
       LIMIT 20)
       ORDER BY action_time DESC
       LIMIT 20`,
      [userId]
    );

    // Aggregate stats
    const statsResult = await db.query(
      `SELECT COUNT(*) as total_attempts,
              COALESCE(ROUND(AVG(score_pct), 2), 0) as overall_avg,
              MAX(started_at) as last_active
       FROM quiz_attempts_meta WHERE user_id = $1`,
      [userId]
    );

    res.json({
      user,
      stats: {
        total_attempts: parseInt(statsResult.rows[0].total_attempts),
        overall_avg: parseFloat(statsResult.rows[0].overall_avg),
        last_active: statsResult.rows[0].last_active,
        topics_studied: topicsResult.rows.length,
      },
      topics: topicsResult.rows,
      recent_activity: activityResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════
//  USER ACTIONS — Ban / Unban / Delete / Revoke
// ═══════════════════════════════════════

// Ban user
router.post('/users/:id/ban', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const adminId = req.admin.id;

    const result = await db.query(
      `UPDATE users SET status = 'banned' WHERE id = $1 AND status != 'banned' RETURNING id, email`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found or already banned' });
    }

    // Delete all topics created by this user (cascades quiz data for those topics)
    const userTopics = await db.query('SELECT id FROM topics WHERE created_by = $1', [userId]);
    for (const t of userTopics.rows) {
      await db.query('DELETE FROM quiz_attempts_meta WHERE topic_id = $1', [t.id]);
      await db.query('DELETE FROM user_scores WHERE topic_id = $1', [t.id]);
      await db.query('DELETE FROM topic_progress WHERE topic_id = $1', [t.id]);
    }
    await db.query('DELETE FROM topics WHERE created_by = $1', [userId]);

    // Delete this user's own usage data (quiz attempts, scores, progress on other topics)
    await db.query('DELETE FROM quiz_attempts_meta WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM user_scores WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM topic_progress WHERE user_id = $1', [userId]);

    // Log action
    await db.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_user_id, details)
       VALUES ($1, 'ban_user', $2, $3)`,
      [adminId, userId, JSON.stringify({ email: result.rows[0].email, topics_deleted: userTopics.rows.length })]
    );

    // Revoke their sessions
    await redis.setex(`revoked:${userId}`, 7 * 24 * 3600, '1');

    res.json({ message: `User ${result.rows[0].email} has been banned and all data cleared`, user_id: userId });
  } catch (err) {
    next(err);
  }
});

// Unban user
router.post('/users/:id/unban', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const adminId = req.admin.id;

    const result = await db.query(
      `UPDATE users SET status = 'active' WHERE id = $1 AND status = 'banned' RETURNING id, email`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found or not banned' });
    }

    // Remove session revocation
    await redis.del(`revoked:${userId}`);

    // Log action
    await db.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_user_id, details)
       VALUES ($1, 'unban_user', $2, $3)`,
      [adminId, userId, JSON.stringify({ email: result.rows[0].email })]
    );

    res.json({ message: `User ${result.rows[0].email} has been unbanned`, user_id: userId });
  } catch (err) {
    next(err);
  }
});

// Delete user
router.delete('/users/:id', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const adminId = req.admin.id;
    const { confirm } = req.query;

    if (confirm !== 'true') {
      return res.status(400).json({ error: 'Confirmation required. Add ?confirm=true to proceed.' });
    }

    // Get user info before deletion
    const userResult = await db.query('SELECT id, email, display_name FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userResult.rows[0];

    // First, delete all topics created by this user and their related data
    const userTopics = await db.query('SELECT id FROM topics WHERE created_by = $1', [userId]);
    for (const t of userTopics.rows) {
      await db.query('DELETE FROM quiz_attempts_meta WHERE topic_id = $1', [t.id]);
      await db.query('DELETE FROM user_scores WHERE topic_id = $1', [t.id]);
      await db.query('DELETE FROM topic_progress WHERE topic_id = $1', [t.id]);
    }
    await db.query('DELETE FROM topics WHERE created_by = $1', [userId]);

    // Delete user (cascades remaining user data: quiz_attempts_meta, user_scores, topic_progress)
    await db.query('DELETE FROM users WHERE id = $1', [userId]);

    // Revoke sessions
    await redis.setex(`revoked:${userId}`, 7 * 24 * 3600, '1');

    // Log action
    await db.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_user_id, details)
       VALUES ($1, 'delete_user', $2, $3)`,
      [adminId, userId, JSON.stringify({ email: user.email, display_name: user.display_name, topics_deleted: userTopics.rows.length })]
    );

    res.json({ message: `User ${user.email} and all their data permanently deleted`, user_id: userId });
  } catch (err) {
    next(err);
  }
});

// Revoke sessions (force logout)
router.post('/users/:id/revoke-sessions', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const adminId = req.admin.id;

    // Verify user exists
    const userResult = await db.query('SELECT id, email FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Set revocation key in Redis — expires after JWT max lifetime (7 days)
    await redis.setex(`revoked:${userId}`, 7 * 24 * 3600, '1');

    // Log action
    await db.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_user_id, details)
       VALUES ($1, 'revoke_sessions', $2, $3)`,
      [adminId, userId, JSON.stringify({ email: userResult.rows[0].email })]
    );

    res.json({ message: `All sessions revoked for ${userResult.rows[0].email}`, user_id: userId });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════
//  ACTIVITY — Global Activity Feed
// ═══════════════════════════════════════

router.get('/activity', async (req, res, next) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const countResult = await db.query('SELECT COUNT(*) as total FROM quiz_attempts_meta');
    const total = parseInt(countResult.rows[0].total);

    const result = await db.query(
      `SELECT q.id, q.user_id, u.display_name, u.email,
              q.topic_id, t.title as topic_title, t.category,
              q.score_pct, q.total_questions, q.is_retake,
              q.started_at, q.submitted_at
       FROM quiz_attempts_meta q
       JOIN users u ON u.id = q.user_id
       JOIN topics t ON t.id = q.topic_id
       ORDER BY q.started_at DESC
       LIMIT $1 OFFSET $2`,
      [limitNum, offset]
    );

    res.json({
      activity: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        total_pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════
//  TOPICS — Usage Insights
// ═══════════════════════════════════════

router.get('/topics/insights', async (req, res, next) => {
  try {
    // Most studied topics
    const mostStudied = await db.query(
      `SELECT t.id, t.title, t.category,
              COUNT(q.id) as attempt_count,
              COUNT(DISTINCT q.user_id) as unique_users,
              ROUND(AVG(q.score_pct), 2) as avg_score
       FROM topics t
       JOIN quiz_attempts_meta q ON q.topic_id = t.id
       GROUP BY t.id, t.title, t.category
       ORDER BY attempt_count DESC
       LIMIT 20`
    );

    // Least studied topics (topics with fewest or zero attempts)
    const leastStudied = await db.query(
      `SELECT t.id, t.title, t.category,
              COALESCE(stats.attempt_count, 0) as attempt_count,
              COALESCE(stats.unique_users, 0) as unique_users
       FROM topics t
       LEFT JOIN (
         SELECT topic_id,
                COUNT(*) as attempt_count,
                COUNT(DISTINCT user_id) as unique_users
         FROM quiz_attempts_meta
         GROUP BY topic_id
       ) stats ON stats.topic_id = t.id
       ORDER BY attempt_count ASC, t.title ASC
       LIMIT 20`
    );

    // Highest failure rates (topics with lowest avg scores, minimum 3 attempts)
    const highestFailure = await db.query(
      `SELECT t.id, t.title, t.category,
              COUNT(q.id) as attempt_count,
              ROUND(AVG(q.score_pct), 2) as avg_score,
              COUNT(DISTINCT q.user_id) as unique_users
       FROM topics t
       JOIN quiz_attempts_meta q ON q.topic_id = t.id
       GROUP BY t.id, t.title, t.category
       HAVING COUNT(q.id) >= 3
       ORDER BY avg_score ASC
       LIMIT 20`
    );

    // Total topics
    const totalResult = await db.query('SELECT COUNT(*) as total FROM topics');

    res.json({
      total_topics: parseInt(totalResult.rows[0].total),
      most_studied: mostStudied.rows,
      least_studied: leastStudied.rows,
      highest_failure: highestFailure.rows,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
