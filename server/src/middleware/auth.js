const jwt = require('jsonwebtoken');
const redis = require('../services/redis');
const db = require('../db/client');

/**
 * Auth middleware with REAL-TIME enforcement.
 * On every request:
 *  1. Verify JWT
 *  2. Check Redis for session revocation
 *  3. Check DB for user existence + ban status
 * This ensures admin actions (ban/revoke/delete) take effect IMMEDIATELY.
 */
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if session has been revoked by admin
    const revoked = await redis.get(`revoked:${decoded.id}`);
    if (revoked) {
      return res.status(401).json({ error: 'Session has been revoked. Please login again.', code: 'SESSION_REVOKED' });
    }

    // Check user exists and is not banned in DB (real-time enforcement)
    const userResult = await db.query(
      'SELECT id, status FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Account no longer exists.', code: 'ACCOUNT_DELETED' });
    }

    if (userResult.rows[0].status === 'banned') {
      return res.status(403).json({ error: 'Account has been banned. Contact support.', code: 'ACCOUNT_BANNED' });
    }

    req.user = decoded; // { id, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
