'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import ThemeToggle from '@/components/ThemeToggle';

interface Context {
  summary: string;
  key_points: string[];
  flashcards: { front: string; back: string }[];
  resources: { title: string; url: string }[];
}

interface Attempt {
  attempt_id: number;
  score_pct: number;
  total_questions: number;
  is_retake: boolean;
  submitted_at: string;
  mcq_correct: number;
  mcq_total: number;
  short_correct: number;
  short_total: number;
  seed: string;
}

interface Stats {
  best_score_pct: number;
  avg_score_pct: number;
  attempts_count: number;
  last_attempt_at: string | null;
}

const PROGRESS_MESSAGES = [
  '📖 Reading topic material…',
  '🧠 Analyzing key concepts…',
  '📝 Writing summary…',
  '🎯 Identifying key points…',
  '🃏 Creating flashcards…',
  '📚 Finding resources…',
  '⚡ Almost there…',
];

export default function StudyPage() {
  const params = useParams();
  const topicId = Number(params.id);
  const router = useRouter();

  const [context, setContext] = useState<Context | null>(null);
  const [seed, setSeed] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  const [cacheStatus, setCacheStatus] = useState('');
  const [ttl, setTtl] = useState(0);

  // History state
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Progress bar state
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState(PROGRESS_MESSAGES[0]);
  const retryRef = useRef(0);
  const maxRetries = 15;
  const progressTimer = useRef<NodeJS.Timeout | null>(null);

  // Topic completion state
  const [topicStatus, setTopicStatus] = useState<'new' | 'in_progress' | 'completed'>('new');
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [markingComplete, setMarkingComplete] = useState(false);

  const startProgressBar = useCallback(() => {
    setProgress(0);
    let p = 0;
    let msgIdx = 0;
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => {
      p = Math.min(p + (92 - p) * 0.07, 92);
      msgIdx = Math.min(Math.floor(p / 14), PROGRESS_MESSAGES.length - 1);
      setProgress(p);
      setProgressMsg(PROGRESS_MESSAGES[msgIdx]);
    }, 400);
  }, []);

  const stopProgressBar = useCallback((success: boolean) => {
    if (progressTimer.current) clearInterval(progressTimer.current);
    if (success) {
      setProgress(100);
      setProgressMsg('✅ Explanation ready!');
    }
  }, []);

  const generateContext = useCallback(async (randomize = false) => {
    setLoading(true);
    setError('');
    startProgressBar();

    const tryGenerate = async () => {
      try {
        const data = await api.generateContext(topicId, randomize);
        stopProgressBar(true);
        setTimeout(() => {
          setContext(data.context);
          setSeed(data.seed);
          setCacheStatus(data.cache_status);
          setTtl(data.ttl_remaining_s);
          setLoading(false);
        }, 300);
      } catch (err: any) {
        const msg = err.message || '';
        const isRetryable = msg.includes('in progress') || msg.includes('Retry') || msg.includes('429') || msg.includes('generation');

        if (isRetryable && retryRef.current < maxRetries) {
          retryRef.current++;
          setTimeout(() => tryGenerate(), 2000);
        } else {
          stopProgressBar(false);
          setError(msg);
          setLoading(false);
        }
      }
    };

    retryRef.current = 0;
    tryGenerate();
  }, [topicId, startProgressBar, stopProgressBar]);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const data = await api.getTopicHistory(topicId);
      setAttempts(data.attempts || []);
      setStats(data.stats || null);
    } catch {
      // No history yet — that's fine
    }
    setHistoryLoading(false);
  };

  // Mark topic as opened (in_progress) and fetch current status
  const markAsOpened = async () => {
    try {
      await api.markTopicOpened(topicId);
      // Fetch current status
      const progressData = await api.getProgress();
      const topicProgress = progressData.topics[topicId];
      if (topicProgress) {
        setTopicStatus(topicProgress.status as any);
      } else {
        setTopicStatus('in_progress');
      }
    } catch {
      // Non-critical — continue even if tracking fails
    }
  };

  // Mark topic as completed
  const handleMarkComplete = async () => {
    setMarkingComplete(true);
    try {
      await api.markTopicCompleted(topicId);
      setTopicStatus('completed');
    } catch (err: any) {
      console.error('Failed to mark complete:', err);
    }
    setMarkingComplete(false);
  };

  // Mark topic as uncompleted (revert to in_progress)
  const handleUncomplete = async () => {
    setMarkingComplete(true);
    try {
      await api.markTopicUncompleted(topicId);
      setTopicStatus('in_progress');
    } catch (err: any) {
      console.error('Failed to uncomplete:', err);
    }
    setMarkingComplete(false);
  };

  // Navigate away with leave confirmation
  const handleNavigateAway = (path: string) => {
    // Only show popup for non-completed topics that have content loaded
    if (topicStatus !== 'completed' && context && !loading) {
      setPendingNavigation(path);
      setShowLeaveModal(true);
    } else {
      router.push(path);
    }
  };

  // Leave modal: mark complete and navigate
  const handleLeaveAndComplete = async () => {
    setShowLeaveModal(false);
    await handleMarkComplete();
    if (pendingNavigation) router.push(pendingNavigation);
  };

  // Leave modal: skip and navigate
  const handleLeaveWithout = () => {
    setShowLeaveModal(false);
    if (pendingNavigation) router.push(pendingNavigation);
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }
    generateContext();
    fetchHistory();
    markAsOpened();

    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  const toggleFlip = (i: number) => {
    setFlippedCards((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return d; }
  };

  return (
    <div className="container">
      <header className="header">
        <div className="header-logo" style={{ cursor: 'pointer' }} onClick={() => handleNavigateAway('/')}>⚡ StudyQuiz AI</div>
        <nav className="header-nav">
          {!loading && (
            <>
              <span className={`badge ${cacheStatus === 'hit' ? 'badge-success' : 'badge-info'}`}>
                {cacheStatus === 'hit' ? '⚡ Cached' : '🔄 Fresh'}
              </span>
              {ttl > 0 && <span className="badge badge-warning">TTL: {Math.floor(ttl / 60)}m</span>}
              {/* Topic status badge */}
              {topicStatus === 'completed' && (
                <span className="badge badge-success">✅ Completed</span>
              )}
              {topicStatus === 'in_progress' && (
                <span className="badge badge-warning">🔄 In Progress</span>
              )}
            </>
          )}
          <ThemeToggle />
        </nav>
      </header>

      {error && <div className="card" style={{ borderColor: 'var(--accent-danger)', marginBottom: '1rem' }}><p style={{ color: 'var(--accent-danger)' }}>{error}</p></div>}

      {loading ? (
        <div className="card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>📖 Generating Explanation</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>{progressMsg}</p>

          {/* Progress Bar */}
          <div style={{
            width: '100%', maxWidth: 450, margin: '0 auto', height: 8,
            background: 'var(--bg-glass)', borderRadius: 99, overflow: 'hidden',
          }}>
            <div style={{
              width: `${progress}%`, height: '100%',
              background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
              borderRadius: 99,
              transition: 'width 0.4s ease',
            }} />
          </div>

          <p style={{ color: 'var(--text-muted)', marginTop: '1rem', fontSize: '0.8rem' }}>
            {progress < 92 ? 'AI is building a comprehensive explanation for this topic…' : 'Finalizing content…'}
          </p>
        </div>
      ) : context ? (
        <>
          {/* Summary */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ marginBottom: '1rem' }}>📝 Summary</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>{context.summary}</p>
          </div>

          {/* Key Points */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ marginBottom: '1rem' }}>🎯 Key Points</h2>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {context.key_points.map((kp, i) => (
                <li key={i} style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--accent-success)', marginRight: '0.5rem' }}>✓</span>{kp}
                </li>
              ))}
            </ul>
          </div>

          {/* Flashcards */}
          {context.flashcards.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ marginBottom: '1rem' }}>🃏 Flashcards <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>(click to flip)</span></h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                {context.flashcards.map((fc, i) => (
                  <div key={i} className={`flashcard ${flippedCards.has(i) ? 'flipped' : ''}`} onClick={() => toggleFlip(i)}>
                    <div className="flashcard-inner">
                      <div className="flashcard-front"><p style={{ fontSize: '0.95rem' }}>{fc.front}</p></div>
                      <div className="flashcard-back"><p style={{ fontSize: '0.95rem' }}>{fc.back}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resources */}
          {context.resources.length > 0 && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ marginBottom: '1rem' }}>📚 Resources</h2>
              {context.resources.map((r, i) => (
                <div key={i} style={{ padding: '0.4rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {r.title} {r.url && <span style={{ color: 'var(--text-muted)' }}>— {r.url}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="action-bar" style={{ marginBottom: '2rem' }}>
            <button className="btn btn-primary" onClick={() => {
              const freshSeed = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
              router.push(`/quiz/${topicId}?seed=${freshSeed}&randomize=true`);
            }} id="start-quiz-btn">
              🧠 Take Quiz
            </button>

            {/* Mark Complete / Uncomplete Button */}
            {topicStatus === 'completed' ? (
              <button
                className="btn btn-secondary"
                onClick={handleUncomplete}
                disabled={markingComplete}
                id="uncomplete-btn"
                style={{ borderColor: 'var(--accent-success)', color: 'var(--accent-success)' }}
              >
                {markingComplete ? '⏳...' : '✅ Completed — Undo?'}
              </button>
            ) : (
              <button
                className="btn btn-success"
                onClick={handleMarkComplete}
                disabled={markingComplete}
                id="mark-complete-btn"
              >
                {markingComplete ? '⏳ Marking...' : '✅ Mark Complete'}
              </button>
            )}

            <button className="btn btn-secondary" onClick={() => generateContext(true)} id="regenerate-btn">
              🔄 Regenerate (Random)
            </button>
            <button className="btn btn-secondary" onClick={() => handleNavigateAway('/')}>← Back to Topics</button>
          </div>

          {/* ═══ QUIZ HISTORY ═══ */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ marginBottom: '1rem' }}>📊 Quiz History</h2>

            {historyLoading ? (
              <div className="loading-center"><div className="spinner" /></div>
            ) : attempts.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>
                No quiz attempts yet. Take a quiz to see your history here.
              </p>
            ) : (
              <>
                {/* Stats Summary */}
                {stats && stats.attempts_count > 0 && (
                  <div className="stats-row" style={{ marginBottom: '1rem' }}>
                    <div style={{ padding: '0.75rem', background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-success)' }}>
                        {parseFloat(String(stats.best_score_pct)).toFixed(0)}%
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Best Score</div>
                    </div>
                    <div style={{ padding: '0.75rem', background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-secondary)' }}>
                        {parseFloat(String(stats.avg_score_pct)).toFixed(0)}%
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Avg Score</div>
                    </div>
                    <div style={{ padding: '0.75rem', background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-warning)' }}>
                        {stats.attempts_count}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Total Attempts</div>
                    </div>
                  </div>
                )}

                {/* Attempts Table */}
                <div className="table-responsive">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: 450 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>#</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>Score</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>MCQ</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>Short</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((a, i) => (
                      <tr key={a.attempt_id} style={{ borderBottom: '1px solid var(--bg-glass)' }}>
                        <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>{attempts.length - i}</td>
                        <td style={{ padding: '0.5rem' }}>
                          <span style={{ color: parseFloat(String(a.score_pct)) >= 70 ? 'var(--accent-success)' : parseFloat(String(a.score_pct)) >= 40 ? 'var(--accent-warning)' : 'var(--accent-danger)', fontWeight: 600 }}>
                            {parseFloat(String(a.score_pct)).toFixed(0)}%
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{a.mcq_correct}/{a.mcq_total}</td>
                        <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{a.short_correct}/{a.short_total}</td>
                        <td style={{ padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{formatDate(a.submitted_at)}</td>
                        <td style={{ padding: '0.5rem' }}>
                          <span className={`badge ${a.is_retake ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '0.7rem' }}>
                            {a.is_retake ? 'Retake' : 'First'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </>
            )}
          </div>
        </>
      ) : null}

      {/* ═══ LEAVE CONFIRMATION MODAL ═══ */}
      {showLeaveModal && (
        <div className="completion-modal-overlay" onClick={handleLeaveWithout}>
          <div className="completion-modal" onClick={(e) => e.stopPropagation()}>
            <h3>📋 Mark as Complete?</h3>
            <p>
              You&apos;re leaving this topic. Would you like to mark it as completed?
            </p>
            <div className="modal-actions">
              <button className="btn btn-success" onClick={handleLeaveAndComplete} id="modal-complete-btn">
                ✅ Yes, Mark Complete
              </button>
              <button className="btn btn-secondary" onClick={handleLeaveWithout} id="modal-skip-btn">
                Not Yet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
