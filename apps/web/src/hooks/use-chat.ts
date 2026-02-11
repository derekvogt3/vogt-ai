import { useState, useCallback } from 'react';
import { streamChat, type ChatMessage } from '../api/client';

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');

  const sendMessage = useCallback(
    async (content: string) => {
      const userMessage: ChatMessage = { role: 'user', content };
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setIsStreaming(true);
      setStreamingContent('');

      let accumulated = '';

      try {
        for await (const event of streamChat(updatedMessages)) {
          if (event.type === 'token') {
            accumulated += event.content;
            setStreamingContent(accumulated);
          } else if (event.type === 'done') {
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: accumulated },
            ]);
            setStreamingContent('');
          } else if (event.type === 'error') {
            console.error('Chat error:', event.message);
          }
        }
      } catch (error) {
        console.error('Stream error:', error);
      } finally {
        setIsStreaming(false);
      }
    },
    [messages]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setStreamingContent('');
  }, []);

  return { messages, isStreaming, streamingContent, sendMessage, clearChat };
}
