/**
 * Execution API Client
 * - GET /execute/conversations/:id/stream (EventSource URL)
 * - POST /execute/conversations/:id/messages (submit message, returns 202)
 * - Conversation CRUD
 */
import { apiCall, getApiBaseUrl, getApiHeaders } from './client';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface Conversation {
  id: string;
  user_id: string;
  agent_slug: string | null;
  title: string;
  sdk_session_id: string | null;
  summary: string | null;
  message_count: number;
  last_message_at: string;
  created_at: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  execution_id: string;
  created_at: string;
  status?: string;
  input_tokens?: number;
  output_tokens?: number;
  credits_used?: string;
  completed_at?: string;
  thinking?: string;
  message_metadata?: {
    parts?: Array<
      | { id: string; type: 'text'; text: string }
      | { id: string; type: 'reasoning'; text: string }
      | {
          id: string;
          type: 'tool';
          callId: string;
          name: string;
          state: 'running' | 'done' | 'error';
          icon: 'read' | 'write' | 'search' | 'bash' | 'web' | 'think';
          args?: Record<string, unknown>;
          result?: unknown;
          target?: string;
          durationMs?: number;
        }
    >;
    tool_calls?: Array<{
      call_id: string;
      tool_name: string;
      arguments?: Record<string, unknown>;
      result?: unknown;
      success?: boolean;
      duration_ms?: number;
    }>;
  };
}

export interface ConversationDetail extends Conversation {
  messages: ConversationMessage[];
}

// -----------------------------------------------------------------------------
// Stream URL (for EventSource)
// -----------------------------------------------------------------------------

export async function getStreamUrl(conversationId: string): Promise<string> {
  const baseUrl = await getApiBaseUrl();
  return `${baseUrl}/execute/conversations/${conversationId}/stream`;
}

// -----------------------------------------------------------------------------
// SSE Token Exchange
// Exchanges a Firebase JWT (sent in Authorization header) for a short-lived,
// single-use token safe to pass as a query parameter to EventSource.
// -----------------------------------------------------------------------------

export async function fetchSseToken(): Promise<string> {
  const baseUrl = await getApiBaseUrl();
  const headers = await getApiHeaders();

  const response = await fetch(`${baseUrl}/execute/sse-token`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to obtain SSE token: ${response.status}`);
  }

  const json = await response.json();
  const token: string | undefined = json.data?.token ?? json.token;
  if (!token) {
    throw new Error('SSE token response missing token field');
  }
  return token;
}

// -----------------------------------------------------------------------------
// Send Message (POST /conversations/:id/messages -> 202)
// -----------------------------------------------------------------------------

export async function sendConversationMessage(
  conversationId: string,
  params: {
    task: string;
    coordinationMode?: string;
    context?: Record<string, unknown>;
  },
): Promise<{ execution_id: string | null; conversation_id: string }> {
  const baseUrl = await getApiBaseUrl();
  const headers = await getApiHeaders();

  const response = await fetch(`${baseUrl}/execute/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      task: params.task,
      coordination_mode: params.coordinationMode,
      context: params.context,
    }),
  });

  if (!response.ok) {
    let errorMessage = `Send message failed: ${response.status}`;
    try {
      const errorData = await response.clone().json();
      if (errorData.error?.message) errorMessage = errorData.error.message;
      else if (typeof errorData.error === 'string') errorMessage = errorData.error;
    } catch {
      // keep default
    }
    throw new Error(errorMessage);
  }

  const json = await response.json();
  return json.data ?? json;
}

// -----------------------------------------------------------------------------
// HITL Guidance Response
// -----------------------------------------------------------------------------

export async function respondToGuidance(
  executionId: string,
  params: {
    guidance_id: string;
    accepted: boolean;
    response_value?: string;
  },
): Promise<void> {
  await apiCall(`/execute/${executionId}/respond`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// -----------------------------------------------------------------------------
// Cancel Execution
// -----------------------------------------------------------------------------

export async function cancelExecution(executionId: string): Promise<void> {
  await apiCall(`/execute/${executionId}/cancel`, { method: 'POST' });
}

// -----------------------------------------------------------------------------
// Execution Sessions (Neon PostgreSQL — manual/chat runs)
// -----------------------------------------------------------------------------

export interface ExecutionSessionEntry {
  id: string;
  agent_slug: string;
  status: string;
  trigger_type: string | null;
  user_prompt: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  credits_used: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export async function listExecutionSessions(params?: {
  agent_slug?: string;
  limit?: number;
  offset?: number;
}): Promise<{ sessions: ExecutionSessionEntry[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.agent_slug) qs.set('agent_slug', params.agent_slug);
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  if (params?.offset !== undefined) qs.set('offset', String(params.offset));
  const query = qs.toString();

  const response = await apiCall(`/execute/sessions${query ? `?${query}` : ''}`, { method: 'GET' });
  const json = await response.json();
  return json.data ?? json;
}

// -----------------------------------------------------------------------------
// Conversation CRUD
// -----------------------------------------------------------------------------

const CONV_BASE = '/execute/conversations';

export async function getConversations(
  limit?: number,
  offset?: number,
): Promise<{ conversations: Conversation[]; total: number }> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', String(limit));
  if (offset !== undefined) params.set('offset', String(offset));
  const qs = params.toString();
  const response = await apiCall(`${CONV_BASE}${qs ? `?${qs}` : ''}`, { method: 'GET' });
  const json = await response.json();
  return json.data ?? json;
}

export async function getConversationDetail(id: string): Promise<ConversationDetail> {
  const response = await apiCall(`${CONV_BASE}/${id}`, { method: 'GET' });
  const json = await response.json();
  return json.data ?? json;
}

export async function createConversationApi(
  agentSlug: string | null,
  title?: string,
): Promise<Conversation> {
  const response = await apiCall(CONV_BASE, {
    method: 'POST',
    body: JSON.stringify({ agent_slug: agentSlug, title }),
  });
  const json = await response.json();
  return json.data ?? json;
}

export async function updateConversationTitle(
  id: string,
  title: string,
): Promise<Conversation> {
  const response = await apiCall(`${CONV_BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
  const json = await response.json();
  return json.data ?? json;
}

export async function deleteConversationApi(id: string): Promise<void> {
  await apiCall(`${CONV_BASE}/${id}`, { method: 'DELETE' });
}
