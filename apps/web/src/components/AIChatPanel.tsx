import { useState, useRef, useEffect } from 'react';
import {
  streamChat,
  type AIChatMessage,
  type SSEEvent,
} from '../api/ai-client';

type ToolAction = {
  tool_use_id: string;
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'success' | 'error';
  error?: string;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  toolActions?: ToolAction[];
};

type AIChatPanelProps = {
  appId: string;
  isOpen: boolean;
  onClose: () => void;
  onDataChanged: () => void;
};

function toolLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'create_type':
      return `Create type "${input.name}"`;
    case 'create_field':
      return `Add field "${input.name}" (${input.type})`;
    case 'create_record':
      return 'Create record';
    case 'update_type':
      return 'Update type';
    case 'update_field':
      return 'Update field';
    case 'delete_type':
      return 'Delete type';
    case 'delete_field':
      return 'Delete field';
    case 'list_records':
      return 'List records';
    default:
      return name;
  }
}

function ToolActionBadge({ action }: { action: ToolAction }) {
  return (
    <div className="my-1 flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs">
      {action.status === 'running' && (
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-purple-600" />
      )}
      {action.status === 'success' && (
        <span className="text-green-600">✓</span>
      )}
      {action.status === 'error' && <span className="text-red-600">✗</span>}
      <span className="text-gray-700">
        {toolLabel(action.name, action.input)}
      </span>
      {action.error && (
        <span className="text-red-500">— {action.error}</span>
      )}
    </div>
  );
}

export function AIChatPanel({
  appId,
  isOpen,
  onClose,
  onDataChanged,
}: AIChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: ChatMessage = { role: 'user', content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsStreaming(true);

    // Build API message history (simple role/content pairs)
    const apiMessages: AIChatMessage[] = updatedMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let assistantText = '';
    const toolActions: ToolAction[] = [];
    let dataChanged = false;

    try {
      for await (const event of streamChat(appId, apiMessages)) {
        switch (event.type) {
          case 'text_delta': {
            assistantText += event.text;
            const updatedToolActions = [...toolActions];
            setMessages((prev) => {
              const withoutLast =
                prev[prev.length - 1]?.role === 'assistant'
                  ? prev.slice(0, -1)
                  : prev;
              return [
                ...withoutLast,
                {
                  role: 'assistant',
                  content: assistantText,
                  toolActions: updatedToolActions,
                },
              ];
            });
            break;
          }

          case 'tool_use_start': {
            toolActions.push({
              tool_use_id: event.tool_use_id,
              name: event.name,
              input: event.input,
              status: 'running',
            });
            const updatedToolActions = [...toolActions];
            setMessages((prev) => {
              const withoutLast =
                prev[prev.length - 1]?.role === 'assistant'
                  ? prev.slice(0, -1)
                  : prev;
              return [
                ...withoutLast,
                {
                  role: 'assistant',
                  content: assistantText,
                  toolActions: updatedToolActions,
                },
              ];
            });
            break;
          }

          case 'tool_result': {
            const action = toolActions.find(
              (a) => a.tool_use_id === event.tool_use_id,
            );
            if (action) {
              action.status = event.success ? 'success' : 'error';
              if (event.error) action.error = event.error;
            }
            if (event.success) dataChanged = true;
            const updatedToolActions = [...toolActions];
            setMessages((prev) => {
              const withoutLast =
                prev[prev.length - 1]?.role === 'assistant'
                  ? prev.slice(0, -1)
                  : prev;
              return [
                ...withoutLast,
                {
                  role: 'assistant',
                  content: assistantText,
                  toolActions: updatedToolActions,
                },
              ];
            });
            break;
          }

          case 'error': {
            assistantText += assistantText
              ? `\n\nError: ${event.error}`
              : `Error: ${event.error}`;
            setMessages((prev) => {
              const withoutLast =
                prev[prev.length - 1]?.role === 'assistant'
                  ? prev.slice(0, -1)
                  : prev;
              return [
                ...withoutLast,
                { role: 'assistant', content: assistantText },
              ];
            });
            break;
          }

          case 'message_done':
            break;
        }
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Connection failed';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${errorMsg}` },
      ]);
    }

    setIsStreaming(false);
    if (dataChanged) {
      onDataChanged();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-96 flex-col border-l border-gray-200 bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <h2 className="text-sm font-semibold text-gray-900">AI Assistant</h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="mt-8 text-center text-sm text-gray-400">
            <p className="mb-2">Ask the AI to help build your data model.</p>
            <p className="text-xs text-gray-300">
              Try: "Create a CRM with Contacts, Companies, and Deals"
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
          >
            <div
              className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              {/* Tool actions */}
              {msg.toolActions && msg.toolActions.length > 0 && (
                <div className="mb-2">
                  {msg.toolActions.map((action) => (
                    <ToolActionBadge key={action.tool_use_id} action={action} />
                  ))}
                </div>
              )}

              {/* Text content */}
              {msg.content && (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              )}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 px-4 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isStreaming ? 'AI is working...' : 'Ask the AI...'}
            disabled={isStreaming}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
