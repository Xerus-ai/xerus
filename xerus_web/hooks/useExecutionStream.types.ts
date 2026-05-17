/**
 * useExecutionStream Type Definitions
 *
 * All 12 event type interfaces, StreamEvent union type, ConnectionState,
 * callback types, and configuration types for the SSE client hook.
 * Mirrors backend execution/types.ts event definitions.
 */

// ---------------------------------------------------------------------------
// Stream Event Types (mirrors backend execution/types.ts)
// ---------------------------------------------------------------------------

export const STREAM_EVENT_TYPES = [
  'meta',
  'progress',
  'token',
  'tool_call',
  'tool_result',
  'reasoning',
  'memory_update',
  'kb_query',
  'self_moderation',
  'context_warning',
  'done',
  'stop',
  'notification',
  'tool_auth_required',
  'guidance',
  // Team coordination events
  'subagent_start',
  'subagent_stop',
  'delegation',
  // Live app preview from agent dev server (Lovable/Replit-style)
  'preview',
  // Billing/credit events
  'credit_warning',
  'insufficient_credits',
  'provider_unavailable',
  // Tool lifecycle events (from SDK runner)
  'tool_progress',
  'tool_use_summary',
  // Task/subagent lifecycle events (from SDK runner)
  'task_started',
  'task_progress',
  'task_updated',
  'task_notification',
  // Inter-agent communication
  'agent_message',
] as const;

export type StreamEventType = (typeof STREAM_EVENT_TYPES)[number];

export interface MetaEventContent {
  conversationId: string;
  model?: string;
  agentSlug?: string;
  agentName?: string;
  startedAt?: string;
  runId?: string;
}

export interface ProgressEventContent {
  phase: string;
  message: string;
  percent: number;
}

export interface TokenEventContent {
  text: string;
  tokenCount: number;
}

export interface ToolCallEventContent {
  toolName: string;
  arguments: Record<string, unknown>;
  callId: string;
}

export interface ToolResultEventContent {
  callId: string;
  result: unknown;
  durationMs: number;
  success: boolean;
}

export interface ReasoningEventContent {
  thought: string;
  confidence?: number;
}

export interface MemoryUpdateEventContent {
  operation: 'save' | 'update' | 'delete';
  scope: 'company' | 'project' | 'channel' | 'agent' | 'user' | 'entity' | 'topic';
  path: string;
  category?: string;
}

export interface KbQueryEventContent {
  query: string;
  resultsCount: number;
  kbIds: string[];
}

export interface SelfModerationEventContent {
  checklist: string[];
  qualityScore: number;
  passed: boolean;
}

export interface ContextWarningEventContent {
  warningType: 'approaching_limit' | 'at_limit' | 'overflow';
  currentUsage: number;
  maxBudget: number;
  percentUsed: number;
}

export interface ExecutionSummary {
  totalTokens: number;
  durationMs: number;
  toolCalls: number;
  agentsUsed: number;
  artifacts?: string[];
}

export interface ExecutionErrorInfo {
  message: string;
  code: string;
  type: string;
}

export interface DoneEventContent {
  finalResponse?: string;
  summary: ExecutionSummary;
  error?: ExecutionErrorInfo;
  databaseUpdated: boolean;
  conversationId?: string;
}

export interface StopEventContent {
  reason: 'user_cancel' | 'timeout' | 'error' | 'complete';
  task_title?: string;
  has_unsaved_memory?: boolean;
}

export interface ToolAuthRequiredEventContent {
  app_slug: string;
  agent_slug: string;
}

export interface SubagentStartEventContent {
  parentAgent: string;
  subagentType: string;
  taskDescription: string;
}

export interface SubagentStopEventContent {
  parentAgent: string;
  subagentType: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

export interface DelegationEventContent {
  fromAgent: string;
  toAgent: string;
  task: string;
}

export interface NotificationEventContent {
  notification_type: string;
  message: string;
  priority: string;
  action_required: boolean;
  agent_slug: string;
}

export interface AgentMessageEventContent {
  fromAgent: string;
  toAgent: string;
  message: string;
  summary?: string;
}

// Live app preview surfaced to the chat artifact viewer.
// Emitted by agents when they start a dev server (e.g., npm run dev on port 3000).
// Backend resolves the Daytona preview URL when only port is given.
export interface PreviewEventContent {
  port: number;
  url: string;
  label?: string;
}

export type UIHint = 'browser' | 'approval' | 'form' | 'preview' | 'terminal';

export interface GuidanceEventContent {
  question: string;
  options?: string[];
  timeout_seconds: number;
  pause_id: string;
  scenario: string;
  tool_name: string;
  agent_slug: string;
  requires_auth: boolean;
  execution_id: string;
  ui_hint?: UIHint;
  browser_url?: string;
  preview_url?: string;
  artifact_path?: string;
}

export interface CreditWarningEventContent {
  credits_available: number;
  credits_total: number;
  message: string;
}

export interface InsufficientCreditsEventContent {
  message: string;
}

export interface ProviderUnavailableEventContent {
  message: string;
}

export interface ToolProgressEventContent {
  toolName: string;
  toolUseId: string;
  progress: { status: string; message: string };
}

export interface ToolUseSummaryEventContent {
  toolName: string;
  toolUseId: string;
  durationMs: number;
  input?: unknown;
  output?: unknown;
  status: 'success' | 'error';
}

export interface TaskStartedEventContent {
  taskId: string;
  taskName: string;
  taskDescription?: string;
  parentToolUseId?: string;
}

export interface TaskProgressEventContent {
  taskId: string;
  progress: number;
  message?: string;
}

export interface TaskUpdatedEventContent {
  taskId: string;
  status: 'running' | 'completed' | 'failed';
  result?: unknown;
}

export interface TaskNotificationEventContent {
  taskId: string;
  taskSubject: string;
  status: string;
  result?: unknown;
}

// Map from event type string to its content type
export interface StreamEventContentMap {
  meta: MetaEventContent;
  progress: ProgressEventContent;
  token: TokenEventContent;
  tool_call: ToolCallEventContent;
  tool_result: ToolResultEventContent;
  reasoning: ReasoningEventContent;
  memory_update: MemoryUpdateEventContent;
  kb_query: KbQueryEventContent;
  self_moderation: SelfModerationEventContent;
  context_warning: ContextWarningEventContent;
  done: DoneEventContent;
  stop: StopEventContent;
  tool_auth_required: ToolAuthRequiredEventContent;
  guidance: GuidanceEventContent;
  subagent_start: SubagentStartEventContent;
  subagent_stop: SubagentStopEventContent;
  delegation: DelegationEventContent;
  notification: NotificationEventContent;
  preview: PreviewEventContent;
  credit_warning: CreditWarningEventContent;
  insufficient_credits: InsufficientCreditsEventContent;
  provider_unavailable: ProviderUnavailableEventContent;
  tool_progress: ToolProgressEventContent;
  tool_use_summary: ToolUseSummaryEventContent;
  task_started: TaskStartedEventContent;
  task_progress: TaskProgressEventContent;
  task_updated: TaskUpdatedEventContent;
  task_notification: TaskNotificationEventContent;
  agent_message: AgentMessageEventContent;
}

export interface StreamEvent<T extends StreamEventType = StreamEventType> {
  type: T;
  success?: boolean;
  execution_id: string;
  content?: T extends keyof StreamEventContentMap ? StreamEventContentMap[T] : unknown;
  meta?: unknown;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Hook Options & Return Types
// ---------------------------------------------------------------------------

export type StreamEventCallback<T extends StreamEventType = StreamEventType> =
  (event: StreamEvent<T>) => void;

export interface UseExecutionStreamOptions {
  sessionId: string | null;
  autoConnect?: boolean;
  maxReconnectAttempts?: number;
  onEvent?: StreamEventCallback;
  onMeta?: StreamEventCallback<'meta'>;
  onProgress?: StreamEventCallback<'progress'>;
  onToken?: StreamEventCallback<'token'>;
  onToolCall?: StreamEventCallback<'tool_call'>;
  onToolResult?: StreamEventCallback<'tool_result'>;
  onReasoning?: StreamEventCallback<'reasoning'>;
  onMemoryUpdate?: StreamEventCallback<'memory_update'>;
  onKbQuery?: StreamEventCallback<'kb_query'>;
  onSelfModeration?: StreamEventCallback<'self_moderation'>;
  onContextWarning?: StreamEventCallback<'context_warning'>;
  onDone?: StreamEventCallback<'done'>;
  onStop?: StreamEventCallback<'stop'>;
  onToolAuthRequired?: StreamEventCallback<'tool_auth_required'>;
  onGuidance?: StreamEventCallback<'guidance'>;
  onSubagentStart?: StreamEventCallback<'subagent_start'>;
  onSubagentStop?: StreamEventCallback<'subagent_stop'>;
  onDelegation?: StreamEventCallback<'delegation'>;
  onNotification?: StreamEventCallback<'notification'>;
  onPreview?: StreamEventCallback<'preview'>;
  onToolProgress?: StreamEventCallback<'tool_progress'>;
  onToolUseSummary?: StreamEventCallback<'tool_use_summary'>;
  onTaskStarted?: StreamEventCallback<'task_started'>;
  onTaskProgress?: StreamEventCallback<'task_progress'>;
  onTaskUpdated?: StreamEventCallback<'task_updated'>;
  onTaskNotification?: StreamEventCallback<'task_notification'>;
  onAgentMessage?: StreamEventCallback<'agent_message'>;
  onError?: (error: Error) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface UseExecutionStreamReturn {
  isConnected: boolean;
  connectionState: ConnectionState;
  lastEvent: StreamEvent | null;
  events: StreamEvent[];
  error: Error | null;
  close: () => void;
}
