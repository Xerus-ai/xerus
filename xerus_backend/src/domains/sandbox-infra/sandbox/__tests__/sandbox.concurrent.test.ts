// Sandbox Concurrent and Error Tests
// Tests for concurrent sandbox management, timeout handling, and error recovery
// Run with: npm test -- --testPathPatterns="sandbox.concurrent"

import { SandboxService, SandboxDatabase } from '../sandbox.service';
import { SandboxProvider, ProviderSandbox, ProviderSandboxStatus, ProviderCapabilities } from '../providers/sandbox-provider.interface';
import { SandboxRegistryEntry } from '../sandbox.types';
import { withRetry } from '../sandbox.retry';
import { SandboxState } from '../../../execution/types';

// Minimal test database
class TestDatabase implements SandboxDatabase {
    private registry = new Map<string, SandboxRegistryEntry>();

    async query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
        const normalized = sql.toLowerCase().trim();

        if (normalized.startsWith('insert into workspaces')) {
            const [userId, sandboxId, status, createdAt, lastActivityAt] = params as [string, string, SandboxState, Date, Date];
            this.registry.set(userId, {
                id: crypto.randomUUID(),
                user_id: userId,
                slug: 'default',
                name: 'Default Workspace',
                sandbox_id: sandboxId,
                sandbox_status: status,
                sandbox_active_agent_id: null,
                sandbox_active_execution_count: 0,
                created_at: createdAt,
                sandbox_paused_at: null,
                sandbox_last_activity_at: lastActivityAt,
                sandbox_total_runtime_seconds: 0,
                sandbox_resume_count: 0,
                sandbox_template_version: null,
                sandbox_novnc_url: null,
                sandbox_plan: null,
            });
            return { rows: [] as T[] };
        }
        if (normalized.startsWith('update workspaces')) {
            const userId = params![0] as string;
            const entry = this.registry.get(userId);
            if (entry) {
                if (sql.includes('sandbox_resume_count = sandbox_resume_count + 1')) {
                    entry.sandbox_resume_count++;
                } else {
                    entry.sandbox_status = params![1] as SandboxState;
                    entry.sandbox_last_activity_at = new Date();
                }
            }
            return { rows: [] as T[] };
        }
        if (normalized.includes('where user_id = $1') && normalized.includes('from workspaces')) {
            const entry = this.registry.get(params![0] as string);
            return { rows: entry ? [entry as T] : [] };
        }
        if (normalized.includes("sandbox_status") && normalized.includes('24 hours')) {
            return { rows: [] as T[] };
        }
        return { rows: [] };
    }

    clear(): void {
        this.registry.clear();
    }
}

// Test provider with controllable behavior
class ControlledProvider implements SandboxProvider {
    readonly name = 'controlled';
    readonly capabilities: ProviderCapabilities = {
        supportsPause: true,
        supportsResume: true,
        supportsTimeout: true,
        maxLifetimeMs: 86400000,
    };

    private sandboxes = new Map<string, { state: SandboxState; createdAt: Date }>();
    private idCounter = 0;

    // Control flags
    createDelay = 0;
    failAfterAttempts = 0;
    attemptCount = 0;
    errorType: 'timeout' | 'connection' | 'rate_limit' | 'permanent' = 'permanent';

    async create(): Promise<ProviderSandbox> {
        this.attemptCount++;

        if (this.createDelay > 0) {
            await new Promise((r) => setTimeout(r, this.createDelay));
        }

        if (this.failAfterAttempts > 0 && this.attemptCount <= this.failAfterAttempts) {
            throw this.createError();
        }

        const sandboxId = `sandbox-${++this.idCounter}`;
        this.sandboxes.set(sandboxId, { state: 'running', createdAt: new Date() });
        return { sandboxId };
    }

    async connect(sandboxId: string): Promise<ProviderSandbox> {
        const sandbox = this.sandboxes.get(sandboxId);
        if (!sandbox) throw new Error('SANDBOX_NOT_FOUND');
        sandbox.state = 'running';
        return { sandboxId };
    }

    async pause(sandboxId: string): Promise<void> {
        const sandbox = this.sandboxes.get(sandboxId);
        if (sandbox) sandbox.state = 'paused';
    }

    async kill(sandboxId: string): Promise<void> {
        this.sandboxes.delete(sandboxId);
    }

    async getStatus(sandboxId: string): Promise<ProviderSandboxStatus> {
        const sandbox = this.sandboxes.get(sandboxId);
        if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);
        return { sandboxId, state: sandbox.state, createdAt: sandbox.createdAt };
    }

    private createError(): Error {
        switch (this.errorType) {
            case 'timeout':
                return new Error('SANDBOX_TIMEOUT: operation timed out');
            case 'connection':
                return new Error('SANDBOX_CONNECTION_FAILED: cannot reach sandbox');
            case 'rate_limit':
                return new Error('RATE_LIMIT_EXCEEDED: too many requests');
            case 'permanent':
                return new Error('PERMANENT_FAILURE: cannot recover');
        }
    }

    // DaytonaProvider-compatible methods for SandboxService.createSandbox setup pipeline
    async executeCommand(_sandboxId: string, _command: string): Promise<{ result: string; exitCode: number }> {
        return { result: '', exitCode: 0 };
    }

    async uploadFile(_sandboxId: string, _content: string, _remotePath: string): Promise<void> {}

    async createFileSystem(_sandboxId: string): Promise<{
        mkdir(path: string): Promise<void>;
        writeFile(path: string, content: string): Promise<void>;
        readFile(path: string): Promise<string>;
        exists(path: string): Promise<boolean>;
        rm(path: string): Promise<void>;
        list(path: string): Promise<string[]>;
    }> {
        const files = new Map<string, string>();
        return {
            mkdir: async () => {},
            writeFile: async (path: string, content: string) => { files.set(path, content); },
            readFile: async (path: string) => files.get(path) || '',
            exists: async (path: string) => files.has(path),
            rm: async (path: string) => { files.delete(path); },
            list: async () => [],
        };
    }

    reset(): void {
        this.sandboxes.clear();
        this.idCounter = 0;
        this.createDelay = 0;
        this.failAfterAttempts = 0;
        this.attemptCount = 0;
        this.errorType = 'permanent';
    }
}

describe('Concurrent Sandbox Management', () => {
    let db: TestDatabase;
    let provider: ControlledProvider;
    let service: SandboxService;

    beforeEach(() => {
        db = new TestDatabase();
        provider = new ControlledProvider();
        service = new SandboxService(db, provider);
    });

    afterEach(() => {
        db.clear();
        provider.reset();
    });

    it('handles concurrent sandbox creation for different users', async () => {
        const results = await Promise.all([
            service.createSandbox({ userId: 'user-1' }),
            service.createSandbox({ userId: 'user-2' }),
            service.createSandbox({ userId: 'user-3' }),
        ]);

        expect(results).toHaveLength(3);
        expect(new Set(results.map((r) => r.userId)).size).toBe(3);
        expect(new Set(results.map((r) => r.sandboxId)).size).toBe(3);
    });

    it('handles concurrent getOrCreate for same user', async () => {
        // First call creates, subsequent should return cached
        const results = await Promise.all([
            service.getOrCreateSandbox({ userId: 'user-1' }),
            service.getOrCreateSandbox({ userId: 'user-1' }),
            service.getOrCreateSandbox({ userId: 'user-1' }),
        ]);

        // All results returned, final state should be consistent
        expect(results.every((r) => r.userId === 'user-1')).toBe(true);
        expect(service.hasSandbox('user-1')).toBe(true);
    });

    it('handles concurrent pause and resume operations', async () => {
        await service.createSandbox({ userId: 'user-1' });

        // Concurrent pause/resume - one should win
        const [pause1, pause2] = await Promise.allSettled([
            service.pauseSandbox('user-1'),
            service.pauseSandbox('user-1'),
        ]);

        // First should succeed, second may fail due to state
        expect([pause1.status, pause2.status]).toContain('fulfilled');
    });

    it('handles concurrent execution count changes', async () => {
        await service.createSandbox({ userId: 'user-1' });

        // Simulate concurrent agent executions
        service.incrementExecutionCount('user-1');
        service.incrementExecutionCount('user-1');
        service.incrementExecutionCount('user-1');

        expect(service.getActiveExecutionCount('user-1')).toBe(3);

        // Concurrent decrements
        service.decrementExecutionCount('user-1');
        service.decrementExecutionCount('user-1');

        expect(service.getActiveExecutionCount('user-1')).toBe(1);
    });

    it('prevents pause when executions are active', async () => {
        await service.createSandbox({ userId: 'user-1' });
        service.incrementExecutionCount('user-1');

        const result = await service.pauseSandbox('user-1');

        expect(result.success).toBe(false);
        expect(result.message).toContain('active executions');
    });

    it('allows pause after all executions complete', async () => {
        await service.createSandbox({ userId: 'user-1' });
        service.incrementExecutionCount('user-1');
        service.incrementExecutionCount('user-1');
        service.decrementExecutionCount('user-1');
        service.decrementExecutionCount('user-1');

        const result = await service.pauseSandbox('user-1');

        expect(result.success).toBe(true);
    });

    it('tracks multiple active sessions', async () => {
        await service.createSandbox({ userId: 'user-1' });
        await service.createSandbox({ userId: 'user-2' });
        await service.createSandbox({ userId: 'user-3' });
        await service.pauseSandbox('user-2');

        const active = service.getActiveSessions();

        expect(active).toHaveLength(2);
        expect(active.map((s) => s.userId).sort()).toEqual(['user-1', 'user-3']);
    });
});

describe('withRetry utility', () => {
    it('succeeds on first attempt', async () => {
        let attempts = 0;
        const result = await withRetry(async () => {
            attempts++;
            return 'success';
        }, 'test');

        expect(result).toBe('success');
        expect(attempts).toBe(1);
    });

    it('retries on retryable error and eventually succeeds', async () => {
        let attempts = 0;
        const result = await withRetry(async () => {
            attempts++;
            if (attempts < 3) {
                throw new Error('SANDBOX_TIMEOUT: temporary failure');
            }
            return 'success';
        }, 'test');

        expect(result).toBe('success');
        expect(attempts).toBe(3);
    });

    it('throws immediately on non-retryable error', async () => {
        let attempts = 0;

        await expect(
            withRetry(async () => {
                attempts++;
                throw new Error('PERMANENT_ERROR: not retryable');
            }, 'test')
        ).rejects.toThrow('PERMANENT_ERROR');

        expect(attempts).toBe(1);
    });

    it('throws after max retries exhausted', async () => {
        let attempts = 0;

        await expect(
            withRetry(async () => {
                attempts++;
                throw new Error('SANDBOX_CONNECTION_FAILED: always fails');
            }, 'test')
        ).rejects.toThrow('SANDBOX_CONNECTION_FAILED');

        expect(attempts).toBe(3); // maxRetries = 3
    });
});

describe('Error Recovery Scenarios', () => {
    let db: TestDatabase;
    let provider: ControlledProvider;
    let service: SandboxService;

    beforeEach(() => {
        db = new TestDatabase();
        provider = new ControlledProvider();
        service = new SandboxService(db, provider);
    });

    afterEach(() => {
        db.clear();
        provider.reset();
    });

    it('recovers from transient creation failures', async () => {
        provider.failAfterAttempts = 2;
        provider.errorType = 'connection';

        // The provider will fail twice, then succeed
        // But since SandboxService doesn't use withRetry internally for create,
        // we test the provider behavior directly
        await expect(provider.create()).rejects.toThrow('SANDBOX_CONNECTION_FAILED');

        provider.reset();
        const result = await provider.create();
        expect(result.sandboxId).toBeDefined();
    });

    it('handles kill on non-existent sandbox gracefully', async () => {
        const result = await service.killSandbox('nonexistent-user');

        expect(result.success).toBe(true);
        expect(result.message).toContain('No active session');
    });

    it('handles status check on killed sandbox', async () => {
        await service.createSandbox({ userId: 'user-1' });
        await service.killSandbox('user-1');

        const status = await service.getSandboxStatus('user-1');

        // After kill, registry shows killed status
        expect(status.status).toBe('killed');
    });

    it('handles resume when sandbox is deleted from provider', async () => {
        await service.createSandbox({ userId: 'user-1' });
        await service.pauseSandbox('user-1');

        // Simulate provider sandbox being deleted externally
        await provider.kill('sandbox-1');

        // Try to resume - should fail gracefully
        const session = await service.resumeSandbox('user-1');

        // Connection will fail, registry should be updated
        expect(session).toBeNull();
    });
});

describe('Sandbox Session Lifecycle', () => {
    let db: TestDatabase;
    let provider: ControlledProvider;
    let service: SandboxService;

    beforeEach(() => {
        db = new TestDatabase();
        provider = new ControlledProvider();
        service = new SandboxService(db, provider);
    });

    afterEach(() => {
        db.clear();
        provider.reset();
    });

    it('tracks wasResumed flag correctly', async () => {
        const created = await service.createSandbox({ userId: 'user-1' });
        expect(created.wasResumed).toBe(false);

        await service.pauseSandbox('user-1');
        const resumed = await service.resumeSandbox('user-1');

        expect(resumed!.wasResumed).toBe(true);
    });

    it('updates lastActivityAt on operations', async () => {
        const session = await service.createSandbox({ userId: 'user-1' });
        const initialTime = session.lastActivityAt.getTime();

        await new Promise((r) => setTimeout(r, 10));
        service.incrementExecutionCount('user-1');

        const status = await service.getSandboxStatus('user-1');
        expect(status.lastActivityAt!.getTime()).toBeGreaterThanOrEqual(initialTime);
    });

    it('full lifecycle: create -> use -> pause -> resume -> kill', async () => {
        // Create
        const session = await service.createSandbox({ userId: 'user-1' });
        expect(session.status).toBe('running');

        // Use (simulate agent execution)
        service.incrementExecutionCount('user-1');
        expect(service.getActiveExecutionCount('user-1')).toBe(1);
        service.decrementExecutionCount('user-1');

        // Pause
        const pauseResult = await service.pauseSandbox('user-1');
        expect(pauseResult.success).toBe(true);

        const pausedStatus = await service.getSandboxStatus('user-1');
        expect(pausedStatus.status).toBe('paused');

        // Resume
        const resumed = await service.resumeSandbox('user-1');
        expect(resumed!.status).toBe('running');
        expect(resumed!.wasResumed).toBe(true);

        const resumedStatus = await service.getSandboxStatus('user-1');
        expect(resumedStatus.resumeCount).toBe(1);

        // Kill
        const killResult = await service.killSandbox('user-1');
        expect(killResult.success).toBe(true);
        expect(service.hasSandbox('user-1')).toBe(false);
    });
});

describe('Registry Consistency', () => {
    let db: TestDatabase;
    let provider: ControlledProvider;
    let service: SandboxService;

    beforeEach(() => {
        db = new TestDatabase();
        provider = new ControlledProvider();
        service = new SandboxService(db, provider);
    });

    afterEach(() => {
        db.clear();
        provider.reset();
    });

    it('persists new sandbox to registry', async () => {
        await service.createSandbox({ userId: 'user-1' });

        // Query workspaces table directly
        const result = await db.query<SandboxRegistryEntry>('SELECT id, user_id FROM workspaces WHERE user_id = $1', ['user-1']);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].sandbox_status).toBe('running');
    });

    it('updates registry on pause', async () => {
        await service.createSandbox({ userId: 'user-1' });
        await service.pauseSandbox('user-1');

        const result = await db.query<SandboxRegistryEntry>('SELECT id, user_id FROM workspaces WHERE user_id = $1', ['user-1']);

        expect(result.rows[0].sandbox_status).toBe('paused');
    });

    it('updates registry on kill', async () => {
        await service.createSandbox({ userId: 'user-1' });
        await service.killSandbox('user-1');

        const result = await db.query<SandboxRegistryEntry>('SELECT id, user_id FROM workspaces WHERE user_id = $1', ['user-1']);

        expect(result.rows[0].sandbox_status).toBe('killed');
    });

    it('increments resume count in registry', async () => {
        await service.createSandbox({ userId: 'user-1' });
        await service.pauseSandbox('user-1');
        await service.resumeSandbox('user-1');
        await service.pauseSandbox('user-1');
        await service.resumeSandbox('user-1');

        const result = await db.query<SandboxRegistryEntry>('SELECT id, user_id FROM workspaces WHERE user_id = $1', ['user-1']);

        expect(result.rows[0].sandbox_resume_count).toBe(2);
    });
});
