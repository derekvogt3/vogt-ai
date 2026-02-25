// --- Types ---

export type DocumentSearchResult = {
  id: string;
  fileName: string;
  fileType: string;
  dropboxPath: string;
  wordCount: number | null;
  fileSizeBytes: number | null;
  pageCount: number | null;
  dropboxModified: string | null;
  rank: number;
  snippet: string;
};

export type SearchResponse = {
  results: DocumentSearchResult[];
  total: number;
  query: string;
  page: number;
  limit: number;
  searchTimeMs: number;
};

export type DocumentDetail = {
  id: string;
  fileName: string;
  fileType: string;
  dropboxPath: string;
  wordCount: number | null;
  fileSizeBytes: number | null;
  pageCount: number | null;
  dropboxModified: string | null;
  status: string;
  extractedText: string | null;
  textPreview: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentStats = {
  totalDocuments: number;
  indexedDocuments: number;
  totalWords: number;
  typeBreakdown: Array<{ fileType: string; count: number; totalWords: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
};

// --- Fetch helper ---

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);

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

// --- API functions ---

export function searchDocuments(params: {
  q: string;
  type?: string;
  limit?: number;
  page?: number;
}): Promise<SearchResponse> {
  const qs = new URLSearchParams();
  qs.set('q', params.q);
  if (params.type) qs.set('type', params.type);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.page) qs.set('page', String(params.page));
  return apiFetch(`/api/documents/search?${qs.toString()}`);
}

export function getDocument(id: string): Promise<DocumentDetail> {
  return apiFetch(`/api/documents/${id}`);
}

export function getDocumentStats(): Promise<DocumentStats> {
  return apiFetch('/api/documents/stats');
}
