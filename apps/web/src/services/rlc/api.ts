// --- Types ---

export type DocumentSearchResult = {
  id: string;
  fileName: string;
  fileType: string;
  dropboxPath: string;
  directoryPath: string | null;
  dropboxUrl: string;
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
  directoryPath: string | null;
  dropboxUrl: string;
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

export type DirectoryEntry = {
  path: string;
  docCount: number;
};

export type DirectoriesResponse = {
  directories: DirectoryEntry[];
};

// --- Chat types ---

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ChatSSEEvent =
  | { event: 'text'; data: { text: string } }
  | { event: 'tool_call'; data: { tool: string; input: Record<string, any> } }
  | { event: 'done'; data: Record<string, never> };

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
  directory?: string;
  limit?: number;
  page?: number;
}): Promise<SearchResponse> {
  const qs = new URLSearchParams();
  qs.set('q', params.q);
  if (params.type) qs.set('type', params.type);
  if (params.directory) qs.set('directory', params.directory);
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

export function getDirectories(): Promise<DirectoriesResponse> {
  return apiFetch('/api/documents/directories');
}

// --- Chat SSE consumer ---

export async function* streamChat(messages: ChatMessage[]): AsyncGenerator<ChatSSEEvent> {
  const res = await fetch('/api/documents/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (res.status === 401) {
    window.location.href = '/app/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error((body as { error: string }).error || `Request failed: ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ') && currentEvent) {
        const data = JSON.parse(line.slice(6));
        yield { event: currentEvent, data } as ChatSSEEvent;
        currentEvent = '';
      }
    }
  }
}
