// In-memory test implementations for SessionStart hook tests
// These are NOT mocks — they are real implementations that track calls for verification

import type {
    SessionStartHandlerDeps,
    SessionStartContext,
    ContextFileEntry,
} from '../session-start.hook';
import type { SessionStartInput } from '../hooks.types';

// -----------------------------------------------------------------------------
// In-Memory Test Implementations
// -----------------------------------------------------------------------------

export class InMemoryWorkspaceScanner {
    private files: Map<string, ContextFileEntry[]> = new Map();
    private directories: Set<string> = new Set();
    public listFilesCalls: Array<{ dirPath: string }> = [];
    public directoryExistsCalls: Array<{ dirPath: string }> = [];

    addFiles(dirPath: string, files: ContextFileEntry[]): void {
        this.files.set(dirPath, files);
    }

    addDirectory(dirPath: string): void {
        this.directories.add(dirPath);
    }

    async listFiles(dirPath: string): Promise<ContextFileEntry[]> {
        this.listFilesCalls.push({ dirPath });
        return this.files.get(dirPath) ?? [];
    }

    async directoryExists(dirPath: string): Promise<boolean> {
        this.directoryExistsCalls.push({ dirPath });
        return this.directories.has(dirPath);
    }
}

export class InMemoryWorkspaceWriter {
    public writtenFiles: Map<string, string> = new Map();
    public createdDirs: string[] = [];
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

    async writeFile(filePath: string, content: string): Promise<void> {
        if (this.shouldFail && this.failureError) {
            throw this.failureError;
        }
        this.writtenFiles.set(filePath, content);
    }

    async ensureDirectory(dirPath: string): Promise<void> {
        if (this.shouldFail && this.failureError) {
            throw this.failureError;
        }
        this.createdDirs.push(dirPath);
    }
}

export class InMemoryMemoryRepoInitializer {
    private initialized = false;
    private agentDirs: string[] = [];
    public ensureInitializedCalls: Array<{ workspaceId: string }> = [];
    public ensureAgentDirectoryCalls: Array<{ agentSlug: string }> = [];
    private shouldReturnNewlyInitialized = true;
    private shouldFail = false;
    private failureError: Error | null = null;

    setAlreadyInitialized(): void {
        this.shouldReturnNewlyInitialized = false;
    }

    setNewlyInitialized(): void {
        this.shouldReturnNewlyInitialized = true;
    }

    setFailure(error: Error): void {
        this.shouldFail = true;
        this.failureError = error;
    }

    clearFailure(): void {
        this.shouldFail = false;
        this.failureError = null;
    }

    async ensureInitialized(workspaceId: string): Promise<boolean> {
        this.ensureInitializedCalls.push({ workspaceId });
        if (this.shouldFail && this.failureError) {
            throw this.failureError;
        }
        const wasNew = this.shouldReturnNewlyInitialized && !this.initialized;
        this.initialized = true;
        return wasNew;
    }

    async ensureAgentDirectory(agentSlug: string): Promise<void> {
        this.ensureAgentDirectoryCalls.push({ agentSlug });
        if (this.shouldFail && this.failureError) {
            throw this.failureError;
        }
        this.agentDirs.push(agentSlug);
    }

    getAgentDirs(): string[] {
        return [...this.agentDirs];
    }
}

export class InMemorySessionAnalytics {
    public records: Array<{
        agent_id: number;
        user_id: string;
        trigger_type: string;
        session_id: string;
        timestamp: Date;
    }> = [];
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

    async recordSessionStart(record: {
        agent_id: number;
        user_id: string;
        trigger_type: string;
        session_id: string;
        timestamp: Date;
    }): Promise<void> {
        if (this.shouldFail && this.failureError) {
            throw this.failureError;
        }
        this.records.push(record);
    }
}

// -----------------------------------------------------------------------------
// Test Utilities
// -----------------------------------------------------------------------------

export function createTestInput(overrides: Partial<SessionStartInput> = {}): SessionStartInput {
    return {
        session_id: 'session-123',
        transcript_path: '/workspace/agents/test-agent/transcript.json',
        cwd: '/workspace/agents/test-agent',
        agent_id: 'agent-123',
        user_id: 'user-456',
        trigger_type: 'user_message',
        ...overrides,
    };
}

export function createTestContext(overrides: Partial<SessionStartContext> = {}): SessionStartContext {
    return {
        agent_id: 123,
        agent_slug: 'test-agent',
        user_id: 'user-456',
        workspace_id: 'workspace-001',
        workspace_path: '/workspace/agents/test-agent',
        ...overrides,
    };
}

export interface TestDeps extends SessionStartHandlerDeps {
    workspaceScanner: InMemoryWorkspaceScanner;
    workspaceWriter: InMemoryWorkspaceWriter;
    memoryRepoInitializer: InMemoryMemoryRepoInitializer;
    sessionAnalytics: InMemorySessionAnalytics;
}

export function createTestDeps(): TestDeps {
    const scanner = new InMemoryWorkspaceScanner();
    scanner.addDirectory('context');
    scanner.addDirectory('context/memory');
    scanner.addDirectory('context/knowledge');
    scanner.addDirectory('context/ace');
    scanner.addDirectory('context/trigger');
    scanner.addDirectory('output');

    return {
        workspaceScanner: scanner,
        workspaceWriter: new InMemoryWorkspaceWriter(),
        memoryRepoInitializer: new InMemoryMemoryRepoInitializer(),
        sessionAnalytics: new InMemorySessionAnalytics(),
    };
}
