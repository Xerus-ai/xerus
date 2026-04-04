// Sandbox Lifecycle Cleanup Service
// Manages idle Daytona sandboxes for paid users:
// - PAUSE stale sandboxes (idle 24h+) — preserves disk, quick resume
// - KILL only for deactivated users (no active subscription)
// - Clean up stuck execution sessions
// Spec: xerus-y5v.4.112

import { logger } from '../../../utils/logger';

const log = logger('LifecycleCleanup');

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface CleanupConfig {
    idle_threshold_ms: number;
    stuck_session_threshold_ms: number;
    paused_threshold_ms: number;
    max_sandboxes_per_user: number;
}

export interface CleanupResult {
    cleaned: number;
    errors: number;
}

export interface FullCleanupResult {
    stale_sandboxes: CleanupResult;
    long_paused_sandboxes: CleanupResult;
    orphaned_sandboxes: CleanupResult;
    stuck_sessions: CleanupResult;
    timestamp: string;
}

// Registry row shape for stale/orphan queries
interface RegistryRow {
    sandbox_id: string;
    user_id: string;
    status: string;
    last_activity_at: Date;
}

// Session row shape for stuck session queries
interface SessionRow {
    id: string;
    status: string;
    started_at: Date;
}

// Dependency interfaces
export interface CleanupDatabase {
    findStaleSandboxes(idleThresholdMs: number): Promise<RegistryRow[]>;
    findLongPausedSandboxes(pausedThresholdMs: number): Promise<RegistryRow[]>;
    findOrphanedSandboxes(activeUserIds: string[]): Promise<RegistryRow[]>;
    findStuckSessions(stuckThresholdMs: number): Promise<SessionRow[]>;
    updateSandboxStatus(sandboxId: string, status: string, userId?: string): Promise<void>;
    updateSessionStatus(sessionId: string, status: string): Promise<void>;
}

export interface CleanupSandboxControl {
    kill(sandboxId: string, userId: string): Promise<void>;
    pause(sandboxId: string, userId: string): Promise<void>;
}

export interface CleanupUserLookup {
    getActiveUserIds(): Promise<string[]>;
}

export interface LifecycleCleanupDeps {
    database: CleanupDatabase;
    sandboxKiller: CleanupSandboxControl;
    userLookup: CleanupUserLookup;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_CONFIG: CleanupConfig = {
    idle_threshold_ms: 24 * 60 * 60 * 1000,          // 24 hours
    stuck_session_threshold_ms: 2 * 60 * 60 * 1000,  // 2 hours
    paused_threshold_ms: 30 * 24 * 60 * 60 * 1000,   // 30 days
    max_sandboxes_per_user: 1,
};

// -----------------------------------------------------------------------------
// Lifecycle Cleanup Service
// -----------------------------------------------------------------------------

export class LifecycleCleanupService {
    private readonly deps: LifecycleCleanupDeps;
    private readonly config: CleanupConfig;

    constructor(deps: LifecycleCleanupDeps, config?: Partial<CleanupConfig>) {
        this.deps = deps;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    // -------------------------------------------------------------------------
    // Stale Sandbox Cleanup — PAUSE (not kill) for active users
    // Users pay for their Pod; pausing preserves disk and allows quick resume.
    // -------------------------------------------------------------------------

    async cleanupStaleSandboxes(): Promise<CleanupResult> {
        const staleRows = await this.deps.database.findStaleSandboxes(
            this.config.idle_threshold_ms
        );

        let cleaned = 0;
        let errors = 0;

        for (const row of staleRows) {
            try {
                await this.deps.sandboxKiller.pause(row.sandbox_id, row.user_id);
                await this.deps.database.updateSandboxStatus(row.sandbox_id, 'paused', row.user_id);
                cleaned++;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                log.error('Failed to pause stale sandbox', { sandbox_id: row.sandbox_id, error: msg });
                errors++;
            }
        }

        return { cleaned, errors };
    }

    // -------------------------------------------------------------------------
    // Long-Paused Sandbox Cleanup — KILL sandboxes paused for 30+ days
    // Users who stop using the platform accumulate paused Daytona volumes.
    // S3 backup exists as safety net for data recovery.
    // -------------------------------------------------------------------------

    async cleanupLongPausedSandboxes(): Promise<CleanupResult> {
        const longPausedRows = await this.deps.database.findLongPausedSandboxes(
            this.config.paused_threshold_ms
        );

        let cleaned = 0;
        let errors = 0;

        for (const row of longPausedRows) {
            try {
                await this.deps.sandboxKiller.kill(row.sandbox_id, row.user_id);
                await this.deps.database.updateSandboxStatus(row.sandbox_id, 'killed', row.user_id);
                cleaned++;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                log.error('Failed to kill long-paused sandbox', { sandbox_id: row.sandbox_id, error: msg });
                errors++;
            }
        }

        return { cleaned, errors };
    }

    // -------------------------------------------------------------------------
    // Orphaned Sandbox Cleanup — KILL sandboxes for deactivated users only
    // These users no longer have active accounts; safe to reclaim resources.
    // -------------------------------------------------------------------------

    async cleanupOrphanedSandboxes(): Promise<CleanupResult> {
        const activeUserIds = await this.deps.userLookup.getActiveUserIds();
        const orphanRows = await this.deps.database.findOrphanedSandboxes(activeUserIds);

        let cleaned = 0;
        let errors = 0;

        for (const row of orphanRows) {
            try {
                await this.deps.sandboxKiller.kill(row.sandbox_id, row.user_id);
                await this.deps.database.updateSandboxStatus(row.sandbox_id, 'killed', row.user_id);
                cleaned++;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                log.error('Failed to kill orphaned sandbox', { sandbox_id: row.sandbox_id, error: msg });
                errors++;
            }
        }

        return { cleaned, errors };
    }

    // -------------------------------------------------------------------------
    // Stuck Session Cleanup
    // -------------------------------------------------------------------------

    async cleanupStuckSessions(): Promise<CleanupResult> {
        const stuckRows = await this.deps.database.findStuckSessions(
            this.config.stuck_session_threshold_ms
        );

        let cleaned = 0;
        let errors = 0;

        for (const row of stuckRows) {
            try {
                await this.deps.database.updateSessionStatus(row.id, 'failed');
                cleaned++;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                log.error('Failed to mark stuck session', { session_id: row.id, error: msg });
                errors++;
            }
        }

        return { cleaned, errors };
    }

    // -------------------------------------------------------------------------
    // Full Cleanup Run
    // -------------------------------------------------------------------------

    async runFullCleanup(): Promise<FullCleanupResult> {
        const staleSandboxes = await this.cleanupStaleSandboxes();
        const longPausedSandboxes = await this.cleanupLongPausedSandboxes();
        const orphanedSandboxes = await this.cleanupOrphanedSandboxes();
        const stuckSessions = await this.cleanupStuckSessions();

        return {
            stale_sandboxes: staleSandboxes,
            long_paused_sandboxes: longPausedSandboxes,
            orphaned_sandboxes: orphanedSandboxes,
            stuck_sessions: stuckSessions,
            timestamp: new Date().toISOString(),
        };
    }
}

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

export function createLifecycleCleanupService(
    deps: LifecycleCleanupDeps,
    config?: Partial<CleanupConfig>
): LifecycleCleanupService {
    return new LifecycleCleanupService(deps, config);
}
