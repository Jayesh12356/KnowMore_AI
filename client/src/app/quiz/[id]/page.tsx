'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import ThemeToggle from '@/components/ThemeToggle';

interface Option { id: string; text: string; }
interface Question { id: string; type: 'mcq' | 'short_answer'; text: string; options: Option[] | null; max_words: number | null; }
interface Result { question_id: string; correct?: boolean; your_answer?: string; correct_answer?: string; score?: number; feedback?: string; correct_answer_summary?: string; }

const PROGRESS_MESSAGES = [
  '🧠 Analyzing study material…',
  '📝 Crafting questions…',
  '🎯 Building multiple-choice options…',
  '✍️ Generating short-answer questions…',
  '🔍 Validating answers…',
  '⚡ Almost there…',
];

export default function QuizPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const topicId = Number(params.id);
  const seed = searchParams.get('seed') || '';
  const randomize = searchParams.get('randomize') === 'true';
  const router = useRouter();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [scorePct, setScorePct] = useState(0);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [error, setError] = useState('');

  // Progress bar state
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState(PROGRESS_MESSAGES[0]);
  const retryRef = useRef(0);
  const maxRetries = 15;
  const progressTimer = useRef<NodeJS.Timeout | null>(null);

  const startProgressBar = useCallback(() => {
    setProgress(0);
    let p = 0;
    let msgIdx = 0;
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => {
      p = Math.min(p + (90 - p) * 0.08, 92); // eases towards 92%
      msgIdx = Math.min(Math.floor(p / 16), PROGRESS_MESSAGES.length - 1);
      setProgress(p);
      setProgressMsg(PROGRESS_MESSAGES[msgIdx]);
    }, 400);
  }, []);

  const stopProgressBar = useCallback((success: boolean) => {
    if (progressTimer.current) clearInterval(progressTimer.current);
    if (success) {
      setProgress(100);
      setProgressMsg('✅ Quiz ready!');
    }
  }, []);

  const fetchQuiz = useCallback(async () => {
    try {
      const data = await api.generateQuiz(topicId, seed, randomize);
      stopProgressBar(true);
      setTimeout(() => {
        setQuestions(data.quiz.questions);
        setLoading(false);
      }, 300);
    } catch (err: any) {
      const msg = err.message || '';
      const isRetryable = msg.includes('in progress') || msg.includes('Retry') || msg.includes('429') || msg.includes('generation');

      if (isRetryable && retryRef.current < maxRetries) {
        retryRef.current++;
        setTimeout(() => fetchQuiz(), 2000); // retry every 2s
      } else if (msg.includes('Context not found') || msg.includes('expired')) {
        // Context expired or not generated for this seed — generate fresh context, then retry
        try {
          await api.generateContext(topicId, true);
          retryRef.current = 0;
          fetchQuiz();
        } catch {
          stopProgressBar(false);
          setError('Failed to generate context. Please go back and try again.');
          setLoading(false);
        }
      } else {
        stopProgressBar(false);
        setError(msg);
        setLoading(false);
      }
    }
  }, [topicId, seed, randomize, stopProgressBar]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }
    if (!seed) { router.push(`/study/${topicId}`); return; }

    startProgressBar();
    fetchQuiz();

    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId, seed, router]);

  const handleMCQ = (qId: string, optionId: string) => {
    if (results) return;
    setAnswers((prev) => ({ ...prev, [qId]: optionId }));
  };

  const handleShort = (qId: string, text: string) => {
    if (results) return;
    setAnswers((prev) => ({ ...prev, [qId]: text }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const answerList = questions.map((q) => ({
        question_id: q.id,
        ...(q.type === 'mcq' ? { selected: answers[q.id] } : { text: answers[q.id] || '' }),
      }));
      const data = await api.submitQuiz(topicId, seed, answerList);
      setResults(data.results);
      setScorePct(data.score_pct);
      setBreakdown(data.breakdown);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const getResultForQ = (qId: string) => results?.find((r) => r.question_id === qId);

  return (
    <div className="container">
      <header className="header">
        <div className="header-logo" style={{ cursor: 'pointer' }} onClick={() => router.push('/')}>⚡ StudyQuiz AI</div>
        <nav className="header-nav">
          <span className="badge badge-info">Seed: {seed.slice(0, 8)}…</span>
          <ThemeToggle />
        </nav>
      </header>

      {error && <div className="card" style={{ borderColor: 'var(--accent-danger)', marginBottom: '1rem' }}><p style={{ color: 'var(--accent-danger)' }}>{error}</p></div>}

      {/* Score Display */}
      {results && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div className="score-display">
            <div className="score-number">{scorePct}%</div>
            <div className="score-label">Your Score</div>
            {breakdown && (
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem' }}>
                <span className="badge badge-success">MCQ: {breakdown.mcq.correct}/{breakdown.mcq.total}</span>
                <span className="badge badge-info">Short: {breakdown.short_answer.correct}/{breakdown.short_answer.total}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>🧠 Constructing Your Quiz</h2>
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
            {progress < 92 ? 'AI is generating questions from your study material…' : 'Finalizing quiz…'}
          </p>
        </div>
      ) : (
        <>
          {questions.map((q, idx) => {
            const result = getResultForQ(q.id);
            return (
              <div key={q.id} className="card question-card" id={`question-${q.id}`}>
                <div className="q-number">Question {idx + 1} — {q.type === 'mcq' ? 'Multiple Choice' : 'Short Answer'}</div>
                <div className="q-text">{q.text}</div>

                {q.type === 'mcq' && q.options ? (
                  <div className="option-list">
                    {q.options.map((opt) => {
                      let cls = 'option-item';
                      if (answers[q.id] === opt.id) cls += ' selected';
                      if (result) {
                        if (opt.id === result.correct_answer) cls += ' correct';
                        else if (opt.id === answers[q.id] && !result.correct) cls += ' incorrect';
                      }
                      return (
                        <div key={opt.id} className={cls} onClick={() => handleMCQ(q.id, opt.id)}>
                          <div className="option-id">{opt.id.toUpperCase()}</div>
                          <div>{opt.text}</div>
                        </div>
                      );
                    })}
                    {result && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: result.correct ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                        {result.correct ? '✅ Correct!' : `❌ Incorrect — correct answer: ${result.correct_answer?.toUpperCase()}`}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <textarea
                      className="input"
                      placeholder={`Your answer (max ${q.max_words || 50} words)...`}
                      value={answers[q.id] || ''}
                      onChange={(e) => handleShort(q.id, e.target.value)}
                      disabled={!!results}
                    />
                    {result && (
                      <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                        <div style={{ color: result.score !== undefined && result.score >= 0.7 ? 'var(--accent-success)' : 'var(--accent-warning)' }}>
                          Score: {((result.score || 0) * 100).toFixed(0)}%
                        </div>
                        {result.feedback && <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{result.feedback}</div>}
                        {result.correct_answer_summary && <div style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>Ideal: {result.correct_answer_summary}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Actions */}
          <div className="quiz-actions">
            {!results ? (
              <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting} id="submit-quiz-btn">
                {submitting ? '⏳ Grading...' : '📝 Submit Quiz'}
              </button>
            ) : (
              <>
                <button className="btn btn-primary" onClick={() => {
                  const freshSeed = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
                  router.push(`/quiz/${topicId}?seed=${freshSeed}&randomize=true`);
                }} id="retake-btn">🔄 Retake</button>
                <button className="btn btn-success" onClick={() => router.push(`/study/${topicId}`)}>📖 Back to Study</button>
              </>
            )}
            <button className="btn btn-secondary" onClick={() => router.push(`/study/${topicId}`)}>← Study Material</button>
          </div>
        </>
      )}
    </div>
  );
}
