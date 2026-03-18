'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

type StatusFilter = 'all' | 'active' | 'banned';
type SortField = 'created_at' | 'activity' | 'score' | 'attempts' | 'email';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortField>('created_at');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const router = useRouter();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getUsers({ search, status: statusFilter, sort, order, page, limit: 20 });
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (err: any) {
      if (err.message.includes('401')) router.push('/admin/login');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, sort, order, page, router]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleSort = (field: SortField) => {
    if (sort === field) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(field);
      setOrder('desc');
    }
    setPage(1);
  };

  const sortIndicator = (field: SortField) => {
    if (sort !== field) return '';
    return order === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div className="admin-content">
      <div className="admin-page-header">
        <h1>👥 Users</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          {pagination ? `${pagination.total} total users` : 'Loading...'}
        </p>
      </div>

      {/* Filters */}
      <div className="admin-filters">
        <input
          className="input"
          placeholder="Search by name or email..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ flex: 1, minWidth: '200px' }}
          id="admin-user-search"
        />
        <div className="admin-filter-pills">
          {(['all', 'active', 'banned'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              className={`admin-filter-pill ${statusFilter === s ? 'active' : ''}`}
              onClick={() => { setStatusFilter(s); setPage(1); }}
            >
              {s === 'all' ? '📋 All' : s === 'active' ? '🟢 Active' : '🚫 Banned'}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : users.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>No users found</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th className="sortable col-hide-mobile" onClick={() => handleSort('created_at')}>
                    Joined{sortIndicator('created_at')}
                  </th>
                  <th className="sortable col-hide-mobile" onClick={() => handleSort('activity')}>
                    Last Active{sortIndicator('activity')}
                  </th>
                  <th className="sortable" onClick={() => handleSort('attempts')}>
                    Quizzes{sortIndicator('attempts')}
                  </th>
                  <th className="sortable col-hide-mobile" onClick={() => handleSort('score')}>
                    Avg Score{sortIndicator('score')}
                  </th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="admin-table-row clickable" onClick={() => router.push(`/admin/users/${u.id}`)}>
                    <td>
                      <div className="admin-user-cell">
                        <div className="admin-activity-avatar">{(u.display_name || u.email || '?')[0].toUpperCase()}</div>
                        <div>
                          <div className="admin-user-cell-name">{u.display_name || '—'}</div>
                          <div className="admin-user-cell-email">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="col-hide-mobile">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="col-hide-mobile">{u.last_active ? timeAgo(u.last_active) : 'Never'}</td>
                    <td>{u.total_attempts}</td>
                    <td className="col-hide-mobile">{u.avg_score > 0 ? `${u.avg_score}%` : '—'}</td>
                    <td>
                      <span className={`badge ${u.status === 'banned' ? 'badge-danger' : 'badge-success'}`}>
                        {u.status === 'banned' ? '🚫 Banned' : '🟢 Active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
