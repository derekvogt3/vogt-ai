export type Service = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  route: string;
};

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (res.status === 401) {
    window.location.href = '/app/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error((body as { error: string }).error || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export function getMyServices(): Promise<{ services: Service[] }> {
  return apiFetch('/api/services/mine');
}
