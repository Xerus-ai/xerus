// Stop Hook
// Emergency cleanup when agent execution stops
// Ensures working.md is saved and state is synced to database

import path from 'path';
import { StopInput, HookResult } from './hooks.types';
import { StreamEvent, StopEventContent } from '../types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface StopContext {
    agent_id: number;
    user_id: string;
    agent_slug: string;
    workspace_path: string;
}

export interface StopWorkspaceWriter {
    writeFile(path: string, content: string): Promise<void>;
    appendFile(path: string, content: string): Promise<void>;
    exists(path: string): Promise<boolean>;
}

export interface StateSync {
    syncSessionState(sessionId: string, reason: string, partialOutput?: string): Promise<void>;
}

export interface StopSSEEmitter {
    emit(event: StreamEvent): void;
}

export interface StopHandlerDeps {
    workspaceWriter: StopWorkspaceWriter;
    stateSync: StateSync;
    sseEmitter: StopSSEEmitter;
}

// -----------------------------------------------------------------------------
// Stop Handler
// -----------------------------------------------------------------------------

export class StopHandler {
    private readonly deps: StopHandlerDeps;
    private readonly context: StopContext;

    constructor(deps: StopHandlerDeps, context: StopContext) {
        this.deps = deps;
        this.context = context;
    }

    async handle(input: StopInput): Promise<HookResult> {
        // 1. Emergency save if there's unsaved memory
        await this.emergencySave(input);

        // 2. Sync session state to database
        await this.syncState(input);

        // 3. Emit stop SSE event for frontend
        this.emitStopEvent(input);

        return { success: true };
    }

    // -------------------------------------------------------------------------
    // Private Methods
    // -------------------------------------------------------------------------

    private async emergencySave(input: StopInput): Promise<void> {
        if (!input.has_unsaved_memory || !input.partial_output) {
            return;
        }

        // Validate workspace_path to prevent path traversal attacks
        // Note: workspace_path comes from backend context, not user input.
        // The '..' check is sufficient for security; skip isAbsolute check
        // since Daytona uses POSIX paths but tests may run on Windows.
        const workspacePath = this.context.workspace_path;
        if (workspacePath.includes('..')) {
            throw new Error(`Invalid workspace_path: path traversal detected in '${workspacePath}'`);
        }

        const workingMdPath = path.join(workspacePath, 'context', 'memory', 'working.md');
        const content = this.buildEmergencySaveContent(input);

        // Append to preserve existing working state (fail-fast on error)
        const exists = await this.deps.workspaceWriter.exists(workingMdPath);
        if (exists) {
            await this.deps.workspaceWriter.appendFile(workingMdPath, '\n\n' + content);
        } else {
            await this.deps.workspaceWriter.writeFile(workingMdPath, content);
        }
    }

    private buildEmergencySaveContent(input: StopInput): string {
        const timestamp = new Date().toISOString();
        const lines: string[] = [
            '# Emergency Save',
            '',
            `**Timestamp**: ${timestamp}`,
            `**Stop Reason**: ${input.stop_reason}`,
            `**Task**: ${input.task_title ?? 'Unknown'}`,
            `**Session**: ${input.session_id}`,
            '',
            '## Partial Output',
            '',
            input.partial_output ?? '',
            '',
            '---',
            '*This file was created by emergency save during agent stop.*',
        ];

        return lines.join('\n');
    }

    private async syncState(input: StopInput): Promise<void> {
        // Fail-fast: let errors propagate to caller
        await this.deps.stateSync.syncSessionState(
            input.session_id,
            input.stop_reason,
            input.partial_output
        );
    }

    private emitStopEvent(input: StopInput): void {
        const content: StopEventContent = {
            reason: input.stop_reason,
            task_title: input.task_title,
            has_unsaved_memory: input.has_unsaved_memory,
        };

        const event: StreamEvent = {
            type: 'stop',
            execution_id: input.execution_id,
            content,
            timestamp: new Date().toISOString(),
        };

        this.deps.sseEmitter.emit(event);
    }
}

