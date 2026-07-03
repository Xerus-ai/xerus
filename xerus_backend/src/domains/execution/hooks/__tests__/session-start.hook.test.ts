// SessionStart Hook Tests
// Tests for context manifest setup and workspace initialization

import {
    SessionStartHandler,
    SessionStartHandlerResult,
    createSessionStartHandler,
} from '../session-start.hook';
import type { HookResult } from '../hooks.types';
import {
    InMemoryWorkspaceScanner,
    createTestInput,
    createTestContext,
    createTestDeps,
} from './session-start-test-deps';

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
            deps.workspaceScanner = new InMemoryWorkspaceScanner();
            deps.workspaceScanner.addDirectory('context');
            deps.workspaceScanner.addDirectory('context/memory');
            deps.workspaceScanner.addDirectory('context/knowledge');
            deps.workspaceScanner.addDirectory('context/trigger');

            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            await handler.handle(createTestInput());

            expect(deps.workspaceWriter.createdDirs).toContain('context/ace');
            expect(deps.workspaceWriter.createdDirs).toContain('output');
        });

        it('should not create directories that already exist', async () => {
            const deps = createTestDeps();
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            await handler.handle(createTestInput());

            expect(deps.workspaceWriter.createdDirs).toHaveLength(0);
        });

        it('should throw if directory creation fails (fail-fast)', async () => {
            const deps = createTestDeps();
            deps.workspaceScanner = new InMemoryWorkspaceScanner();
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
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            const result = await handler.handle(createTestInput());

            expect(result.context_file_count).toBe(0);
        });

        it('should handle missing context directory gracefully', async () => {
            const deps = createTestDeps();
            deps.workspaceScanner = new InMemoryWorkspaceScanner();
            const context = createTestContext();
            const handler = new SessionStartHandler(deps, context);

            const result = await handler.handle(createTestInput());

            expect(result.context_file_count).toBe(0);
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
