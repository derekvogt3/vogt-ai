// --- Shared types ---

export type App = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppType = {
  id: string;
  appId: string;
  name: string;
  description: string | null;
  icon: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type FieldType =
  | 'text' | 'rich_text' | 'number' | 'boolean' | 'date'
  | 'select' | 'multi_select' | 'url' | 'email';

export type Field = {
  id: string;
  typeId: string;
  name: string;
  type: FieldType;
  config: Record<string, unknown>;
  position: number;
  required: boolean;
  createdAt: string;
};

// --- Fetch helper ---

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

// --- Apps ---

export function createApp(data: { name: string; description?: string; icon?: string }) {
  return apiFetch<{ app: App }>('/api/apps', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function listApps() {
  return apiFetch<{ apps: App[] }>('/api/apps');
}

export function getApp(appId: string) {
  return apiFetch<{ app: App; types: AppType[] }>(`/api/apps/${appId}`);
}

export function updateApp(appId: string, data: { name?: string; description?: string; icon?: string }) {
  return apiFetch<{ app: App }>(`/api/apps/${appId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteApp(appId: string) {
  return apiFetch<{ success: boolean }>(`/api/apps/${appId}`, {
    method: 'DELETE',
  });
}

// --- Types ---

export function createType(appId: string, data: { name: string; description?: string; icon?: string }) {
  return apiFetch<{ type: AppType }>(`/api/apps/${appId}/types`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getType(appId: string, typeId: string) {
  return apiFetch<{ type: AppType; fields: Field[] }>(`/api/apps/${appId}/types/${typeId}`);
}

export function updateType(appId: string, typeId: string, data: { name?: string; description?: string; icon?: string }) {
  return apiFetch<{ type: AppType }>(`/api/apps/${appId}/types/${typeId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteType(appId: string, typeId: string) {
  return apiFetch<{ success: boolean }>(`/api/apps/${appId}/types/${typeId}`, {
    method: 'DELETE',
  });
}

// --- Fields ---

export function createField(
  appId: string,
  typeId: string,
  data: { name: string; type: FieldType; config?: Record<string, unknown>; required?: boolean },
) {
  return apiFetch<{ field: Field }>(`/api/apps/${appId}/types/${typeId}/fields`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateField(
  appId: string,
  typeId: string,
  fieldId: string,
  data: { name?: string; config?: Record<string, unknown>; required?: boolean },
) {
  return apiFetch<{ field: Field }>(`/api/apps/${appId}/types/${typeId}/fields/${fieldId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteField(appId: string, typeId: string, fieldId: string) {
  return apiFetch<{ success: boolean }>(`/api/apps/${appId}/types/${typeId}/fields/${fieldId}`, {
    method: 'DELETE',
  });
}

export function reorderFields(appId: string, typeId: string, fieldIds: string[]) {
  return apiFetch<{ fields: Field[] }>(`/api/apps/${appId}/types/${typeId}/fields/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ fieldIds }),
  });
}
