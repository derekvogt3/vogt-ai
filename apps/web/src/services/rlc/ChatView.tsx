import { useState, useEffect, useRef, type FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { streamChat, type ChatMessage, type DocumentStats } from './api';

interface ToolCall {
  tool: string;
  input: Record<string, any>;
}

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}

function formatToolCall(tc: ToolCall): string {
  switch (tc.tool) {
    case 'search_documents':
      return `Searching "${tc.input.query}"${tc.input.file_type ? ` (${tc.input.file_type})` : ''}${tc.input.directory ? ` in ${tc.input.directory.split('/').pop()}` : ''}`;
    case 'get_document':
      return 'Reading document...';
    case 'list_directories':
      return tc.input.prefix ? `Listing directories in ${tc.input.prefix.split('/').pop()}` : 'Listing directories...';
    case 'get_corpus_stats':
      return 'Getting corpus stats...';
    default:
      return tc.tool;
  }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function ChatMessageBubble({ message }: { message: DisplayMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-blue-600 px-4 py-3 text-sm text-white whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2">
        {/* Tool call indicators */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.toolCalls.map((tc, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500"
              >
                <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {formatToolCall(tc)}
              </div>
            ))}
          </div>
        )}
        {/* Markdown content */}
        {message.content && (
          <div className="prose prose-sm max-w-none rounded-lg border border-gray-200 bg-white px-4 py-3 [&_table]:text-sm [&_code]:text-xs [&_pre]:text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        {message.isStreaming && !message.content && (
          <div className="flex items-center gap-2 px-1">
            <div className="flex gap-1">
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0ms' }} />
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '150ms' }} />
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-gray-400">Thinking...</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatView({ stats }: { stats: DocumentStats | null }) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userText = input.trim();
    const userMessage: DisplayMessage = { role: 'user', content: userText };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);

    // Build conversation history for API (only user/assistant text messages)
    const apiMessages: ChatMessage[] = [
      ...messages
        .filter((m) => m.content) // skip empty assistant messages
        .map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userText },
    ];

    // Add streaming assistant message
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '', toolCalls: [], isStreaming: true },
    ]);

    try {
      for await (const event of streamChat(apiMessages)) {
        if (event.event === 'text') {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, content: last.content + event.data.text }];
            }
            return prev;
          });
        } else if (event.event === 'tool_call') {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              const tc = event.data as ToolCall;
              const existing = last.toolCalls || [];
              const prevTc = existing[existing.length - 1];
              if (prevTc && prevTc.tool === tc.tool && JSON.stringify(prevTc.input) === JSON.stringify(tc.input)) {
                return prev;
              }
              return [...prev.slice(0, -1), { ...last, toolCalls: [...existing, tc] }];
            }
            return prev;
          });
        } else if (event.event === 'done') {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, isStreaming: false }];
            }
            return prev;
          });
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return [...prev.slice(0, -1), {
            ...last,
            content: last.content + '\n\n*Error: ' + (err instanceof Error ? err.message : 'Request failed') + '*',
            isStreaming: false,
          }];
        }
        return prev;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSuggestedQuery = (q: string) => {
    setInput(q);
    inputRef.current?.focus();
  };

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.length === 0 && (
            <div className="mt-12 text-center">
              <div className="text-4xl">&#129302;</div>
              <h2 className="mt-3 text-lg font-semibold text-gray-900">AI Document Search</h2>
              <p className="mt-1 text-sm text-gray-500">
                Ask questions about the {stats ? formatNumber(stats.indexedDocuments) : '...'} indexed documents.
                The AI agent will search, read documents, and find exactly what you need.
              </p>
              <div className="mx-auto mt-6 max-w-lg">
                <div className="text-xs font-medium text-gray-500 uppercase">Try asking:</div>
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  {[
                    'Find all delay notices from 2024',
                    'What CDR reviews mention WCS installation?',
                    'Show me emails about site readiness',
                    'Find change orders related to signaling',
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSuggestedQuery(q)}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <ChatMessageBubble key={i} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input form - pinned to bottom */}
      <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-4">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about documents... (e.g., 'Find all delay notices from 2023')"
            disabled={isStreaming}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isStreaming ? 'Searching...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}
