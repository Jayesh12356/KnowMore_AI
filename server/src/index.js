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

// Routes with targeted rate limits
app.use('/api/v1/auth', authLimiter.middleware(), authRoutes);
app.use('/api/v1/context', contextRoutes);      // LLM limiter applied inside route
app.use('/api/v1/quiz', quizRoutes);             // LLM limiter applied inside route
app.use('/api/v1/news', newsRoutes);
app.use('/api/v1/topics', topicsRoutes);
app.use('/api/v1/progress', progressRoutes);

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message, err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await runMigrations();
  } catch (err) {
    console.error('[STARTUP] Migration failed — aborting server start:', err.message);
    process.exit(1);
  }
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

start();

module.exports = app;
