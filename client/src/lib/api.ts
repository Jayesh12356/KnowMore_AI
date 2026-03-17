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

  // Context
  generateContext: (topic_id: number, randomize = false) =>
    apiFetch<any>('/context/generate', {
      method: 'POST', body: JSON.stringify({ topic_id, randomize }),
    }),

  // Quiz
  generateQuiz: (topic_id: number, seed: string, randomize = false) =>
    apiFetch<any>('/quiz/generate', {
      method: 'POST', body: JSON.stringify({ topic_id, seed, randomize }),
    }),

  submitQuiz: (topic_id: number, seed: string, answers: any[]) =>
    apiFetch<any>('/quiz/submit', {
      method: 'POST', body: JSON.stringify({ topic_id, seed, answers }),
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
