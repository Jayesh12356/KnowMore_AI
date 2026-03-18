'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    adminApi.getDashboard()
      .then(setData)
      .catch((err) => {
        if (err.message.includes('401') || err.message.includes('403')) {
          router.push('/admin/login');
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;
  if (!data) return <div className="admin-empty">Failed to load dashboard</div>;

  const { stats, popular_topics, recent_activity } = data;

  return (
    <div className="admin-content">
      <div className="admin-page-header">
        <h1>📊 Dashboard</h1>
        <p style={{ color: 'var(--text-secondary)' }}>System overview at a glance</p>
      </div>

      {/* Stat Cards */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-icon">👥</div>
          <div className="admin-stat-value">{stats.total_users}</div>
          <div className="admin-stat-label">Total Users</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon">🟢</div>
          <div className="admin-stat-value">{stats.active_today}</div>
          <div className="admin-stat-label">Active Today</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon">📝</div>
          <div className="admin-stat-value">{stats.quizzes_today}</div>
          <div className="admin-stat-label">Quizzes Today</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon">📊</div>
          <div className="admin-stat-value">{stats.quizzes_total}</div>
          <div className="admin-stat-label">Total Quizzes</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon">🚫</div>
          <div className="admin-stat-value">{stats.banned_users}</div>
          <div className="admin-stat-label">Banned Users</div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="admin-two-col">
        {/* Popular Topics */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>🔥 Popular Topics</h2>
          {popular_topics.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No quiz data yet</p>
          ) : (
            <div className="admin-list">
              {popular_topics.map((t: any, i: number) => (
                <div key={t.id} className="admin-list-item">
                  <div className="admin-list-rank">#{i + 1}</div>
                  <div className="admin-list-content">
                    <div className="admin-list-title">{t.title}</div>
                    <div className="admin-list-meta">{t.category || 'Uncategorized'}</div>
                  </div>
                  <div className="badge badge-info">{t.attempt_count} attempts</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>⚡ Recent Activity</h2>
          {recent_activity.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No activity yet</p>
          ) : (
            <div className="admin-list">
              {recent_activity.map((a: any) => (
                <div key={a.id} className="admin-list-item clickable" onClick={() => router.push(`/admin/users/${a.user_id}`)}>
                  <div className="admin-activity-avatar">{(a.display_name || a.email || '?')[0].toUpperCase()}</div>
                  <div className="admin-list-content">
                    <div className="admin-list-title">{a.display_name || a.email}</div>
                    <div className="admin-list-meta">
                      {a.topic_title} — <strong>{a.score_pct}%</strong>
                    </div>
                  </div>
                  <div className="admin-list-time">{timeAgo(a.started_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
