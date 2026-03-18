'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';
import ThemeToggle from '@/components/ThemeToggle';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await adminApi.login(email, password);
      localStorage.setItem('admin_token', result.token);
      localStorage.setItem('admin', JSON.stringify(result.admin));
      router.push('/admin');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div className="card login-card" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}><ThemeToggle /></div>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className="header-logo login-logo" style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>🛡️ Admin Panel</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Super Admin Access Only
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <input className="input" type="email" placeholder="Admin email" value={email} onChange={(e) => setEmail(e.target.value)} required id="admin-login-email" />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required id="admin-login-password" />
          </div>

          {error && (
            <div style={{ color: 'var(--accent-danger)', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</div>
          )}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }} id="admin-login-submit">
            {loading ? 'Signing in...' : '🔐 Sign In as Admin'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button
            onClick={() => router.push('/login')}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit' }}
          >
            ← Back to user login
          </button>
        </div>
      </div>
    </div>
  );
}
