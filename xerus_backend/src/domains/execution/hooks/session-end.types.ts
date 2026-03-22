// SessionEnd Hook Types
// Types and dependency interfaces for SessionEnd handler.
// Extracted from session-end.hook.ts to keep files under 400 lines.

import { HookResult } from './hooks.types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Context provided when creating the SessionEnd handler.
 * Contains execution-specific information not in the SDK input.
 */
export interface SessionEndContext {
    /** Database agent ID (number) */
    agent_id: number;
    /** Agent slug for .memory/ path (e.g., 'seo-agent') */
    agent_slug: string;
    /** User ID string */
    user_id: string;
    /** Workspace ID for git-memory scoping */
    workspace_id: string;
    /** Session ID for updating execution_sessions table */
    run_id: string;
    /** When the session started (for duration calculation) */
    session_start_time: Date;
    /** Whether this was an async/proactive task (needs channel notification) */
    is_async_task: boolean;
    /** Channel ID for posting completion message (if async) */
    channel_id?: string;
    /** Project slug (optional, for scoped memory) */
    project_slug?: string;
    /** Channel slug (optional, for scoped memory) */
    channel_slug?: string;
}

/**
 * Update payload for execution_sessions table
 */
export interface SessionCompletionUpdate {
    status: 'completed' | 'failed';
    input_tokens?: number;
    output_tokens?: number;
    completed_at: Date;
    agent_response?: string;
}

/**
 * Extended result returned by SessionEnd hook
 */
export interface SessionEndHandlerResult extends HookResult {
    /** Git commit SHA from memory persistence (empty if no memories extracted) */
    commitSha?: string;
    /** Whether the sandbox was paused */
    sandbox_paused?: boolean;
    /** Skill suggestion if novel solution detected */
    skill_suggestion?: string;
    /** Whether channel was notified (for async tasks) */
    channel_notified?: boolean;
    /** Number of old episodic entries compressed by DRM */
    entries_compressed?: number;
}

// -----------------------------------------------------------------------------
// Dependency Interfaces
// -----------------------------------------------------------------------------

/**
 * Extracted memories from session context.
 * Output from MemoryExtractor service.
 */
export interface ExtractedMemories {
    /** Current working state (overwrites working.md) */
    working: string;
    /** Session events to append to episodic.md */
    episodic: Array<{ event: string; outcome: string; scope: 'company' | 'project' | 'channel' | 'agent' }>;
    /** Facts learned to upsert in semantic.md */
    semantic: Array<{ fact: string; confidence: number; scope: 'company' | 'project' | 'channel' | 'agent' }>;
    /** Patterns learned to append to procedural.md */
    procedural: Array<{ pattern: string; steps: string[]; scope: 'company' | 'project' | 'channel' | 'agent' }>;
    /** One-line summary for digest */
    digest_line: string;
}

/**
 * Interface for LLM-based memory extraction (task 4.117)
 */
export interface MemoryExtractor {
    /**
     * Extract memories from session transcript using LLM (Haiku)
     * @param transcript - The conversation transcript to extract from
     * @param agentSlug - Agent identifier for context
     * @returns Structured extracted memories
     */
    extract(transcript: string, agentSlug: string): Promise<ExtractedMemories>;
}

/**
 * Interface for writing memories to Git repo (tasks 4.116 + 4.118)
 */
export interface GitMemoryService {
    /**
     * Write extracted memories to .memory/ Git repo and commit
     * @param params - Write parameters
     * @returns Git commit SHA
     */
    writeAndCommit(params: {
        workspaceId: string;
        agentSlug: string;
        memories: ExtractedMemories;
        commitMessage: string;
        projectSlug?: string;
        channelSlug?: string;
    }): Promise<{ commitSha: string }>;

    /**
     * Trigger async pgvector indexing of changed files
     * Non-blocking - returns immediately
     */
    triggerIndexing(workspaceId: string, commitSha: string): void;
}

/**
 * Interface for ACE (Agent Capability Evaluation) service
 */
export interface ACEService {
    /**
     * Trigger asynchronous reflection on agent performance
     * This evaluates the session and may update ACE entries
     */
    triggerReflection(params: {
        agent_id: number;
        session_id: string;
        response?: string;
        tool_calls?: unknown[];
    }): Promise<void>;
}

/**
 * Interface for sandbox lifecycle operations.
 * Named SessionEndSandboxService to avoid conflict with the main SandboxService class.
 */
export interface SessionEndSandboxService {
    /**
     * Pause the sandbox for a user
     * @returns Operation result with success status
     */
    pauseSandbox(userId: string): Promise<{ success: boolean }>;

    /**
     * Get number of active executions for a user's sandbox
     */
    getActiveExecutionCount(userId: string): number;
}

/**
 * Interface for execution session database operations
 */
export interface ExecutionSessionRepository {
    /**
     * Update an execution session with completion data
     */
    updateSession(sessionId: string, update: SessionCompletionUpdate): Promise<void>;
}

/**
 * Interface for SSE streaming
 */
export interface StreamHandler {
    /**
     * Send an SSE event
     */
    send(eventType: string, payload: unknown): void;
}

/**
 * Interface for skill creation suggestions
 */
export interface SkillSuggester {
    /**
     * Check if the session's output represents a novel solution
     * that could be turned into a reusable skill
     * @returns Suggested skill name/slug, or null if no opportunity
     */
    checkForSkillOpportunity(params: { tool_calls: unknown[]; response: string }): Promise<string | null>;
}

/**
 * Interface for DRM compression of old episodic memory entries.
 * Compresses working.md entries using decay tiers: lossless->daily->weekly->monthly.
 * See: git-memory/drm-compression.service.ts
 */
export interface DRMCompressor {
    compressWorkingMemory(options: {
        workspaceId: string;
        agentSlug: string;
    }): Promise<{ entriesCompressed: number }>;
}

/**
 * Interface for appending execution traces to shared/activity.jsonl.
 * Gives agents (especially Xerus master) visibility into what ran.
 */
export interface ActivityWriter {
    appendEntry(entry: ActivityEntry): Promise<void>;
}

/**
 * Single entry in shared/activity.jsonl.
 * ~150-200 bytes per line. Rolling 7-day window (trimmed by daily digest).
 */
export interface ActivityEntry {
    ts: string;
    agent: string;
    task: string;
    status: 'completed' | 'failed' | 'cancelled' | 'paused';
    duration_ms: number;
    tokens: { in: number; out: number };
    trigger: string;
    error?: string;
}

/**
 * Dependencies required by SessionEndHandler
 */
export interface SessionEndHandlerDeps {
    memoryExtractor: MemoryExtractor;
    gitMemoryService: GitMemoryService;
    aceService: ACEService;
    sandboxService: SessionEndSandboxService;
    executionSessionRepository: ExecutionSessionRepository;
    streamHandler: StreamHandler;
    skillSuggester: SkillSuggester;
    drmCompressor: DRMCompressor;
    activityWriter: ActivityWriter;
}
