// UserPromptSubmit Hook
// Primary context preparation hook. Fires before agent's first turn.
// Delegates to Context Builder which writes context files (memory, KB, ACE).
// Returns short additionalContext pointing to context/index.md - NOT injecting tokens.

import { logger } from '../../../utils/logger';
import { UserPromptSubmitInput, HookResult } from './hooks.types';

const log = logger('UserPromptSubmitHook');

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Context provided when creating the UserPromptSubmit handler.
 * Contains execution-specific information not in the SDK input.
 */
export interface UserPromptSubmitContext {
    /** Database agent ID (number) */
    agent_id: number;
    /** Agent slug for workspace paths */
    agent_slug: string;
    /** User ID string */
    user_id: string;
    /** Trigger type that initiated this execution */
    trigger_type: string;
    /** Trigger-specific payload data */
    trigger_payload: Record<string, unknown>;
}

/**
 * Result from Context Builder service
 */
export interface ContextBuildResult {
    success: boolean;
    indexPath: string;
    filesWritten: string[];
}

/**
 * Extended result returned by UserPromptSubmit hook
 */
export interface UserPromptSubmitHandlerResult extends HookResult {
    /** Short context pointer for agent (NOT full context injection) */
    additional_context?: string;
    /** List of context files written to workspace */
    files_written?: string[];
    /** Number of ACE playbook entries written to context */
    ace_entries_written?: number;
}

// -----------------------------------------------------------------------------
// Dependency Interfaces
// -----------------------------------------------------------------------------

/**
 * Interface for Context Builder service (4.27)
 * Orchestrates writing all context files to workspace
 */
export interface ContextBuilder {
    /**
     * Build all context files for an agent execution
     * - Ensures .memory/ Git repo initialized (memory lives in .memory/, not context/memory/)
     * - Calls KB Workspace Sync (syncs knowledge files)
     * - Calls ACE Context File Writer (writes context/ace/playbook.md)
     * - Generates context/index.md with file listing
     */
    buildContextFiles(params: {
        agentSlug: string;
        userId: string;
        triggerType: string;
        triggerPayload: Record<string, unknown>;
    }): Promise<ContextBuildResult>;
}

/**
 * Interface for Workspace Manager
 */
export interface WorkspaceManagerInterface {
    /**
     * Refresh the context index file with current filesystem state
     */
    refreshContextIndex(agentSlug: string): Promise<void>;
}

/**
 * Result from ACE playbook context file write
 */
export interface AceWriteResult {
    success: boolean;
    file_path: string;
    entries_written: number;
    cached: boolean;
}

/**
 * Interface for ACE Context Writer (writes context/ace/playbook.md)
 * Queries ace_playbook table for relevant entries and writes formatted markdown.
 */
export interface AceContextWriter {
    /**
     * Write ACE playbook entries to context/ace/playbook.md
     * @param options - Agent identification for querying playbook
     * @returns Write result with entries_written count
     */
    writeContextFile(options: {
        agent_id: number;
        agent_slug: string;
    }): Promise<AceWriteResult>;
}

/**
 * Dependencies required by UserPromptSubmitHandler
 */
export interface UserPromptSubmitHandlerDeps {
    contextBuilder: ContextBuilder;
    workspaceManager: WorkspaceManagerInterface;
    aceContextWriter: AceContextWriter;
}

// -----------------------------------------------------------------------------
// UserPromptSubmitHandler Class
// -----------------------------------------------------------------------------

/**
 * Handler for UserPromptSubmit hook events.
 *
 * Responsibilities:
 * 1. Delegate to Context Builder - Write memory, KB, ACE files to workspace
 * 2. Refresh context index - Ensure context/index.md reflects current state
 * 3. Return short additionalContext - Point agent to context/index.md
 *
 * Key principle: This hook WRITES FILES, does NOT inject tokens into prompt.
 * The agent reads files on-demand using native SDK Read tool.
 * This replaces the v1 "memory subagent" pattern (expensive, slow) with
 * a file-based approach (cheap, fast).
 *
 * Context files written:
 * - context/knowledge/*.md - KB docs synced from S3
 * - context/ace/playbook.md - ACE behavioral guidance
 * - context/trigger/*.md - Trigger-specific context
 * - context/index.md - Summary of all available files
 *
 * Memory files (in .memory/) are managed by GitMemoryRepository:
 * - .memory/agents/{slug}/working.md - Current session state
 * - .memory/agents/{slug}/episodic.md - Past sessions
 * - .memory/agents/{slug}/semantic.md - Known facts
 * - .memory/agents/{slug}/procedural.md - Learned workflows
 */
export class UserPromptSubmitHandler {
    private readonly deps: UserPromptSubmitHandlerDeps;
    private readonly context: UserPromptSubmitContext;

    constructor(deps: UserPromptSubmitHandlerDeps, context: UserPromptSubmitContext) {
        this.deps = deps;
        this.context = context;
    }

    /**
     * Handle the UserPromptSubmit event
     */
    async handle(_input: UserPromptSubmitInput): Promise<UserPromptSubmitHandlerResult> {
        // 1. Build all context files via Context Builder
        const buildResult = await this.buildContextFiles();

        // 2. Write ACE playbook context file (context/ace/playbook.md)
        const aceResult = await this.writeAcePlaybook();

        // 3. Refresh context index (best-effort, don't fail on error)
        await this.refreshContextIndex();

        // 4. Return result with short additionalContext pointer
        const filesWritten = [...buildResult.filesWritten];
        if (aceResult.entries_written > 0) {
            filesWritten.push(aceResult.file_path);
        }

        return {
            success: true,
            additional_context: 'Context files ready at context/index.md',
            files_written: filesWritten,
            ace_entries_written: aceResult.entries_written,
        };
    }

    /**
     * Write ACE playbook entries to context/ace/playbook.md.
     * Queries ace_playbook table for relevant entries and writes formatted markdown.
     * Fail-fast: throws if ACE write fails.
     */
    private async writeAcePlaybook(): Promise<AceWriteResult> {
        return this.deps.aceContextWriter.writeContextFile({
            agent_id: this.context.agent_id,
            agent_slug: this.context.agent_slug,
        });
    }

    /**
     * Delegate to Context Builder to write all context files.
     * Context Builder orchestrates:
     * - Memory File Writer (4.19)
     * - KB Workspace Sync (4.21)
     * - ACE Context File Writer (4.58)
     * - Trigger context writers
     */
    private async buildContextFiles(): Promise<ContextBuildResult> {
        const result = await this.deps.contextBuilder.buildContextFiles({
            agentSlug: this.context.agent_slug,
            userId: this.context.user_id,
            triggerType: this.context.trigger_type,
            triggerPayload: this.context.trigger_payload,
        });

        if (!result.success) {
            throw new Error(`Context build failed for agent ${this.context.agent_slug}`);
        }

        return result;
    }

    /**
     * Refresh the context/index.md file to reflect current filesystem state.
     * This ensures the index is up-to-date after Context Builder writes files.
     * Non-critical - log warning but don't fail on error.
     */
    private async refreshContextIndex(): Promise<void> {
        try {
            await this.deps.workspaceManager.refreshContextIndex(this.context.agent_slug);
        } catch (error) {
            log.warn('Failed to refresh context index', { error: (error as Error).message });
        }
    }
}

// -----------------------------------------------------------------------------
// Factory Function
// -----------------------------------------------------------------------------

/**
 * Create a hook handler function for UserPromptSubmit events.
 * This function matches the HookHandler signature expected by the hooks system.
 */
export function createUserPromptSubmitHandler(
    deps: UserPromptSubmitHandlerDeps,
    context: UserPromptSubmitContext
): (input: UserPromptSubmitInput) => Promise<UserPromptSubmitHandlerResult> {
    const handler = new UserPromptSubmitHandler(deps, context);
    return (input: UserPromptSubmitInput) => handler.handle(input);
}
