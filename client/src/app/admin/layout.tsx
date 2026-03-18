'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';

const NAV_ITEMS = [
  { href: '/admin', label: '📊 Dashboard', id: 'nav-dashboard' },
  { href: '/admin/users', label: '👥 Users', id: 'nav-users' },
  { href: '/admin/topics', label: '📚 Topics', id: 'nav-topics' },
  { href: '/admin/activity', label: '⚡ Activity', id: 'nav-activity' },
  { href: '/admin/settings', label: '⚙️ Settings', id: 'nav-settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Don't wrap the login page
  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (isLoginPage) return;
    const token = localStorage.getItem('admin_token');
    const adminData = localStorage.getItem('admin');
    if (!token) {
      router.push('/admin/login');
      return;
    }
    if (adminData) setAdmin(JSON.parse(adminData));
  }, [router, isLoginPage]);

  if (isLoginPage) return <>{children}</>;

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin');
    router.push('/admin/login');
  };

  return (
    <div className="admin-layout">
      {/* Mobile header */}
      <div className="admin-mobile-header">
        <button
          className="admin-hamburger"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle menu"
          id="admin-menu-toggle"
        >
          ☰
        </button>
        <span className="admin-mobile-title">🛡️ Admin</span>
        <ThemeToggle />
      </div>

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-header">
          <div className="admin-sidebar-logo">🛡️ Admin Panel</div>
          <button className="admin-sidebar-close" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>

        <nav className="admin-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.href}
              id={item.id}
              className={`admin-nav-item ${pathname === item.href ? 'active' : ''}`}
              onClick={() => { router.push(item.href); setSidebarOpen(false); }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          {admin && (
            <div className="admin-user-info">
              <div className="admin-user-avatar">{(admin.display_name || admin.email || 'A')[0].toUpperCase()}</div>
              <div className="admin-user-details">
                <div className="admin-user-name">{admin.display_name || 'Admin'}</div>
                <div className="admin-user-email">{admin.email}</div>
              </div>
            </div>
          )}
          <button className="admin-nav-item admin-logout-btn" onClick={handleLogout} id="admin-logout">
            🚪 Logout
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && <div className="admin-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Main content */}
      <main className="admin-main">
        {children}
      </main>
    </div>
  );
}
