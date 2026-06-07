// Sandbox Integration Tests
// Comprehensive tests for SandboxService with Daytona provider
// Target: >80% coverage for sandbox.service.ts
// Run with: npm test -- --testPathPattern="sandbox.integration"

import { SandboxService, SandboxDatabase } from '../sandbox.service';
import { SandboxProvider, ProviderSandbox, ProviderSandboxStatus, ProviderCapabilities } from '../providers/sandbox-provider.interface';
import { SandboxRegistryEntry } from '../sandbox.types';
import { SANDBOX_CONFIG, isEnvAllowed } from '../sandbox.config';
import { SandboxState } from '../../../execution/types';

// In-memory database for testing (no mocks - real implementation)
class TestDatabase implements SandboxDatabase {
    private registry = new Map<string, SandboxRegistryEntry>();

    async query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
        const normalized = sql.toLowerCase().trim();

        if (normalized.startsWith('insert into workspaces')) {
            return this.handleInsert(params!) as { rows: T[] };
        }
        if (normalized.startsWith('update workspaces')) {
            return this.handleUpdate(sql, params!) as { rows: T[] };
        }
        if (normalized.includes('where user_id = $1') && normalized.includes('from workspaces')) {
            return this.handleSelectByUser(params!) as { rows: T[] };
        }
        if (normalized.includes("sandbox_status in ('paused', 'running')") && normalized.includes('24 hours')) {
            return this.handleSelectStale() as { rows: T[] };
        }
        return { rows: [] };
    }

    private handleInsert(params: unknown[]): { rows: never[] } {
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
        return { rows: [] };
    }

    private handleUpdate(sql: string, params: unknown[]): { rows: never[] } {
        const userId = params[0] as string;
        const entry = this.registry.get(userId);
        if (!entry) return { rows: [] };

        if (sql.includes('sandbox_resume_count = sandbox_resume_count + 1')) {
            entry.sandbox_resume_count++;
            // markResumed also sets status to running and clears paused_at
            if (sql.includes("sandbox_status = 'running'")) {
                entry.sandbox_status = 'running';
                entry.sandbox_paused_at = null;
                entry.sandbox_last_activity_at = new Date();
            }
        } else {
            entry.sandbox_status = params[1] as SandboxState;
            entry.sandbox_last_activity_at = new Date();
            if (entry.sandbox_status === 'paused') entry.sandbox_paused_at = new Date();
        }
        return { rows: [] };
    }

    private handleSelectByUser(params: unknown[]): { rows: SandboxRegistryEntry[] } {
        const entry = this.registry.get(params[0] as string);
        return { rows: entry ? [entry] : [] };
    }

    private handleSelectStale(): { rows: SandboxRegistryEntry[] } {
        const threshold = 24 * 60 * 60 * 1000;
        const now = Date.now();
        const stale: SandboxRegistryEntry[] = [];
        for (const entry of this.registry.values()) {
            if ((entry.sandbox_status === 'paused' || entry.sandbox_status === 'running') && entry.sandbox_last_activity_at && now - entry.sandbox_last_activity_at.getTime() > threshold) {
                stale.push(entry);
            }
        }
        return { rows: stale };
    }

    setEntry(entry: SandboxRegistryEntry): void {
        this.registry.set(entry.user_id, entry);
    }

    getEntry(userId: string): SandboxRegistryEntry | undefined {
        return this.registry.get(userId);
    }

    clear(): void {
        this.registry.clear();
    }
}

// Test provider that simulates Daytona behavior (no mocks - real simulation)
class TestSandboxProvider implements SandboxProvider {
    readonly name = 'test';
    readonly capabilities: ProviderCapabilities = {
        supportsPause: true,
        supportsResume: true,
        supportsTimeout: true,
        maxLifetimeMs: 7 * 24 * 60 * 60 * 1000,
    };

    private sandboxes = new Map<string, { state: SandboxState; metadata?: Record<string, string>; createdAt: Date }>();
    public sandboxCount = 0;

    // Control test behavior
    shouldFailCreate = false;
    shouldFailConnect = false;
    shouldFailPause = false;
    createDelay = 0;
    connectDelay = 0;

    async create(options: { metadata?: Record<string, string> }): Promise<ProviderSandbox> {
        if (this.createDelay > 0) await this.sleep(this.createDelay);
        if (this.shouldFailCreate) throw new Error('SANDBOX_CONNECTION_FAILED: simulated failure');

        const sandboxId = `test-sandbox-${++this.sandboxCount}`;
        this.sandboxes.set(sandboxId, { state: 'running', metadata: options.metadata, createdAt: new Date() });
        return { sandboxId, metadata: options.metadata };
    }

    async connect(sandboxId: string): Promise<ProviderSandbox> {
        if (this.connectDelay > 0) await this.sleep(this.connectDelay);
        if (this.shouldFailConnect) throw new Error('SANDBOX_CONNECTION_FAILED: simulated failure');

        const sandbox = this.sandboxes.get(sandboxId);
        if (!sandbox) throw new Error('Sandbox not found');

        sandbox.state = 'running';
        return { sandboxId };
    }

    async pause(sandboxId: string): Promise<void> {
        if (this.shouldFailPause) throw new Error('Pause failed');
        const sandbox = this.sandboxes.get(sandboxId);
        if (sandbox) sandbox.state = 'paused';
    }

    async kill(sandboxId: string): Promise<void> {
        this.sandboxes.delete(sandboxId);
    }

    async getStatus(sandboxId: string): Promise<ProviderSandboxStatus> {
        const sandbox = this.sandboxes.get(sandboxId);
        if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);
        return { sandboxId, state: sandbox.state, createdAt: sandbox.createdAt, metadata: sandbox.metadata };
    }

    setSandboxState(sandboxId: string, state: SandboxState): void {
        const sandbox = this.sandboxes.get(sandboxId);
        if (sandbox) sandbox.state = state;
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
        this.sandboxCount = 0;
        this.shouldFailCreate = false;
        this.shouldFailConnect = false;
        this.shouldFailPause = false;
        this.createDelay = 0;
        this.connectDelay = 0;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((r) => setTimeout(r, ms));
    }
}

describe('SandboxService Unit Tests', () => {
    let service: SandboxService;
    let db: TestDatabase;
    let provider: TestSandboxProvider;

    beforeEach(() => {
        db = new TestDatabase();
        provider = new TestSandboxProvider();
        service = new SandboxService(db, provider);
    });

    afterEach(() => {
        db.clear();
        provider.reset();
    });

    describe('createSandbox', () => {
        it('creates sandbox and persists to registry', async () => {
            const session = await service.createSandbox({ userId: 'user-1' });

            expect(session.sandboxId).toBe('test-sandbox-1');
            expect(session.userId).toBe('user-1');
            expect(session.status).toBe('running');
            expect(session.wasResumed).toBe(false);
            expect(session.activeExecutionCount).toBe(0);

            const entry = db.getEntry('user-1');
            expect(entry).toBeDefined();
            expect(entry!.sandbox_id).toBe('test-sandbox-1');
        });

        it('uses custom template when provided', async () => {
            const session = await service.createSandbox({ userId: 'user-1', template: 'custom-snapshot' });
            expect(session.sandboxId).toBeDefined();
        });

        it('uses custom timeout when provided', async () => {
            const session = await service.createSandbox({ userId: 'user-1', timeoutMs: 60000 });
            expect(session.sandboxId).toBeDefined();
        });
    });

    describe('getOrCreateSandbox', () => {
        it('returns cached running session', async () => {
            const first = await service.getOrCreateSandbox({ userId: 'user-1' });
            const second = await service.getOrCreateSandbox({ userId: 'user-1' });

            expect(second.sandboxId).toBe(first.sandboxId);
            expect(provider.sandboxCount).toBe(1);
        });

        it('creates new sandbox when none exists', async () => {
            const session = await service.getOrCreateSandbox({ userId: 'user-1' });
            expect(session.sandboxId).toBe('test-sandbox-1');
        });

        it('resumes paused sandbox from cache', async () => {
            await service.createSandbox({ userId: 'user-1' });
            await service.pauseSandbox('user-1');

            const resumed = await service.getOrCreateSandbox({ userId: 'user-1' });

            expect(resumed.wasResumed).toBe(true);
            expect(resumed.status).toBe('running');
        });
    });

    describe('resumeSandbox', () => {
        it('resumes from in-memory cache', async () => {
            await service.createSandbox({ userId: 'user-1' });
            await service.pauseSandbox('user-1');

            const session = await service.resumeSandbox('user-1');

            expect(session).not.toBeNull();
            expect(session!.status).toBe('running');
            expect(session!.wasResumed).toBe(true);
        });

        it('resumes from database registry', async () => {
            const now = new Date();
            db.setEntry({
                id: 'entry-1',
                user_id: 'user-2',
                sandbox_id: 'test-sandbox-1',
                slug: 'default',
                name: 'Default Workspace',
                sandbox_status: 'paused',
                sandbox_active_agent_id: null,
                sandbox_active_execution_count: 0,
                created_at: now,
                sandbox_paused_at: now,
                sandbox_last_activity_at: now,
                sandbox_total_runtime_seconds: 0,
                sandbox_resume_count: 0,
                sandbox_template_version: null,
                sandbox_novnc_url: null,
            });

            // Pre-create sandbox in provider
            await provider.create({});
            provider.setSandboxState('test-sandbox-1', 'paused');

            const session = await service.resumeSandbox('user-2');

            expect(session).not.toBeNull();
            expect(session!.wasResumed).toBe(true);
        });

        it('returns null when no sandbox to resume', async () => {
            const session = await service.resumeSandbox('nonexistent-user');
            expect(session).toBeNull();
        });

        it('increments resume count in registry', async () => {
            await service.createSandbox({ userId: 'user-1' });
            await service.pauseSandbox('user-1');
            await service.resumeSandbox('user-1');

            const entry = db.getEntry('user-1');
            expect(entry!.sandbox_resume_count).toBe(1);
        });
    });

    describe('pauseSandbox', () => {
        it('pauses running sandbox', async () => {
            await service.createSandbox({ userId: 'user-1' });

            const result = await service.pauseSandbox('user-1');

            expect(result.success).toBe(true);
            expect(result.sandboxId).toBe('test-sandbox-1');
        });

        it('fails when no sandbox exists', async () => {
            const result = await service.pauseSandbox('nonexistent');

            expect(result.success).toBe(false);
            expect(result.message).toContain('No active sandbox');
        });

        it('fails when sandbox has active executions', async () => {
            await service.createSandbox({ userId: 'user-1' });
            service.incrementExecutionCount('user-1');

            const result = await service.pauseSandbox('user-1');

            expect(result.success).toBe(false);
            expect(result.message).toContain('active executions');
        });

        it('updates registry status on pause', async () => {
            await service.createSandbox({ userId: 'user-1' });
            await service.pauseSandbox('user-1');

            const entry = db.getEntry('user-1');
            expect(entry!.sandbox_status).toBe('paused');
        });

        it('cleans up on pause failure', async () => {
            await service.createSandbox({ userId: 'user-1' });
            provider.shouldFailPause = true;

            await expect(service.pauseSandbox('user-1')).rejects.toThrow('Pause failed');

            expect(service.hasSandbox('user-1')).toBe(false);
            const entry = db.getEntry('user-1');
            expect(entry!.sandbox_status).toBe('killed');
        });
    });

    describe('killSandbox', () => {
        it('kills running sandbox', async () => {
            await service.createSandbox({ userId: 'user-1' });

            const result = await service.killSandbox('user-1');

            expect(result.success).toBe(true);
            expect(service.hasSandbox('user-1')).toBe(false);
        });

        it('cleans up registry entry when no session', async () => {
            db.setEntry({
                id: 'entry-1',
                user_id: 'user-orphan',
                sandbox_id: 'orphan-sandbox',
                slug: 'default',
                name: 'Default Workspace',
                sandbox_status: 'running',
                sandbox_active_agent_id: null,
                sandbox_active_execution_count: 0,
                created_at: new Date(),
                sandbox_paused_at: null,
                sandbox_last_activity_at: new Date(),
                sandbox_total_runtime_seconds: 0,
                sandbox_resume_count: 0,
                sandbox_template_version: null,
                sandbox_novnc_url: null,
            });

            const result = await service.killSandbox('user-orphan');

            expect(result.success).toBe(true);
            expect(result.message).toContain('cleaned up registry');
        });
    });

    describe('getSandboxStatus', () => {
        it('returns none when no sandbox exists', async () => {
            const status = await service.getSandboxStatus('nonexistent');

            expect(status.status).toBe('none');
            expect(status.sandboxId).toBeNull();
        });

        it('returns status from active session', async () => {
            await service.createSandbox({ userId: 'user-1' });

            const status = await service.getSandboxStatus('user-1');

            expect(status.status).toBe('running');
            expect(status.sandboxId).toBe('test-sandbox-1');
        });

        it('returns status from registry when no session', async () => {
            db.setEntry({
                id: 'entry-1',
                user_id: 'user-1',
                slug: 'default',
                name: 'Default Workspace',
                sandbox_id: 'sandbox-123',
                sandbox_status: 'paused',
                sandbox_active_agent_id: null,
                sandbox_active_execution_count: 5,
                created_at: new Date(),
                sandbox_paused_at: new Date(),
                sandbox_last_activity_at: new Date(),
                sandbox_total_runtime_seconds: 3600,
                sandbox_resume_count: 3,
                sandbox_template_version: null,
                sandbox_novnc_url: null,
            });

            const status = await service.getSandboxStatus('user-1');

            expect(status.status).toBe('paused');
            expect(status.resumeCount).toBe(3);
            expect(status.totalRuntimeSeconds).toBe(3600);
        });
    });

    describe('execution count management', () => {
        it('increments execution count', async () => {
            await service.createSandbox({ userId: 'user-1' });

            service.incrementExecutionCount('user-1');
            service.incrementExecutionCount('user-1');

            expect(service.getActiveExecutionCount('user-1')).toBe(2);
        });

        it('decrements execution count', async () => {
            await service.createSandbox({ userId: 'user-1' });
            service.incrementExecutionCount('user-1');
            service.incrementExecutionCount('user-1');

            service.decrementExecutionCount('user-1');

            expect(service.getActiveExecutionCount('user-1')).toBe(1);
        });

        it('does not decrement below zero', async () => {
            await service.createSandbox({ userId: 'user-1' });

            service.decrementExecutionCount('user-1');

            expect(service.getActiveExecutionCount('user-1')).toBe(0);
        });

        it('returns zero for nonexistent user', () => {
            expect(service.getActiveExecutionCount('nonexistent')).toBe(0);
        });
    });

    describe('hasSandbox', () => {
        it('returns true for running sandbox', async () => {
            await service.createSandbox({ userId: 'user-1' });
            expect(service.hasSandbox('user-1')).toBe(true);
        });

        it('returns false for nonexistent user', () => {
            expect(service.hasSandbox('nonexistent')).toBe(false);
        });

        it('returns false for killed sandbox', async () => {
            await service.createSandbox({ userId: 'user-1' });
            await service.killSandbox('user-1');
            expect(service.hasSandbox('user-1')).toBe(false);
        });
    });

    describe('getActiveSessions', () => {
        it('returns only running sessions', async () => {
            await service.createSandbox({ userId: 'user-1' });
            await service.createSandbox({ userId: 'user-2' });
            await service.pauseSandbox('user-2');

            const active = service.getActiveSessions();

            expect(active).toHaveLength(1);
            expect(active[0].userId).toBe('user-1');
        });
    });

    describe('stale sandbox detection via registry', () => {
        it('identifies stale sandboxes older than 24 hours in registry', async () => {
            const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
            db.setEntry({
                id: 'entry-1',
                user_id: 'stale-user',
                slug: 'default',
                name: 'Default Workspace',
                sandbox_id: 'stale-sandbox',
                sandbox_status: 'paused',
                sandbox_active_agent_id: null,
                sandbox_active_execution_count: 0,
                created_at: staleTime,
                sandbox_paused_at: staleTime,
                sandbox_last_activity_at: staleTime,
                sandbox_total_runtime_seconds: 0,
                sandbox_resume_count: 0,
                sandbox_template_version: null,
                sandbox_novnc_url: null,
            });

            // Verify the stale query returns stale entries
            const result = await db.query<SandboxRegistryEntry>(
                `SELECT id, user_id FROM workspaces WHERE sandbox_status IN ('paused', 'running') AND sandbox_last_activity_at < NOW() - INTERVAL '24 hours'`
            );
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].user_id).toBe('stale-user');

            // Kill the stale sandbox via service
            const killResult = await service.killSandbox('stale-user');
            expect(killResult.success).toBe(true);
            const entry = db.getEntry('stale-user');
            expect(entry!.sandbox_status).toBe('killed');
        });

        it('returns empty when no stale sandboxes', async () => {
            const result = await db.query<SandboxRegistryEntry>(
                `SELECT id, user_id FROM workspaces WHERE sandbox_status IN ('paused', 'running') AND sandbox_last_activity_at < NOW() - INTERVAL '24 hours'`
            );
            expect(result.rows).toHaveLength(0);
        });
    });
});

describe('isEnvAllowed', () => {
    it('allows ANTHROPIC_API_KEY', () => {
        expect(isEnvAllowed('ANTHROPIC_API_KEY')).toBe(true);
    });

    it('allows XERUS_RUNNER_CONFIG (wildcard match)', () => {
        expect(isEnvAllowed('XERUS_RUNNER_CONFIG')).toBe(true);
        expect(isEnvAllowed('XERUS_RUNNER_PROMPT')).toBe(true);
    });

    it('allows LC_ALL (wildcard match)', () => {
        expect(isEnvAllowed('LC_ALL')).toBe(true);
        expect(isEnvAllowed('LC_CTYPE')).toBe(true);
    });

    it('rejects unknown env vars', () => {
        expect(isEnvAllowed('SECRET_KEY')).toBe(false);
        expect(isEnvAllowed('DATABASE_URL')).toBe(false);
    });
});

describe('SANDBOX_CONFIG', () => {
    it('has runner directory configured', () => {
        const root = process.env.XERUS_WORKSPACE_ROOT;
        expect(SANDBOX_CONFIG.runnerDir).toBe(`${root}/.xerus/runner`);
    });

    it('has auto-lifecycle intervals', () => {
        expect(SANDBOX_CONFIG.autoStopIntervalMinutes).toBe(0);
        expect(SANDBOX_CONFIG.autoArchiveIntervalMinutes).toBe(24 * 60);
        expect(SANDBOX_CONFIG.autoDeleteIntervalMinutes).toBe(0);
    });
});

// Extended test provider with file operation simulation and retry behavior
class ExtendedTestProvider implements SandboxProvider {
    readonly name = 'extended-test';
    readonly capabilities: ProviderCapabilities = {
        supportsPause: true,
        supportsResume: true,
        supportsTimeout: true,
        maxLifetimeMs: 7 * 24 * 60 * 60 * 1000,
    };

    public sandboxes = new Map<string, {
        state: SandboxState;
        metadata?: Record<string, string>;
        createdAt: Date;
        files: Map<string, string>;
    }>();
    public sandboxCount = 0;
    public createCallCount = 0;
    public connectCallCount = 0;

    // Transient failure simulation
    private createFailuresRemaining = 0;
    private connectFailuresRemaining = 0;
    public createDelay = 0;
    public timeoutOnCreate = false;

    setTransientCreateFailures(count: number): void {
        this.createFailuresRemaining = count;
    }

    setTransientConnectFailures(count: number): void {
        this.connectFailuresRemaining = count;
    }

    async create(options: { metadata?: Record<string, string> }): Promise<ProviderSandbox> {
        this.createCallCount++;

        if (this.createDelay > 0) await this.sleep(this.createDelay);

        if (this.timeoutOnCreate) {
            throw new Error('SANDBOX_TIMEOUT: Operation timed out');
        }

        if (this.createFailuresRemaining > 0) {
            this.createFailuresRemaining--;
            throw new Error('SANDBOX_CONNECTION_FAILED: Transient failure');
        }

        const sandboxId = `ext-sandbox-${++this.sandboxCount}`;
        this.sandboxes.set(sandboxId, {
            state: 'running',
            metadata: options.metadata,
            createdAt: new Date(),
            files: new Map(),
        });
        return { sandboxId, metadata: options.metadata };
    }

    async connect(sandboxId: string): Promise<ProviderSandbox> {
        this.connectCallCount++;

        if (this.connectFailuresRemaining > 0) {
            this.connectFailuresRemaining--;
            throw new Error('SANDBOX_CONNECTION_FAILED: Transient failure');
        }

        const sandbox = this.sandboxes.get(sandboxId);
        if (!sandbox) throw new Error('Sandbox not found');

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
        return { sandboxId, state: sandbox.state, createdAt: sandbox.createdAt, metadata: sandbox.metadata };
    }

    // File operation simulation
    writeFile(sandboxId: string, path: string, content: string): void {
        const sandbox = this.sandboxes.get(sandboxId);
        if (sandbox) sandbox.files.set(path, content);
    }

    readFile(sandboxId: string, path: string): string | null {
        const sandbox = this.sandboxes.get(sandboxId);
        return sandbox?.files.get(path) ?? null;
    }

    fileExists(sandboxId: string, path: string): boolean {
        const sandbox = this.sandboxes.get(sandboxId);
        return sandbox?.files.has(path) ?? false;
    }

    setSandboxState(sandboxId: string, state: SandboxState): void {
        const sandbox = this.sandboxes.get(sandboxId);
        if (sandbox) sandbox.state = state;
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
        this.sandboxCount = 0;
        this.createCallCount = 0;
        this.connectCallCount = 0;
        this.createFailuresRemaining = 0;
        this.connectFailuresRemaining = 0;
        this.createDelay = 0;
        this.timeoutOnCreate = false;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((r) => setTimeout(r, ms));
    }
}

describe('SandboxService Concurrent Management', () => {
    let db: TestDatabase;
    let provider: ExtendedTestProvider;
    let service: SandboxService;

    beforeEach(() => {
        db = new TestDatabase();
        provider = new ExtendedTestProvider();
        service = new SandboxService(db, provider);
    });

    afterEach(() => {
        db.clear();
        provider.reset();
    });

    it('handles concurrent sandbox creation for different users', async () => {
        const users = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];

        const results = await Promise.all(
            users.map((userId) => service.createSandbox({ userId }))
        );

        expect(results).toHaveLength(5);
        expect(provider.sandboxCount).toBe(5);

        const uniqueIds = new Set(results.map((r) => r.sandboxId));
        expect(uniqueIds.size).toBe(5);

        for (const userId of users) {
            expect(service.hasSandbox(userId)).toBe(true);
        }
    });

    it('handles concurrent getOrCreateSandbox for same user (last write wins)', async () => {
        // NOTE: Current implementation does not deduplicate concurrent creates.
        // Multiple concurrent calls for the same user will create multiple sandboxes,
        // but only the last one will be stored in the sessions map (last write wins).
        // This is acceptable because:
        // 1. Per-user sandbox model means only one sandbox per user at a time
        // 2. The sessions map is eventually consistent
        // 3. Registry upsert handles conflicts
        provider.createDelay = 50;

        const calls = Array(5).fill(null).map(() =>
            service.getOrCreateSandbox({ userId: 'user-1' })
        );

        const results = await Promise.all(calls);

        // All calls should succeed and return a session
        expect(results).toHaveLength(5);
        results.forEach((r) => expect(r.sandboxId).toBeDefined());

        // User should have a sandbox after all operations complete
        expect(service.hasSandbox('user-1')).toBe(true);

        // Only one session is tracked (last write wins)
        const activeSessions = service.getActiveSessions();
        const userSessions = activeSessions.filter((s) => s.userId === 'user-1');
        expect(userSessions).toHaveLength(1);
    });

    it('handles mixed concurrent operations', async () => {
        await service.createSandbox({ userId: 'user-1' });
        await service.createSandbox({ userId: 'user-2' });

        const [pauseResult, statusResult, createResult, getOrCreateResult] = await Promise.all([
            service.pauseSandbox('user-1'),
            service.getSandboxStatus('user-2'),
            service.createSandbox({ userId: 'user-3' }),
            service.getOrCreateSandbox({ userId: 'user-4' }),
        ]);

        expect(pauseResult.success).toBe(true);
        expect(statusResult.status).toBe('running');
        expect(createResult.sandboxId).toBeDefined();
        expect(getOrCreateResult.sandboxId).toBeDefined();
    });

    it('handles concurrent pause and resume', async () => {
        await service.createSandbox({ userId: 'user-1' });

        await service.pauseSandbox('user-1');
        const resumed = await service.resumeSandbox('user-1');
        await service.pauseSandbox('user-1');
        const resumed2 = await service.resumeSandbox('user-1');

        expect(resumed).not.toBeNull();
        expect(resumed2).not.toBeNull();

        const status = await service.getSandboxStatus('user-1');
        expect(status.status).toBe('running');
    });

    it('handles concurrent execution count modifications', async () => {
        await service.createSandbox({ userId: 'user-1' });

        const increments = Array(10).fill(null).map(() => {
            service.incrementExecutionCount('user-1');
            return Promise.resolve();
        });

        await Promise.all(increments);

        expect(service.getActiveExecutionCount('user-1')).toBe(10);

        const decrements = Array(5).fill(null).map(() => {
            service.decrementExecutionCount('user-1');
            return Promise.resolve();
        });

        await Promise.all(decrements);

        expect(service.getActiveExecutionCount('user-1')).toBe(5);
    });

    it('handles multiple active sessions correctly', async () => {
        const userCount = 10;
        const users = Array.from({ length: userCount }, (_, i) => `user-${i + 1}`);

        await Promise.all(users.map((userId) => service.createSandbox({ userId })));

        const activeSessions = service.getActiveSessions();
        expect(activeSessions).toHaveLength(userCount);

        await Promise.all(
            users.slice(0, 5).map((userId) => service.pauseSandbox(userId))
        );

        const activeAfterPause = service.getActiveSessions();
        expect(activeAfterPause).toHaveLength(5);
    });
});

describe('SandboxService Error Recovery', () => {
    let db: TestDatabase;
    let provider: ExtendedTestProvider;
    let service: SandboxService;

    beforeEach(() => {
        db = new TestDatabase();
        provider = new ExtendedTestProvider();
        service = new SandboxService(db, provider);
    });

    afterEach(() => {
        db.clear();
        provider.reset();
    });

    it('propagates creation errors (fail-fast)', async () => {
        provider.setTransientCreateFailures(5);

        await expect(service.createSandbox({ userId: 'user-1' })).rejects.toThrow('SANDBOX_CONNECTION_FAILED');

        expect(provider.createCallCount).toBe(1);
        expect(service.hasSandbox('user-1')).toBe(false);
    });

    it('handles connection failure during resume', async () => {
        const now = new Date();
        db.setEntry({
            id: 'entry-1',
            user_id: 'user-1',
            slug: 'default',
            name: 'Default Workspace',
            sandbox_id: 'ext-sandbox-1',
            sandbox_status: 'paused',
            sandbox_active_agent_id: null,
            sandbox_active_execution_count: 0,
            created_at: now,
            sandbox_paused_at: now,
            sandbox_last_activity_at: now,
            sandbox_total_runtime_seconds: 0,
            sandbox_resume_count: 0,
            sandbox_template_version: null,
            sandbox_novnc_url: null,
            sandbox_plan: null,
        });

        await provider.create({});
        provider.setSandboxState('ext-sandbox-1', 'paused');
        provider.setTransientConnectFailures(1);

        const session = await service.resumeSandbox('user-1');

        expect(session).toBeNull();
        const entry = db.getEntry('user-1');
        expect(entry!.sandbox_status).toBe('killed');
    });

    it('handles timeout errors appropriately', async () => {
        provider.timeoutOnCreate = true;

        await expect(service.createSandbox({ userId: 'user-1' })).rejects.toThrow('SANDBOX_TIMEOUT');

        expect(service.hasSandbox('user-1')).toBe(false);
    });

    it('recovers state after failed pause', async () => {
        const session = await service.createSandbox({ userId: 'user-1' });
        const originalSandboxId = session.sandboxId;

        provider.sandboxes = new Map();

        const pauseResult = await service.pauseSandbox('user-1');

        expect(pauseResult.success).toBe(true);

        const status = await service.getSandboxStatus('user-1');
        expect(status.sandboxId).toBe(originalSandboxId);
    });

    it('cleans up orphaned registry entries on kill', async () => {
        db.setEntry({
            id: 'orphan-entry',
            user_id: 'orphan-user',
            slug: 'default',
            name: 'Default Workspace',
            sandbox_id: 'nonexistent-sandbox',
            sandbox_status: 'running',
            sandbox_active_agent_id: null,
            sandbox_active_execution_count: 0,
            created_at: new Date(),
            sandbox_paused_at: null,
            sandbox_last_activity_at: new Date(),
            sandbox_total_runtime_seconds: 0,
            sandbox_resume_count: 0,
            sandbox_template_version: null,
            sandbox_novnc_url: null,
            sandbox_plan: null,
        });

        const result = await service.killSandbox('orphan-user');

        expect(result.success).toBe(true);
        expect(result.message).toContain('cleaned up registry');
    });

    it('handles missing sandbox in cache but present in registry', async () => {
        const now = new Date();
        db.setEntry({
            id: 'entry-1',
            user_id: 'user-1',
            slug: 'default',
            name: 'Default Workspace',
            sandbox_id: 'ext-sandbox-1',
            sandbox_status: 'running',
            sandbox_active_agent_id: null,
            sandbox_active_execution_count: 3,
            created_at: now,
            sandbox_paused_at: null,
            sandbox_last_activity_at: now,
            sandbox_total_runtime_seconds: 3600,
            sandbox_resume_count: 2,
            sandbox_template_version: null,
            sandbox_novnc_url: null,
            sandbox_plan: null,
        });

        const status = await service.getSandboxStatus('user-1');

        expect(status.status).toBe('running');
        expect(status.sandboxId).toBe('ext-sandbox-1');
        expect(status.activeExecutionCount).toBe(3);
        expect(status.resumeCount).toBe(2);
        expect(status.totalRuntimeSeconds).toBe(3600);
    });
});

describe('SandboxService File Operations Simulation', () => {
    let db: TestDatabase;
    let provider: ExtendedTestProvider;
    let service: SandboxService;

    beforeEach(() => {
        db = new TestDatabase();
        provider = new ExtendedTestProvider();
        service = new SandboxService(db, provider);
    });

    afterEach(() => {
        db.clear();
        provider.reset();
    });

    it('preserves files across pause/resume cycle', async () => {
        const session = await service.createSandbox({ userId: 'user-1' });

        provider.writeFile(session.sandboxId, '/workspace/test.txt', 'Hello World');
        expect(provider.readFile(session.sandboxId, '/workspace/test.txt')).toBe('Hello World');

        await service.pauseSandbox('user-1');
        const resumed = await service.resumeSandbox('user-1');

        expect(resumed).not.toBeNull();
        expect(provider.readFile(session.sandboxId, '/workspace/test.txt')).toBe('Hello World');
    });

    it('tracks file existence correctly', async () => {
        const session = await service.createSandbox({ userId: 'user-1' });

        expect(provider.fileExists(session.sandboxId, '/workspace/missing.txt')).toBe(false);

        provider.writeFile(session.sandboxId, '/workspace/created.txt', 'content');

        expect(provider.fileExists(session.sandboxId, '/workspace/created.txt')).toBe(true);
    });

    it('clears files on kill', async () => {
        const session = await service.createSandbox({ userId: 'user-1' });
        provider.writeFile(session.sandboxId, '/workspace/test.txt', 'content');

        await service.killSandbox('user-1');

        expect(provider.fileExists(session.sandboxId, '/workspace/test.txt')).toBe(false);
    });

    it('maintains separate file systems per user', async () => {
        const session1 = await service.createSandbox({ userId: 'user-1' });
        const session2 = await service.createSandbox({ userId: 'user-2' });

        provider.writeFile(session1.sandboxId, '/workspace/test.txt', 'User 1 content');
        provider.writeFile(session2.sandboxId, '/workspace/test.txt', 'User 2 content');

        expect(provider.readFile(session1.sandboxId, '/workspace/test.txt')).toBe('User 1 content');
        expect(provider.readFile(session2.sandboxId, '/workspace/test.txt')).toBe('User 2 content');
    });
});

describe('SandboxService Timeout Handling', () => {
    let db: TestDatabase;
    let provider: ExtendedTestProvider;
    let service: SandboxService;

    beforeEach(() => {
        db = new TestDatabase();
        provider = new ExtendedTestProvider();
        service = new SandboxService(db, provider);
    });

    afterEach(() => {
        db.clear();
        provider.reset();
    });

    it('respects custom timeout in options', async () => {
        const customTimeout = 30000;
        const session = await service.createSandbox({
            userId: 'user-1',
            timeoutMs: customTimeout,
        });

        expect(session.sandboxId).toBeDefined();
    });

    it('uses default timeout when not specified', async () => {
        const session = await service.createSandbox({ userId: 'user-1' });

        expect(session.sandboxId).toBeDefined();
    });

    it('throws on timeout during creation', async () => {
        provider.timeoutOnCreate = true;

        await expect(
            service.createSandbox({ userId: 'user-1' })
        ).rejects.toThrow('SANDBOX_TIMEOUT');

        expect(service.hasSandbox('user-1')).toBe(false);
        expect(db.getEntry('user-1')).toBeUndefined();
    });
});

describe('SandboxService Lifecycle Integration', () => {
    let db: TestDatabase;
    let provider: ExtendedTestProvider;
    let service: SandboxService;

    beforeEach(() => {
        db = new TestDatabase();
        provider = new ExtendedTestProvider();
        service = new SandboxService(db, provider);
    });

    afterEach(() => {
        db.clear();
        provider.reset();
    });

    it('completes full create-pause-resume-kill lifecycle', async () => {
        const session = await service.createSandbox({ userId: 'user-1' });
        expect(session.status).toBe('running');
        expect(session.wasResumed).toBe(false);

        let status = await service.getSandboxStatus('user-1');
        expect(status.status).toBe('running');
        expect(status.resumeCount).toBe(0);

        const pauseResult = await service.pauseSandbox('user-1');
        expect(pauseResult.success).toBe(true);

        status = await service.getSandboxStatus('user-1');
        expect(status.status).toBe('paused');

        const resumed = await service.resumeSandbox('user-1');
        expect(resumed).not.toBeNull();
        expect(resumed!.wasResumed).toBe(true);
        expect(resumed!.status).toBe('running');

        status = await service.getSandboxStatus('user-1');
        expect(status.resumeCount).toBe(1);

        const killResult = await service.killSandbox('user-1');
        expect(killResult.success).toBe(true);

        status = await service.getSandboxStatus('user-1');
        expect(status.status).toBe('killed');
        expect(service.hasSandbox('user-1')).toBe(false);
    });

    it('tracks activity timestamp updates', async () => {
        const session = await service.createSandbox({ userId: 'user-1' });
        const initialActivityAt = session.lastActivityAt;

        await new Promise((r) => setTimeout(r, 10));

        service.incrementExecutionCount('user-1');

        const updatedStatus = await service.getSandboxStatus('user-1');
        expect(updatedStatus.lastActivityAt).not.toBeNull();
        expect(updatedStatus.lastActivityAt!.getTime()).toBeGreaterThanOrEqual(
            initialActivityAt.getTime()
        );
    });

    it('prevents pause when executions are active', async () => {
        await service.createSandbox({ userId: 'user-1' });
        service.incrementExecutionCount('user-1');
        service.incrementExecutionCount('user-1');

        const pauseResult = await service.pauseSandbox('user-1');

        expect(pauseResult.success).toBe(false);
        expect(pauseResult.message).toContain('2 active executions');

        service.decrementExecutionCount('user-1');
        service.decrementExecutionCount('user-1');

        const secondPause = await service.pauseSandbox('user-1');
        expect(secondPause.success).toBe(true);
    });

    it('handles rapid create-kill cycles', async () => {
        for (let i = 0; i < 5; i++) {
            const session = await service.createSandbox({ userId: 'user-rapid' });
            expect(session.sandboxId).toBeDefined();

            const killResult = await service.killSandbox('user-rapid');
            expect(killResult.success).toBe(true);
        }

        expect(service.hasSandbox('user-rapid')).toBe(false);
    });

    it('handles getOrCreateSandbox after kill', async () => {
        await service.createSandbox({ userId: 'user-1' });
        await service.killSandbox('user-1');

        const newSession = await service.getOrCreateSandbox({ userId: 'user-1' });

        expect(newSession.sandboxId).toBeDefined();
        expect(newSession.wasResumed).toBe(false);
        expect(service.hasSandbox('user-1')).toBe(true);
    });
});

describe('SandboxService Registry Consistency', () => {
    let db: TestDatabase;
    let provider: ExtendedTestProvider;
    let service: SandboxService;

    beforeEach(() => {
        db = new TestDatabase();
        provider = new ExtendedTestProvider();
        service = new SandboxService(db, provider);
    });

    afterEach(() => {
        db.clear();
        provider.reset();
    });

    it('maintains consistency between cache and registry on create', async () => {
        const session = await service.createSandbox({ userId: 'user-1' });

        const entry = db.getEntry('user-1');
        expect(entry).toBeDefined();
        expect(entry!.sandbox_id).toBe(session.sandboxId);
        expect(entry!.sandbox_status).toBe('running');
        expect(service.hasSandbox('user-1')).toBe(true);
    });

    it('maintains consistency on pause', async () => {
        await service.createSandbox({ userId: 'user-1' });
        await service.pauseSandbox('user-1');

        const entry = db.getEntry('user-1');
        expect(entry!.sandbox_status).toBe('paused');
        expect(entry!.sandbox_paused_at).not.toBeNull();

        const status = await service.getSandboxStatus('user-1');
        expect(status.status).toBe('paused');
    });

    it('maintains consistency on resume', async () => {
        await service.createSandbox({ userId: 'user-1' });
        await service.pauseSandbox('user-1');
        await service.resumeSandbox('user-1');

        const entry = db.getEntry('user-1');
        expect(entry!.sandbox_status).toBe('running');
        expect(entry!.sandbox_resume_count).toBe(1);

        expect(service.hasSandbox('user-1')).toBe(true);
    });

    it('maintains consistency on kill', async () => {
        await service.createSandbox({ userId: 'user-1' });
        await service.killSandbox('user-1');

        const entry = db.getEntry('user-1');
        expect(entry!.sandbox_status).toBe('killed');
        expect(service.hasSandbox('user-1')).toBe(false);
    });

    it('updates registry on upsert (existing user)', async () => {
        const first = await service.createSandbox({ userId: 'user-1' });
        await service.killSandbox('user-1');

        const second = await service.createSandbox({ userId: 'user-1' });

        expect(second.sandboxId).not.toBe(first.sandboxId);

        const entry = db.getEntry('user-1');
        expect(entry!.sandbox_id).toBe(second.sandboxId);
        expect(entry!.sandbox_status).toBe('running');
    });
});
