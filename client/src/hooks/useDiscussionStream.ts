import { useState, useEffect, useRef, useCallback } from 'react';

export interface StreamingMessage {
  role: string;
  modelName: string;
  content: string;
  isStreaming: boolean;
}

export function useDiscussionStream(discussionId: number, isRunning: boolean) {
  const [streamingMessages, setStreamingMessages] = useState<Map<string, StreamingMessage>>(new Map());
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!discussionId || !isRunning) return;

    const es = new EventSource(`/api/stream/${discussionId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'message_start') {
          const key = `${data.data.role}_${data.data.modelName}`;
          setStreamingMessages(prev => {
            const next = new Map(prev);
            next.set(key, {
              role: data.data.role,
              modelName: data.data.modelName,
              content: '',
              isStreaming: true,
            });
            return next;
          });
        } else if (data.type === 'chunk') {
          const key = `${data.data.role}_${data.data.modelName}`;
          setStreamingMessages(prev => {
            const next = new Map(prev);
            const existing = next.get(key);
            if (existing) {
              next.set(key, { ...existing, content: existing.content + data.data.chunk });
            }
            return next;
          });
        } else if (data.type === 'message_end') {
          const key = `${data.data.role}_${data.data.modelName}`;
          setStreamingMessages(prev => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      // Reconnect after brief delay if still running
      setTimeout(() => {
        if (eventSourceRef.current === es) {
          connect();
        }
      }, 2000);
    };
  }, [discussionId, isRunning]);

  useEffect(() => {
    if (isRunning && discussionId > 0) {
      connect();
    }
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setStreamingMessages(new Map());
    };
  }, [isRunning, discussionId, connect]);

  return { streamingMessages };
}
