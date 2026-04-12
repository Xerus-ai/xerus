// SessionEnd Hook
// Clean shutdown hook. Fires when execution completes normally.
// Orchestrates memory persistence to Git repo (.memory/) with pgvector indexing,
// handles sandbox lifecycle, and posts results to inbox.
//
// ARCHITECTURE (Feb 2025): Git-based memory. See docs/planning/execution/git-memory-system.md
// - Memory files live in .memory/ Git repo (source of truth)
// - Neon pgvector is search index only (not primary storage)
// - This hook: extracts memories -> writes to .memory/ -> git commit -> async pgvector index

import { SessionEndInput } from './hooks.types';
import type {
    SessionEndContext,
    SessionEndHandlerDeps,
    SessionEndHandlerResult,
    SessionCompletionUpdate,
    ActivityEntry,
} from './session-end.types';

// -----------------------------------------------------------------------------
// SessionEndHandler Class
// -----------------------------------------------------------------------------

/**
 * Handler for SessionEnd hook events.
 *
 * Responsibilities (ordered by criticality):
 * 1. Extract Memories - Use MemoryExtractor (Haiku) to classify session content
 * 2. Persist to Git - Write to .memory/ files, git commit, trigger pgvector indexing
 * 3. DRM Compression - Compress old episodic entries (lossless->daily->weekly->monthly)
 * 4. Trigger ACE Reflection - Evaluate agent performance asynchronously
 * 5. Update execution_sessions - Record execution stats
 * 6. Emit SSE session_ended - Notify frontend
 * 7. Sandbox Lifecycle Decision - Pause sandbox if appropriate
 * 8. Check Skill Creation - Suggest skill if novel problem solved
 * 9. Append Activity Log - Write to data/activity.jsonl (last, least critical)
 *
 * ARCHITECTURE (Feb 2025): Git-based memory
 * - .memory/ Git repo is source of truth
 * - Agent reads from .memory/agents/{slug}/*.md
 * - This hook writes to .memory/ and commits
 * - pgvector is search index only (async update)
 * - See docs/planning/execution/git-memory-system.md
 */
export class SessionEndHandler {
    private readonly deps: SessionEndHandlerDeps;
    private readonly context: SessionEndContext;

    constructor(deps: SessionEndHandlerDeps, context: SessionEndContext) {
        this.deps = deps;
        this.context = context;
    }

    /**
     * Handle the SessionEnd event
     */
    async handle(input: SessionEndInput): Promise<SessionEndHandlerResult> {
        const result: SessionEndHandlerResult = { success: true };

        // 1. Extract and persist memories to Git repo
        result.commitSha = await this.extractAndPersistMemories(input);

        // 2. Compress old episodic entries in working.md (DRM tiers)
        result.entries_compressed = await this.compressOldMemories();

        // 3. Trigger ACE reflection (async, non-blocking)
        await this.triggerACEReflection(input);

        // 4. Update execution_sessions with completion stats
        await this.updateExecutionSession(input);

        // 5. Emit SSE session_ended event
        this.emitSessionEnded(input);

        // 6. Handle sandbox lifecycle (pause if appropriate)
        result.sandbox_paused = await this.handleSandboxLifecycle(input);

        // 7. Check for skill creation opportunity
        result.skill_suggestion = await this.checkSkillOpportunity(input);

        // 8. Notify channel if async task
        if (this.context.is_async_task && this.context.channel_id) {
            result.channel_notified = true;
        }

        // 9. Append to data/activity.jsonl (agent-visible execution trace)
        // Runs last: all critical work above is already complete.
        await this.appendActivityEntry(input);

        return result;
    }

    /**
     * Extract memories from session transcript and persist to .memory/ Git repo.
     *
     * Flow:
     * 1. Get session transcript (from SDK input or workspace)
     * 2. Extract memories using MemoryExtractor (Haiku LLM call)
     * 3. Write to .memory/agents/{slug}/*.md files
     * 4. Git commit with structured message
     * 5. Trigger async pgvector indexing
     *
     * Fail-fast: throws if extraction or persistence fails.
     */
    private async extractAndPersistMemories(input: SessionEndInput): Promise<string> {
        const transcript = this.buildTranscript(input);

        if (!transcript) {
            return '';
        }

        const memories = await this.deps.memoryExtractor.extract(transcript, this.context.agent_slug);

        const { commitSha } = await this.deps.gitMemoryService.writeAndCommit({
            workspaceId: this.context.workspace_id,
            agentSlug: this.context.agent_slug,
            memories,
            commitMessage: `session-end:${this.context.agent_slug}: ${memories.digest_line}`,
            projectSlug: this.context.project_slug,
            channelSlug: this.context.channel_slug,
        });

        this.deps.gitMemoryService.triggerIndexing(this.context.workspace_id, commitSha);
        return commitSha;
    }

    /**
     * Build a transcript string from SessionEnd input.
     * Used as input for memory extraction.
     */
    private buildTranscript(input: SessionEndInput): string | null {
        const parts: string[] = [];

        if (input.final_response) {
            parts.push(`Final Response:\n${input.final_response}`);
        }

        if (input.tool_calls && input.tool_calls.length > 0) {
            const toolSummary = input.tool_calls
                .map((tc: unknown) => {
                    if (typeof tc === 'object' && tc !== null && 'name' in tc) {
                        const name = (tc as Record<string, unknown>).name;
                        return `- ${typeof name === 'string' ? name : 'unknown'}`;
                    }
                    return '- unknown';
                })
                .join('\n');
            parts.push(`Tools Used:\n${toolSummary}`);
        }

        return parts.length > 0 ? parts.join('\n\n') : null;
    }

    /**
     * Compress old episodic entries in working.md using DRM decay tiers.
     * Runs after memory extraction so newly written entries are included.
     * Returns count of entries compressed (0 if nothing old enough).
     */
    private async compressOldMemories(): Promise<number> {
        const result = await this.deps.drmCompressor.compressWorkingMemory({
            workspaceId: this.context.workspace_id,
            agentSlug: this.context.agent_slug,
        });
        return result.entriesCompressed;
    }

    /**
     * Trigger ACE reflection to evaluate agent performance.
     * Fail-fast: throws if ACE reflection fails.
     */
    private async triggerACEReflection(input: SessionEndInput): Promise<void> {
        await this.deps.aceService.triggerReflection({
            agent_id: this.context.agent_id,
            session_id: input.session_id,
            response: input.final_response,
            tool_calls: input.tool_calls,
        });
    }

    /**
     * Update the execution_sessions table with completion statistics.
     */
    private async updateExecutionSession(input: SessionEndInput): Promise<void> {
        const update: SessionCompletionUpdate = {
            status: 'completed',
            input_tokens: input.usage?.input_tokens,
            output_tokens: input.usage?.output_tokens,
            completed_at: new Date(),
            agent_response: input.final_response,
        };

        await this.deps.executionSessionRepository.updateSession(this.context.run_id, update);
    }

    /**
     * Append execution summary to data/activity.jsonl.
     * Gives Xerus master and other agents visibility into what ran.
     * ~150-200 bytes per entry. Runs after all critical steps in handle().
     */
    private async appendActivityEntry(input: SessionEndInput): Promise<void> {
        const durationMs = Date.now() - this.context.session_start_time.getTime();
        const taskSummary = (input.final_response || '').slice(0, 100).replace(/\n/g, ' ');

        const entry: ActivityEntry = {
            ts: new Date().toISOString(),
            agent: this.context.agent_slug,
            task: taskSummary,
            status: 'completed',
            duration_ms: durationMs,
            tokens: {
                in: input.usage?.input_tokens ?? 0,
                out: input.usage?.output_tokens ?? 0,
            },
            trigger: 'manual',
        };

        await this.deps.activityWriter.appendEntry(entry);
    }

    /**
     * Emit SSE session_ended event to notify frontend.
     */
    private emitSessionEnded(input: SessionEndInput): void {
        this.deps.streamHandler.send('session_ended', {
            run_id: this.context.run_id,
            agent_id: this.context.agent_id,
            final_response: input.final_response,
            usage: input.usage,
            completed_at: new Date().toISOString(),
        });
    }

    /**
     * Handle sandbox lifecycle decision.
     * - Pause sandbox if will_pause is true and no other active executions
     *
     * Pausing is cheap as stopped sandboxes only incur disk cost.
     * Archive for long-term cold storage.
     * Fail-fast: throws if sandbox pause fails.
     */
    private async handleSandboxLifecycle(input: SessionEndInput): Promise<boolean> {
        if (!input.will_pause) {
            return false;
        }

        const activeCount = this.deps.sandboxService.getActiveExecutionCount(this.context.user_id);
        if (activeCount > 0) {
            return false;
        }

        const result = await this.deps.sandboxService.pauseSandbox(this.context.user_id);
        return result.success;
    }

    /**
     * Check if the agent solved a novel problem that could become a skill.
     * Fail-fast: throws if skill check fails.
     */
    private async checkSkillOpportunity(input: SessionEndInput): Promise<string | undefined> {
        if (!input.final_response || !input.tool_calls || input.tool_calls.length === 0) {
            return undefined;
        }

        const suggestion = await this.deps.skillSuggester.checkForSkillOpportunity({
            tool_calls: input.tool_calls,
            response: input.final_response,
        });

        return suggestion || undefined;
    }
}

// -----------------------------------------------------------------------------
// Factory Function
// -----------------------------------------------------------------------------

/**
 * Create a hook handler function for SessionEnd events.
 * This function matches the HookHandler signature expected by the hooks system.
 */
export function createSessionEndHandler(
    deps: SessionEndHandlerDeps,
    context: SessionEndContext
): (input: SessionEndInput) => Promise<SessionEndHandlerResult> {
    const handler = new SessionEndHandler(deps, context);
    return (input: SessionEndInput) => handler.handle(input);
}
