// Sandbox Lifecycle Cleanup Service
// Manages idle Daytona sandboxes for paid users:
// - PAUSE stale sandboxes (idle 24h+) — preserves disk, quick resume
// - KILL only for deactivated users (no active subscription)
// - Clean up stuck execution sessions
// Spec: xerus-y5v.4.112

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface CleanupConfig {
    idle_threshold_ms: number;
    stuck_session_threshold_ms: number;
    max_sandboxes_per_user: number;
}

export interface CleanupResult {
    cleaned: number;
    errors: number;
}

export interface FullCleanupResult {
    stale_sandboxes: CleanupResult;
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
    findOrphanedSandboxes(activeUserIds: string[]): Promise<RegistryRow[]>;
    findStuckSessions(stuckThresholdMs: number): Promise<SessionRow[]>;
    updateSandboxStatus(sandboxId: string, status: string, userId?: string): Promise<void>;
    updateSessionStatus(sessionId: string, status: string): Promise<void>;
}

export interface CleanupSandboxKiller {
    kill(sandboxId: string, userId?: string): Promise<void>;
    pause(sandboxId: string, userId?: string): Promise<void>;
}

export interface CleanupUserLookup {
    getActiveUserIds(): Promise<string[]>;
}

export interface LifecycleCleanupDeps {
    database: CleanupDatabase;
    sandboxKiller: CleanupSandboxKiller;
    userLookup: CleanupUserLookup;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_CONFIG: CleanupConfig = {
    idle_threshold_ms: 24 * 60 * 60 * 1000,          // 24 hours
    stuck_session_threshold_ms: 2 * 60 * 60 * 1000,  // 2 hours
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
                console.error(`[LifecycleCleanup] Failed to pause stale sandbox ${row.sandbox_id}: ${msg}`);
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
                console.error(`[LifecycleCleanup] Failed to kill orphaned sandbox ${row.sandbox_id}: ${msg}`);
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
                console.error(`[LifecycleCleanup] Failed to mark stuck session ${row.id}: ${msg}`);
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
        const orphanedSandboxes = await this.cleanupOrphanedSandboxes();
        const stuckSessions = await this.cleanupStuckSessions();

        return {
            stale_sandboxes: staleSandboxes,
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
