// Sandbox Lifecycle Cleanup Service Tests
// Tests for stale sandbox GC, orphan detection, stuck session cleanup

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '..', '.env') });

import {
    LifecycleCleanupService,
    LifecycleCleanupDeps,
    CleanupConfig,
} from '../lifecycle-cleanup.service';

// In-memory implementations
type RegistryRow = { sandbox_id: string; user_id: string; status: string; last_activity_at: Date };
type SessionRow = { id: string; status: string; started_at: Date };

class InMemoryCleanupDatabase {
    public registryRows: RegistryRow[] = [];
    public sessionRows: SessionRow[] = [];
    public updatedStatuses: Array<{ table: string; id: string; status: string }> = [];

    async findStaleSandboxes(idleThresholdMs: number): Promise<RegistryRow[]> {
        const cutoff = new Date(Date.now() - idleThresholdMs);
        return this.registryRows.filter(
            (r) => (r.status === 'paused' || r.status === 'running') && r.last_activity_at < cutoff
        );
    }

    async findOrphanedSandboxes(activeUserIds: string[]): Promise<RegistryRow[]> {
        return this.registryRows.filter(
            (r) => r.status !== 'killed' && !activeUserIds.includes(r.user_id)
        );
    }

    async findStuckSessions(stuckThresholdMs: number): Promise<SessionRow[]> {
        const cutoff = new Date(Date.now() - stuckThresholdMs);
        return this.sessionRows.filter(
            (s) => s.status === 'running' && s.started_at < cutoff
        );
    }

    async updateSandboxStatus(sandboxId: string, status: string, _userId?: string): Promise<void> {
        this.updatedStatuses.push({ table: 'workspaces', id: sandboxId, status });
        const row = this.registryRows.find((r) => r.sandbox_id === sandboxId);
        if (row) row.status = status;
    }

    async updateSessionStatus(sessionId: string, status: string): Promise<void> {
        this.updatedStatuses.push({ table: 'execution_sessions', id: sessionId, status });
        const row = this.sessionRows.find((s) => s.id === sessionId);
        if (row) row.status = status;
    }
}

class InMemorySandboxKiller {
    public killed: string[] = [];
    public shouldFail = false;

    async kill(sandboxId: string): Promise<void> {
        if (this.shouldFail) throw new Error('Kill failed');
        this.killed.push(sandboxId);
    }
}

class InMemoryUserLookup {
    public activeUserIds: string[] = [];

    async getActiveUserIds(): Promise<string[]> {
        return this.activeUserIds;
    }
}

function createConfig(overrides?: Partial<CleanupConfig>): CleanupConfig {
    return {
        idle_threshold_ms: 24 * 60 * 60 * 1000,
        stuck_session_threshold_ms: 2 * 60 * 60 * 1000,
        max_sandboxes_per_user: 1,
        ...overrides,
    };
}

describe('LifecycleCleanupService', () => {
    let service: LifecycleCleanupService;
    let db: InMemoryCleanupDatabase;
    let killer: InMemorySandboxKiller;
    let userLookup: InMemoryUserLookup;

    beforeEach(() => {
        db = new InMemoryCleanupDatabase();
        killer = new InMemorySandboxKiller();
        userLookup = new InMemoryUserLookup();

        const deps: LifecycleCleanupDeps = {
            database: db,
            sandboxKiller: killer,
            userLookup,
        };

        service = new LifecycleCleanupService(deps, createConfig());
    });

    describe('cleanupStaleSandboxes', () => {
        it('should kill sandboxes idle for more than threshold', async () => {
            db.registryRows.push({
                sandbox_id: 'sbx-stale',
                user_id: 'user-1',
                status: 'paused',
                last_activity_at: new Date(Date.now() - 25 * 60 * 60 * 1000),
            });

            const result = await service.cleanupStaleSandboxes();

            expect(result.cleaned).toBe(1);
            expect(killer.killed).toContain('sbx-stale');
            expect(db.updatedStatuses).toContainEqual({
                table: 'workspaces',
                id: 'sbx-stale',
                status: 'killed',
            });
        });

        it('should not kill recently active sandboxes', async () => {
            db.registryRows.push({
                sandbox_id: 'sbx-active',
                user_id: 'user-1',
                status: 'paused',
                last_activity_at: new Date(),
            });

            const result = await service.cleanupStaleSandboxes();

            expect(result.cleaned).toBe(0);
            expect(killer.killed).toHaveLength(0);
        });

        it('should handle multiple stale sandboxes', async () => {
            for (let i = 0; i < 5; i++) {
                db.registryRows.push({
                    sandbox_id: `sbx-${i}`,
                    user_id: `user-${i}`,
                    status: 'paused',
                    last_activity_at: new Date(Date.now() - 48 * 60 * 60 * 1000),
                });
            }

            const result = await service.cleanupStaleSandboxes();
            expect(result.cleaned).toBe(5);
            expect(killer.killed).toHaveLength(5);
        });

        it('should continue on individual kill failure', async () => {
            db.registryRows.push(
                {
                    sandbox_id: 'sbx-fail',
                    user_id: 'user-1',
                    status: 'paused',
                    last_activity_at: new Date(Date.now() - 25 * 60 * 60 * 1000),
                },
                {
                    sandbox_id: 'sbx-ok',
                    user_id: 'user-2',
                    status: 'paused',
                    last_activity_at: new Date(Date.now() - 25 * 60 * 60 * 1000),
                },
            );

            let callCount = 0;
            killer.kill = async (sandboxId: string) => {
                callCount++;
                if (callCount === 1) throw new Error('First kill failed');
                killer.killed.push(sandboxId);
            };

            const result = await service.cleanupStaleSandboxes();
            expect(result.cleaned).toBe(1);
            expect(result.errors).toBe(1);
        });
    });

    describe('cleanupOrphanedSandboxes', () => {
        it('should kill sandboxes for deleted users', async () => {
            userLookup.activeUserIds = ['user-1', 'user-2'];

            db.registryRows.push({
                sandbox_id: 'sbx-orphan',
                user_id: 'user-deleted',
                status: 'running',
                last_activity_at: new Date(),
            });

            const result = await service.cleanupOrphanedSandboxes();

            expect(result.cleaned).toBe(1);
            expect(killer.killed).toContain('sbx-orphan');
        });

        it('should not kill sandboxes for active users', async () => {
            userLookup.activeUserIds = ['user-1'];

            db.registryRows.push({
                sandbox_id: 'sbx-valid',
                user_id: 'user-1',
                status: 'running',
                last_activity_at: new Date(),
            });

            const result = await service.cleanupOrphanedSandboxes();
            expect(result.cleaned).toBe(0);
        });
    });

    describe('cleanupStuckSessions', () => {
        it('should mark stuck sessions as failed', async () => {
            db.sessionRows.push({
                id: 'session-stuck',
                status: 'running',
                started_at: new Date(Date.now() - 3 * 60 * 60 * 1000),
            });

            const result = await service.cleanupStuckSessions();

            expect(result.cleaned).toBe(1);
            expect(db.updatedStatuses).toContainEqual({
                table: 'execution_sessions',
                id: 'session-stuck',
                status: 'failed',
            });
        });

        it('should not touch recently started sessions', async () => {
            db.sessionRows.push({
                id: 'session-ok',
                status: 'running',
                started_at: new Date(),
            });

            const result = await service.cleanupStuckSessions();
            expect(result.cleaned).toBe(0);
        });
    });

    describe('runFullCleanup', () => {
        it('should run all cleanup phases and aggregate results', async () => {
            db.registryRows.push({
                sandbox_id: 'sbx-stale',
                user_id: 'user-active',
                status: 'paused',
                last_activity_at: new Date(Date.now() - 25 * 60 * 60 * 1000),
            });

            db.sessionRows.push({
                id: 'session-stuck',
                status: 'running',
                started_at: new Date(Date.now() - 3 * 60 * 60 * 1000),
            });

            userLookup.activeUserIds = ['user-active'];

            const result = await service.runFullCleanup();

            expect(result.stale_sandboxes.cleaned).toBe(1);
            expect(result.stuck_sessions.cleaned).toBe(1);
            expect(result.orphaned_sandboxes.cleaned).toBe(0);
        });

        it('should return zero for clean system', async () => {
            userLookup.activeUserIds = [];
            const result = await service.runFullCleanup();

            expect(result.stale_sandboxes.cleaned).toBe(0);
            expect(result.orphaned_sandboxes.cleaned).toBe(0);
            expect(result.stuck_sessions.cleaned).toBe(0);
        });
    });
});
