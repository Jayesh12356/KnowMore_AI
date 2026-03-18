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

-- Super Admin tables
CREATE TABLE IF NOT EXISTS admins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  display_name    VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add status column to users (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'status'
  ) THEN
    ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active';
  END IF;
END $$;

-- Add created_by column to topics (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'topics' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE topics ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE CASCADE;
    CREATE INDEX idx_topics_created_by ON topics(created_by);
  END IF;
END $$;

-- Change UNIQUE constraint from (title) to (title, created_by) so each user has their own topics
DO $$
BEGIN
  -- Drop old global unique constraint on title if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'topics_title_key' AND conrelid = 'topics'::regclass
  ) THEN
    ALTER TABLE topics DROP CONSTRAINT topics_title_key;
  END IF;
  -- Create per-user unique constraint if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'topics_title_created_by_key' AND conrelid = 'topics'::regclass
  ) THEN
    ALTER TABLE topics ADD CONSTRAINT topics_title_created_by_key UNIQUE (title, created_by);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id              SERIAL PRIMARY KEY,
  admin_id        UUID NOT NULL REFERENCES admins(id),
  action          VARCHAR(100) NOT NULL,
  target_user_id  UUID,
  details         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at DESC);

-- Add allowed_providers column to users (idempotent)
-- Default for NEW users = 'grok' only. Existing users get all providers.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'allowed_providers'
  ) THEN
    ALTER TABLE users ADD COLUMN allowed_providers TEXT NOT NULL DEFAULT 'grok';
    -- Grant existing users all providers so we don't break their access
    UPDATE users SET allowed_providers = 'grok,openai,gemini' WHERE allowed_providers = 'grok';
  END IF;
END $$;
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
