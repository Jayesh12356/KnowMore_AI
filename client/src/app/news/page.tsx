'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';

interface Article {
  title: string;
  description: string;
  url: string;
  source: string;
  published_at: string;
  cover_image: string | null;
  tags: string[];
  score?: number;
}

const SOURCE_COLORS: Record<string, string> = {
  'Dev.to': 'badge-success',
  'Hacker News': 'badge-warning',
  'arXiv': 'badge-info',
  'Reddit': 'badge-danger',
  'Hugging Face': 'badge-warning',
  'MIT Tech Review': 'badge-info',
  'TechCrunch': 'badge-success',
  'OpenAI': 'badge-info',
  'Google AI': 'badge-success',
  'VentureBeat': 'badge-warning',
};

export default function NewsPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }

    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'}/news`)
      .then(r => r.json())
      .then(data => setArticles(data.articles || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  const sources = ['all', ...new Set(articles.map(a => a.source))];
  const filtered = filter === 'all' ? articles : articles.filter(a => a.source === filter);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return dateStr; }
  };

  const getBadgeClass = (source: string) => SOURCE_COLORS[source] || 'badge-info';

  return (
    <div className="container">
      <header className="header">
        <div className="header-logo" style={{ cursor: 'pointer' }} onClick={() => router.push('/')}>⚡ StudyQuiz AI</div>
        <nav className="header-nav">
          <button className="btn btn-secondary" onClick={() => router.push('/')}>📚 Topics</button>
          <ThemeToggle />
        </nav>
      </header>

      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ marginBottom: '0.5rem' }}>🗞️ AI News & Research</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          {articles.length} articles from {sources.length - 1} sources — refreshed every 15 minutes
        </p>
      </div>

      {error && <div className="card" style={{ borderColor: 'var(--accent-danger)', marginBottom: '1rem' }}><p style={{ color: 'var(--accent-danger)' }}>{error}</p></div>}

      {/* Source Filter Tabs */}
      <div className="filter-pills" style={{ marginBottom: '1.5rem' }}>
        {sources.map(s => (
          <button
            key={s}
            className={`btn ${filter === s ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(s)}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
          >
            {s === 'all' ? `All (${articles.length})` : `${s} (${articles.filter(a => a.source === s).length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="card"><p style={{ color: 'var(--text-muted)' }}>No articles found.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map((article, i) => (
            <a
              key={i}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="card news-card"
              id={`news-${i}`}
              style={{ textDecoration: 'none', cursor: 'pointer' }}
            >
              <div className="news-card-meta">
                <span className={`badge ${getBadgeClass(article.source)}`}
                  style={{ fontSize: '0.68rem', padding: '0.12rem 0.4rem' }}>
                  {article.source}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDate(article.published_at)}</span>
                {article.score && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>⬆ {article.score}</span>}
              </div>
              <h3 className="news-card-title">{article.title}</h3>
              {article.description && (
                <p className="news-card-desc">
                  {article.description.length > 180 ? article.description.slice(0, 180) + '…' : article.description}
                </p>
              )}
              {article.tags.length > 0 && (
                <div className="news-card-tags">
                  {article.tags.slice(0, 4).map(tag => (
                    <span key={tag} className="news-tag">#{tag}</span>
                  ))}
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
