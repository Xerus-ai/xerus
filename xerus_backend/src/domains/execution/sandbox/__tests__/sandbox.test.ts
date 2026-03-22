// Sandbox Service Tests
// Unit tests for sandbox service logic
// Daytona integration tests require API key and skip when unavailable

import { SANDBOX_CONFIG, RETRY_CONFIG, RETRYABLE_ERROR_CODES } from '../sandbox.config';
import { SandboxRegistryEntry, SandboxSession, SandboxStatusResponse } from '../sandbox.types';

// Check if Daytona API key is available for integration tests
const DAYTONA_API_KEY = process.env.DAYTONA_API_KEY;
const RUN_DAYTONA_TESTS = Boolean(DAYTONA_API_KEY);

// In-memory database for unit testing
interface MockQueryResult<T> {
    rows: T[];
}

class InMemoryDatabase {
    private registry: Map<string, SandboxRegistryEntry> = new Map();

    async query<T>(sql: string, params?: unknown[]): Promise<MockQueryResult<T>> {
        const normalizedSql = sql.toLowerCase().trim();

        if (normalizedSql.startsWith('insert into workspaces')) {
            return this.handleInsert(params as unknown[]) as Promise<MockQueryResult<T>>;
        }

        if (normalizedSql.startsWith('update workspaces')) {
            return this.handleUpdate(sql, params as unknown[]) as Promise<MockQueryResult<T>>;
        }

        if (normalizedSql.includes('from workspaces') && normalizedSql.includes('where user_id')) {
            return this.handleSelectByUser(params as unknown[]) as Promise<MockQueryResult<T>>;
        }

        if (normalizedSql.includes("sandbox_status in ('paused'") && normalizedSql.includes('24 hours')) {
            return this.handleSelectStale() as Promise<MockQueryResult<T>>;
        }

        return { rows: [] };
    }

    private async handleInsert(params: unknown[]): Promise<MockQueryResult<SandboxRegistryEntry>> {
        const [userId, sandboxId, status, createdAt, lastActivityAt] = params as [string, string, string, Date, Date];
        const entry: SandboxRegistryEntry = {
            id: crypto.randomUUID(),
            user_id: userId,
            slug: 'default',
            name: 'Default Workspace',
            sandbox_id: sandboxId,
            sandbox_status: status as 'running' | 'paused' | 'killed',
            sandbox_active_agent_id: null,
            sandbox_active_execution_count: 0,
            created_at: createdAt,
            sandbox_paused_at: null,
            sandbox_last_activity_at: lastActivityAt,
            sandbox_total_runtime_seconds: 0,
            sandbox_resume_count: 0,
            sandbox_template_version: null,
            sandbox_novnc_url: null,
        };
        this.registry.set(userId, entry);
        return { rows: [] };
    }

    private async handleUpdate(sql: string, params: unknown[]): Promise<MockQueryResult<SandboxRegistryEntry>> {
        const userId = params[0] as string;
        const entry = this.registry.get(userId);
        if (!entry) return { rows: [] };

        if (sql.includes('sandbox_resume_count = sandbox_resume_count + 1')) {
            entry.sandbox_resume_count++;
        } else {
            const status = params[1] as string;
            entry.sandbox_status = status as 'running' | 'paused' | 'killed';
            entry.sandbox_last_activity_at = new Date();
            if (status === 'paused') {
                entry.sandbox_paused_at = new Date();
            }
        }

        return { rows: [] };
    }

    private async handleSelectByUser(params: unknown[]): Promise<MockQueryResult<SandboxRegistryEntry>> {
        const userId = params[0] as string;
        const entry = this.registry.get(userId);
        return { rows: entry ? [entry] : [] };
    }

    private async handleSelectStale(): Promise<MockQueryResult<SandboxRegistryEntry>> {
        const now = Date.now();
        const staleThreshold = 24 * 60 * 60 * 1000;
        const stale: SandboxRegistryEntry[] = [];

        for (const entry of this.registry.values()) {
            if (entry.sandbox_status === 'paused') {
                const activityAt = entry.sandbox_last_activity_at;
                if (activityAt) {
                    const age = now - activityAt.getTime();
                    if (age > staleThreshold) {
                        stale.push(entry);
                    }
                }
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

describe('SANDBOX_CONFIG', () => {
    it('has snapshot configured from env or default', () => {
        // Snapshot can be from env or 'daytona-medium' (default)
        expect(SANDBOX_CONFIG.snapshot).toBeDefined();
        expect(typeof SANDBOX_CONFIG.snapshot).toBe('string');
        expect(SANDBOX_CONFIG.snapshot.length).toBeGreaterThan(0);
    });

    it('has reasonable timeout values', () => {
        expect(SANDBOX_CONFIG.operationTimeoutMs).toBe(5 * 60 * 1000);
        expect(SANDBOX_CONFIG.autoStopIntervalMinutes).toBe(0);
        expect(SANDBOX_CONFIG.autoArchiveIntervalMinutes).toBe(24 * 60);
    });

    it('has workspace path from XERUS_WORKSPACE_ROOT env var', () => {
        expect(SANDBOX_CONFIG.workspacePath).toBe(process.env.XERUS_WORKSPACE_ROOT);
    });

    it('has backpressure queue limits configured', () => {
        expect(SANDBOX_CONFIG.queueSoftLimit).toBe(500);
        expect(SANDBOX_CONFIG.queueHardLimit).toBe(1000);
        expect(SANDBOX_CONFIG.killGracePeriodMs).toBe(5000);
    });
});

describe('RETRY_CONFIG', () => {
    it('has valid retry settings', () => {
        expect(RETRY_CONFIG.maxRetries).toBe(3);
        expect(RETRY_CONFIG.initialDelayMs).toBe(1000);
        expect(RETRY_CONFIG.maxDelayMs).toBe(10000);
        expect(RETRY_CONFIG.multiplier).toBe(2);
        expect(RETRY_CONFIG.jitter).toBe(true);
    });
});

describe('RETRYABLE_ERROR_CODES', () => {
    it('includes expected error codes', () => {
        expect(RETRYABLE_ERROR_CODES).toContain('SANDBOX_TIMEOUT');
        expect(RETRYABLE_ERROR_CODES).toContain('SANDBOX_CONNECTION_FAILED');
        expect(RETRYABLE_ERROR_CODES).toContain('RATE_LIMIT_EXCEEDED');
    });
});

describe('InMemoryDatabase', () => {
    let db: InMemoryDatabase;

    beforeEach(() => {
        db = new InMemoryDatabase();
    });

    afterEach(() => {
        db.clear();
    });

    it('handles insert and select by user', async () => {
        const now = new Date();
        await db.query(
            `INSERT INTO workspaces (user_id, slug, name, sandbox_id, sandbox_status, created_at, sandbox_last_activity_at) VALUES ($1, $2, $3, $4, $5)`,
            ['user-1', 'sandbox-123', 'running', now, now]
        );

        const result = await db.query<SandboxRegistryEntry>(`SELECT id, user_id FROM workspaces WHERE user_id = $1`, ['user-1']);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].user_id).toBe('user-1');
        expect(result.rows[0].sandbox_id).toBe('sandbox-123');
        expect(result.rows[0].sandbox_status).toBe('running');
    });

    it('handles update status', async () => {
        const now = new Date();
        db.setEntry({
            id: 'entry-1',
            user_id: 'user-1',
            slug: 'default',
            name: 'Default Workspace',
            sandbox_id: 'sandbox-123',
            sandbox_status: 'running',
            sandbox_active_agent_id: null,
            sandbox_active_execution_count: 0,
            created_at: now,
            sandbox_paused_at: null,
            sandbox_last_activity_at: now,
            sandbox_total_runtime_seconds: 0,
            sandbox_resume_count: 0,
            sandbox_template_version: null,
            sandbox_novnc_url: null,
        });

        await db.query(`UPDATE workspaces SET sandbox_status = $2, sandbox_paused_at = $3, sandbox_last_activity_at = NOW() WHERE user_id = $1`, [
            'user-1',
            'paused',
            now,
        ]);

        const entry = db.getEntry('user-1');
        expect(entry?.sandbox_status).toBe('paused');
    });

    it('handles resume count increment', async () => {
        const now = new Date();
        db.setEntry({
            id: 'entry-1',
            user_id: 'user-1',
            slug: 'default',
            name: 'Default Workspace',
            sandbox_id: 'sandbox-123',
            sandbox_status: 'running',
            sandbox_active_agent_id: null,
            sandbox_active_execution_count: 0,
            created_at: now,
            sandbox_paused_at: null,
            sandbox_last_activity_at: now,
            sandbox_total_runtime_seconds: 0,
            sandbox_resume_count: 0,
            sandbox_template_version: null,
            sandbox_novnc_url: null,
        });

        await db.query(`UPDATE workspaces SET sandbox_resume_count = sandbox_resume_count + 1 WHERE user_id = $1`, ['user-1']);

        const entry = db.getEntry('user-1');
        expect(entry?.sandbox_resume_count).toBe(1);
    });

    it('returns empty for stale query when no stale entries', async () => {
        const now = new Date();
        db.setEntry({
            id: 'entry-1',
            user_id: 'user-1',
            slug: 'default',
            name: 'Default Workspace',
            sandbox_id: 'sandbox-123',
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

        const result = await db.query<SandboxRegistryEntry>(
            `SELECT id, user_id FROM workspaces WHERE sandbox_status IN ('paused', 'running') AND sandbox_last_activity_at < NOW() - INTERVAL '24 hours'`
        );

        expect(result.rows).toHaveLength(0);
    });

    it('returns stale entries when older than 24 hours', async () => {
        const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
        db.setEntry({
            id: 'entry-1',
            user_id: 'user-1',
            slug: 'default',
            name: 'Default Workspace',
            sandbox_id: 'sandbox-123',
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

        const result = await db.query<SandboxRegistryEntry>(
            `SELECT id, user_id FROM workspaces WHERE sandbox_status IN ('paused', 'running') AND sandbox_last_activity_at < NOW() - INTERVAL '24 hours'`
        );

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].user_id).toBe('user-1');
    });
});

describe('SandboxSession type', () => {
    it('has correct shape', () => {
        const session: SandboxSession = {
            sandboxId: 'sandbox-123',
            userId: 'user-1',
            status: 'running',
            createdAt: new Date(),
            lastActivityAt: new Date(),
            wasResumed: false,
            activeExecutionCount: 0,
        };

        expect(session.sandboxId).toBe('sandbox-123');
        expect(session.userId).toBe('user-1');
        expect(session.status).toBe('running');
        expect(session.wasResumed).toBe(false);
        expect(session.activeExecutionCount).toBe(0);
    });
});

describe('SandboxStatusResponse type', () => {
    it('handles none status', () => {
        const status: SandboxStatusResponse = {
            userId: 'user-1',
            sandboxId: null,
            status: 'none',
            lastActivityAt: null,
            activeExecutionCount: 0,
            resumeCount: 0,
            totalRuntimeSeconds: 0,
        };

        expect(status.status).toBe('none');
        expect(status.sandboxId).toBeNull();
    });

    it('handles running status', () => {
        const status: SandboxStatusResponse = {
            userId: 'user-1',
            sandboxId: 'sandbox-123',
            status: 'running',
            lastActivityAt: new Date(),
            activeExecutionCount: 2,
            resumeCount: 5,
            totalRuntimeSeconds: 3600,
        };

        expect(status.status).toBe('running');
        expect(status.sandboxId).toBe('sandbox-123');
        expect(status.activeExecutionCount).toBe(2);
    });
});

// Daytona Integration Tests - only run when API key is available
// These tests make real API calls to Daytona
const describeDaytona = RUN_DAYTONA_TESTS ? describe : describe.skip;

describeDaytona('SandboxService Daytona Integration', () => {
    jest.setTimeout(120000);

    it('verifies Daytona API key is configured', () => {
        expect(DAYTONA_API_KEY).toBeDefined();
        expect(DAYTONA_API_KEY!.startsWith('dtn_')).toBe(true);
    });

    it('verifies SANDBOX_CONFIG has valid defaults', () => {
        expect(SANDBOX_CONFIG.snapshot).toBeDefined();
        expect(SANDBOX_CONFIG.workspacePath).toBe(process.env.XERUS_WORKSPACE_ROOT);
        expect(SANDBOX_CONFIG.operationTimeoutMs).toBe(300000);
        expect(SANDBOX_CONFIG.autoStopIntervalMinutes).toBe(0);
    });
});

// Full SandboxService integration tests
// These create real sandboxes and cost money - run manually
// Run with: npm test -- --testPathPatterns="sandbox.test" --testNamePattern="SandboxService Lifecycle"
describeDaytona('SandboxService Lifecycle Integration', () => {
    jest.setTimeout(180000);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DaytonaProvider } = require('../providers/daytona.provider');

    let provider: InstanceType<typeof DaytonaProvider>;
    let sandboxId: string | null = null;
    const testUserId = `test_user_${Date.now()}`;

    beforeAll(() => {
        provider = new DaytonaProvider();
    });

    afterAll(async () => {
        if (sandboxId) {
            try {
                await provider.kill(sandboxId);
                console.log(`[Cleanup] Sandbox ${sandboxId} deleted`);
            } catch (error) {
                console.warn(`[Cleanup] Failed to delete sandbox:`, error);
            }
        }
    });

    it('creates sandbox with user metadata', async () => {
        const result = await provider.create({
            metadata: {
                user_id: testUserId,
                test: 'sandbox-service-integration',
            },
        });

        expect(result.sandboxId).toBeDefined();
        sandboxId = result.sandboxId;
        console.log(`[Test] Created sandbox for user ${testUserId}: ${sandboxId}`);
    });

    it('verifies workspace path exists', async () => {
        expect(sandboxId).not.toBeNull();

        const result = await provider.executeCommand(
            sandboxId!,
            `test -d ${SANDBOX_CONFIG.workspacePath} && echo "exists"`
        );

        expect(result.result).toContain('exists');
    });

    it('creates agent workspace directory', async () => {
        expect(sandboxId).not.toBeNull();

        const agentDir = `${SANDBOX_CONFIG.workspacePath}/agents/test-agent`;
        await provider.executeCommand(sandboxId!, `mkdir -p ${agentDir}`);

        const result = await provider.executeCommand(sandboxId!, `test -d ${agentDir} && echo "exists"`);
        expect(result.result).toContain('exists');
    });

    it('writes and reads CLAUDE.md file', async () => {
        expect(sandboxId).not.toBeNull();

        const filePath = `${SANDBOX_CONFIG.workspacePath}/agents/test-agent/CLAUDE.md`;

        // Create file using heredoc (avoids SDK uploadFile limitation)
        const createResult = await provider.executeCommand(
            sandboxId!,
            `cat > ${filePath} << 'EOF'
# Test Agent
You are a test agent for integration testing.
## Skills
- Testing
EOF`
        );
        expect(createResult.exitCode).toBe(0);

        const result = await provider.executeCommand(sandboxId!, `cat ${filePath}`);
        expect(result.result).toContain('# Test Agent');
        expect(result.result).toContain('## Skills');
    });

    it('pauses sandbox and verifies state', async () => {
        expect(sandboxId).not.toBeNull();

        await provider.pause(sandboxId!);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const status = await provider.getStatus(sandboxId!);
        expect(status!.state).toBe('paused');
    });

    it('resumes sandbox and verifies files persist', async () => {
        expect(sandboxId).not.toBeNull();

        await provider.start(sandboxId!);
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const status = await provider.getStatus(sandboxId!);
        expect(status!.state).toBe('running');

        // Verify file still exists
        const result = await provider.executeCommand(
            sandboxId!,
            `cat ${SANDBOX_CONFIG.workspacePath}/agents/test-agent/CLAUDE.md`
        );
        expect(result.result).toContain('# Test Agent');
    });

    it('cleans up sandbox', async () => {
        expect(sandboxId).not.toBeNull();

        await provider.kill(sandboxId!);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // getStatus throws SandboxNotFoundError after deletion
        await expect(provider.getStatus(sandboxId!)).rejects.toThrow('not found');

        sandboxId = null;
    });
});

// Log whether Daytona tests are being run
if (!RUN_DAYTONA_TESTS) {
    console.log('[SandboxTests] DAYTONA_API_KEY not set - skipping Daytona integration tests');
}
