const jwt = require('jsonwebtoken');
const redis = require('../services/redis');

/**
 * Middleware that verifies admin JWT tokens.
 * Only tokens with role='admin' are accepted.
 * Also checks if the token has been revoked (for session revocation).
 */
async function adminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.admin = decoded; // { id, email, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}

/**
 * Middleware for user auth that also checks ban status and session revocation.
 * Drop-in replacement for the existing authMiddleware.
 */
async function enhancedAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if session has been revoked
    const revoked = await redis.get(`revoked:${decoded.id}`);
    if (revoked) {
      return res.status(401).json({ error: 'Session has been revoked. Please login again.' });
    }

    req.user = decoded; // { id, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { adminAuth, enhancedAuth };
