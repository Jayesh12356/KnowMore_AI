'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

export default function AdminTopicInsightsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'most' | 'least' | 'failure'>('most');
  const router = useRouter();

  useEffect(() => {
    adminApi.getTopicInsights()
      .then(setData)
      .catch((err) => {
        if (err.message.includes('401')) router.push('/admin/login');
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;
  if (!data) return <div className="admin-empty">Failed to load topic insights</div>;

  const tabs = [
    { key: 'most', label: '🔥 Most Studied', data: data.most_studied },
    { key: 'least', label: '❄️ Least Studied', data: data.least_studied },
    { key: 'failure', label: '⚠️ Highest Failure', data: data.highest_failure },
  ] as const;

  const currentTab = tabs.find(t => t.key === activeTab)!;

  return (
    <div className="admin-content">
      <div className="admin-page-header">
        <h1>📚 Topic Insights</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          {data.total_topics} total topics in the system
        </p>
      </div>

      {/* Tab pills */}
      <div className="admin-filter-pills" style={{ marginBottom: '1.5rem' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`admin-filter-pill ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Topic table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {currentTab.data.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            {activeTab === 'failure' ? 'Not enough data (minimum 3 attempts per topic required)' : 'No data available'}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Topic</th>
                  <th className="col-hide-mobile">Category</th>
                  <th>Attempts</th>
                  <th>Users</th>
                  {activeTab !== 'least' && <th>Avg Score</th>}
                </tr>
              </thead>
              <tbody>
                {currentTab.data.map((t: any, i: number) => (
                  <tr key={t.id} className="admin-table-row">
                    <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{i + 1}</td>
                    <td>
                      <div className="admin-list-title">{t.title}</div>
                    </td>
                    <td className="col-hide-mobile">
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t.category || '—'}</span>
                    </td>
                    <td>
                      <span className="badge badge-info">{t.attempt_count}</span>
                    </td>
                    <td>{t.unique_users}</td>
                    {activeTab !== 'least' && (
                      <td>
                        <span className={`badge ${Number(t.avg_score) >= 70 ? 'badge-success' : Number(t.avg_score) >= 40 ? 'badge-warning' : 'badge-danger'}`}>
                          {t.avg_score}%
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
