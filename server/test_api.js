/**
 * Comprehensive E2E API test — tests all endpoints.
 * Run: node test_api.js
 */
require('dotenv').config();

const BASE = 'http://localhost:4000/api/v1';
let TOKEN = '';
let SEED = '';

async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (TOKEN) opts.headers['Authorization'] = `Bearer ${TOKEN}`;
  if (body) opts.body = JSON.stringify(body);

  const r = await fetch(`${BASE}${path}`, opts);
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log(`  ✅ ${msg}`); }
  else { fail++; console.error(`  ❌ FAIL: ${msg}`); }
}

async function run() {
  console.log('\n════════════════════════════════════════');
  console.log('  StudyQuiz AI — E2E API Tests');
  console.log('════════════════════════════════════════\n');

  // 1. Health
  console.log('1. Health Check');
  const h = await api('GET', '/health');
  ok(h.status === 200, `Status 200 (got ${h.status})`);
  ok(h.data.status === 'ok', `Returns {status: ok}`);

  // 2. Register
  console.log('\n2. Register');
  const email = `e2e_${Date.now()}@test.com`;
  const r = await api('POST', '/auth/register', { email, password: 'test1234', display_name: 'E2E Tester' });
  ok(r.status === 201, `Status 201 (got ${r.status})`);
  ok(r.data.token?.length > 20, 'Got JWT token');
  ok(r.data.user?.email === email, 'User email matches');
  TOKEN = r.data.token;

  // 3. Login
  console.log('\n3. Login');
  const l = await api('POST', '/auth/login', { email, password: 'test1234' });
  ok(l.status === 200, `Status 200 (got ${l.status})`);
  ok(l.data.token?.length > 20, 'Got JWT on login');
  TOKEN = l.data.token;

  // 4. Duplicate register
  console.log('\n4. Duplicate Register');
  const d = await api('POST', '/auth/register', { email, password: 'x' });
  ok(d.status === 409, `Status 409 (got ${d.status})`);

  // 5. Get Topics
  console.log('\n5. Get Topics');
  const t = await api('GET', '/context/topics');
  ok(t.status === 200, `Status 200 (got ${t.status})`);
  ok(Array.isArray(t.data.topics), 'Topics is array');
  ok(t.data.topics.length >= 500, `500+ topics (got ${t.data.topics.length})`);
  const topicId = t.data.topics[0].id;
  console.log(`  → Using topic: ${t.data.topics[0].title} (id=${topicId})`);

  // 6. Generate Context (LLM call)
  console.log('\n6. Generate Context (LLM call — may take ~5s)');
  const c = await api('POST', '/context/generate', { topic_id: topicId });
  ok(c.status === 200, `Status 200 (got ${c.status})`);
  ok(c.data.context?.summary?.length > 10, 'Has summary');
  ok(Array.isArray(c.data.context?.key_points), 'Has key_points');
  ok(Array.isArray(c.data.context?.flashcards), 'Has flashcards');
  ok(c.data.seed?.length > 0, `Has seed: ${c.data.seed}`);
  SEED = c.data.seed;
  console.log(`  → Cache: ${c.data.cache_status}, TTL: ${c.data.ttl_remaining_s}s`);

  // 7. Context cache hit
  console.log('\n7. Context Cache Hit');
  const c2 = await api('POST', '/context/generate', { topic_id: topicId });
  ok(c2.status === 200, `Status 200 (got ${c2.status})`);
  ok(c2.data.cache_status === 'hit', `Cache hit (got ${c2.data.cache_status})`);

  // 8. Generate Quiz (LLM call)
  console.log('\n8. Generate Quiz (LLM call)');
  const q = await api('POST', '/quiz/generate', { topic_id: topicId, seed: SEED });
  ok(q.status === 200, `Status 200 (got ${q.status})`);
  ok(q.data.quiz?.questions?.length > 0, `${q.data.quiz?.questions?.length} questions`);
  const hasAnswer = q.data.quiz?.questions?.some(qq => qq.correct_answer !== undefined);
  ok(!hasAnswer, 'correct_answer NOT exposed to frontend');
  const mcqs = q.data.quiz?.questions?.filter(qq => qq.type === 'mcq') || [];
  const shorts = q.data.quiz?.questions?.filter(qq => qq.type === 'short_answer') || [];
  console.log(`  → MCQs: ${mcqs.length}, Short answers: ${shorts.length}`);

  // 9. Quiz cache hit
  console.log('\n9. Quiz Cache Hit');
  const q2 = await api('POST', '/quiz/generate', { topic_id: topicId, seed: SEED });
  ok(q2.status === 200, `Status 200`);
  ok(q2.data.cache_status === 'hit', `Cache hit (got ${q2.data.cache_status})`);

  // 10. Submit Quiz (LLM grading)
  console.log('\n10. Submit Quiz (LLM grading)');
  const answers = q.data.quiz.questions.map(qq =>
    qq.type === 'mcq'
      ? { question_id: qq.id, selected: qq.options?.[0]?.id || 'a' }
      : { question_id: qq.id, text: 'A test answer for grading.' }
  );
  const s = await api('POST', '/quiz/submit', { topic_id: topicId, seed: SEED, answers });
  ok(s.status === 200, `Status 200 (got ${s.status})`);
  ok(typeof s.data.score_pct === 'number', `Score: ${s.data.score_pct}%`);
  ok(s.data.attempt_id, 'Has attempt_id');
  ok(s.data.breakdown, 'Has breakdown');
  ok(Array.isArray(s.data.results), `${s.data.results?.length} results`);
  console.log(`  → Score: ${s.data.score_pct}%  MCQ: ${s.data.breakdown?.mcq?.correct}/${s.data.breakdown?.mcq?.total}  Short: ${s.data.breakdown?.short_answer?.correct}/${s.data.breakdown?.short_answer?.total}`);

  // 11. Get History
  console.log('\n11. Get History');
  const hist = await api('GET', `/history?topic_id=${topicId}`);
  ok(hist.status === 200, `Status 200 (got ${hist.status})`);
  ok(hist.data.attempts?.length >= 1, `${hist.data.attempts?.length} attempt(s)`);
  ok(hist.data.stats, 'Has stats');
  console.log(`  → Attempts: ${hist.data.attempts?.length}, Best: ${hist.data.stats?.best_score_pct}%`);

  // 12. News Aggregation
  console.log('\n12. News Aggregation');
  const n = await api('GET', '/news');
  ok(n.status === 200, `Status 200 (got ${n.status})`);
  ok(Array.isArray(n.data.articles), 'Articles is array');
  ok(n.data.total >= 0, `${n.data.total} articles fetched`);
  console.log(`  → Sources: ${n.data.sources?.join(', ')}`);

  // 13. Research Papers
  console.log('\n13. arXiv Papers');
  const p = await api('GET', '/news/papers');
  ok(p.status === 200, `Status 200 (got ${p.status})`);
  ok(Array.isArray(p.data.papers), 'Papers is array');
  console.log(`  → ${p.data.total} papers`);

  // ─── Summary ───
  console.log('\n════════════════════════════════════════');
  console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
  console.log('════════════════════════════════════════\n');

  if (fail > 0) process.exit(1);
}

run().catch(err => {
  console.error('\n❌ TEST CRASHED:', err.message);
  process.exit(1);
});
