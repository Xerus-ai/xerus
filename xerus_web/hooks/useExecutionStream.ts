/**
 * useExecutionStream Hook (v3 - Long-lived SSE)
 *
 * GET /conversations/:id/stream via EventSource (long-lived, per-conversation).
 * Messages submitted via POST /conversations/:id/messages.
 * EventSource handles SSE parsing and reconnection natively.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { getStreamUrl, sendConversationMessage, fetchSseToken } from '@/lib/api/execute';

// Re-export all types so consumers can import from this file as before
export { STREAM_EVENT_TYPES } from './useExecutionStream.types';
export type {
  StreamEventType, MetaEventContent, ProgressEventContent,
  TokenEventContent, ToolCallEventContent, ToolResultEventContent, ReasoningEventContent,
  MemoryUpdateEventContent, KbQueryEventContent, SelfModerationEventContent,
  ContextWarningEventContent, ExecutionSummary, ExecutionErrorInfo, DoneEventContent,
  StopEventContent, ToolAuthRequiredEventContent, GuidanceEventContent,
  SubagentStartEventContent, SubagentStopEventContent, DelegationEventContent, NotificationEventContent,
  StreamEventContentMap, StreamEvent, StreamEventCallback,
  UseExecutionStreamOptions, UseExecutionStreamReturn, ConnectionState,
} from './useExecutionStream.types';

import type {
  StreamEvent,
  UseExecutionStreamReturn, ConnectionState,
} from './useExecutionStream.types';
import { STREAM_EVENT_TYPES, type StreamEventType } from './useExecutionStream.types';

// ---------------------------------------------------------------------------
// Callback types for the new hook signature
// ---------------------------------------------------------------------------

export interface UseExecutionStreamCallbacks {
  onEvent?: (event: StreamEvent) => void;
  onMeta?: (event: StreamEvent<'meta'>) => void;
  onProgress?: (event: StreamEvent<'progress'>) => void;
  onToken?: (event: StreamEvent<'token'>) => void;
  onToolCall?: (event: StreamEvent<'tool_call'>) => void;
  onToolResult?: (event: StreamEvent<'tool_result'>) => void;
  onReasoning?: (event: StreamEvent<'reasoning'>) => void;
  onMemoryUpdate?: (event: StreamEvent<'memory_update'>) => void;
  onKbQuery?: (event: StreamEvent<'kb_query'>) => void;
  onSelfModeration?: (event: StreamEvent<'self_moderation'>) => void;
  onContextWarning?: (event: StreamEvent<'context_warning'>) => void;
  onDone?: (event: StreamEvent<'done'>) => void;
  onStop?: (event: StreamEvent<'stop'>) => void;
  onToolAuthRequired?: (event: StreamEvent<'tool_auth_required'>) => void;
  onGuidance?: (event: StreamEvent<'guidance'>) => void;
  onSubagentStart?: (event: StreamEvent<'subagent_start'>) => void;
  onSubagentStop?: (event: StreamEvent<'subagent_stop'>) => void;
  onDelegation?: (event: StreamEvent<'delegation'>) => void;
  onNotification?: (event: StreamEvent<'notification'>) => void;
  onError?: (error: Error) => void;
  onConnectionChange?: (connected: boolean) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useExecutionStream(
  callbacks: UseExecutionStreamCallbacks,
): UseExecutionStreamReturn & {
  connectStream: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, task: string, context?: Record<string, unknown>) => Promise<{ execution_id: string | null }>;
} {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastEvent, setLastEvent] = useState<StreamEvent | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const connectedConvRef = useRef<string | null>(null);

  // Dispatch a parsed event to the appropriate typed callback
  const dispatchEvent = useCallback((event: StreamEvent) => {
    const cbs = callbacksRef.current;
    cbs.onEvent?.(event);

    switch (event.type) {
      case 'meta':
        cbs.onMeta?.(event as StreamEvent<'meta'>);
        break;
      case 'progress':
        cbs.onProgress?.(event as StreamEvent<'progress'>);
        break;
      case 'token':
        cbs.onToken?.(event as StreamEvent<'token'>);
        break;
      case 'tool_call':
        cbs.onToolCall?.(event as StreamEvent<'tool_call'>);
        break;
      case 'tool_result':
        cbs.onToolResult?.(event as StreamEvent<'tool_result'>);
        break;
      case 'reasoning':
        cbs.onReasoning?.(event as StreamEvent<'reasoning'>);
        break;
      case 'memory_update':
        cbs.onMemoryUpdate?.(event as StreamEvent<'memory_update'>);
        break;
      case 'kb_query':
        cbs.onKbQuery?.(event as StreamEvent<'kb_query'>);
        break;
      case 'self_moderation':
        cbs.onSelfModeration?.(event as StreamEvent<'self_moderation'>);
        break;
      case 'context_warning':
        cbs.onContextWarning?.(event as StreamEvent<'context_warning'>);
        break;
      case 'done':
        cbs.onDone?.(event as StreamEvent<'done'>);
        break;
      case 'stop':
        cbs.onStop?.(event as StreamEvent<'stop'>);
        break;
      case 'tool_auth_required':
        cbs.onToolAuthRequired?.(event as StreamEvent<'tool_auth_required'>);
        break;
      case 'guidance':
        cbs.onGuidance?.(event as StreamEvent<'guidance'>);
        break;
      case 'subagent_start':
        cbs.onSubagentStart?.(event as StreamEvent<'subagent_start'>);
        break;
      case 'subagent_stop':
        cbs.onSubagentStop?.(event as StreamEvent<'subagent_stop'>);
        break;
      case 'delegation':
        cbs.onDelegation?.(event as StreamEvent<'delegation'>);
        break;
      case 'notification':
        cbs.onNotification?.(event as StreamEvent<'notification'>);
        break;
    }
  }, []);

  // Close / disconnect EventSource
  const close = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    connectedConvRef.current = null;
    setConnectionState('disconnected');
    callbacksRef.current.onConnectionChange?.(false);
  }, []);

  // Connect a long-lived SSE stream to a conversation
  const connectStream = useCallback(async (conversationId: string) => {
    // Skip if already connected and OPEN (not just CONNECTING)
    if (connectedConvRef.current === conversationId && eventSourceRef.current?.readyState === EventSource.OPEN) {
      return;
    }

    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      connectedConvRef.current = null;
    }

    setError(null);
    setConnectionState('connecting');

    try {
      // Two-step SSE auth: exchange Firebase JWT for a short-lived, single-use
      // token via POST /sse-token (JWT stays in Authorization header, never in URL).
      // The short-lived token is safe to pass as a query param to EventSource.
      const sseToken = await fetchSseToken();
      const streamUrl = await getStreamUrl(conversationId);
      const separator = streamUrl.includes('?') ? '&' : '?';
      const urlWithAuth = `${streamUrl}${separator}token=${encodeURIComponent(sseToken)}`;

      const es = new EventSource(urlWithAuth);
      eventSourceRef.current = es;

      // Await actual connection before resolving — prevents race with sendMessage
      await new Promise<void>((resolve, reject) => {
        es.onopen = () => {
          connectedConvRef.current = conversationId;
          setConnectionState('connected');
          callbacksRef.current.onConnectionChange?.(true);
          resolve();
        };

        es.onerror = () => {
          if (es.readyState === EventSource.CLOSED) {
            connectedConvRef.current = null;
            setConnectionState('disconnected');
            callbacksRef.current.onConnectionChange?.(false);
            reject(new Error('SSE connection failed'));
          } else {
            setConnectionState('reconnecting');
          }
        };
      });

      es.onmessage = (msgEvent: MessageEvent) => {
        try {
          const parsed = JSON.parse(msgEvent.data) as StreamEvent;
          if (parsed.type && STREAM_EVENT_TYPES.includes(parsed.type as StreamEventType)) {
            if (!parsed.timestamp) parsed.timestamp = new Date().toISOString();

            setLastEvent(parsed);
            setEvents(prev => {
              const next = [...prev, parsed];
              return next.length > 1000 ? next.slice(-1000) : next;
            });
            dispatchEvent(parsed);
          }
        } catch (parseErr) {
          console.warn('[useExecutionStream] Failed to parse SSE event:', msgEvent.data?.slice(0, 200), parseErr);
        }
      };

      // After initial connection, switch to non-rejecting error handler for reconnects
      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) {
          connectedConvRef.current = null;
          setConnectionState('disconnected');
          callbacksRef.current.onConnectionChange?.(false);
        } else {
          setConnectionState('reconnecting');
        }
      };
    } catch (err) {
      const streamError = err instanceof Error ? err : new Error(String(err));
      setError(streamError);
      setConnectionState('disconnected');
      callbacksRef.current.onError?.(streamError);
      callbacksRef.current.onConnectionChange?.(false);
    }
  }, [dispatchEvent]);

  // Send a message via POST (fire-and-forget, events arrive on the SSE stream)
  const sendMessage = useCallback(async (
    conversationId: string,
    task: string,
    context?: Record<string, unknown>,
  ): Promise<{ execution_id: string | null }> => {
    // Clear events from previous execution in this conversation
    setEvents([]);
    setLastEvent(null);
    const result = await sendConversationMessage(conversationId, { task, context });
    return { execution_id: result.execution_id };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  return {
    isConnected: connectionState === 'connected',
    connectionState,
    lastEvent,
    events,
    error,
    close,
    connectStream,
    sendMessage,
  };
}
