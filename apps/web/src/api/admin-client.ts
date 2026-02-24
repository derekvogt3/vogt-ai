// --- Types ---

export type AdminUser = {
  id: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: string;
  services: Array<{ id: string; name: string; slug: string }>;
};

export type InviteCode = {
  id: string;
  code: string;
  createdBy: string;
  createdByEmail: string | null;
  usedBy: string | null;
  usedByEmail: string | null;
  usedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type AdminService = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  route: string;
  enabled: boolean;
  createdAt: string;
};

// --- Fetch helper ---

async function adminFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (res.status === 401) {
    window.location.href = '/app/login';
    throw new Error('Unauthorized');
  }

  if (res.status === 403) {
    throw new Error('Admin access required');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error((body as { error: string }).error || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// --- Users ---

export function getUsers(): Promise<{ users: AdminUser[] }> {
  return adminFetch('/api/admin/users');
}

export function updateUserRole(userId: string, role: 'admin' | 'user'): Promise<{ user: { id: string; email: string; role: string } }> {
  return adminFetch(`/api/admin/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

// --- Invite Codes ---

export function getInviteCodes(): Promise<{ inviteCodes: InviteCode[] }> {
  return adminFetch('/api/admin/invite-codes');
}

export function createInviteCode(expiresInDays?: number): Promise<{ inviteCode: InviteCode }> {
  return adminFetch('/api/admin/invite-codes', {
    method: 'POST',
    body: JSON.stringify(expiresInDays ? { expiresInDays } : {}),
  });
}

export function deleteInviteCode(id: string): Promise<{ success: boolean }> {
  return adminFetch(`/api/admin/invite-codes/${id}`, {
    method: 'DELETE',
  });
}

// --- Services ---

export function getServices(): Promise<{ services: AdminService[] }> {
  return adminFetch('/api/admin/services');
}

export function grantServiceAccess(userId: string, serviceId: string): Promise<{ success: boolean }> {
  return adminFetch(`/api/admin/users/${userId}/services/${serviceId}`, {
    method: 'POST',
  });
}

export function revokeServiceAccess(userId: string, serviceId: string): Promise<{ success: boolean }> {
  return adminFetch(`/api/admin/users/${userId}/services/${serviceId}`, {
    method: 'DELETE',
  });
}
