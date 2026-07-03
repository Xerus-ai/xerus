// SessionStart Hook Tests — Context Manifest, Analytics, and Execution Order
// Split from session-start.hook.test.ts for the 400-line file limit

import { SessionStartHandler } from '../session-start.hook';
import {
    InMemoryWorkspaceScanner,
    createTestInput,
    createTestContext,
    createTestDeps,
} from './session-start-test-deps';

describe('SessionStartHandler — context manifest generation', () => {
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

describe('SessionStartHandler — analytics recording', () => {
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

describe('SessionStartHandler — execution order', () => {
    it('should execute steps in correct order', async () => {
        const executionOrder: string[] = [];
        const deps = createTestDeps();

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
