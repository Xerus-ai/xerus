// Real in-memory test implementations for hook dependencies
// These are NOT mocks - they are real implementations that track calls for verification
//
// SessionEnd-specific deps live here.
// UserPromptSubmit deps: see user-prompt-submit-test-deps.ts

import type { SessionEndHandlerDeps, SessionCompletionUpdate } from '../session-end.types';

// -----------------------------------------------------------------------------
// Call Tracker - records method calls for verification
// -----------------------------------------------------------------------------

export interface MethodCall<TArgs extends unknown[] = unknown[], TResult = unknown> {
    args: TArgs;
    result: TResult;
    timestamp: number;
}

export class CallTracker<TArgs extends unknown[] = unknown[], TResult = unknown> {
    private calls: MethodCall<TArgs, TResult>[] = [];

    record(args: TArgs, result: TResult): void {
        this.calls.push({ args, result, timestamp: Date.now() });
    }

    getCalls(): MethodCall<TArgs, TResult>[] {
        return [...this.calls];
    }

    getLastCall(): MethodCall<TArgs, TResult> | undefined {
        return this.calls[this.calls.length - 1];
    }

    wasCalled(): boolean {
        return this.calls.length > 0;
    }

    wasCalledWith(...expectedArgs: TArgs): boolean {
        return this.calls.some(
            (call) => JSON.stringify(call.args) === JSON.stringify(expectedArgs)
        );
    }

    callCount(): number {
        return this.calls.length;
    }

    clear(): void {
        this.calls = [];
    }
}

// -----------------------------------------------------------------------------
// InMemoryMemoryExtractor (for git-memory architecture)
// -----------------------------------------------------------------------------

import type { ExtractedMemories } from '../session-end.types';

export class InMemoryMemoryExtractor {
    private defaultMemories: ExtractedMemories = {
        working: 'Current task in progress',
        episodic: [{ event: 'Session completed', outcome: 'success', scope: 'agent' }],
        semantic: [],
        procedural: [],
        digest_line: 'Completed session tasks',
    };
    readonly extractCalls = new CallTracker<[string, string], ExtractedMemories>();
    private shouldFail = false;
    private failureError: Error | null = null;

    setMemories(memories: ExtractedMemories): void {
        this.defaultMemories = memories;
    }

    setFailure(error: Error): void {
        this.shouldFail = true;
        this.failureError = error;
    }

    clearFailure(): void {
        this.shouldFail = false;
        this.failureError = null;
    }

    async extract(transcript: string, agentSlug: string): Promise<ExtractedMemories> {
        this.extractCalls.record([transcript, agentSlug], this.defaultMemories);
        if (this.shouldFail && this.failureError) {
            throw this.failureError;
        }
        return this.defaultMemories;
    }
}

// -----------------------------------------------------------------------------
// InMemoryGitMemoryService (for git-memory architecture)
// -----------------------------------------------------------------------------

export class InMemoryGitMemoryService {
    private commits: Array<{
        workspaceId: string;
        agentSlug: string;
        memories: ExtractedMemories;
        commitMessage: string;
        commitSha: string;
    }> = [];
    readonly writeAndCommitCalls = new CallTracker<
        [{ workspaceId: string; agentSlug: string; memories: ExtractedMemories; commitMessage: string; projectSlug?: string; channelSlug?: string }],
        { commitSha: string }
    >();
    readonly triggerIndexingCalls = new CallTracker<[string, string], void>();
    private shouldFail = false;
    private failureError: Error | null = null;
    private commitCounter = 0;

    setFailure(error: Error): void {
        this.shouldFail = true;
        this.failureError = error;
    }

    clearFailure(): void {
        this.shouldFail = false;
        this.failureError = null;
    }

    async writeAndCommit(params: {
        workspaceId: string;
        agentSlug: string;
        memories: ExtractedMemories;
        commitMessage: string;
        projectSlug?: string;
        channelSlug?: string;
    }): Promise<{ commitSha: string }> {
        const commitSha = `sha-${++this.commitCounter}`;
        const result = { commitSha };
        this.writeAndCommitCalls.record([params], result);
        if (this.shouldFail && this.failureError) {
            throw this.failureError;
        }
        this.commits.push({
            workspaceId: params.workspaceId,
            agentSlug: params.agentSlug,
            memories: params.memories,
            commitMessage: params.commitMessage,
            commitSha,
        });
        return result;
    }

    triggerIndexing(workspaceId: string, commitSha: string): void {
        this.triggerIndexingCalls.record([workspaceId, commitSha], undefined);
    }

    getCommits(): typeof this.commits {
        return [...this.commits];
    }
}

// -----------------------------------------------------------------------------
// InMemoryACEService
// -----------------------------------------------------------------------------

export class InMemoryACEService {
    private reflections: Array<{
        agentId: number;
        sessionId: string;
        response?: string;
        toolCalls?: unknown[];
    }> = [];
    readonly triggerReflectionCalls = new CallTracker<
        [{ agent_id: number; session_id: string; response?: string; tool_calls?: unknown[] }],
        void
    >();
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

    async triggerReflection(params: {
        agent_id: number;
        session_id: string;
        response?: string;
        tool_calls?: unknown[];
    }): Promise<void> {
        this.triggerReflectionCalls.record([params], undefined);
        if (this.shouldFail && this.failureError) {
            throw this.failureError;
        }
        this.reflections.push({
            agentId: params.agent_id,
            sessionId: params.session_id,
            response: params.response,
            toolCalls: params.tool_calls,
        });
    }

    getReflections(): typeof this.reflections {
        return [...this.reflections];
    }
}

// -----------------------------------------------------------------------------
// InMemorySandboxService (for SessionEnd)
// -----------------------------------------------------------------------------

export class InMemorySessionEndSandboxService {
    private paused: Set<string> = new Set();
    private activeExecutionCounts: Map<string, number> = new Map();
    readonly pauseSandboxCalls = new CallTracker<[string], { success: boolean }>();
    readonly getActiveExecutionCountCalls = new CallTracker<[string], number>();
    private pauseSuccess = true;

    setPauseSuccess(success: boolean): void {
        this.pauseSuccess = success;
    }

    setActiveExecutionCount(userId: string, count: number): void {
        this.activeExecutionCounts.set(userId, count);
    }

    async pauseSandbox(userId: string): Promise<{ success: boolean }> {
        const result = { success: this.pauseSuccess };
        this.pauseSandboxCalls.record([userId], result);
        if (this.pauseSuccess) {
            this.paused.add(userId);
        }
        return result;
    }

    getActiveExecutionCount(userId: string): number {
        const count = this.activeExecutionCounts.get(userId) ?? 0;
        this.getActiveExecutionCountCalls.record([userId], count);
        return count;
    }

    isPaused(userId: string): boolean {
        return this.paused.has(userId);
    }
}

// -----------------------------------------------------------------------------
// InMemoryExecutionSessionRepository
// -----------------------------------------------------------------------------

export class InMemoryExecutionSessionRepository {
    private sessions: Map<string, SessionCompletionUpdate> = new Map();
    readonly updateSessionCalls = new CallTracker<[string, SessionCompletionUpdate], void>();

    async updateSession(sessionId: string, update: SessionCompletionUpdate): Promise<void> {
        this.updateSessionCalls.record([sessionId, update], undefined);
        this.sessions.set(sessionId, { ...this.sessions.get(sessionId), ...update });
    }

    getSession(sessionId: string): SessionCompletionUpdate | undefined {
        return this.sessions.get(sessionId);
    }
}

// -----------------------------------------------------------------------------
// InMemoryStreamHandler
// -----------------------------------------------------------------------------

export class InMemoryStreamHandler {
    private events: Array<{ eventType: string; data: unknown }> = [];
    readonly sendCalls = new CallTracker<[string, unknown], void>();

    send(eventType: string, data: unknown): void {
        this.sendCalls.record([eventType, data], undefined);
        this.events.push({ eventType, data });
    }

    getEvents(): typeof this.events {
        return [...this.events];
    }

    getEventsByType(eventType: string): unknown[] {
        return this.events.filter((e) => e.eventType === eventType).map((e) => e.data);
    }
}

// -----------------------------------------------------------------------------
// InMemorySkillSuggester
// -----------------------------------------------------------------------------

export class InMemorySkillSuggester {
    private suggestion: string | null = null;
    readonly checkForSkillOpportunityCalls = new CallTracker<
        [{ tool_calls: unknown[]; response: string }],
        string | null
    >();

    setSuggestion(suggestion: string | null): void {
        this.suggestion = suggestion;
    }

    async checkForSkillOpportunity(params: {
        tool_calls: unknown[];
        response: string;
    }): Promise<string | null> {
        this.checkForSkillOpportunityCalls.record([params], this.suggestion);
        return this.suggestion;
    }
}

// -----------------------------------------------------------------------------
// InMemoryDRMCompressor
// -----------------------------------------------------------------------------

export class InMemoryDRMCompressor {
    private entriesCompressed = 0;
    readonly compressWorkingMemoryCalls = new CallTracker<
        [{ workspaceId: string; agentSlug: string }],
        { entriesCompressed: number }
    >();
    private shouldFail = false;
    private failureError: Error | null = null;

    setEntriesCompressed(count: number): void {
        this.entriesCompressed = count;
    }

    setFailure(error: Error): void {
        this.shouldFail = true;
        this.failureError = error;
    }

    clearFailure(): void {
        this.shouldFail = false;
        this.failureError = null;
    }

    async compressWorkingMemory(options: {
        workspaceId: string;
        agentSlug: string;
    }): Promise<{ entriesCompressed: number }> {
        const result = { entriesCompressed: this.entriesCompressed };
        this.compressWorkingMemoryCalls.record([options], result);
        if (this.shouldFail && this.failureError) {
            throw this.failureError;
        }
        return result;
    }
}

// -----------------------------------------------------------------------------
// Factory Functions
// -----------------------------------------------------------------------------

export interface TestSessionEndDeps extends SessionEndHandlerDeps {
    memoryExtractor: InMemoryMemoryExtractor;
    gitMemoryService: InMemoryGitMemoryService;
    aceService: InMemoryACEService;
    sandboxService: InMemorySessionEndSandboxService;
    executionSessionRepository: InMemoryExecutionSessionRepository;
    streamHandler: InMemoryStreamHandler;
    skillSuggester: InMemorySkillSuggester;
    drmCompressor: InMemoryDRMCompressor;
}

export function createTestSessionEndDeps(options?: {
    activeExecutionCount?: number;
}): TestSessionEndDeps {
    const sandboxService = new InMemorySessionEndSandboxService();
    if (options?.activeExecutionCount !== undefined) {
        sandboxService.setActiveExecutionCount('user-456', options.activeExecutionCount);
    }

    return {
        memoryExtractor: new InMemoryMemoryExtractor(),
        gitMemoryService: new InMemoryGitMemoryService(),
        aceService: new InMemoryACEService(),
        sandboxService,
        executionSessionRepository: new InMemoryExecutionSessionRepository(),
        streamHandler: new InMemoryStreamHandler(),
        skillSuggester: new InMemorySkillSuggester(),
        drmCompressor: new InMemoryDRMCompressor(),
        activityWriter: { appendEntry: async () => {} },
    };
}
