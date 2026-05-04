/**
 * useExecutionStream Hook Tests
 *
 * Type-level validation and integration test scenarios for the SSE client hook.
 * These tests validate exports, type safety, and document integration test cases.
 *
 * Run type checks: npx tsc --noEmit
 * Integration tests require a running backend with SSE endpoint.
 */
import type {
  StreamEventType,
  StreamEvent,
  MetaEventContent,
  ProgressEventContent,
  TokenEventContent,
  ToolCallEventContent,
  ToolResultEventContent,
  ReasoningEventContent,
  MemoryUpdateEventContent,
  KbQueryEventContent,
  SelfModerationEventContent,
  ContextWarningEventContent,
  DoneEventContent,
  StopEventContent,
  ToolAuthRequiredEventContent,
  ExecutionSummary,
  ExecutionErrorInfo,
  StreamEventContentMap,
  StreamEventCallback,
  UseExecutionStreamOptions,
  UseExecutionStreamReturn,
  ConnectionState,
} from '../useExecutionStream';

import { STREAM_EVENT_TYPES } from '../useExecutionStream';

// ---------------------------------------------------------------------------
// Type-level tests (compile-time validation)
// These will cause TypeScript errors if types are wrong.
// ---------------------------------------------------------------------------

// Verify all 28 event types are present
const _eventTypes: readonly string[] = STREAM_EVENT_TYPES;
const _expectedLength: 28 = STREAM_EVENT_TYPES.length;

// Verify StreamEventType is a union of all event type strings
const _metaType: StreamEventType = 'meta';
const _progressType: StreamEventType = 'progress';
const _tokenType: StreamEventType = 'token';
const _toolCallType: StreamEventType = 'tool_call';
const _toolResultType: StreamEventType = 'tool_result';
const _reasoningType: StreamEventType = 'reasoning';
const _memoryUpdateType: StreamEventType = 'memory_update';
const _kbQueryType: StreamEventType = 'kb_query';
const _selfModerationEventType: StreamEventType = 'self_moderation';
const _contextWarningType: StreamEventType = 'context_warning';
const _doneType: StreamEventType = 'done';
const _stopType: StreamEventType = 'stop';
const _toolAuthRequiredType: StreamEventType = 'tool_auth_required';
const _subagentStartType: StreamEventType = 'subagent_start';
const _subagentStopType: StreamEventType = 'subagent_stop';
const _delegationType: StreamEventType = 'delegation';
const _notificationType: StreamEventType = 'notification';
const _guidanceType: StreamEventType = 'guidance';
const _previewType: StreamEventType = 'preview';
const _creditWarningType: StreamEventType = 'credit_warning';
const _insufficientCreditsType: StreamEventType = 'insufficient_credits';
const _providerUnavailableType: StreamEventType = 'provider_unavailable';
const _toolProgressType: StreamEventType = 'tool_progress';
const _toolUseSummaryType: StreamEventType = 'tool_use_summary';
const _taskStartedType: StreamEventType = 'task_started';
const _taskProgressType: StreamEventType = 'task_progress';
const _taskUpdatedType: StreamEventType = 'task_updated';
const _taskNotificationType: StreamEventType = 'task_notification';

// Verify StreamEvent shape
const _sampleEvent: StreamEvent = {
  type: 'meta',
  success: true,
  execution_id: 'test-exec-123',
  content: {
    conversationId: 'conv-123',
    model: 'claude-opus-4-6',
    agentSlug: 'test-agent',
    agentName: 'Test Agent',
    startedAt: '2026-02-15T00:00:00Z',
  } satisfies MetaEventContent,
  timestamp: '2026-02-15T00:00:00Z',
};

// Verify typed event content interfaces
const _metaContent: MetaEventContent = {
  conversationId: 'conv-123',
  model: 'claude-opus-4-6',
  agentSlug: 'test-agent',
  agentName: 'Test',
  startedAt: '2026-02-15T00:00:00Z',
};

const _progressContent: ProgressEventContent = {
  phase: 'executing',
  message: 'Running tool...',
  percent: 50,
};

const _tokenContent: TokenEventContent = {
  text: 'Hello',
  tokenCount: 1,
};

const _toolCallContent: ToolCallEventContent = {
  toolName: 'Read',
  arguments: { file_path: '/test.ts' },
  callId: 'call-123',
};

const _toolResultContent: ToolResultEventContent = {
  callId: 'call-123',
  result: 'file contents...',
  durationMs: 150,
  success: true,
};

const _reasoningContent: ReasoningEventContent = {
  thought: 'Analyzing the code structure...',
  confidence: 0.9,
};

const _memoryUpdateContent: MemoryUpdateEventContent = {
  operation: 'save',
  scope: 'agent',
  path: '.memory/agents/seo-agent/working.md',
  category: 'working',
};

const _kbQueryContent: KbQueryEventContent = {
  query: 'How to configure heartbeats',
  resultsCount: 3,
  kbIds: ['kb-1', 'kb-2', 'kb-3'],
};

const _selfModerationContent: SelfModerationEventContent = {
  checklist: ['Format check', 'Safety check'],
  qualityScore: 0.95,
  passed: true,
};

const _contextWarningContent: ContextWarningEventContent = {
  warningType: 'approaching_limit',
  currentUsage: 75000,
  maxBudget: 100000,
  percentUsed: 75,
};

const _doneContent: DoneEventContent = {
  finalResponse: 'Task completed successfully.',
  summary: {
    totalTokens: 5000,
    durationMs: 12000,
    toolCalls: 8,
    agentsUsed: 1,
  } satisfies ExecutionSummary,
  databaseUpdated: true,
};

// Verify error info shape
const _errorInfo: ExecutionErrorInfo = {
  message: 'Timeout exceeded',
  code: 'EXECUTION_TIMEOUT',
  type: 'timeout',
};

// Verify ConnectionState values
const _states: ConnectionState[] = [
  'disconnected',
  'connecting',
  'connected',
  'reconnecting',
];

// Verify StreamEventContentMap maps correctly
type _VerifyMap = StreamEventContentMap['meta'] extends MetaEventContent ? true : never;
type _VerifyMap2 = StreamEventContentMap['done'] extends DoneEventContent ? true : never;
const _mapCheck: _VerifyMap = true;
const _mapCheck2: _VerifyMap2 = true;

// Verify callback type
const _callback: StreamEventCallback<'meta'> = (event) => {
  const _type: 'meta' = event.type;
  const _id: string = event.execution_id;
};

// Verify options shape
const _options: UseExecutionStreamOptions = {
  sessionId: 'session-123',
  autoConnect: true,
  maxReconnectAttempts: 5,
  onEvent: (_event) => {},
  onMeta: (_event) => {},
  onDone: (_event) => {},
  onError: (_error) => {},
  onConnectionChange: (_connected) => {},
};

// Verify return shape
type _ReturnCheck = UseExecutionStreamReturn extends {
  isConnected: boolean;
  connectionState: ConnectionState;
  lastEvent: StreamEvent | null;
  events: StreamEvent[];
  error: Error | null;
  close: () => void;
} ? true : never;
const _returnCheck: _ReturnCheck = true;

// ---------------------------------------------------------------------------
// Runtime assertion helpers (for future test runner integration)
// ---------------------------------------------------------------------------

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Unit tests for pure logic (no browser APIs needed)
// ---------------------------------------------------------------------------

export function testStreamEventTypesArray(): void {
  assert(STREAM_EVENT_TYPES.length === 28, 'Should have exactly 28 event types');
  assert(STREAM_EVENT_TYPES.includes('meta'), 'Should include meta');
  assert(STREAM_EVENT_TYPES.includes('progress'), 'Should include progress');
  assert(STREAM_EVENT_TYPES.includes('token'), 'Should include token');
  assert(STREAM_EVENT_TYPES.includes('tool_call'), 'Should include tool_call');
  assert(STREAM_EVENT_TYPES.includes('tool_result'), 'Should include tool_result');
  assert(STREAM_EVENT_TYPES.includes('reasoning'), 'Should include reasoning');
  assert(STREAM_EVENT_TYPES.includes('memory_update'), 'Should include memory_update');
  assert(STREAM_EVENT_TYPES.includes('kb_query'), 'Should include kb_query');
  assert(STREAM_EVENT_TYPES.includes('self_moderation'), 'Should include self_moderation');
  assert(STREAM_EVENT_TYPES.includes('context_warning'), 'Should include context_warning');
  assert(STREAM_EVENT_TYPES.includes('done'), 'Should include done');
  assert(STREAM_EVENT_TYPES.includes('stop'), 'Should include stop');
  assert(STREAM_EVENT_TYPES.includes('tool_auth_required'), 'Should include tool_auth_required');
  assert(STREAM_EVENT_TYPES.includes('subagent_start'), 'Should include subagent_start');
  assert(STREAM_EVENT_TYPES.includes('subagent_stop'), 'Should include subagent_stop');
  assert(STREAM_EVENT_TYPES.includes('delegation'), 'Should include delegation');
  assert(STREAM_EVENT_TYPES.includes('notification'), 'Should include notification');
  assert(STREAM_EVENT_TYPES.includes('guidance'), 'Should include guidance');
  assert(STREAM_EVENT_TYPES.includes('preview'), 'Should include preview');
  assert(STREAM_EVENT_TYPES.includes('credit_warning'), 'Should include credit_warning');
  assert(STREAM_EVENT_TYPES.includes('insufficient_credits'), 'Should include insufficient_credits');
  assert(STREAM_EVENT_TYPES.includes('provider_unavailable'), 'Should include provider_unavailable');
}

export function testStreamEventParsing(): void {
  const raw = '{"type":"meta","success":true,"execution_id":"exec-1","content":{"model":"claude-opus-4-6","agentSlug":"test-agent","agentName":"Test","startedAt":"2026-02-15T00:00:00Z"}}';
  const parsed: StreamEvent = JSON.parse(raw);

  assert(parsed.type === 'meta', 'Parsed type should be meta');
  assert(parsed.execution_id === 'exec-1', 'Parsed execution_id should match');
  assert(parsed.success === true, 'Parsed success should be true');

  const content = parsed.content as MetaEventContent;
  assert(content.model === 'claude-opus-4-6', 'Content model should match');
  assert(content.agentSlug === 'test-agent', 'Content agentSlug should match');
}

export function testDoneEventWithError(): void {
  const raw = JSON.stringify({
    type: 'done',
    success: false,
    execution_id: 'exec-err',
    content: {
      summary: { totalTokens: 100, durationMs: 500, toolCalls: 0, agentsUsed: 1 },
      error: { message: 'Timed out', code: 'TIMEOUT', type: 'timeout' },
      databaseUpdated: false,
    },
  });

  const parsed: StreamEvent<'done'> = JSON.parse(raw);
  assert(parsed.type === 'done', 'Should be done event');
  assert(parsed.success === false, 'Should indicate failure');

  const content = parsed.content as DoneEventContent;
  assert(content.error !== undefined, 'Should have error');
  assert(content.error!.code === 'TIMEOUT', 'Error code should match');
  assert(content.summary.totalTokens === 100, 'Summary tokens should match');
}

export function testInvalidEventTypeRejected(): void {
  const raw = '{"type":"invalid_type","execution_id":"exec-1"}';
  const parsed = JSON.parse(raw);

  assert(
    !STREAM_EVENT_TYPES.includes(parsed.type),
    'Invalid event type should not be in STREAM_EVENT_TYPES'
  );
}

// ---------------------------------------------------------------------------
// Run all tests if executed directly (Node.js compatible)
// ---------------------------------------------------------------------------

export function runAllTests(): void {
  const tests = [
    testStreamEventTypesArray,
    testStreamEventParsing,
    testDoneEventWithError,
    testInvalidEventTypeRejected,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test();
      passed++;
    } catch {
      failed++;
    }
  }

  if (failed > 0) {
    throw new Error(`${failed} test(s) failed`);
  }
}

// Suppress unused variable warnings -- these are compile-time type checks
void _eventTypes;
void _expectedLength;
void _metaType;
void _progressType;
void _tokenType;
void _toolCallType;
void _toolResultType;
void _reasoningType;
void _memoryUpdateType;
void _kbQueryType;
void _selfModerationEventType;
void _contextWarningType;
void _doneType;
void _guidanceType;
void _sampleEvent;
void _metaContent;
void _progressContent;
void _tokenContent;
void _toolCallContent;
void _toolResultContent;
void _reasoningContent;
void _memoryUpdateContent;
void _kbQueryContent;
void _selfModerationContent;
void _contextWarningContent;
void _doneContent;
void _errorInfo;
void _states;
void _mapCheck;
void _mapCheck2;
void _callback;
void _options;
void _returnCheck;
