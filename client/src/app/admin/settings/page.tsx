'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

export default function AdminSettingsPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    // Client-side validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage('All fields are required');
      setMessageType('error');
      return;
    }
    if (newPassword.length < 6) {
      setMessage('New password must be at least 6 characters');
      setMessageType('error');
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage('New passwords do not match');
      setMessageType('error');
      return;
    }
    if (currentPassword === newPassword) {
      setMessage('New password must be different from current password');
      setMessageType('error');
      return;
    }

    setLoading(true);
    try {
      await adminApi.changePassword(currentPassword, newPassword);
      setMessage('Password changed successfully! You will be logged out.');
      setMessageType('success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Log out after 2 seconds
      setTimeout(() => {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin');
        router.push('/admin/login');
      }, 2000);
    } catch (err: any) {
      setMessage(err.message || 'Failed to change password');
      setMessageType('error');
      if (err.message?.includes('401') || err.message?.includes('403')) {
        router.push('/admin/login');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-content">
      <div className="admin-page-header">
        <h1>⚙️ Settings</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Manage your admin account</p>
      </div>

      {/* Change Password Card */}
      <div className="card" style={{ maxWidth: 520, padding: '2rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>🔐 Change Password</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Update your admin password. You will be logged out after changing.
        </p>

        <form onSubmit={handleChangePassword}>
          {/* Current Password */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Current Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                type={showCurrent ? 'text' : 'password'}
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                id="settings-current-password"
                style={{ paddingRight: '3rem' }}
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                style={{
                  position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem',
                  color: 'var(--text-muted)', padding: '0.2rem',
                }}
              >
                {showCurrent ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              New Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                type={showNew ? 'text' : 'password'}
                placeholder="Enter new password (min 6 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                id="settings-new-password"
                style={{ paddingRight: '3rem' }}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                style={{
                  position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem',
                  color: 'var(--text-muted)', padding: '0.2rem',
                }}
              >
                {showNew ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Confirm New Password
            </label>
            <input
              className="input"
              type="password"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              id="settings-confirm-password"
            />
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p style={{ color: 'var(--accent-danger)', fontSize: '0.78rem', marginTop: '0.35rem' }}>
                Passwords do not match
              </p>
            )}
          </div>

          {/* Message */}
          {message && (
            <div style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '1rem',
              fontSize: '0.85rem',
              fontWeight: 500,
              background: messageType === 'success' ? 'var(--accent-success-soft)' : 'var(--accent-danger-soft)',
              color: messageType === 'success' ? 'var(--accent-success)' : 'var(--accent-danger)',
              border: `1px solid ${messageType === 'success' ? 'var(--accent-success)' : 'var(--accent-danger)'}`,
              borderLeftWidth: '3px',
            }}>
              {messageType === 'success' ? '✅ ' : '❌ '}{message}
            </div>
          )}

          {/* Submit */}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading || !currentPassword || !newPassword || !confirmPassword}
            style={{ width: '100%', justifyContent: 'center' }}
            id="settings-change-password-btn"
          >
            {loading ? '⏳ Changing...' : '🔐 Change Password'}
          </button>
        </form>
      </div>

      {/* Default Credentials Info */}
      <div className="card" style={{ maxWidth: 520, marginTop: '1.25rem', padding: '1.25rem', background: 'var(--bg-glass)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.3rem' }}>ℹ️</span>
          <div>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
              Default Credentials
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Email: <code style={{ background: 'var(--bg-input)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.78rem' }}>admin@knowmore.ai</code><br />
              Password: <code style={{ background: 'var(--bg-input)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.78rem' }}>Admin@123</code><br />
              <span style={{ color: 'var(--accent-warning)' }}>⚠️ Change the default password immediately after first login.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
