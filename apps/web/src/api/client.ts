export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export async function* streamChat(
  messages: ChatMessage[]
): AsyncGenerator<ChatStreamEvent> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Chat request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data) {
          yield JSON.parse(data) as ChatStreamEvent;
        }
      }
    }
  }
}
