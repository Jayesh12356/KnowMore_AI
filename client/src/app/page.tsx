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
  const [providers, setProviders] = useState<any[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>('');
  const [fetchError, setFetchError] = useState<string | null>(null);
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

  const loadData = useCallback(() => {
    setLoading(true);
    setFetchError(null);

    Promise.all([
      api.getTopics(),
      api.getProgress(),
      api.getProviders().catch(() => ({ providers: [], default: 'grok' })),
    ])
      .then(([topicData, progressData, providerData]) => {
        setTopics(topicData.topics);
        setProgress(progressData);
        setProviders(providerData.providers);
        const saved = localStorage.getItem('llm_provider');
        const allowedProviders = providerData.providers.filter((p: any) => p.allowed);
        const savedIsAllowed = saved && allowedProviders.some((p: any) => p.name === saved);
        const chosen = savedIsAllowed ? saved : (allowedProviders[0]?.name || providerData.default);
        setActiveProvider(chosen);
        localStorage.setItem('llm_provider', chosen);
      })
      .catch((err) => {
        console.error(err);
        setFetchError(err.message?.includes('abort') || err.name === 'AbortError'
          ? 'Server is waking up — this may take up to 30 seconds on free hosting.'
          : 'Could not connect to server. It may be starting up.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    if (!token) { router.push('/login'); return; }
    if (userData) setUser(JSON.parse(userData));
    loadData();
  }, [router, loadData]);

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
    localStorage.removeItem('llm_provider');
    router.push('/login');
  };

  const handleProviderChange = (name: string) => {
    // Only allow switching to permitted providers
    const provider = providers.find((p: any) => p.name === name);
    if (!provider?.allowed) return;
    setActiveProvider(name);
    localStorage.setItem('llm_provider', name);
  };

  // Compute counts from the ACTUAL topics list + progress map — guaranteed to add up
  const statusCounts = {
    all: topics.length,
    completed: topics.filter(t => getTopicStatus(t.id) === 'completed').length,
    in_progress: topics.filter(t => getTopicStatus(t.id) === 'in_progress').length,
    new: topics.filter(t => getTopicStatus(t.id) === 'new').length,
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

        {/* Provider Selector */}
        {providers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.25rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>AI Engine:</span>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {providers.map((p: any) => (
                <button
                  key={p.name}
                  onClick={() => handleProviderChange(p.name)}
                  className={`btn ${activeProvider === p.name ? 'btn-primary' : 'btn-secondary'}`}
                  disabled={!p.allowed}
                  title={p.allowed ? p.label : `🔒 ${p.label} — Contact admin to enable`}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.78rem',
                    borderRadius: 'var(--radius-sm)',
                    ...(activeProvider === p.name ? {} : { opacity: p.allowed ? 0.7 : 0.35 }),
                    ...(!p.allowed ? { cursor: 'not-allowed', filter: 'grayscale(0.8)' } : {}),
                  }}
                  id={`provider-${p.name}`}
                >
                  {p.allowed ? p.icon : '🔒'} {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══ GLOBAL PROGRESS CARD ═══ */}
      {!loading && progress && topics.length > 0 && (() => {
        const pct = statusCounts.all > 0 ? parseFloat(((statusCounts.completed / statusCounts.all) * 100).toFixed(1)) : 0;
        return (
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
                  {pct}%
                </span>
                <span className="progress-pct-label" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>complete</span>
              </div>
            </div>

            <div className="progress-bar" style={{ marginBottom: '0.75rem' }}>
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>

            <div className="progress-stats">
              <div className="progress-stat-item">
                <span className="progress-stat-dot" style={{ background: 'var(--accent-success)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--accent-success)' }}>{statusCounts.completed}</strong> Completed
                </span>
              </div>
              <div className="progress-stat-item">
                <span className="progress-stat-dot" style={{ background: 'var(--accent-warning)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--accent-warning)' }}>{statusCounts.in_progress}</strong> In Progress
                </span>
              </div>
              <div className="progress-stat-item">
                <span className="progress-stat-dot" style={{ background: 'var(--accent-info)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--accent-info)' }}>{statusCounts.new}</strong> New
                </span>
              </div>
              <div className="progress-stat-item">
                <span style={{ color: 'var(--text-muted)' }}>
                  {statusCounts.completed}/{statusCounts.all} topics
                </span>
              </div>
            </div>
          </div>
        );
      })()}

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
        <div className="loading-center">
          <div className="spinner" />
          {fetchError === null && <p style={{ color: 'var(--text-muted)', marginTop: '1rem', fontSize: '0.85rem' }}>Connecting to server...</p>}
        </div>
      ) : fetchError ? (
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚠️</p>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>Connection Issue</p>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>{fetchError}</p>
          <button className="btn btn-primary" onClick={loadData}>🔄 Retry</button>
        </div>
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
                          Done
                        </span>
                      )}
                      {status === 'in_progress' && (
                        <span className="status-badge" style={{ background: 'var(--accent-warning-soft)', color: 'var(--accent-warning)' }}>
                          Studying
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
