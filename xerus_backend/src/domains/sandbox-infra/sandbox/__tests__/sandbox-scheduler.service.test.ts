// Sandbox Scheduler Service Tests
// Tests for wake/sleep lifecycle management

import { SandboxSchedulerService, SandboxSchedulerDeps } from '../sandbox-scheduler.service';
import { SandboxState } from '../../../execution/types';

// ---- In-memory test database ----

interface RegistryRow {
    user_id: string;
    sandbox_id: string;
    status: SandboxState;
    last_activity_at: Date;
    active_execution_count: number;
    created_at: Date;
    paused_at: Date | null;
    resume_count: number;
    total_runtime_seconds: number;
}

class InMemorySchedulerDB {
    registryRows: RegistryRow[] = [];

    async query<T>(sql: string, _params?: unknown[]): Promise<{ rows: T[] }> {
        const normalized = sql.toLowerCase().replace(/\s+/g, ' ').trim();

        if (normalized.includes('from workspaces') && normalized.includes('sandbox_status') && normalized.includes('running')) {
            const rows = this.registryRows.filter(r => r.status === 'running');
            return { rows: rows as unknown as T[] };
        }

        return { rows: [] };
    }
}

// ---- Fake sandbox provider for tracking wake/sleep calls ----

class FakeSandboxProvider {
    wokenSandboxIds: string[] = [];
    sleptSandboxIds: string[] = [];
    connectResults: Map<string, boolean> = new Map();

    async connect(sandboxId: string): Promise<void> {
        const shouldSucceed = this.connectResults.get(sandboxId) ?? true;
        if (!shouldSucceed) {
            throw new Error(`Connection to ${sandboxId} failed`);
        }
        this.wokenSandboxIds.push(sandboxId);
    }

    async pause(sandboxId: string): Promise<void> {
        this.sleptSandboxIds.push(sandboxId);
    }

    reset(): void {
        this.wokenSandboxIds = [];
        this.sleptSandboxIds = [];
        this.connectResults.clear();
    }
}

// ---- Tests ----

describe('SandboxSchedulerService', () => {
    let db: InMemorySchedulerDB;
    let provider: FakeSandboxProvider;
    let scheduler: SandboxSchedulerService;

    beforeEach(() => {
        db = new InMemorySchedulerDB();
        provider = new FakeSandboxProvider();
        const deps: SandboxSchedulerDeps = {
            db: { query: db.query.bind(db) },
            wakeHandler: async (sandboxId: string) => {
                await provider.connect(sandboxId);
            },
            sleepHandler: async (sandboxId: string) => {
                await provider.pause(sandboxId);
            },
        };
        scheduler = new SandboxSchedulerService(deps);
    });

    afterEach(() => {
        scheduler.stop();
    });

    describe('start/stop lifecycle', () => {
        it('starts and reports running', () => {
            scheduler.start();
            expect(scheduler.isRunning()).toBe(true);
        });

        it('stops and reports not running', () => {
            scheduler.start();
            scheduler.stop();
            expect(scheduler.isRunning()).toBe(false);
        });

        it('does not start twice', () => {
            scheduler.start();
            scheduler.start();
            expect(scheduler.isRunning()).toBe(true);
        });
    });

    describe('evaluateSleepCandidates', () => {
        it('marks sandbox for sleep when inactive beyond threshold', async () => {
            const pastDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000); // 4 days ago (beyond 3-day default)
            db.registryRows.push({
                user_id: 'user-1',
                sandbox_id: 'sb-1',
                status: 'running',
                last_activity_at: pastDate,
                active_execution_count: 0,
                created_at: pastDate,
                paused_at: null,
                resume_count: 0,
                total_runtime_seconds: 0,
            });

            const result = await scheduler.evaluateSleepCandidates();

            expect(result.evaluated).toBe(1);
            expect(result.slept).toBe(1);
            expect(provider.sleptSandboxIds).toContain('sb-1');
        });

        it('skips sandbox with active executions', async () => {
            const pastDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000); // 4 days ago
            db.registryRows.push({
                user_id: 'user-2',
                sandbox_id: 'sb-2',
                status: 'running',
                last_activity_at: pastDate,
                active_execution_count: 1,
                created_at: pastDate,
                paused_at: null,
                resume_count: 0,
                total_runtime_seconds: 0,
            });

            const result = await scheduler.evaluateSleepCandidates();

            expect(result.evaluated).toBe(1);
            expect(result.slept).toBe(0);
            expect(provider.sleptSandboxIds).toHaveLength(0);
        });

        it('skips sandbox with recent activity', async () => {
            const recentDate = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
            db.registryRows.push({
                user_id: 'user-3',
                sandbox_id: 'sb-3',
                status: 'running',
                last_activity_at: recentDate,
                active_execution_count: 0,
                created_at: recentDate,
                paused_at: null,
                resume_count: 0,
                total_runtime_seconds: 0,
            });

            const result = await scheduler.evaluateSleepCandidates();

            expect(result.evaluated).toBe(1);
            expect(result.slept).toBe(0);
        });

    });

    describe('wakeForUser', () => {
        it('wakes a paused sandbox for a user message', async () => {
            const result = await scheduler.wakeForUser('user-wake-1', 'sb-wake-1');

            expect(result.woken).toBe(true);
            expect(result.sandboxId).toBe('sb-wake-1');
            expect(provider.wokenSandboxIds).toContain('sb-wake-1');
        });

        it('reports failure when wake fails', async () => {
            provider.connectResults.set('sb-fail', false);
            const result = await scheduler.wakeForUser('user-fail', 'sb-fail');

            expect(result.woken).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe('wakeForHeartbeat', () => {
        it('wakes a sandbox for pre-warm before heartbeat', async () => {
            const result = await scheduler.wakeForHeartbeat('user-hb-1', 'sb-hb-1', 42);

            expect(result.woken).toBe(true);
            expect(result.sandboxId).toBe('sb-hb-1');
            expect(result.reason).toBe('heartbeat_prewarm');
        });
    });

    describe('wakeForEvent', () => {
        it('wakes a sandbox for an incoming event', async () => {
            const result = await scheduler.wakeForEvent('user-ev-1', 'sb-ev-1', 'webhook');

            expect(result.woken).toBe(true);
            expect(result.reason).toBe('event');
        });
    });

    describe('getSchedulerStats', () => {
        it('returns tick count and status', () => {
            scheduler.start();
            const stats = scheduler.getStats();

            expect(stats.running).toBe(true);
            expect(stats.tickCount).toBe(0);
            expect(stats.lastTickAt).toBeNull();
        });
    });

    describe('custom thresholds', () => {
        it('respects custom inactivity timeout', async () => {
            const customDeps: SandboxSchedulerDeps = {
                db: { query: db.query.bind(db) },
                wakeHandler: async (sandboxId: string) => {
                    await provider.connect(sandboxId);
                },
                sleepHandler: async (sandboxId: string) => {
                    await provider.pause(sandboxId);
                },
                inactivityTimeoutMinutes: 5,
            };
            const customScheduler = new SandboxSchedulerService(customDeps);

            // 6 minutes ago should be beyond 5 min threshold
            const pastDate = new Date(Date.now() - 6 * 60 * 1000);
            db.registryRows.push({
                user_id: 'user-custom',
                sandbox_id: 'sb-custom',
                status: 'running',
                last_activity_at: pastDate,
                active_execution_count: 0,
                created_at: pastDate,
                paused_at: null,
                resume_count: 0,
                total_runtime_seconds: 0,
            });

            const result = await customScheduler.evaluateSleepCandidates();
            expect(result.slept).toBe(1);

            customScheduler.stop();
        });
    });
});
