const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));

    // Auto-logout on auth failures (banned, revoked, deleted)
    if ((res.status === 401 || res.status === 403) && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      const errorMsg = encodeURIComponent(body.error || 'Session expired. Please login again.');
      window.location.href = `/login?error=${errorMsg}`;
      throw new Error(body.error || 'Session expired');
    }

    throw new Error(body.error || `API error ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Auth
  register: (email: string, password: string, display_name?: string) =>
    apiFetch<{ user: any; token: string }>('/auth/register', {
      method: 'POST', body: JSON.stringify({ email, password, display_name }),
    }),

  login: (email: string, password: string) =>
    apiFetch<{ user: any; token: string }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),

  // Topics
  getTopics: () => apiFetch<{ topics: any[]; total: number }>('/topics?limit=10000'),

  // LLM Providers
  getProviders: () => apiFetch<{ providers: any[]; default: string }>('/providers'),

  // Context
  generateContext: (topic_id: number, randomize = false, provider?: string) =>
    apiFetch<any>('/context/generate', {
      method: 'POST', body: JSON.stringify({ topic_id, randomize, provider }),
    }),

  // Quiz
  generateQuiz: (topic_id: number, seed: string, randomize = false, provider?: string) =>
    apiFetch<any>('/quiz/generate', {
      method: 'POST', body: JSON.stringify({ topic_id, seed, randomize, provider }),
    }),

  submitQuiz: (topic_id: number, seed: string, answers: any[], provider?: string) =>
    apiFetch<any>('/quiz/submit', {
      method: 'POST', body: JSON.stringify({ topic_id, seed, answers, provider }),
    }),

  // Topic-level history
  getTopicHistory: (topic_id: number, limit = 20) =>
    apiFetch<any>(`/topics/${topic_id}/history?limit=${limit}`),

  // Progress tracking
  getProgress: () =>
    apiFetch<any>('/progress'),

  markTopicOpened: (topic_id: number) =>
    apiFetch<any>(`/progress/${topic_id}/open`, { method: 'POST' }),

  markTopicCompleted: (topic_id: number) =>
    apiFetch<any>(`/progress/${topic_id}/complete`, { method: 'POST' }),

  markTopicUncompleted: (topic_id: number) =>
    apiFetch<any>(`/progress/${topic_id}/uncomplete`, { method: 'POST' }),
};

// ═══ Admin API ═══

function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('admin_token');
}

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `API error ${res.status}`);
  }

  return res.json();
}

export const adminApi = {
  login: (email: string, password: string) =>
    adminFetch<{ admin: any; token: string }>('/admin/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),

  getDashboard: () => adminFetch<any>('/admin/dashboard'),

  getUsers: (params: { search?: string; status?: string; sort?: string; order?: string; page?: number; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.status) q.set('status', params.status);
    if (params.sort) q.set('sort', params.sort);
    if (params.order) q.set('order', params.order);
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));
    return adminFetch<any>(`/admin/users?${q.toString()}`);
  },

  getUser: (id: string) => adminFetch<any>(`/admin/users/${id}`),

  banUser: (id: string) =>
    adminFetch<any>(`/admin/users/${id}/ban`, { method: 'POST' }),

  unbanUser: (id: string) =>
    adminFetch<any>(`/admin/users/${id}/unban`, { method: 'POST' }),

  deleteUser: (id: string) =>
    adminFetch<any>(`/admin/users/${id}?confirm=true`, { method: 'DELETE' }),

  revokeSessions: (id: string) =>
    adminFetch<any>(`/admin/users/${id}/revoke-sessions`, { method: 'POST' }),

  getActivity: (page = 1, limit = 30) =>
    adminFetch<any>(`/admin/activity?page=${page}&limit=${limit}`),

  getTopicInsights: () => adminFetch<any>('/admin/topics/insights'),

  changePassword: (current_password: string, new_password: string) =>
    adminFetch<any>('/admin/auth/change-password', {
      method: 'PUT', body: JSON.stringify({ current_password, new_password }),
    }),
};
