// PreCompact Hook
// Saves critical state before context compaction.
// Extracts memories from pre-compaction context using LLM (Haiku),
// writes to .memory/ Git repo, and triggers pgvector indexing.
//
// ARCHITECTURE (Feb 2025): Git-based memory. See docs/planning/execution/git-memory-system.md
// - PreCompact fires when SDK detects context nearing capacity
// - Extracts memories from current session state (working summary, decisions, todos)
// - Writes to .memory/agents/{slug}/*.md files via Git commit
// - Triggers async pgvector indexing
// - Emits SSE context_warning event with compaction_starting flag
//
// Pattern: cc-context-awareness (graduated thresholds) - PostToolUse does steering,
// PreCompact does the actual save before SDK compresses context.

import { PreCompactInput, HookResult } from './hooks.types';
import { StreamEvent, ContextWarningEventContent } from '../types';
import { createContextWarningEvent } from '../streaming/stream.events';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Context provided when creating the PreCompact handler.
 * Contains execution-specific information not in the SDK input.
 */
export interface PreCompactContext {
    /** Database agent ID (number) */
    agent_id: number;
    /** Agent slug for .memory/ path (e.g., 'seo-agent') */
    agent_slug: string;
    /** User ID string */
    user_id: string;
    /** Workspace ID for git-memory scoping */
    workspace_id: string;
    /** Execution ID for SSE events */
    execution_id: string;
    /** Number of compactions that have occurred in this session */
    compaction_count: number;
    /** Project slug (optional, for scoped memory) */
    project_slug?: string;
    /** Channel slug (optional, for scoped memory) */
    channel_slug?: string;
}

/**
 * Extended result returned by PreCompact hook
 */
export interface PreCompactHandlerResult extends HookResult {
    /** Updated compaction count after this compaction */
    compaction_count: number;
    /** Git commit SHA from memory persistence */
    commit_sha?: string;
}

// -----------------------------------------------------------------------------
// Dependency Interfaces
// -----------------------------------------------------------------------------

/**
 * Extracted memories from session context.
 * Matches the ExtractedMemories type from session-end.hook.ts.
 */
export interface PreCompactExtractedMemories {
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
export interface PreCompactMemoryExtractor {
    /**
     * Extract memories from session transcript using LLM (Haiku)
     * @param transcript - The assembled transcript to extract from
     * @param agentSlug - Agent identifier for context
     * @returns Structured extracted memories
     */
    extract(transcript: string, agentSlug: string): Promise<PreCompactExtractedMemories>;
}

/**
 * Interface for writing memories to Git repo (tasks 4.116 + 4.118)
 */
export interface PreCompactGitMemoryService {
    /**
     * Write extracted memories to .memory/ Git repo and commit
     */
    writeAndCommit(params: {
        workspaceId: string;
        agentSlug: string;
        memories: PreCompactExtractedMemories;
        commitMessage: string;
        projectSlug?: string;
        channelSlug?: string;
    }): Promise<{ commitSha: string }>;

    /**
     * Trigger async pgvector indexing of changed files.
     * Non-blocking - returns immediately.
     */
    triggerIndexing(workspaceId: string, commitSha: string): void;
}

/**
 * Interface for SSE streaming
 */
export interface PreCompactSSEEmitter {
    emit(event: StreamEvent): void;
}

/**
 * Dependencies required by PreCompactHandler
 */
export interface PreCompactHandlerDeps {
    memoryExtractor: PreCompactMemoryExtractor;
    gitMemoryService: PreCompactGitMemoryService;
    sseEmitter: PreCompactSSEEmitter;
}

// -----------------------------------------------------------------------------
// PreCompactHandler Class
// -----------------------------------------------------------------------------

/**
 * Handler for PreCompact hook events.
 *
 * Responsibilities:
 * 1. Build transcript from current session state (todos, decisions, issues, summary)
 * 2. Extract memories using MemoryExtractor (Haiku LLM call)
 * 3. Persist to .memory/ Git repo with structured commit message
 * 4. Trigger async pgvector indexing
 * 5. Emit SSE context_warning event with compaction_starting flag
 * 6. Return updated compaction count
 *
 * ARCHITECTURE (Feb 2025): Git-based memory
 * - .memory/ Git repo is source of truth
 * - Commit message: "compact:{slug}:ctx-{N}: {digest_line}"
 * - After compaction, agent re-reads .memory/agents/{slug}/working.md
 * - See docs/planning/execution/git-memory-system.md
 */
export class PreCompactHandler {
    private readonly deps: PreCompactHandlerDeps;
    private readonly context: PreCompactContext;

    constructor(deps: PreCompactHandlerDeps, context: PreCompactContext) {
        this.deps = deps;
        this.context = context;
    }

    /**
     * Handle the PreCompact event
     */
    async handle(input: PreCompactInput): Promise<PreCompactHandlerResult> {
        const newCompactionCount = this.context.compaction_count + 1;

        // 1. Build transcript from current session state
        const transcript = this.buildTranscript(input);

        // 2. Extract memories using LLM (Haiku) - fail-fast on error
        const memories = await this.deps.memoryExtractor.extract(transcript, this.context.agent_slug);

        // 3. Persist to .memory/ Git repo - fail-fast on error
        const commitMessage = `compact:${this.context.agent_slug}:ctx-${newCompactionCount}: ${memories.digest_line}`;
        const { commitSha } = await this.deps.gitMemoryService.writeAndCommit({
            workspaceId: this.context.workspace_id,
            agentSlug: this.context.agent_slug,
            memories,
            commitMessage,
            projectSlug: this.context.project_slug,
            channelSlug: this.context.channel_slug,
        });

        // 4. Trigger async pgvector indexing (non-blocking)
        this.deps.gitMemoryService.triggerIndexing(this.context.workspace_id, commitSha);

        // 5. Emit SSE context_warning event
        this.emitCompactionEvent(input.context_usage_percent);

        return {
            success: true,
            compaction_count: newCompactionCount,
            commit_sha: commitSha,
        };
    }

    // -------------------------------------------------------------------------
    // Private Methods
    // -------------------------------------------------------------------------

    /**
     * Build a transcript string from PreCompact input.
     * Assembles all available session state into a structured format
     * for the memory extractor to process.
     */
    private buildTranscript(input: PreCompactInput): string {
        const parts: string[] = [];

        parts.push(`Context Usage: ${input.context_usage_percent}%`);

        if (input.working_memory_summary) {
            parts.push(`Working Memory:\n${input.working_memory_summary}`);
        }

        if (input.key_decisions && input.key_decisions.length > 0) {
            const decisions = input.key_decisions.map((d) => `- ${d}`).join('\n');
            parts.push(`Key Decisions:\n${decisions}`);
        }

        if (input.open_issues && input.open_issues.length > 0) {
            const issues = input.open_issues.map((i) => `- ${i}`).join('\n');
            parts.push(`Open Issues:\n${issues}`);
        }

        if (input.current_todos && input.current_todos.length > 0) {
            const todos = input.current_todos
                .map((todo: unknown) => {
                    const t = todo as { status?: string; content?: string };
                    return `- [${t.status || 'unknown'}] ${t.content || 'No content'}`;
                })
                .join('\n');
            parts.push(`Current Todos:\n${todos}`);
        }

        return parts.join('\n\n');
    }

    /**
     * Emit SSE context_warning event indicating compaction is starting.
     * Frontend uses this to show compaction UI indicator.
     */
    private emitCompactionEvent(usagePercent: number): void {
        // SDK reports context_usage_percent; derive token estimates from model context window.
        // Claude models default to 200K token context. These are estimates for frontend display.
        const MODEL_CONTEXT_TOKENS = 200_000;
        const maxBudget = MODEL_CONTEXT_TOKENS;
        const currentUsage = Math.round((usagePercent / 100) * maxBudget);

        const content: ContextWarningEventContent = {
            warningType: usagePercent >= 92 ? 'at_limit' : 'approaching_limit',
            currentUsage,
            maxBudget,
            percentUsed: usagePercent,
        };

        const meta = {
            compaction_starting: true,
            compaction_count: this.context.compaction_count + 1,
            preserved_items: ['working_memory', 'key_decisions', 'open_issues', 'todos'],
        };

        const event = createContextWarningEvent(this.context.execution_id, content, meta);
        this.deps.sseEmitter.emit(event);
    }
}

// -----------------------------------------------------------------------------
// Factory Function
// -----------------------------------------------------------------------------

/**
 * Create a hook handler function for PreCompact events.
 * This function matches the HookHandler signature expected by the hooks system.
 */
export function createPreCompactHandler(
    deps: PreCompactHandlerDeps,
    context: PreCompactContext
): (input: PreCompactInput) => Promise<PreCompactHandlerResult> {
    const handler = new PreCompactHandler(deps, context);
    return (input: PreCompactInput) => handler.handle(input);
}
