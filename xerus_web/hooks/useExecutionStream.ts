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
  PreviewEventContent,
  CreditWarningEventContent, InsufficientCreditsEventContent, ProviderUnavailableEventContent,
  ToolProgressEventContent, ToolUseSummaryEventContent,
  TaskStartedEventContent, TaskProgressEventContent, TaskUpdatedEventContent, TaskNotificationEventContent,
  AgentMessageEventContent,
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
  onPreview?: (event: StreamEvent<'preview'>) => void;
  onCreditWarning?: (event: StreamEvent<'credit_warning'>) => void;
  onInsufficientCredits?: (event: StreamEvent<'insufficient_credits'>) => void;
  onProviderUnavailable?: (event: StreamEvent<'provider_unavailable'>) => void;
  onToolProgress?: (event: StreamEvent<'tool_progress'>) => void;
  onToolUseSummary?: (event: StreamEvent<'tool_use_summary'>) => void;
  onTaskStarted?: (event: StreamEvent<'task_started'>) => void;
  onTaskProgress?: (event: StreamEvent<'task_progress'>) => void;
  onTaskUpdated?: (event: StreamEvent<'task_updated'>) => void;
  onTaskNotification?: (event: StreamEvent<'task_notification'>) => void;
  onAgentMessage?: (event: StreamEvent<'agent_message'>) => void;
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
  sendMessage: (conversationId: string, task: string, context?: Record<string, unknown>, agentSlug?: string) => Promise<{ execution_id: string | null }>;
  getConnectedConversationId: () => string | null;
} {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastEvent, setLastEvent] = useState<StreamEvent | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const connectedConvRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stabilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectingPromiseRef = useRef<Promise<void> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_BASE_DELAY_MS = 2000;
  const STABLE_CONNECTION_MS = 10_000; // connection must stay open this long to reset counter

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
      case 'preview':
        cbs.onPreview?.(event as StreamEvent<'preview'>);
        break;
      case 'credit_warning':
        cbs.onCreditWarning?.(event as StreamEvent<'credit_warning'>);
        break;
      case 'insufficient_credits':
        cbs.onInsufficientCredits?.(event as StreamEvent<'insufficient_credits'>);
        break;
      case 'provider_unavailable':
        cbs.onProviderUnavailable?.(event as StreamEvent<'provider_unavailable'>);
        break;
      case 'tool_progress':
        cbs.onToolProgress?.(event as StreamEvent<'tool_progress'>);
        break;
      case 'tool_use_summary':
        cbs.onToolUseSummary?.(event as StreamEvent<'tool_use_summary'>);
        break;
      case 'task_started':
        cbs.onTaskStarted?.(event as StreamEvent<'task_started'>);
        break;
      case 'task_progress':
        cbs.onTaskProgress?.(event as StreamEvent<'task_progress'>);
        break;
      case 'task_updated':
        cbs.onTaskUpdated?.(event as StreamEvent<'task_updated'>);
        break;
      case 'task_notification':
        cbs.onTaskNotification?.(event as StreamEvent<'task_notification'>);
        break;
      case 'agent_message':
        cbs.onAgentMessage?.(event as StreamEvent<'agent_message'>);
        break;
    }
  }, []);

  // Close / disconnect EventSource
  const close = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (stabilityTimerRef.current) {
      clearTimeout(stabilityTimerRef.current);
      stabilityTimerRef.current = null;
    }
    reconnectAttemptRef.current = 0;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    connectedConvRef.current = null;
    setConnectionState('disconnected');
    callbacksRef.current.onConnectionChange?.(false);
  }, []);

  // Internal: create EventSource with fresh SSE token, wire up event handlers
  const createEventSource = useCallback(async (conversationId: string): Promise<EventSource> => {
    const [sseToken, streamUrl] = await Promise.all([
      fetchSseToken(),
      getStreamUrl(conversationId),
    ]);
    const separator = streamUrl.includes('?') ? '&' : '?';
    const urlWithAuth = `${streamUrl}${separator}token=${encodeURIComponent(sseToken)}`;

    const es = new EventSource(urlWithAuth);
    eventSourceRef.current = es;

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

    return es;
  }, [dispatchEvent]);

  // Internal: schedule a reconnect with exponential backoff and fresh token
  const scheduleReconnect = useCallback((conversationId: string) => {
    if (reconnectTimerRef.current) return; // already scheduled
    if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.warn(`[useExecutionStream] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached, giving up`);
      setConnectionState('disconnected');
      callbacksRef.current.onConnectionChange?.(false);
      callbacksRef.current.onError?.(new Error('SSE reconnection failed after max attempts'));
      return;
    }

    const attempt = reconnectAttemptRef.current;
    const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt);
    reconnectAttemptRef.current = attempt + 1;
    setConnectionState('reconnecting');
    console.warn(`[useExecutionStream] Scheduling reconnect attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);

    reconnectTimerRef.current = setTimeout(async () => {
      reconnectTimerRef.current = null;
      try {
        // Close stale EventSource before reconnecting with fresh token
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }

        const es = await createEventSource(conversationId);

        es.onopen = () => {
          // Do NOT reset reconnectAttemptRef here — only reset after connection
          // proves stable (open for STABLE_CONNECTION_MS). This prevents infinite
          // loops when the server keeps dropping connections quickly.
          connectedConvRef.current = conversationId;
          setConnectionState('connected');
          callbacksRef.current.onConnectionChange?.(true);

          if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
          stabilityTimerRef.current = setTimeout(() => {
            stabilityTimerRef.current = null;
            if (eventSourceRef.current === es && es.readyState === EventSource.OPEN) {
              reconnectAttemptRef.current = 0;
            }
          }, STABLE_CONNECTION_MS);
        };

        es.onerror = () => {
          es.close();
          // Guard: only act if WE are still the current EventSource
          if (eventSourceRef.current !== es) return;
          if (stabilityTimerRef.current) {
            clearTimeout(stabilityTimerRef.current);
            stabilityTimerRef.current = null;
          }
          eventSourceRef.current = null;
          connectedConvRef.current = null;
          scheduleReconnect(conversationId);
        };
      } catch (err) {
        console.warn('[useExecutionStream] Reconnect failed:', err);
        scheduleReconnect(conversationId);
      }
    }, delay);
  }, [createEventSource]);

  // Connect a long-lived SSE stream to a conversation
  const connectStream = useCallback(async (conversationId: string) => {
    // Skip if already connected and OPEN (not just CONNECTING)
    if (connectedConvRef.current === conversationId && eventSourceRef.current?.readyState === EventSource.OPEN) {
      return;
    }

    // If another connectStream is in progress for the same conversation, wait for it
    // instead of creating a competing connection (prevents race condition)
    if (connectingPromiseRef.current) {
      await connectingPromiseRef.current.catch(() => {});
      // After the prior attempt finishes, check if we're now connected
      if (connectedConvRef.current === conversationId && eventSourceRef.current?.readyState === EventSource.OPEN) {
        return;
      }
    }

    // Close any existing connection and cancel pending reconnects
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      connectedConvRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptRef.current = 0;

    setError(null);
    setConnectionState('connecting');

    const connectPromise = (async () => {
      try {
        const es = await createEventSource(conversationId);

        // Await actual connection before resolving — prevents race with sendMessage
        await new Promise<void>((resolve, reject) => {
          es.onopen = () => {
            reconnectAttemptRef.current = 0;
            connectedConvRef.current = conversationId;
            setConnectionState('connected');
            callbacksRef.current.onConnectionChange?.(true);
            resolve();
          };

          es.onerror = () => {
            es.close();
            // Guard: only wipe refs if WE are still the current EventSource.
            // A concurrent connectStream call may have replaced us already.
            if (eventSourceRef.current === es) {
              eventSourceRef.current = null;
              connectedConvRef.current = null;
              setConnectionState('disconnected');
              callbacksRef.current.onConnectionChange?.(false);
            }
            reject(new Error('SSE connection failed'));
          };
        });

        // Start stability timer — reset reconnect counter if connection stays open
        if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
        stabilityTimerRef.current = setTimeout(() => {
          stabilityTimerRef.current = null;
          if (eventSourceRef.current === es && es.readyState === EventSource.OPEN) {
            reconnectAttemptRef.current = 0;
          }
        }, STABLE_CONNECTION_MS);

        // After initial connection, switch to reconnect-capable error handler
        es.onerror = () => {
          es.close();
          // Guard: only act if WE are still the current EventSource
          if (eventSourceRef.current !== es) return;
          if (stabilityTimerRef.current) {
            clearTimeout(stabilityTimerRef.current);
            stabilityTimerRef.current = null;
          }
          eventSourceRef.current = null;
          connectedConvRef.current = null;
          // Schedule reconnect with fresh token and exponential backoff
          scheduleReconnect(conversationId);
        };
      } catch (err) {
        const streamError = err instanceof Error ? err : new Error(String(err));
        setError(streamError);
        setConnectionState('disconnected');
        callbacksRef.current.onError?.(streamError);
        callbacksRef.current.onConnectionChange?.(false);
      } finally {
        connectingPromiseRef.current = null;
      }
    })();

    connectingPromiseRef.current = connectPromise;
    await connectPromise;
  }, [createEventSource, scheduleReconnect]);

  // Send a message via POST (fire-and-forget, events arrive on the SSE stream)
  const sendMessage = useCallback(async (
    conversationId: string,
    task: string,
    context?: Record<string, unknown>,
    agentSlug?: string,
  ): Promise<{ execution_id: string | null }> => {
    // Clear events from previous execution in this conversation
    setEvents([]);
    setLastEvent(null);
    const result = await sendConversationMessage(conversationId, { task, context, agent_slug: agentSlug });
    return { execution_id: result.execution_id };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (stabilityTimerRef.current) {
        clearTimeout(stabilityTimerRef.current);
        stabilityTimerRef.current = null;
      }
    };
  }, []);

  // Live ref to the conversation currently bound to the SSE stream. Consumers
  // use this to scope per-conversation state during event handlers — the event
  // itself (other than `meta`) doesn't carry the conversation id.
  const getConnectedConversationId = useCallback(() => connectedConvRef.current, []);

  return {
    isConnected: connectionState === 'connected',
    connectionState,
    lastEvent,
    events,
    error,
    close,
    connectStream,
    sendMessage,
    getConnectedConversationId,
  };
}
