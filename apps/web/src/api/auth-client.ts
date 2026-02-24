export type User = {
  id: string;
  email: string;
  role: 'admin' | 'user';
};

type AuthResponse = {
  user: User;
};

type ErrorResponse = {
  error: string;
};

async function authFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error((body as ErrorResponse).error || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export function register(email: string, password: string, inviteCode: string) {
  return authFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, inviteCode }),
  });
}

export function login(email: string, password: string) {
  return authFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return authFetch<{ success: boolean }>('/api/auth/logout', {
    method: 'POST',
  });
}

export function getMe() {
  return authFetch<AuthResponse>('/api/auth/me');
}
