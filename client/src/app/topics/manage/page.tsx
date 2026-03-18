'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';

interface Topic {
  id: number;
  title: string;
  short_description: string;
  category: string | null;
  created_at?: string;
  is_duplicate?: boolean;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

function getHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function ManageTopicsPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // List state
  const [topics, setTopics] = useState<Topic[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  // Add topics — queue system
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCat, setNewCat] = useState('');
  const [addMsg, setAddMsg] = useState('');
  const [topicQueue, setTopicQueue] = useState<{ title: string; description: string; category: string }[]>([]);
  const [addingAll, setAddingAll] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Upload
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Topic[] | null>(null);
  const [uploadMsg, setUploadMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const LIMIT = 50;

  // Fetch topics
  const fetchTopics = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(page * LIMIT) });
      if (search) params.set('search', search);
      if (catFilter) params.set('category', catFilter);
      const r = await fetch(`${API}/topics?${params}`, { headers: getHeaders() });
      const data = await r.json();
      setTopics(data.topics || []);
      setTotal(data.total || 0);
      setCategories(data.categories || []);
    } catch (err: any) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }
    fetchTopics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, catFilter]);

  // Add topic to queue
  const handleAddToQueue = () => {
    if (!newTitle.trim()) return;
    // Prevent duplicate titles in queue
    if (topicQueue.some(t => t.title.toLowerCase() === newTitle.trim().toLowerCase())) {
      setAddMsg('⚠️ This topic is already in the queue.');
      return;
    }
    setTopicQueue(prev => [...prev, {
      title: newTitle.trim(),
      description: newDesc.trim(),
      category: newCat.trim(),
    }]);
    setNewTitle('');
    setNewDesc('');
    setAddMsg('');
    // Keep category for convenience (often same category for batch)
    titleInputRef.current?.focus();
  };

  // Remove topic from queue
  const handleRemoveFromQueue = (index: number) => {
    setTopicQueue(prev => prev.filter((_, i) => i !== index));
  };

  // Submit all queued topics (bulk)
  const handleAddAll = async () => {
    const toAdd = topicQueue.length > 0 ? topicQueue : (newTitle.trim() ? [{
      title: newTitle.trim(),
      description: newDesc.trim(),
      category: newCat.trim(),
    }] : []);

    if (toAdd.length === 0) return;
    setAddingAll(true);
    setAddMsg('');
    try {
      const r = await fetch(`${API}/topics/bulk`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          topics: toAdd.map(t => ({
            title: t.title,
            short_description: t.description || undefined,
            category: t.category || undefined,
          })),
        }),
      });
      const data = await r.json();
      if (!r.ok) { setAddMsg(`❌ ${data.error}`); setAddingAll(false); return; }
      setAddMsg(`✅ Added ${data.inserted} topic${data.inserted !== 1 ? 's' : ''}${data.duplicates > 0 ? ` (${data.duplicates} duplicate${data.duplicates !== 1 ? 's' : ''} skipped)` : ''}`);
      setTopicQueue([]);
      setNewTitle(''); setNewDesc(''); setNewCat('');
      fetchTopics();
    } catch (err: any) { setAddMsg(`❌ ${err.message}`); }
    setAddingAll(false);
  };

  // Preview file
  const handlePreview = async () => {
    if (!uploadFile) return;
    setUploadMsg(''); setPreview(null);
    const form = new FormData();
    form.append('file', uploadFile);
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(`${API}/topics/preview`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: form,
      });
      const data = await r.json();
      if (!r.ok) { setUploadMsg(`❌ ${data.error}`); return; }
      setPreview(data.topics);
      setUploadMsg(`📋 ${data.total} topics detected: ${data.new_topics} new, ${data.duplicates} duplicates`);
    } catch (err: any) { setUploadMsg(`❌ ${err.message}`); }
  };

  // Confirm upload
  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true); setUploadMsg('');
    const form = new FormData();
    form.append('file', uploadFile);
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(`${API}/topics/upload`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: form,
      });
      const data = await r.json();
      if (!r.ok) { setUploadMsg(`❌ ${data.error}`); }
      else { setUploadMsg(`✅ ${data.message}`); }
      setPreview(null); setUploadFile(null);
      if (fileRef.current) fileRef.current.value = '';
      fetchTopics();
    } catch (err: any) { setUploadMsg(`❌ ${err.message}`); }
    setUploading(false);
  };

  // Delete topic
  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Delete "${title}"? This will permanently remove it and all related quiz data.`)) return;
    try {
      const r = await fetch(`${API}/topics/${id}`, { method: 'DELETE', headers: getHeaders() });
      if (r.ok) fetchTopics();
    } catch (err: any) { console.error(err); }
  };

  // Delete ALL topics
  const handleDeleteAll = async () => {
    if (!confirm(`⚠️ DELETE ALL ${total} TOPICS?\n\nThis will permanently remove ALL topics and ALL related quiz history, scores, and attempts.\n\nThis action CANNOT be undone.`)) return;
    if (!confirm(`Are you absolutely sure? Type OK to confirm.`)) return;
    try {
      const r = await fetch(`${API}/topics/all`, { method: 'DELETE', headers: getHeaders() });
      const data = await r.json();
      if (r.ok) {
        setAddMsg(`✅ ${data.message}`);
        fetchTopics();
      }
    } catch (err: any) { console.error(err); }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="container">
      <header className="header">
        <div className="header-logo" style={{ cursor: 'pointer' }} onClick={() => router.push('/')}>⚡ StudyQuiz AI</div>
        <nav className="header-nav">
          <button className="btn btn-secondary" onClick={() => router.push('/')}>📚 Browse</button>
          <span className="badge badge-info">{total} topics</span>
          <ThemeToggle />
        </nav>
      </header>

      <h1 style={{ marginBottom: '0.5rem' }}>📋 Manage Topics</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        Add, upload, or remove study topics. All topics work with AI explanation and quiz generation.
      </p>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>➕ Add Topics</h2>
        <div className="flex-responsive">
          <input className="input" placeholder="Topic title *" value={newTitle} ref={titleInputRef}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddAll(); } }}
            style={{ flex: '2 1 180px' }} id="topic-title-input" />
          <input className="input" placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddAll(); } }}
            style={{ flex: '3 1 180px' }} />
          <input className="input" placeholder="Category (optional)" value={newCat} onChange={e => setNewCat(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddAll(); } }}
            style={{ flex: '1 1 100px' }} />
          <button
            onClick={handleAddToQueue}
            disabled={!newTitle.trim()}
            title="Queue this topic and add another"
            id="queue-topic-btn"
            style={{
              flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 42, height: 42, borderRadius: 'var(--radius-sm)',
              background: newTitle.trim() ? 'var(--accent-primary)' : 'var(--bg-glass)',
              color: '#fff', border: 'none', cursor: newTitle.trim() ? 'pointer' : 'not-allowed',
              fontSize: '1.3rem', fontWeight: 700, transition: 'all 0.2s ease',
              boxShadow: newTitle.trim() ? '0 2px 8px rgba(99,102,241,0.3)' : 'none',
            }}
          >
            +
          </button>
        </div>

        {/* Add / Add All button — always visible when there's content */}
        {(newTitle.trim() || topicQueue.length > 0) && (
          <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={handleAddAll}
              disabled={addingAll}
              id="add-all-topics-btn"
            >
              {addingAll ? '⏳ Adding...' : topicQueue.length > 0
                ? `📥 Add All (${topicQueue.length + (newTitle.trim() ? 1 : 0)})`
                : '📥 Add Topic'}
            </button>
            {topicQueue.length > 0 && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Use <strong>+</strong> to queue more topics before adding
              </span>
            )}
          </div>
        )}

        {/* Queued topics chips */}
        {topicQueue.length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                📋 Queued ({topicQueue.length}):
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {topicQueue.map((t, i) => (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                  padding: '0.3rem 0.6rem 0.3rem 0.75rem',
                  background: 'var(--bg-glass)', borderRadius: '99px',
                  fontSize: '0.82rem', color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  animation: 'fadeIn 0.2s ease',
                }}>
                  {t.title}
                  {t.category && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>({t.category})</span>}
                  <button
                    onClick={() => handleRemoveFromQueue(i)}
                    title="Remove from queue"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--accent-danger)', fontSize: '0.9rem',
                      padding: '0 0.15rem', lineHeight: 1, display: 'flex', alignItems: 'center',
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {addMsg && <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: addMsg.startsWith('✅') ? 'var(--accent-success)' : addMsg.startsWith('⚠') ? 'var(--accent-warning)' : 'var(--accent-danger)' }}>{addMsg}</p>}
      </div>

      {/* ═══ FILE UPLOAD ═══ */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>📤 Upload Topics File</h2>
          <button className="btn btn-secondary" onClick={() => setShowHelp(!showHelp)} style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>
            {showHelp ? 'Hide' : 'Show'} Format Guide
          </button>
        </div>

        {/* FORMAT HELP SECTION */}
        {showHelp && (
          <div className="card" style={{ background: 'var(--bg-glass)', marginBottom: '1rem', fontSize: '0.85rem' }}>
            <h3 style={{ marginBottom: '0.75rem', color: 'var(--accent-secondary)' }}>Supported File Formats</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Maximum file size: <strong>2MB</strong></p>

            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
              {/* CSV */}
              <div>
                <div className="badge badge-success" style={{ marginBottom: '0.5rem' }}>CSV Format</div>
                <pre style={{ background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', overflow: 'auto', color: 'var(--text-secondary)' }}>
{`title,description
Gradient Descent,Optimization method used in ML
Backpropagation,Training method for neural nets
Attention Mechanism,Core idea behind transformers`}
                </pre>
              </div>

              {/* TXT */}
              <div>
                <div className="badge badge-info" style={{ marginBottom: '0.5rem' }}>TXT Format</div>
                <pre style={{ background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', overflow: 'auto', color: 'var(--text-secondary)' }}>
{`Gradient Descent
Backpropagation
Attention Mechanism
Transformers`}
                </pre>
              </div>

              {/* JSON */}
              <div>
                <div className="badge badge-warning" style={{ marginBottom: '0.5rem' }}>JSON Format</div>
                <pre style={{ background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', overflow: 'auto', color: 'var(--text-secondary)' }}>
{`[
  {"title":"Gradient Descent",
   "description":"Optimization method"},
  {"title":"Backpropagation"},
  {"title":"Attention Mechanism"}
]`}
                </pre>
              </div>
            </div>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.75rem', fontSize: '0.8rem' }}>
              📌 <strong>title</strong> is required. <strong>description</strong> and <strong>category</strong> are optional. Duplicates are automatically skipped.
            </p>
          </div>
        )}

        <div className="upload-row" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="file"
            accept=".csv,.txt,.json"
            ref={fileRef}
            onChange={e => { setUploadFile(e.target.files?.[0] || null); setPreview(null); setUploadMsg(''); }}
            className="input"
            style={{ flex: 1 }}
            id="file-upload-input"
          />
          <button className="btn btn-secondary" onClick={handlePreview} disabled={!uploadFile} id="preview-btn">
            👁️ Preview
          </button>
          <button className="btn btn-primary" onClick={handleUpload} disabled={!uploadFile || uploading} id="upload-btn">
            {uploading ? '⏳ Uploading...' : '📤 Upload'}
          </button>
        </div>

        {uploadMsg && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: uploadMsg.startsWith('✅') ? 'var(--accent-success)' : uploadMsg.startsWith('❌') ? 'var(--accent-danger)' : 'var(--accent-warning)' }}>
            {uploadMsg}
          </p>
        )}

        {/* Preview Table */}
        {preview && preview.length > 0 && (
          <div className="table-responsive" style={{ marginTop: '1rem', maxHeight: 300 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '0.4rem', color: 'var(--text-muted)' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '0.4rem', color: 'var(--text-muted)' }}>Title</th>
                  <th style={{ textAlign: 'left', padding: '0.4rem', color: 'var(--text-muted)' }}>Description</th>
                  <th style={{ textAlign: 'left', padding: '0.4rem', color: 'var(--text-muted)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((t, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--bg-glass)', opacity: t.is_duplicate ? 0.5 : 1 }}>
                    <td style={{ padding: '0.4rem', color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td style={{ padding: '0.4rem', color: 'var(--text-primary)' }}>{t.title}</td>
                    <td style={{ padding: '0.4rem', color: 'var(--text-secondary)', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.short_description}</td>
                    <td style={{ padding: '0.4rem' }}>
                      <span className={`badge ${t.is_duplicate ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '0.7rem' }}>
                        {t.is_duplicate ? 'Duplicate' : 'New'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ TOPICS LIST ═══ */}
      <div className="card manage-list-card">
        {/* Compact toolbar */}
        <div className="manage-controls">
          <div className="manage-search-row">
            <input
              className="input manage-search-input"
              placeholder="🔍 Search topics..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              id="manage-search"
            />
            <select
              className="input manage-category-select"
              value={catFilter}
              onChange={e => { setCatFilter(e.target.value); setPage(0); }}
            >
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {total > 0 && (
            <button
              onClick={handleDeleteAll}
              className="btn-ghost manage-delete-all"
              id="delete-all-btn"
            >
              🗑️ Delete All ({total})
            </button>
          )}
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : topics.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>No topics found.</p>
        ) : (
          <>
            {/* Desktop: Table layout */}
            <div className="table-responsive manage-table-desktop">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: 500 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>ID</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>Title</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>Description</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>Category</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--text-muted)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {topics.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--bg-glass)' }}>
                      <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>{t.id}</td>
                      <td style={{ padding: '0.5rem', color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => router.push(`/study/${t.id}`)}>{t.title}</td>
                      <td style={{ padding: '0.5rem', color: 'var(--text-secondary)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.short_description}</td>
                      <td style={{ padding: '0.5rem' }}>
                        {t.category && <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>{t.category}</span>}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        <button
                          onClick={() => handleDelete(t.id, t.title)}
                          style={{ background: 'none', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', fontSize: '0.85rem', padding: '0.2rem 0.5rem' }}
                          title="Delete topic"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: Card layout */}
            <div className="manage-cards-mobile">
              {topics.map(t => (
                <div key={t.id} className="manage-topic-card" onClick={() => router.push(`/study/${t.id}`)}>
                  <div className="manage-topic-card-body">
                    <div className="manage-topic-title">{t.title}</div>
                    {t.short_description && (
                      <div className="manage-topic-desc">{t.short_description}</div>
                    )}
                  </div>
                  <div className="manage-topic-card-footer">
                    <div className="manage-topic-meta">
                      <span className="manage-topic-id">#{t.id}</span>
                      {t.category && <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>{t.category}</span>}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(t.id, t.title); }}
                      className="btn-ghost manage-topic-delete"
                      title="Delete topic"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="manage-pagination">
                <button className="btn btn-secondary" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: '0.3rem 0.6rem' }}>← Prev</button>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Page {page + 1} of {totalPages}</span>
                <button className="btn btn-secondary" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ padding: '0.3rem 0.6rem' }}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
