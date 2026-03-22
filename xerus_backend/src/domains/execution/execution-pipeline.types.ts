// Execution Pipeline Types (v2)
// Simplified types for thin backend router.
// Prompt assembly, context building, hooks removed - runner handles those.
// See: docs/planning/execution/EXECUTION_ARCHITECTURE_v2.md Section 10

import type { StreamingResponse } from './streaming/stream.handler';
import type { SDKService } from './sdk/sdk.service';
import type { SandboxService } from './sandbox/sandbox.service';
import type { ExecutionQueueService } from './queue/execution-queue.service';
import type { CreditTracker } from './credits/credit-tracker.service';
import type {
    ExecutionRequest,
    ExecutionStatus,
    ThinkingLevel,
    AutonomyLevel,
} from './types';
import type { KeySource } from './key-resolver.service';
import type { TriggerType } from './queue/execution-lane.types';
import type { SessionHandle } from './sandbox/providers/daytona-runner';
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
    sdkService: SDKService | null;
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
    sdkService: SDKService;
    sandboxService: SandboxService;
    queueService: ExecutionQueueService;
    creditTracker: CreditTracker;
    db: ExecutionDatabase;
    memorySearchIndex: MemorySearchIndexService | null;
    messageBridge: MessageBridgeService | null;
    hitlHandler: HITLHandler;
    activeStreamEmitter: ActiveStreamEmitter | null;
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
    primary_use_case: string;
    workspace_id: string;
    user_id: string;
}

// -----------------------------------------------------------------------------
// Execution Options & Context (v2 - simplified)
// -----------------------------------------------------------------------------

export interface StartExecutionOptions {
    request: ExecutionRequest;
    stream: StreamingResponse;
    triggerType?: TriggerType;
}

export interface PipelineContext {
    executionId: string;
    stream: StreamingResponse;
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
    toolCallDetails: Array<{
        call_id: string;
        tool_name: string;
        arguments?: Record<string, unknown>;
        result?: unknown;
        success?: boolean;
        duration_ms?: number;
        started_at: number;
    }>;
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
