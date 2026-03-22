// SessionStart Hook Tests
// Tests for context manifest setup and workspace initialization

import {
    SessionStartHandler,
    SessionStartHandlerResult,
    SessionStartContext,
    SessionStartHandlerDeps,
    ContextFileEntry,
    createSessionStartHandler,
} from '../session-start.hook';
import { SessionStartInput, HookResult } from '../hooks.types';

// -----------------------------------------------------------------------------
// In-Memory Test Implementations (NOT mocks)
// -----------------------------------------------------------------------------

class InMemoryWorkspaceScanner {
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

class InMemoryWorkspaceWriter {
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

class InMemoryMemoryRepoInitializer {
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

class InMemorySessionAnalytics {
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

function createTestInput(overrides: Partial<SessionStartInput> = {}): SessionStartInput {
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

function createTestContext(overrides: Partial<SessionStartContext> = {}): SessionStartContext {
    return {
        agent_id: 123,
        agent_slug: 'test-agent',
        user_id: 'user-456',
        workspace_id: 'workspace-001',
        workspace_path: '/workspace/agents/test-agent',
        ...overrides,
    };
}

interface TestDeps extends SessionStartHandlerDeps {
    workspaceScanner: InMemoryWorkspaceScanner;
    workspaceWriter: InMemoryWorkspaceWriter;
    memoryRepoInitializer: InMemoryMemoryRepoInitializer;
    sessionAnalytics: InMemorySessionAnalytics;
}

function createTestDeps(): TestDeps {
    const scanner = new InMemoryWorkspaceScanner();
    // Pre-populate all required directories as existing
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

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('SessionStartHandler', () => {
    describe('constructor', () => {
        it('should create handler with required dependencies', () => {
            const deps = createTestDeps();
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            expect(handler).toBeInstanceOf(SessionStartHandler);
        });
    });

    describe('handle', () => {
        it('should return successful result on normal execution', async () => {
            const deps = createTestDeps();
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            const result = await handler.handle(createTestInput());

            expect(result.success).toBe(true);
        });

        it('should return index_path in result', async () => {
            const deps = createTestDeps();
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            const result = await handler.handle(createTestInput());

            expect(result.index_path).toBe('context/index.md');
        });

        it('should return context_file_count in result', async () => {
            const deps = createTestDeps();
            deps.workspaceScanner.addFiles('context', [
                { path: 'context/memory/working.md', size: 1024 },
                { path: 'context/ace/playbook.md', size: 2048 },
            ]);
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            const result = await handler.handle(createTestInput());

            expect(result.context_file_count).toBe(2);
        });

        it('should return memory_initialized flag', async () => {
            const deps = createTestDeps();
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            const result = await handler.handle(createTestInput());

            expect(result.memory_initialized).toBe(true);
        });

        it('should return directories_verified list', async () => {
            const deps = createTestDeps();
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            const result = await handler.handle(createTestInput());

            expect(result.directories_verified).toContain('context');
            expect(result.directories_verified).toContain('context/memory');
            expect(result.directories_verified).toContain('output');
        });
    });

    describe('directory verification', () => {
        it('should verify all required directories', async () => {
            const deps = createTestDeps();
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            const result = await handler.handle(createTestInput());

            expect(result.directories_verified).toEqual([
                'context',
                'context/memory',
                'context/knowledge',
                'context/ace',
                'context/trigger',
                'output',
            ]);
        });

        it('should create missing directories', async () => {
            const deps = createTestDeps();
            // Remove a directory so it appears missing
            deps.workspaceScanner = new InMemoryWorkspaceScanner();
            // Only add some dirs - context/ace and output are "missing"
            deps.workspaceScanner.addDirectory('context');
            deps.workspaceScanner.addDirectory('context/memory');
            deps.workspaceScanner.addDirectory('context/knowledge');
            deps.workspaceScanner.addDirectory('context/trigger');

            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            await handler.handle(createTestInput());

            // Should have created the missing ones
            expect(deps.workspaceWriter.createdDirs).toContain('context/ace');
            expect(deps.workspaceWriter.createdDirs).toContain('output');
        });

        it('should not create directories that already exist', async () => {
            const deps = createTestDeps();
            // All dirs exist (default in createTestDeps)
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            await handler.handle(createTestInput());

            // No directories should have been created
            expect(deps.workspaceWriter.createdDirs).toHaveLength(0);
        });

        it('should throw if directory creation fails (fail-fast)', async () => {
            const deps = createTestDeps();
            deps.workspaceScanner = new InMemoryWorkspaceScanner();
            // No dirs exist
            deps.workspaceWriter.setFailure(new Error('Permission denied'));

            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            await expect(handler.handle(createTestInput())).rejects.toThrow('Permission denied');
        });
    });

    describe('memory repo initialization', () => {
        it('should ensure .memory/ repo is initialized with workspace_id', async () => {
            const deps = createTestDeps();
            const context = createTestContext({ workspace_id: 'ws-abc' });
            const handler = new SessionStartHandler(deps, context);

            await handler.handle(createTestInput());

            expect(deps.memoryRepoInitializer.ensureInitializedCalls).toHaveLength(1);
            expect(deps.memoryRepoInitializer.ensureInitializedCalls[0].workspaceId).toBe('ws-abc');
        });

        it('should ensure agent directory in .memory/agents/', async () => {
            const deps = createTestDeps();
            const context = createTestContext({ agent_slug: 'seo-agent' });
            const handler = new SessionStartHandler(deps, context);

            await handler.handle(createTestInput());

            expect(deps.memoryRepoInitializer.ensureAgentDirectoryCalls).toHaveLength(1);
            expect(deps.memoryRepoInitializer.ensureAgentDirectoryCalls[0].agentSlug).toBe('seo-agent');
        });

        it('should report memory_initialized=true when newly created', async () => {
            const deps = createTestDeps();
            deps.memoryRepoInitializer.setNewlyInitialized();
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            const result = await handler.handle(createTestInput());

            expect(result.memory_initialized).toBe(true);
        });

        it('should report memory_initialized=false when already existed', async () => {
            const deps = createTestDeps();
            deps.memoryRepoInitializer.setAlreadyInitialized();
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            const result = await handler.handle(createTestInput());

            expect(result.memory_initialized).toBe(false);
        });

        it('should throw if memory initialization fails (fail-fast)', async () => {
            const deps = createTestDeps();
            deps.memoryRepoInitializer.setFailure(new Error('Git init failed'));
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            await expect(handler.handle(createTestInput())).rejects.toThrow('Git init failed');
        });
    });

    describe('context scanning', () => {
        it('should scan context directory for files', async () => {
            const deps = createTestDeps();
            deps.workspaceScanner.addFiles('context', [
                { path: 'context/memory/working.md', size: 512 },
                { path: 'context/knowledge/brand-guide.md', size: 4096 },
            ]);
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            const result = await handler.handle(createTestInput());

            expect(result.context_file_count).toBe(2);
        });

        it('should handle empty context directory', async () => {
            const deps = createTestDeps();
            // No files added to scanner
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            const result = await handler.handle(createTestInput());

            expect(result.context_file_count).toBe(0);
        });

        it('should handle missing context directory gracefully', async () => {
            const deps = createTestDeps();
            // Remove context directory from known dirs
            deps.workspaceScanner = new InMemoryWorkspaceScanner();
            // context dir doesn't exist initially, but will be created in verifyDirectories
            // After creation, directoryExists is still false for scanner since we don't update it
            // The scan happens AFTER verification, so context dir should be checked
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            const result = await handler.handle(createTestInput());

            expect(result.context_file_count).toBe(0);
        });
    });

    describe('context manifest generation', () => {
        it('should write context/index.md', async () => {
            const deps = createTestDeps();
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            await handler.handle(createTestInput());

            expect(deps.workspaceWriter.writtenFiles.has('context/index.md')).toBe(true);
        });

        it('should include agent slug in manifest', async () => {
            const deps = createTestDeps();
            const context = createTestContext({ agent_slug: 'content-writer' });
            const handler = new SessionStartHandler(deps, context);

            await handler.handle(createTestInput());

            const content = deps.workspaceWriter.writtenFiles.get('context/index.md');
            expect(content).toContain('content-writer');
        });

        it('should group files by category in manifest', async () => {
            const deps = createTestDeps();
            deps.workspaceScanner.addFiles('context', [
                { path: 'context/memory/working.md', size: 1024 },
                { path: 'context/memory/episodic.md', size: 2048 },
                { path: 'context/knowledge/guide.pdf', size: 8192 },
                { path: 'context/ace/playbook.md', size: 512 },
            ]);
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            await handler.handle(createTestInput());

            const content = deps.workspaceWriter.writtenFiles.get('context/index.md')!;
            expect(content).toContain('## Memory');
            expect(content).toContain('## Knowledge Base');
            expect(content).toContain('## ACE Playbook');
            expect(content).toContain('context/memory/working.md');
            expect(content).toContain('context/knowledge/guide.pdf');
        });

        it('should show file sizes in KB', async () => {
            const deps = createTestDeps();
            deps.workspaceScanner.addFiles('context', [
                { path: 'context/memory/working.md', size: 2048 },
            ]);
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            await handler.handle(createTestInput());

            const content = deps.workspaceWriter.writtenFiles.get('context/index.md')!;
            expect(content).toContain('2.0 KB');
        });

        it('should handle empty manifest (no files)', async () => {
            const deps = createTestDeps();
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            await handler.handle(createTestInput());

            const content = deps.workspaceWriter.writtenFiles.get('context/index.md')!;
            expect(content).toContain('No context files available yet.');
        });

        it('should include trigger category in manifest', async () => {
            const deps = createTestDeps();
            deps.workspaceScanner.addFiles('context', [
                { path: 'context/trigger/heartbeat.md', size: 3072 },
            ]);
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            await handler.handle(createTestInput());

            const content = deps.workspaceWriter.writtenFiles.get('context/index.md')!;
            expect(content).toContain('## Trigger Context');
            expect(content).toContain('context/trigger/heartbeat.md');
        });

        it('should throw if manifest write fails (fail-fast)', async () => {
            const deps = createTestDeps();
            deps.workspaceWriter.setFailure(new Error('Disk full'));
            // Need scanner to exist but dirs to be present so we get past dir verification
            deps.workspaceScanner = new InMemoryWorkspaceScanner();
            deps.workspaceScanner.addDirectory('context');
            deps.workspaceScanner.addDirectory('context/memory');
            deps.workspaceScanner.addDirectory('context/knowledge');
            deps.workspaceScanner.addDirectory('context/ace');
            deps.workspaceScanner.addDirectory('context/trigger');
            deps.workspaceScanner.addDirectory('output');

            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            await expect(handler.handle(createTestInput())).rejects.toThrow('Disk full');
        });
    });

    describe('analytics recording', () => {
        it('should record session start with correct data', async () => {
            const deps = createTestDeps();
            const context = createTestContext({
                agent_id: 789,
                user_id: 'user-xyz',
            });
            const handler = new SessionStartHandler(deps, context);

            const input = createTestInput({
                session_id: 'sess-abc',
                trigger_type: 'heartbeat',
            });

            await handler.handle(input);

            expect(deps.sessionAnalytics.records).toHaveLength(1);
            const record = deps.sessionAnalytics.records[0];
            expect(record.agent_id).toBe(789);
            expect(record.user_id).toBe('user-xyz');
            expect(record.trigger_type).toBe('heartbeat');
            expect(record.session_id).toBe('sess-abc');
            expect(record.timestamp).toBeInstanceOf(Date);
        });

        it('should throw if analytics recording fails (fail-fast)', async () => {
            const deps = createTestDeps();
            deps.sessionAnalytics.setFailure(new Error('Analytics DB down'));
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            await expect(handler.handle(createTestInput())).rejects.toThrow('Analytics DB down');
        });
    });

    describe('execution order', () => {
        it('should execute steps in correct order', async () => {
            const executionOrder: string[] = [];
            const deps = createTestDeps();

            // Track execution order through call tracking
            const originalListFiles = deps.workspaceScanner.listFiles.bind(deps.workspaceScanner);
            deps.workspaceScanner.listFiles = async (dirPath: string) => {
                executionOrder.push('scan');
                return originalListFiles(dirPath);
            };

            const originalEnsureInit = deps.memoryRepoInitializer.ensureInitialized.bind(deps.memoryRepoInitializer);
            deps.memoryRepoInitializer.ensureInitialized = async (workspaceId: string) => {
                executionOrder.push('memory_init');
                return originalEnsureInit(workspaceId);
            };

            const originalEnsureDir = deps.memoryRepoInitializer.ensureAgentDirectory.bind(deps.memoryRepoInitializer);
            deps.memoryRepoInitializer.ensureAgentDirectory = async (agentSlug: string) => {
                executionOrder.push('agent_dir');
                return originalEnsureDir(agentSlug);
            };

            const originalWriteFile = deps.workspaceWriter.writeFile.bind(deps.workspaceWriter);
            deps.workspaceWriter.writeFile = async (filePath: string, content: string) => {
                executionOrder.push('write_manifest');
                return originalWriteFile(filePath, content);
            };

            const originalRecord = deps.sessionAnalytics.recordSessionStart.bind(deps.sessionAnalytics);
            deps.sessionAnalytics.recordSessionStart = async (record: Parameters<typeof originalRecord>[0]) => {
                executionOrder.push('analytics');
                return originalRecord(record);
            };

            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);
            await handler.handle(createTestInput());

            expect(executionOrder).toEqual([
                'memory_init',
                'agent_dir',
                'scan',
                'write_manifest',
                'analytics',
            ]);
        });
    });
});

describe('createSessionStartHandler', () => {
    it('should create a handler function', () => {
        const deps = createTestDeps();
        const context = createTestContext();
        const handlerFn = createSessionStartHandler(deps, context);

        expect(typeof handlerFn).toBe('function');
    });

    it('should return HookResult-compatible output', async () => {
        const deps = createTestDeps();
        const context = createTestContext();
        const handlerFn = createSessionStartHandler(deps, context);

        const result: HookResult = await handlerFn(createTestInput());

        expect(result.success).toBe(true);
    });

    it('should return full SessionStartHandlerResult', async () => {
        const deps = createTestDeps();
        const context = createTestContext();
        const handlerFn = createSessionStartHandler(deps, context);

        const result = await handlerFn(createTestInput()) as SessionStartHandlerResult;

        expect(result.index_path).toBeDefined();
        expect(result.context_file_count).toBeDefined();
        expect(result.memory_initialized).toBeDefined();
        expect(result.directories_verified).toBeDefined();
    });
});
