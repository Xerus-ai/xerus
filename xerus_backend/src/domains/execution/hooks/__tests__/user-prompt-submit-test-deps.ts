// Real in-memory test implementations for UserPromptSubmit hook dependencies
// Extracted from test-implementations.ts to keep files under 400 lines.

import { CallTracker } from './test-implementations';
import type { UserPromptSubmitHandlerDeps } from '../user-prompt-submit.hook';
import type { AceWriteResult } from '../user-prompt-submit.hook';

// -----------------------------------------------------------------------------
// InMemoryContextBuilder
// -----------------------------------------------------------------------------

export class InMemoryContextBuilder {
    private result: { success: boolean; indexPath: string; filesWritten: string[] } = {
        success: true,
        indexPath: 'context/index.md',
        filesWritten: ['context/ace/playbook.md', 'context/index.md'],
    };
    readonly buildContextFilesCalls = new CallTracker<
        [{ agentSlug: string; userId: string; triggerType: string; triggerPayload: Record<string, unknown> }],
        { success: boolean; indexPath: string; filesWritten: string[] }
    >();
    private shouldFail = false;
    private failureError: Error | null = null;

    setResult(result: { success: boolean; indexPath: string; filesWritten: string[] }): void {
        this.result = result;
    }

    setFailure(error: Error): void {
        this.shouldFail = true;
        this.failureError = error;
    }

    clearFailure(): void {
        this.shouldFail = false;
        this.failureError = null;
    }

    async buildContextFiles(params: {
        agentSlug: string;
        userId: string;
        triggerType: string;
        triggerPayload: Record<string, unknown>;
    }): Promise<{ success: boolean; indexPath: string; filesWritten: string[] }> {
        this.buildContextFilesCalls.record([params], this.result);
        if (this.shouldFail && this.failureError) {
            throw this.failureError;
        }
        return this.result;
    }
}

// -----------------------------------------------------------------------------
// InMemoryWorkspaceManager (for UserPromptSubmit)
// -----------------------------------------------------------------------------

export class InMemoryWorkspaceManager {
    readonly refreshContextIndexCalls = new CallTracker<[string], void>();
    private shouldFail = false;
    private failureError: Error | null = null;

    setFailure(error: Error): void {
        this.shouldFail = true;
        this.failureError = error;
    }

    clearFailure(): void {
        this.shouldFail = false;
        this.failureError = null;
    }

    async refreshContextIndex(agentSlug: string): Promise<void> {
        this.refreshContextIndexCalls.record([agentSlug], undefined);
        if (this.shouldFail && this.failureError) {
            throw this.failureError;
        }
    }
}

// -----------------------------------------------------------------------------
// InMemoryAceContextWriter
// -----------------------------------------------------------------------------

export class InMemoryAceContextWriter {
    private result: AceWriteResult = {
        success: true,
        file_path: 'context/ace/playbook.md',
        entries_written: 0,
        cached: false,
    };
    readonly writeContextFileCalls = new CallTracker<
        [{ agent_id: number; agent_slug: string }],
        AceWriteResult
    >();
    private shouldFail = false;
    private failureError: Error | null = null;

    setResult(result: AceWriteResult): void {
        this.result = result;
    }

    setFailure(error: Error): void {
        this.shouldFail = true;
        this.failureError = error;
    }

    clearFailure(): void {
        this.shouldFail = false;
        this.failureError = null;
    }

    async writeContextFile(options: {
        agent_id: number;
        agent_slug: string;
    }): Promise<AceWriteResult> {
        this.writeContextFileCalls.record([options], this.result);
        if (this.shouldFail && this.failureError) {
            throw this.failureError;
        }
        return this.result;
    }
}

// -----------------------------------------------------------------------------
// Factory: TestUserPromptSubmitDeps
// -----------------------------------------------------------------------------

export interface TestUserPromptSubmitDeps extends UserPromptSubmitHandlerDeps {
    contextBuilder: InMemoryContextBuilder;
    workspaceManager: InMemoryWorkspaceManager;
    aceContextWriter: InMemoryAceContextWriter;
}

export function createTestUserPromptSubmitDeps(): TestUserPromptSubmitDeps {
    return {
        contextBuilder: new InMemoryContextBuilder(),
        workspaceManager: new InMemoryWorkspaceManager(),
        aceContextWriter: new InMemoryAceContextWriter(),
    };
}
