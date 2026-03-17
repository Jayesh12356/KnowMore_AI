'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import ThemeToggle from '@/components/ThemeToggle';

interface Topic {
  id: number;
  title: string;
  short_description: string;
  category: string;
}

interface ProgressData {
  total_topics: number;
  completed: number;
  in_progress: number;
  new_count: number;
  percentage: number;
  topics: Record<string, { status: string; opened_at: string | null; completed_at: string | null }>;
}

type StatusFilter = 'all' | 'completed' | 'in_progress' | 'new';

export default function HomePage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showUserMenu]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    if (!token) { router.push('/login'); return; }
    if (userData) setUser(JSON.parse(userData));

    Promise.all([
      api.getTopics(),
      api.getProgress(),
    ])
      .then(([topicData, progressData]) => {
        setTopics(topicData.topics);
        setProgress(progressData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [router]);

  const getTopicStatus = (topicId: number): string => {
    if (!progress) return 'new';
    return progress.topics[topicId]?.status || 'new';
  };

  const filtered = topics.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.category || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.short_description || '').toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'all') return true;
    return getTopicStatus(t.id) === statusFilter;
  });

  const categories = [...new Set(filtered.map((t) => t.category || 'Uncategorized'))];

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  const statusCounts = {
    all: topics.length,
    completed: progress?.completed || 0,
    in_progress: progress?.in_progress || 0,
    new: progress?.new_count || topics.length,
  };

  return (
    <div className="container">
      {/* ═══ HEADER ═══ */}
      <header className="header">
        <div className="header-logo">⚡ StudyQuiz AI</div>
        <div className="header-right">
          <ThemeToggle />
          {user && (
            <div className="user-menu-wrapper" ref={userMenuRef}>
              <button
                className="user-avatar-btn"
                onClick={() => setShowUserMenu(prev => !prev)}
                aria-label="User menu"
                aria-expanded={showUserMenu}
              >
                {(user.display_name || user.email || '?')[0].toUpperCase()}
              </button>
              {showUserMenu && (
                <div className="user-dropdown">
                  <div className="user-dropdown-info">
                    <span className="user-dropdown-name">{user.display_name || user.email}</span>
                    <span className="user-dropdown-email">{user.email}</span>
                  </div>
                  <div className="user-dropdown-divider" />
                  <button className="user-dropdown-item" onClick={() => { setShowUserMenu(false); handleLogout(); }}>
                    🚪 Logout
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ═══ ACTION TOOLBAR ═══ */}
      <div className="home-toolbar">
        <div className="toolbar-actions">
          <button className="btn btn-secondary toolbar-btn" onClick={() => router.push('/topics/manage')}>
            ⚙️ Manage Topics
          </button>
          <button className="btn btn-secondary toolbar-btn" onClick={() => router.push('/news')}>
            🗞️ AI News
          </button>
        </div>
      </div>

      {/* ═══ GLOBAL PROGRESS CARD ═══ */}
      {!loading && progress && topics.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
          <div className="progress-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ margin: 0 }}>📊 Your Progress</h2>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
              <span className="progress-pct" style={{
                fontSize: '2rem', fontWeight: 800,
                background: 'var(--gradient-primary)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                lineHeight: 1,
              }}>
                {progress.percentage}%
              </span>
              <span className="progress-pct-label" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>complete</span>
            </div>
          </div>

          <div className="progress-bar" style={{ marginBottom: '0.75rem' }}>
            <div className="progress-fill" style={{ width: `${progress.percentage}%` }} />
          </div>

          <div className="progress-stats">
            <div className="progress-stat-item">
              <span className="progress-stat-dot" style={{ background: 'var(--accent-success)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--accent-success)' }}>{progress.completed}</strong> Completed
              </span>
            </div>
            <div className="progress-stat-item">
              <span className="progress-stat-dot" style={{ background: 'var(--accent-warning)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--accent-warning)' }}>{progress.in_progress}</strong> In Progress
              </span>
            </div>
            <div className="progress-stat-item">
              <span className="progress-stat-dot" style={{ background: 'var(--accent-info)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--accent-info)' }}>{progress.new_count}</strong> New
              </span>
            </div>
            <div className="progress-stat-item">
              <span style={{ color: 'var(--text-muted)' }}>
                {progress.completed}/{progress.total_topics} topics
              </span>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ marginBottom: '0.5rem' }}>Choose a topic to study</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          {topics.length} topics available — AI generates explanations, flashcards & quizzes in real-time
        </p>
      </div>

      <input
        className="input"
        placeholder="Search topics or categories..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: '1rem' }}
        id="topic-search"
      />

      {/* ═══ STATUS FILTERS ═══ */}
      {!loading && topics.length > 0 && (
        <div className="filter-pills">
          <button
            className={`filter-pill${statusFilter === 'all' ? ' active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            📚 All ({statusCounts.all})
          </button>
          <button
            className={`filter-pill${statusFilter === 'completed' ? ' active-completed' : ''}`}
            onClick={() => setStatusFilter('completed')}
          >
            ✅ Completed ({statusCounts.completed})
          </button>
          <button
            className={`filter-pill${statusFilter === 'in_progress' ? ' active-progress' : ''}`}
            onClick={() => setStatusFilter('in_progress')}
          >
            🔄 In Progress ({statusCounts.in_progress})
          </button>
          <button
            className={`filter-pill${statusFilter === 'new' ? ' active-new' : ''}`}
            onClick={() => setStatusFilter('new')}
          >
            ⬜ New ({statusCounts.new})
          </button>
        </div>
      )}

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            {statusFilter !== 'all'
              ? `No ${statusFilter === 'in_progress' ? 'in-progress' : statusFilter} topics found.`
              : 'No topics found. Add some from the Manage page.'}
          </p>
          {statusFilter !== 'all' ? (
            <button className="btn btn-secondary" onClick={() => setStatusFilter('all')}>Show All Topics</button>
          ) : (
            <button className="btn btn-primary" onClick={() => router.push('/topics/manage')}>⚙️ Add Topics</button>
          )}
        </div>
      ) : (
        categories.map((cat) => (
          <div key={cat} style={{ marginBottom: '2rem' }}>
            <h2 style={{ marginBottom: '1rem', color: 'var(--accent-secondary)' }}>{cat}</h2>
            <div className="topic-grid">
              {filtered.filter((t) => (t.category || 'Uncategorized') === cat).map((topic) => {
                const status = getTopicStatus(topic.id);
                const statusClass = status === 'completed' ? 'status-completed'
                  : status === 'in_progress' ? 'status-in-progress' : '';

                return (
                  <div
                    key={topic.id}
                    className={`card topic-card ${statusClass}`}
                    onClick={() => router.push(`/study/${topic.id}`)}
                    id={`topic-${topic.id}`}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div className="category">{topic.category || 'Uncategorized'}</div>
                      {status === 'completed' && (
                        <span className="status-badge" style={{ background: 'var(--accent-success-soft)', color: 'var(--accent-success)' }}>
                          ✅ Done
                        </span>
                      )}
                      {status === 'in_progress' && (
                        <span className="status-badge" style={{ background: 'var(--accent-warning-soft)', color: 'var(--accent-warning)' }}>
                          🔄 Studying
                        </span>
                      )}
                    </div>
                    <h3>{topic.title}</h3>
                    <p>{topic.short_description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
