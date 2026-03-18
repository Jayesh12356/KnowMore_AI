require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const contextRoutes = require('./routes/context');
const quizRoutes = require('./routes/quiz');
const newsRoutes = require('./routes/news');
const topicsRoutes = require('./routes/topics');
const progressRoutes = require('./routes/progress');
const adminRoutes = require('./routes/admin');
const { llmLimiter, authLimiter, generalLimiter } = require('./middleware/rateLimiter');
const { runMigrations } = require('./db/migrate');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// Global rate limit
app.use('/api/', generalLimiter.middleware());

// Health check (used by Vercel cron to prevent Render cold starts)
app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok' }));

// LLM Providers list — auth-aware (returns allowed status per user)
const { getAvailableProviders, getDefaultProviderName } = require('./services/providers');
const jwt = require('jsonwebtoken');
const db = require('./db/client');
app.get('/api/v1/providers', async (req, res) => {
  const providers = getAvailableProviders();
  const defaultProvider = getDefaultProviderName();

  // Try to get user's allowed providers if authenticated
  let userAllowed = null;
  try {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
      const result = await db.query('SELECT allowed_providers FROM users WHERE id = $1', [decoded.id]);
      if (result.rows.length) {
        userAllowed = result.rows[0].allowed_providers.split(',').map(s => s.trim());
      }
    }
  } catch { /* ignore — treat as unauthenticated */ }

  res.json({
    providers: providers.map(p => ({
      ...p,
      allowed: userAllowed ? userAllowed.includes(p.name) : true,
    })),
    default: defaultProvider,
  });
});

// Routes with targeted rate limits
app.use('/api/v1/auth', authLimiter.middleware(), authRoutes);
app.use('/api/v1/context', contextRoutes);      // LLM limiter applied inside route
app.use('/api/v1/quiz', quizRoutes);             // LLM limiter applied inside route
app.use('/api/v1/news', newsRoutes);
app.use('/api/v1/topics', topicsRoutes);
app.use('/api/v1/progress', progressRoutes);
app.use('/api/v1/admin', adminRoutes);

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message, err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

async function start() {
  console.log("[STARTUP] Starting app...");

  try {
    console.log("[STARTUP] Running migrations...");
    await runMigrations();
    console.log("[STARTUP] Migrations complete");
  } catch (err) {
    console.error('[STARTUP] Migration failed — aborting server start:', err.message);
    process.exit(1);
  }

  // Seed default admin (safe to run every boot — uses ON CONFLICT DO UPDATE)
  try {
    const bcrypt = require('bcryptjs');
    const db = require('./db/client');
    const email = 'admin@knowmore.ai';
    const hash = await bcrypt.hash('Admin@123', 10);
    await db.query(
      `INSERT INTO admins (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING`,
      [email, hash, 'Super Admin']
    );
    console.log('[STARTUP] Admin account ensured');
  } catch (err) {
    console.warn('[STARTUP] Admin seed skipped:', err.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[STARTUP] Server running on port ${PORT}`);
  });
}

start();

module.exports = app;
