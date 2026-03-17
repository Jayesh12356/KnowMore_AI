require('dotenv').config();
const db = require('./client');

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS topics (
  id              SERIAL PRIMARY KEY,
  title           VARCHAR(255) NOT NULL UNIQUE,
  short_description TEXT NOT NULL,
  category        VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_topics_category ON topics(category);

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  display_name    VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_attempts_meta (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id        INT  NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  redis_ctx_key   VARCHAR(512) NOT NULL,
  redis_quiz_key  VARCHAR(512) NOT NULL,
  seed            VARCHAR(64)  NOT NULL,
  total_questions INT  NOT NULL,
  mcq_correct     INT  NOT NULL DEFAULT 0,
  mcq_total       INT  NOT NULL DEFAULT 0,
  short_correct   INT  NOT NULL DEFAULT 0,
  short_total     INT  NOT NULL DEFAULT 0,
  score_pct       NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_retake       BOOLEAN NOT NULL DEFAULT FALSE,
  grading_meta    JSONB,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_qam_user ON quiz_attempts_meta(user_id);
CREATE INDEX IF NOT EXISTS idx_qam_topic ON quiz_attempts_meta(topic_id);
CREATE INDEX IF NOT EXISTS idx_qam_user_topic ON quiz_attempts_meta(user_id, topic_id);

CREATE TABLE IF NOT EXISTS user_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id        INT  NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  best_score_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  attempts_count  INT NOT NULL DEFAULT 0,
  avg_score_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  UNIQUE(user_id, topic_id)
);
CREATE INDEX IF NOT EXISTS idx_us_user ON user_scores(user_id);

CREATE TABLE IF NOT EXISTS topic_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id        INT  NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'new',
  opened_at       TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  UNIQUE(user_id, topic_id)
);
CREATE INDEX IF NOT EXISTS idx_tp_user ON topic_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_tp_user_topic ON topic_progress(user_id, topic_id);
`;

async function runMigrations() {
  console.log('[DB] Running migrations...');
  await db.query(MIGRATION_SQL);
  console.log('[DB] Migrations complete.');
}

// CLI usage: `node src/db/migrate.js` or `npm run db:migrate`
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[DB] Migration error:', err.message);
      process.exit(1);
    })
    .finally(() => db.pool.end());
}

module.exports = { runMigrations };
