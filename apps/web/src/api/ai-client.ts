import type { FieldType } from './apps-client';

// ============ AI Generation Types ============

export type AutomationProposal = {
  name: string;
  trigger: 'record_created' | 'record_updated' | 'record_deleted' | 'manual';
  description: string;
  code: string;
  explanation: string;
};

export type SchemaTypeProposal = {
  name: string;
  description: string;
  icon: string;
  fields: Array<{
    name: string;
    type: FieldType;
    required: boolean;
    config?: Record<string, unknown>;
  }>;
};

export type SchemaProposal = {
  types: SchemaTypeProposal[];
};

// ============ AI Generation Functions ============

async function aiFetch<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    window.location.href = '/app/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error((err as { error?: string }).error || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function generateAutomation(
  appId: string,
  prompt: string,
  typeId: string,
): Promise<AutomationProposal> {
  const data = await aiFetch<{ automation: AutomationProposal }>(
    `/api/apps/${appId}/generate-automation`,
    { prompt, typeId },
  );
  return data.automation;
}

export async function generateSchema(
  appId: string,
  prompt: string,
): Promise<SchemaProposal> {
  const data = await aiFetch<{ schema: SchemaProposal }>(
    `/api/apps/${appId}/generate-schema`,
    { prompt },
  );
  return data.schema;
}

export async function executeSchema(
  appId: string,
  schema: SchemaProposal,
): Promise<{ types: Array<{ id: string; name: string; icon: string | null }> }> {
  return aiFetch(
    `/api/apps/${appId}/execute-schema`,
    schema,
  );
}

// ============ Legacy Chat Types (kept for backend compatibility) ============

export type AIChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type SSEEvent =
  | { type: 'text_delta'; text: string }
  | {
      type: 'tool_use_start';
      tool_use_id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: 'tool_result';
      tool_use_id: string;
      name: string;
      success: boolean;
      result?: unknown;
      error?: string;
    }
  | { type: 'message_done' }
  | { type: 'error'; error: string };

export async function* streamChat(
  appId: string,
  messages: AIChatMessage[],
): AsyncGenerator<SSEEvent> {
  const res = await fetch(`/api/apps/${appId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (res.status === 401) {
    window.location.href = '/app/login';
    return;
  }

  if (!res.ok) {
    const body = await res
      .json()
      .catch(() => ({ error: 'Request failed' }));
    yield {
      type: 'error',
      error:
        (body as { error?: string }).error || `Request failed: ${res.status}`,
    };
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!; // Keep incomplete line in buffer

    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ') && currentEvent) {
        try {
          const data = JSON.parse(line.slice(6));
          yield { type: currentEvent, ...data } as SSEEvent;
        } catch {
          // Skip malformed data
        }
        currentEvent = '';
      }
    }
  }
}
