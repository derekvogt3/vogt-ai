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
  | 'select' | 'multi_select' | 'url' | 'email' | 'relation';

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

// --- Records ---

export type AppRecord = {
  id: string;
  typeId: string;
  data: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type RecordListResponse = {
  records: AppRecord[];
  total: number;
  page: number;
  pageSize: number;
};

export function createRecord(appId: string, typeId: string, data: Record<string, unknown>) {
  return apiFetch<{ record: AppRecord }>(`/api/apps/${appId}/types/${typeId}/records`, {
    method: 'POST',
    body: JSON.stringify({ data }),
  });
}

export function listRecords(appId: string, typeId: string, page = 1, pageSize = 50) {
  return apiFetch<RecordListResponse>(
    `/api/apps/${appId}/types/${typeId}/records?page=${page}&pageSize=${pageSize}`,
  );
}

export function getRecord(appId: string, typeId: string, recordId: string) {
  return apiFetch<{ record: AppRecord }>(`/api/apps/${appId}/types/${typeId}/records/${recordId}`);
}

export function updateRecord(appId: string, typeId: string, recordId: string, data: Record<string, unknown>) {
  return apiFetch<{ record: AppRecord }>(`/api/apps/${appId}/types/${typeId}/records/${recordId}`, {
    method: 'PUT',
    body: JSON.stringify({ data }),
  });
}

export function deleteRecord(appId: string, typeId: string, recordId: string) {
  return apiFetch<{ success: boolean }>(`/api/apps/${appId}/types/${typeId}/records/${recordId}`, {
    method: 'DELETE',
  });
}

export function resolveRecords(appId: string, typeId: string, ids: string[]) {
  return apiFetch<{ records: Record<string, { id: string; displayValue: string }> }>(
    `/api/apps/${appId}/types/${typeId}/records/resolve`,
    { method: 'POST', body: JSON.stringify({ ids }) },
  );
}

// --- Pages ---

export type Page = {
  id: string;
  appId: string;
  name: string;
  slug: string;
  description: string | null;
  config: Record<string, unknown>;
  isHome: boolean;
  published: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type PageVersion = {
  id: string;
  pageId: string;
  config: Record<string, unknown>;
  createdBy: string;
  note: string | null;
  createdAt: string;
};

export function createPage(appId: string, data: { name: string; slug: string; description?: string }) {
  return apiFetch<{ page: Page }>(`/api/apps/${appId}/pages`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function listPages(appId: string) {
  return apiFetch<{ pages: Page[] }>(`/api/apps/${appId}/pages`);
}

export function getPage(appId: string, pageId: string) {
  return apiFetch<{ page: Page }>(`/api/apps/${appId}/pages/${pageId}`);
}

export function updatePage(
  appId: string,
  pageId: string,
  data: { name?: string; slug?: string; description?: string; config?: Record<string, unknown>; published?: boolean; isHome?: boolean },
) {
  return apiFetch<{ page: Page }>(`/api/apps/${appId}/pages/${pageId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deletePage(appId: string, pageId: string) {
  return apiFetch<{ success: boolean }>(`/api/apps/${appId}/pages/${pageId}`, {
    method: 'DELETE',
  });
}

export function getPageBySlug(appId: string, slug: string) {
  return apiFetch<{ page: Page }>(`/api/apps/${appId}/pages/by-slug/${slug}`);
}

export function listPageVersions(appId: string, pageId: string) {
  return apiFetch<{ versions: PageVersion[] }>(`/api/apps/${appId}/pages/${pageId}/versions`);
}

export function restorePageVersion(appId: string, pageId: string, versionId: string) {
  return apiFetch<{ page: Page }>(`/api/apps/${appId}/pages/${pageId}/versions/${versionId}/restore`, {
    method: 'POST',
  });
}

// --- Automations ---

export type Automation = {
  id: string;
  appId: string;
  typeId: string | null;
  name: string;
  description: string | null;
  trigger: string;
  triggerConfig: Record<string, unknown>;
  code: string;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type AutomationRun = {
  id: string;
  automationId: string;
  status: string;
  triggerEvent: string;
  triggerRecordId: string | null;
  logs: Array<{ timestamp: string; level: string; message: string }>;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
};

export function listAutomations(appId: string, typeId?: string) {
  const qs = typeId ? `?typeId=${typeId}` : '';
  return apiFetch<{ automations: Automation[] }>(`/api/apps/${appId}/automations${qs}`);
}

export function createAutomation(
  appId: string,
  data: { name: string; typeId: string; trigger: string; code: string; description?: string; enabled?: boolean },
) {
  return apiFetch<{ automation: Automation }>(`/api/apps/${appId}/automations`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getAutomation(appId: string, automationId: string) {
  return apiFetch<{ automation: Automation }>(`/api/apps/${appId}/automations/${automationId}`);
}

export function updateAutomation(
  appId: string,
  automationId: string,
  data: { name?: string; code?: string; enabled?: boolean; trigger?: string; description?: string },
) {
  return apiFetch<{ automation: Automation }>(`/api/apps/${appId}/automations/${automationId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteAutomation(appId: string, automationId: string) {
  return apiFetch<{ success: boolean }>(`/api/apps/${appId}/automations/${automationId}`, {
    method: 'DELETE',
  });
}

export function runAutomationManually(appId: string, automationId: string) {
  return apiFetch<{ runId: string }>(`/api/apps/${appId}/automations/${automationId}/run`, {
    method: 'POST',
  });
}

export function listAutomationRuns(appId: string, automationId: string, page = 1, pageSize = 10) {
  return apiFetch<{ runs: AutomationRun[]; total: number; page: number; pageSize: number }>(
    `/api/apps/${appId}/automations/${automationId}/runs?page=${page}&pageSize=${pageSize}`,
  );
}
