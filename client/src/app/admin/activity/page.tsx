'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

export default function AdminActivityPage() {
  const [activity, setActivity] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const router = useRouter();

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getActivity(page, 30);
      setActivity(data.activity);
      setPagination(data.pagination);
    } catch (err: any) {
      if (err.message.includes('401')) router.push('/admin/login');
    } finally {
      setLoading(false);
    }
  }, [page, router]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  return (
    <div className="admin-content">
      <div className="admin-page-header">
        <h1>⚡ Activity Feed</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          {pagination ? `${pagination.total} total actions recorded` : 'Loading...'}
        </p>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : activity.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>No activity recorded yet</p>
        </div>
      ) : (
        <div className="admin-activity-feed">
          {activity.map((a) => (
            <div
              key={a.id}
              className="card admin-activity-card clickable"
              onClick={() => router.push(`/admin/users/${a.user_id}`)}
            >
              <div className="admin-activity-card-content">
                <div className="admin-activity-avatar">{(a.display_name || a.email || '?')[0].toUpperCase()}</div>
                <div className="admin-activity-info">
                  <div className="admin-activity-main">
                    <strong>{a.display_name || a.email}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>attempted quiz on</span>
                    <strong style={{ color: 'var(--accent-primary)' }}>{a.topic_title}</strong>
                  </div>
                  <div className="admin-activity-meta">
                    <span className={`badge ${a.score_pct >= 70 ? 'badge-success' : a.score_pct >= 40 ? 'badge-warning' : 'badge-danger'}`}>
                      {a.score_pct}%
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      {a.total_questions} questions
                    </span>
                    {a.is_retake && <span className="badge badge-warning">Retake</span>}
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      {a.category || ''}
                    </span>
                  </div>
                </div>
                <div className="admin-activity-time">{timeAgo(a.started_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="admin-pagination">
          <button
            className="btn btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            ← Previous
          </button>
          <span className="admin-pagination-info">
            Page {pagination.page} of {pagination.total_pages}
          </span>
          <button
            className="btn btn-secondary"
            disabled={page >= pagination.total_pages}
            onClick={() => setPage(page + 1)}
          >
            Next →
          </button>
        </div>
      )}
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
