// Execution Pipeline Types (v2)
// Simplified types for thin backend router.
// Prompt assembly, context building, hooks removed - runner handles those.
// See: docs/planning/execution/EXECUTION_ARCHITECTURE_v2.md Section 10

import type { StreamSink } from './streaming/stream.handler';
import type { PricingService } from './sdk/pricing.service';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';
import type { ExecutionQueueService } from './queue/execution-queue.service';
import type { CreditTracker } from '../credits/credit-tracker.service';
import type {
    ExecutionRequest,
    ExecutionStatus,
    ThinkingLevel,
    AutonomyLevel,
    AdapterType,
} from './types';
import type { KeySource } from './key-resolver.service';
import type { TriggerType } from './queue/execution-lane.types';
import type { SessionHandle } from '../sandbox-infra/sandbox/providers/daytona-runner';
import type { MemorySearchIndexService } from '../memory/git-memory/memory-search-index.service';
import type { MessageBridgeService } from '../inbox/messaging/message-bridge.service';
import type { AnnounceQueueService } from './queue/announce-queue.service';
import type { HITLHandler } from './hitl/hitl.handler';
import type { ActiveStreamEmitter } from './hitl/active-stream-emitter';

// -----------------------------------------------------------------------------
// Dependency Injection (v2 - simplified)
// Removed: PromptAssembler, HooksService, FileContextBuilder, TokenEstimator
// Those responsibilities now live inside the runner (in sandbox)
// -----------------------------------------------------------------------------

export interface ExecutionServiceDeps {
    sdkService: PricingService | null;
    sandboxService: SandboxService | null;
    queueService: ExecutionQueueService | null;
    creditTracker: CreditTracker | null;
    db: ExecutionDatabase;
    memorySearchIndex?: MemorySearchIndexService | null;
    messageBridge?: MessageBridgeService | null;
    hitlHandler?: HITLHandler | null;
    activeStreamEmitter?: ActiveStreamEmitter | null;
}

export interface ResolvedExecutionDeps {
    sdkService: PricingService;
    sandboxService: SandboxService;
    queueService: ExecutionQueueService;
    creditTracker: CreditTracker;
    db: ExecutionDatabase;
    memorySearchIndex: MemorySearchIndexService | null;
    messageBridge: MessageBridgeService | null;
    hitlHandler: HITLHandler;
    activeStreamEmitter: ActiveStreamEmitter | null;
    /** Callback to trigger execution for an agent that isn't running (e.g. @mention to offline agent).
     *  Avoids circular dep: runner-event-router → ExecutionService. Wired at startup. */
    triggerAgentExecution?: (userId: string, agentSlug: string, message: string, channelSlug: string) => Promise<void>;
}

export interface ExecutionDatabase {
    query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

// -----------------------------------------------------------------------------
// Agent Row (DB result shape)
// -----------------------------------------------------------------------------

export interface AgentRow {
    id: number;
    name: string;
    slug: string;
    description: string;
    ai_model: string;
    thinking_level: ThinkingLevel;
    autonomy_level: AutonomyLevel;
    adapter_type: AdapterType;
    primary_use_case: string;
    workspace_id: string;
    user_id: string;
}

// -----------------------------------------------------------------------------
// Execution Options & Context (v2 - simplified)
// -----------------------------------------------------------------------------

export interface StartExecutionOptions {
    request: ExecutionRequest;
    stream: StreamSink;
    triggerType?: TriggerType;
}

export interface ToolCallDetail {
    call_id: string;
    tool_name: string;
    arguments?: Record<string, unknown>;
    result?: unknown;
    success?: boolean;
    duration_ms?: number;
    started_at: number;
}

export interface PipelineContext {
    executionId: string;
    stream: StreamSink;
    request: ExecutionRequest;
    agent: AgentRow | null;
    sandboxId: string | null;
    sessionHandle: SessionHandle | null;
    laneId: string | null;
    startedAt: number;
    sessionId: string;
    inputTokens: number;
    outputTokens: number;
    toolCallCount: number;
    status: ExecutionStatus;
    /** Log buffer offset captured before sendExecuteCommand so stream reader skips old events */
    streamOffset: number;
    conversationId: string | null;
    /** SDK session ID from conversations table (for --resume on crash recovery) */
    sdkSessionId: string | null;
    /** Accumulated agent response text from token/agent_output events */
    responseText: string;
    /** Chunks of response text collected from streaming events, joined at finalization */
    responseChunks: string[];
    /** Accumulated credits consumed from credit_usage events (set during streaming) */
    creditsUsed: number;
    /** Whether the resolved API key is user-provided (byok) or platform-owned */
    keySource: KeySource | null;
    /** Number of agent sessions that completed (incremented on each session_ended event) */
    agentSessionCount: number;
    /** Batches subagent completion notifications for user inbox */
    announceQueue: AnnounceQueueService | null;
    /** Accumulated reasoning/thinking chunks from reasoning events */
    thinkingChunks: string[];
    /** Accumulated tool call details for structured persistence */
    toolCallDetails: ToolCallDetail[];
    /** O(1) lookup map for tool call details by call_id */
    toolCallMap: Map<string, ToolCallDetail>;
    /** Number of runner events filtered out due to agent_slug mismatch */
    eventsFiltered: number;
    /** Setup report from runFullWorkspaceSetup (null if sandbox was already warm) */
    setupReport: { git_initialized: boolean; memory_git_initialized: boolean; sqlite_installed: boolean; duration_ms: number } | null;
    /** Post-execution shell hook health check result (null if check skipped or failed) */
    hookHealth: HookHealth | null;
    /** Trigger type that initiated this execution (user_message, heartbeat, schedule, etc.) */
    triggerType: TriggerType;
}

// -----------------------------------------------------------------------------
// Hook Health (shell hook observability)
// -----------------------------------------------------------------------------

export interface HookHealthAuditEntry {
    hook: string;
    agent: string;
    ts: string;
    ok: boolean;
}

export interface HookHealth {
    hooks_fired: string[];
    hooks_expected_missing: string[];
    audit_entries: number;
    activity_entries: number;
    company_db_initialized: boolean;
    checked_at: string;
}
