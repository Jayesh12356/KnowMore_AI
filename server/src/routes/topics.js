const express = require('express');
const multer = require('multer');
const db = require('../db/client');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Multer: store file in memory, max 2MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.csv', '.txt', '.json', 'text/csv', 'text/plain', 'application/json'];
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (allowed.includes(`.${ext}`) || allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV, TXT, and JSON files are supported.'));
    }
  },
});

// ─── Parsers ───

function parseCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const topics = [];
  // Check if first line is header
  const firstLine = lines[0].toLowerCase();
  const startIdx = (firstLine.startsWith('title') || firstLine.includes(',description')) ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    // Handle CSV with possible quoted fields
    const parts = parseCSVLine(lines[i]);
    const title = (parts[0] || '').trim();
    const description = (parts[1] || '').trim();
    const category = (parts[2] || '').trim();
    if (title && title.length >= 2 && title.length <= 255) {
      topics.push({ title, short_description: description || `Study topic: ${title}`, category: category || null });
    }
  }
  return topics;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseTXT(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lines
    .filter(l => l.length >= 2 && l.length <= 255)
    .map(title => ({
      title,
      short_description: `Study topic: ${title}`,
      category: null,
    }));
}

function parseJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON format');
  }

  if (!Array.isArray(data)) {
    throw new Error('JSON must be an array of topic objects');
  }

  return data
    .filter(item => item && typeof item.title === 'string' && item.title.trim().length >= 2 && item.title.trim().length <= 255)
    .map(item => ({
      title: item.title.trim(),
      short_description: (item.description || item.short_description || `Study topic: ${item.title.trim()}`).trim(),
      category: (item.category || '').trim() || null,
    }));
}

function parseFile(buffer, filename) {
  const text = buffer.toString('utf-8');
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'csv') return parseCSV(text);
  if (ext === 'txt') return parseTXT(text);
  if (ext === 'json') return parseJSON(text);
  throw new Error(`Unsupported file format: .${ext}`);
}

// ─── GET /api/v1/topics — list all topics with optional search + pagination ───
router.get('/', async (req, res, next) => {
  try {
    const { search, category, limit = 100, offset = 0 } = req.query;
    let sql = 'SELECT id, title, short_description, category, created_at FROM topics';
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(title ILIKE $${params.length} OR short_description ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    // Count total
    const countResult = await db.query(
      sql.replace('SELECT id, title, short_description, category, created_at', 'SELECT COUNT(*) as total'),
      params
    );
    const total = parseInt(countResult.rows[0].total);

    sql += ' ORDER BY id DESC';
    params.push(parseInt(limit));
    sql += ` LIMIT $${params.length}`;
    params.push(parseInt(offset));
    sql += ` OFFSET $${params.length}`;

    const result = await db.query(sql, params);

    // Get distinct categories
    const catResult = await db.query('SELECT DISTINCT category FROM topics WHERE category IS NOT NULL ORDER BY category');

    res.json({
      topics: result.rows,
      total,
      categories: catResult.rows.map(r => r.category),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/topics — add single topic ───
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { title, short_description, category } = req.body;
    if (!title || title.trim().length < 2) {
      return res.status(400).json({ error: 'Title is required (minimum 2 characters).' });
    }
    if (title.trim().length > 255) {
      return res.status(400).json({ error: 'Title must be under 255 characters.' });
    }

    const desc = (short_description || `Study topic: ${title.trim()}`).trim();

    const result = await db.query(
      `INSERT INTO topics (title, short_description, category)
       VALUES ($1, $2, $3)
       ON CONFLICT (title) DO NOTHING
       RETURNING id, title, short_description, category, created_at`,
      [title.trim(), desc, (category || '').trim() || null]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: `Topic "${title.trim()}" already exists.` });
    }

  res.status(201).json({ topic: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/topics/bulk — add multiple topics at once ───
router.post('/bulk', authMiddleware, async (req, res, next) => {
  try {
    const { topics } = req.body;
    if (!Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({ error: 'topics array is required and must not be empty.' });
    }
    if (topics.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 topics per batch.' });
    }

    let inserted = 0;
    let duplicates = 0;
    const insertedTopics = [];

    for (const t of topics) {
      const title = (t.title || '').trim();
      if (!title || title.length < 2 || title.length > 255) {
        duplicates++; // skip invalid
        continue;
      }
      const desc = (t.short_description || `Study topic: ${title}`).trim();
      const category = (t.category || '').trim() || null;

      const result = await db.query(
        `INSERT INTO topics (title, short_description, category)
         VALUES ($1, $2, $3)
         ON CONFLICT (title) DO NOTHING
         RETURNING id, title, short_description, category`,
        [title, desc, category]
      );
      if (result.rows.length > 0) {
        inserted++;
        insertedTopics.push(result.rows[0]);
      } else {
        duplicates++;
      }
    }

    res.status(201).json({
      message: `Added ${inserted} topic${inserted !== 1 ? 's' : ''}${duplicates > 0 ? ` (${duplicates} skipped)` : ''}.`,
      inserted,
      duplicates,
      total_in_batch: topics.length,
      topics: insertedTopics,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/topics/upload — bulk upload from file ───
router.post('/upload', authMiddleware, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Send a CSV, TXT, or JSON file.' });
    }

    let topics;
    try {
      topics = parseFile(req.file.buffer, req.file.originalname);
    } catch (parseErr) {
      return res.status(400).json({ error: `Parse error: ${parseErr.message}` });
    }

    if (topics.length === 0) {
      return res.status(400).json({ error: 'No valid topics found in the uploaded file.' });
    }

    // Insert with dedup
    let inserted = 0;
    let duplicates = 0;
    const insertedTopics = [];

    for (const t of topics) {
      const result = await db.query(
        `INSERT INTO topics (title, short_description, category)
         VALUES ($1, $2, $3)
         ON CONFLICT (title) DO NOTHING
         RETURNING id, title, short_description, category`,
        [t.title, t.short_description, t.category]
      );
      if (result.rows.length > 0) {
        inserted++;
        insertedTopics.push(result.rows[0]);
      } else {
        duplicates++;
      }
    }

    res.status(201).json({
      message: `Uploaded ${inserted} topics (${duplicates} duplicates skipped).`,
      inserted,
      duplicates,
      total_in_file: topics.length,
      topics: insertedTopics,
    });
  } catch (err) {
    if (err.message?.includes('File too large')) {
      return res.status(413).json({ error: 'File too large. Maximum size is 2MB.' });
    }
    next(err);
  }
});

// ─── POST /api/v1/topics/preview — preview parsed topics without inserting ───
router.post('/preview', authMiddleware, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    let topics;
    try {
      topics = parseFile(req.file.buffer, req.file.originalname);
    } catch (parseErr) {
      return res.status(400).json({ error: `Parse error: ${parseErr.message}` });
    }

    // Check which already exist
    const existingResult = await db.query('SELECT title FROM topics');
    const existingTitles = new Set(existingResult.rows.map(r => r.title.toLowerCase()));

    const preview = topics.map(t => ({
      ...t,
      is_duplicate: existingTitles.has(t.title.toLowerCase()),
    }));

    res.json({
      total: topics.length,
      new_topics: preview.filter(t => !t.is_duplicate).length,
      duplicates: preview.filter(t => t.is_duplicate).length,
      topics: preview,
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/v1/topics/all — hard delete ALL topics + related data ───
router.delete('/all', authMiddleware, async (req, res, next) => {
  try {
    // Delete all related data first (cascading hard delete)
    await db.query('DELETE FROM quiz_attempts_meta');
    await db.query('DELETE FROM user_scores');
    await db.query('DELETE FROM topic_progress');
    const result = await db.query('DELETE FROM topics RETURNING id');

    res.json({
      message: `Permanently deleted all ${result.rowCount} topics and all related quiz data.`,
      deleted_topics: result.rowCount,
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/v1/topics/:id — hard delete single topic + related data ───
router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    // Hard delete all related quiz data for this topic
    await db.query('DELETE FROM quiz_attempts_meta WHERE topic_id = $1', [id]);
    await db.query('DELETE FROM user_scores WHERE topic_id = $1', [id]);
    await db.query('DELETE FROM topic_progress WHERE topic_id = $1', [id]);

    const result = await db.query('DELETE FROM topics WHERE id = $1 RETURNING id, title', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Topic not found.' });
    }

    res.json({ message: `Permanently deleted topic: ${result.rows[0].title} and all related data.`, topic: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/topics/:id/history — topic-level quiz history ───
router.get('/:id/history', authMiddleware, async (req, res, next) => {
  try {
    const topicId = parseInt(req.params.id);
    const userId = req.user.id;
    const { limit = 20 } = req.query;

    // Verify topic exists
    const topicResult = await db.query('SELECT id, title, short_description, category FROM topics WHERE id = $1', [topicId]);
    if (topicResult.rows.length === 0) {
      return res.status(404).json({ error: 'Topic not found.' });
    }

    // Get attempts for this topic
    const attemptsResult = await db.query(
      `SELECT id as attempt_id, score_pct, total_questions, is_retake, submitted_at,
              mcq_correct, mcq_total, short_correct, short_total, seed
       FROM quiz_attempts_meta
       WHERE user_id = $1 AND topic_id = $2
       ORDER BY submitted_at DESC
       LIMIT $3`,
      [userId, topicId, parseInt(limit)]
    );

    // Get aggregated stats
    const statsResult = await db.query(
      `SELECT best_score_pct, avg_score_pct, attempts_count, last_attempt_at
       FROM user_scores
       WHERE user_id = $1 AND topic_id = $2`,
      [userId, topicId]
    );

    const stats = statsResult.rows[0] || {
      best_score_pct: 0,
      avg_score_pct: 0,
      attempts_count: 0,
      last_attempt_at: null,
    };

    res.json({
      topic: topicResult.rows[0],
      attempts: attemptsResult.rows,
      stats,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

