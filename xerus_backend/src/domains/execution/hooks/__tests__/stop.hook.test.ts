// Stop Hook Tests
// Tests for emergency save on agent stop/termination

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '..', '.env') });

import {
    StopHandler,
    StopHandlerDeps,
    StopContext,
} from '../stop.hook';
import { StopInput } from '../hooks.types';
import { StreamEvent } from '../../types';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createTestInput(overrides: Partial<StopInput> = {}): StopInput {
    return {
        session_id: 'test-session-123',
        transcript_path: '/workspace/transcript.jsonl',
        cwd: '/workspace',
        execution_id: 'exec-789',
        stop_reason: 'complete',
        has_unsaved_memory: false,
        partial_output: undefined,
        task_title: 'Test Task',
        ...overrides,
    };
}

function createTestContext(overrides: Partial<StopContext> = {}): StopContext {
    return {
        agent_id: 123,
        user_id: 'user-456',
        agent_slug: 'test-agent',
        workspace_path: '/workspace/agents/test-agent',
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// Mock Dependencies
// -----------------------------------------------------------------------------

class InMemoryWorkspaceWriter {
    public writtenFiles: Array<{ path: string; content: string }> = [];
    public appendedFiles: Array<{ path: string; content: string }> = [];
    public existingFiles: Set<string> = new Set();
    public shouldFail = false;

    async writeFile(filePath: string, content: string): Promise<void> {
        if (this.shouldFail) {
            throw new Error('Write failed');
        }
        this.writtenFiles.push({ path: filePath, content });
        this.existingFiles.add(filePath);
    }

    async appendFile(filePath: string, content: string): Promise<void> {
        if (this.shouldFail) {
            throw new Error('Append failed');
        }
        this.appendedFiles.push({ path: filePath, content });
    }

    async exists(filePath: string): Promise<boolean> {
        return this.existingFiles.has(filePath);
    }

    setExists(filePath: string): void {
        this.existingFiles.add(filePath);
    }

    clear(): void {
        this.writtenFiles = [];
        this.appendedFiles = [];
        this.existingFiles.clear();
        this.shouldFail = false;
    }
}

class InMemoryStateSync {
    public syncedSessions: Array<{ sessionId: string; reason: string; partialOutput?: string }> = [];
    public shouldFail = false;

    async syncSessionState(
        sessionId: string,
        reason: string,
        partialOutput?: string
    ): Promise<void> {
        if (this.shouldFail) {
            throw new Error('Sync failed');
        }
        this.syncedSessions.push({ sessionId, reason, partialOutput });
    }

    clear(): void {
        this.syncedSessions = [];
        this.shouldFail = false;
    }
}

class InMemorySSEEmitter {
    public emittedEvents: StreamEvent[] = [];

    emit(event: StreamEvent): void {
        this.emittedEvents.push(event);
    }

    getLastEvent(): StreamEvent | undefined {
        return this.emittedEvents[this.emittedEvents.length - 1];
    }

    clear(): void {
        this.emittedEvents = [];
    }
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('StopHandler', () => {
    let handler: StopHandler;
    let inMemoryWriter: InMemoryWorkspaceWriter;
    let inMemoryStateSync: InMemoryStateSync;
    let inMemorySSE: InMemorySSEEmitter;
    let context: StopContext;

    beforeEach(() => {
        inMemoryWriter = new InMemoryWorkspaceWriter();
        inMemoryStateSync = new InMemoryStateSync();
        inMemorySSE = new InMemorySSEEmitter();
        context = createTestContext();

        const deps: StopHandlerDeps = {
            workspaceWriter: inMemoryWriter,
            stateSync: inMemoryStateSync,
            sseEmitter: inMemorySSE,
        };

        handler = new StopHandler(deps, context);
    });

    afterEach(() => {
        inMemoryWriter.clear();
        inMemoryStateSync.clear();
        inMemorySSE.clear();
    });

    describe('handle', () => {
        it('should return success for normal completion', async () => {
            const input = createTestInput({ stop_reason: 'complete' });

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
        });

        it('should emit stop SSE event', async () => {
            const input = createTestInput({ stop_reason: 'user_cancel' });

            await handler.handle(input);

            expect(inMemorySSE.emittedEvents).toHaveLength(1);
            const event = inMemorySSE.getLastEvent();
            expect(event?.type).toBe('stop');
        });

        it('should sync session state to database', async () => {
            const input = createTestInput({
                session_id: 'session-xyz',
                stop_reason: 'timeout',
                partial_output: 'partial work done',
            });

            await handler.handle(input);

            expect(inMemoryStateSync.syncedSessions).toHaveLength(1);
            expect(inMemoryStateSync.syncedSessions[0]).toEqual({
                sessionId: 'session-xyz',
                reason: 'timeout',
                partialOutput: 'partial work done',
            });
        });
    });

    describe('emergency save', () => {
        it('should write working.md when has_unsaved_memory is true', async () => {
            const input = createTestInput({
                has_unsaved_memory: true,
                partial_output: 'Current progress: step 1 complete',
            });

            await handler.handle(input);

            expect(inMemoryWriter.writtenFiles).toHaveLength(1);
            expect(inMemoryWriter.writtenFiles[0].path).toContain('working.md');
            expect(inMemoryWriter.writtenFiles[0].content).toContain('Current progress');
        });

        it('should include stop reason in emergency save content', async () => {
            const input = createTestInput({
                has_unsaved_memory: true,
                stop_reason: 'user_cancel',
                partial_output: 'Some work',
                task_title: 'Important Task',
            });

            await handler.handle(input);

            const content = inMemoryWriter.writtenFiles[0].content;
            expect(content).toContain('user_cancel');
            expect(content).toContain('Important Task');
        });

        it('should not write when has_unsaved_memory is false', async () => {
            const input = createTestInput({
                has_unsaved_memory: false,
                partial_output: 'Some output',
            });

            await handler.handle(input);

            expect(inMemoryWriter.writtenFiles).toHaveLength(0);
        });

        it('should throw when write fails (fail-fast)', async () => {
            inMemoryWriter.shouldFail = true;
            const input = createTestInput({
                has_unsaved_memory: true,
                partial_output: 'Some work',
            });

            // Fail-fast: errors propagate
            await expect(handler.handle(input)).rejects.toThrow('Write failed');
        });

        it('should append to existing working.md', async () => {
            // Use path.join for cross-platform compatibility
            const workingMdPath = path.join('/workspace/agents/test-agent', 'context', 'memory', 'working.md');
            inMemoryWriter.setExists(workingMdPath);

            const input = createTestInput({
                has_unsaved_memory: true,
                partial_output: 'New progress',
            });

            await handler.handle(input);

            expect(inMemoryWriter.appendedFiles).toHaveLength(1);
            expect(inMemoryWriter.appendedFiles[0].path).toContain('working.md');
            expect(inMemoryWriter.appendedFiles[0].content).toContain('New progress');
        });
    });

    describe('SSE event content', () => {
        it('should include stop reason in event', async () => {
            const input = createTestInput({ stop_reason: 'error' });

            await handler.handle(input);

            const event = inMemorySSE.getLastEvent();
            expect(event?.content).toMatchObject({
                reason: 'error',
            });
        });

        it('should include execution_id in event', async () => {
            const input = createTestInput({ execution_id: 'exec-abc' });

            await handler.handle(input);

            const event = inMemorySSE.getLastEvent();
            expect(event?.execution_id).toBe('exec-abc');
        });

        it('should include task_title when available', async () => {
            const input = createTestInput({ task_title: 'Build Feature X' });

            await handler.handle(input);

            const event = inMemorySSE.getLastEvent();
            expect(event?.content).toMatchObject({
                task_title: 'Build Feature X',
            });
        });
    });

    describe('state sync', () => {
        it('should throw when stateSync fails (fail-fast)', async () => {
            inMemoryStateSync.shouldFail = true;
            const input = createTestInput();

            // Fail-fast: errors propagate
            await expect(handler.handle(input)).rejects.toThrow('Sync failed');
        });

        it('should pass all required fields to sync', async () => {
            const input = createTestInput({
                session_id: 'sess-123',
                stop_reason: 'complete',
                partial_output: 'Final output',
            });

            await handler.handle(input);

            expect(inMemoryStateSync.syncedSessions[0]).toEqual({
                sessionId: 'sess-123',
                reason: 'complete',
                partialOutput: 'Final output',
            });
        });
    });

    describe('stop reasons', () => {
        const reasons: Array<StopInput['stop_reason']> = ['user_cancel', 'timeout', 'error', 'complete'];

        it.each(reasons)('should handle stop_reason: %s', async (reason) => {
            const input = createTestInput({ stop_reason: reason });

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
            expect(inMemorySSE.getLastEvent()?.content).toMatchObject({ reason });
        });
    });

    describe('direct instantiation', () => {
        it('should create handler with correct types', () => {
            const deps: StopHandlerDeps = {
                workspaceWriter: inMemoryWriter,
                stateSync: inMemoryStateSync,
                sseEmitter: inMemorySSE,
            };
            const stopHandler = new StopHandler(deps, context);

            expect(stopHandler).toBeInstanceOf(StopHandler);
        });

        it('should work as a hook handler', async () => {
            const deps: StopHandlerDeps = {
                workspaceWriter: inMemoryWriter,
                stateSync: inMemoryStateSync,
                sseEmitter: inMemorySSE,
            };
            const stopHandler = new StopHandler(deps, context);
            const input = createTestInput();

            const result = await stopHandler.handle(input);

            expect(result.success).toBe(true);
        });
    });
});
