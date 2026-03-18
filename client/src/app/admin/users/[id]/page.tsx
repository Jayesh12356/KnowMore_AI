'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { adminApi } from '@/lib/api';

export default function AdminUserDetailPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;

  useEffect(() => {
    adminApi.getUser(userId)
      .then(setData)
      .catch((err) => {
        if (err.message.includes('401')) router.push('/admin/login');
        if (err.message.includes('404')) router.push('/admin/users');
      })
      .finally(() => setLoading(false));
  }, [userId, router]);

  const handleAction = async (action: string) => {
    setActionLoading(action);
    setMessage('');
    try {
      let result;
      switch (action) {
        case 'ban':
          result = await adminApi.banUser(userId);
          break;
        case 'unban':
          result = await adminApi.unbanUser(userId);
          break;
        case 'revoke':
          result = await adminApi.revokeSessions(userId);
          break;
        case 'delete':
          result = await adminApi.deleteUser(userId);
          setMessage(result.message);
          setTimeout(() => router.push('/admin/users'), 1500);
          return;
      }
      setMessage(result?.message || 'Action completed');
      // Refresh data
      const updated = await adminApi.getUser(userId);
      setData(updated);
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setActionLoading('');
      setShowDeleteConfirm(false);
    }
  };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;
  if (!data) return <div className="admin-empty">User not found</div>;

  const { user, stats, topics, recent_activity } = data;

  return (
    <div className="admin-content">
      {/* Back button */}
      <button className="btn btn-secondary" onClick={() => router.push('/admin/users')} style={{ marginBottom: '1.5rem' }}>
        ← Back to Users
      </button>

      {/* User header */}
      <div className="card admin-user-profile">
        <div className="admin-user-profile-header">
          <div className="admin-user-profile-avatar">{(user.display_name || user.email || '?')[0].toUpperCase()}</div>
          <div className="admin-user-profile-info">
            <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{user.display_name || 'No Name'}</h1>
            <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0' }}>{user.email}</p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className={`badge ${user.status === 'banned' ? 'badge-danger' : 'badge-success'}`}>
                {user.status === 'banned' ? '🚫 Banned' : '🟢 Active'}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                Joined {new Date(user.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="admin-user-actions">
          {user.status === 'banned' ? (
            <button
              className="btn btn-success"
              onClick={() => handleAction('unban')}
              disabled={!!actionLoading}
            >
              {actionLoading === 'unban' ? 'Processing...' : '✅ Unban User'}
            </button>
          ) : (
            <button
              className="btn admin-btn-danger"
              onClick={() => handleAction('ban')}
              disabled={!!actionLoading}
            >
              {actionLoading === 'ban' ? 'Processing...' : '🚫 Ban User'}
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={() => handleAction('revoke')}
            disabled={!!actionLoading}
          >
            {actionLoading === 'revoke' ? 'Processing...' : '🔑 Revoke Sessions'}
          </button>
          <button
            className="btn admin-btn-danger-outline"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={!!actionLoading}
          >
            🗑️ Delete User
          </button>
        </div>

        {/* LLM Access Control */}
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>🤖 LLM Access Control</h3>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {[
              { name: 'grok', label: 'Grok (xAI)', icon: '⚡' },
              { name: 'openai', label: 'OpenAI GPT', icon: '🤖' },
              { name: 'gemini', label: 'Google Gemini', icon: '✨' },
            ].map((prov) => {
              const currentAllowed = (user.allowed_providers || 'grok').split(',').map((s: string) => s.trim());
              const isEnabled = currentAllowed.includes(prov.name);
              return (
                <button
                  key={prov.name}
                  onClick={async () => {
                    const newList = isEnabled
                      ? currentAllowed.filter((p: string) => p !== prov.name)
                      : [...currentAllowed, prov.name];
                    if (newList.length === 0) {
                      setMessage('⚠️ At least one provider must remain enabled.');
                      return;
                    }
                    setActionLoading(`provider-${prov.name}`);
                    try {
                      await adminApi.updateUserProviders(userId, newList);
                      const updated = await adminApi.getUser(userId);
                      setData(updated);
                      setMessage(`✅ ${prov.label} ${isEnabled ? 'disabled' : 'enabled'} for this user`);
                    } catch (err: any) {
                      setMessage(`❌ ${err.message}`);
                    } finally {
                      setActionLoading('');
                    }
                  }}
                  disabled={!!actionLoading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.6rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${isEnabled ? 'var(--accent-success)' : 'var(--border)'}`,
                    background: isEnabled ? 'rgba(16,185,129,0.08)' : 'var(--bg-glass)',
                    color: isEnabled ? 'var(--accent-success)' : 'var(--text-muted)',
                    cursor: actionLoading ? 'wait' : 'pointer',
                    fontSize: '0.85rem', fontWeight: 600,
                    transition: 'all 0.2s ease',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.7rem',
                    background: isEnabled ? 'var(--accent-success)' : 'var(--border)',
                    color: '#fff',
                  }}>
                    {actionLoading === `provider-${prov.name}` ? '⏳' : isEnabled ? '✓' : '✕'}
                  </span>
                  {prov.icon} {prov.label}
                  {isEnabled ? '' : ' 🔒'}
                </button>
              );
            })}
          </div>
        </div>

        {message && (
          <div className="admin-action-message">{message}</div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="admin-modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: '0.75rem' }}>⚠️ Confirm Delete</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              This will <strong>permanently delete</strong> user <strong>{user.email}</strong> and all their quiz data.
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button
                className="btn admin-btn-danger"
                onClick={() => handleAction('delete')}
                disabled={!!actionLoading}
              >
                {actionLoading === 'delete' ? 'Deleting...' : '🗑️ Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="admin-stats-grid" style={{ marginTop: '1.5rem' }}>
        <div className="admin-stat-card">
          <div className="admin-stat-icon">📁</div>
          <div className="admin-stat-value">{stats.topics_added}</div>
          <div className="admin-stat-label">Topics Added</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon">📚</div>
          <div className="admin-stat-value">{stats.topics_studied}</div>
          <div className="admin-stat-label">Topics Studied</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon">📝</div>
          <div className="admin-stat-value">{stats.total_attempts}</div>
          <div className="admin-stat-label">Total Quizzes</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon">📊</div>
          <div className="admin-stat-value">{stats.overall_avg}%</div>
          <div className="admin-stat-label">Average Score</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon">🕐</div>
          <div className="admin-stat-value">{stats.last_active ? timeAgo(stats.last_active) : 'Never'}</div>
          <div className="admin-stat-label">Last Active</div>
        </div>
      </div>

      {/* Two column layout */}
      <div className="admin-two-col" style={{ marginTop: '1.5rem' }}>
        {/* Topics Studied */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>📚 Topics Studied</h2>
          {topics.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No topics studied yet</p>
          ) : (
            <div className="admin-list">
              {topics.map((t: any) => (
                <div key={t.topic_id} className="admin-list-item">
                  <div className="admin-list-content">
                    <div className="admin-list-title">{t.title}</div>
                    <div className="admin-list-meta">{t.category || 'Uncategorized'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="badge badge-info">{t.attempts_count} attempts</span>
                    <span className="badge badge-success">Best: {t.best_score_pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>⚡ Recent Activity</h2>
          {recent_activity.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No activity recorded</p>
          ) : (
            <div className="admin-list">
              {recent_activity.map((a: any, i: number) => (
                <div key={i} className="admin-list-item">
                  <div className="admin-list-content">
                    <div className="admin-list-title">{a.topic_title}</div>
                    <div className="admin-list-meta">
                      {a.action_type === 'quiz_attempt' ? `Quiz — ${a.score_pct}%` :
                       a.action_type === 'topic_completed' ? 'Completed topic' :
                       a.action_type === 'topic_in_progress' ? 'Started studying' : a.action_type}
                    </div>
                  </div>
                  <div className="admin-list-time">{a.action_time ? timeAgo(a.action_time) : '—'}</div>
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
