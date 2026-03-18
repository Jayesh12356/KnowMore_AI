const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/client');
const redis = require('../services/redis');

const router = express.Router();

// POST /api/v1/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, display_name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, email, display_name, created_at`,
      [email, hash, display_name || null]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ user, token });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    next(err);
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    // Check if user is banned
    if (user.status === 'banned') {
      return res.status(403).json({ error: 'Account has been banned. Contact support.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // Clear any previous session revocation so user can use the app
    await redis.del(`revoked:${user.id}`);

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: { id: user.id, email: user.email, display_name: user.display_name }, token });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
