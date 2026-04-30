// Sandbox Registry - Database operations for workspaces table (sandbox columns)
// Migration 066 absorbed sandbox_registry into workspaces.

import { SandboxState } from '../../execution/types';
import type { SandboxRegistryEntry, SandboxSession } from './sandbox.types';

export interface RegistryDatabase {
    query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/** TTL cache entry for getByUserId lookups */
interface CacheEntry {
    value: SandboxRegistryEntry | null;
    expiresAt: number;
}

/**
 * How long to cache getByUserId results (ms).
 * Multiple concurrent routes call getSandboxStatus() for the same user;
 * this collapses ~30 identical DB queries into 1 per 3-second window.
 */
const CACHE_TTL_MS = 3000;

/** Evict expired entries when cache exceeds this size */
const EVICTION_THRESHOLD = 100;

export class SandboxRegistry {
    private cache: Map<string, CacheEntry> = new Map();
    private inflight: Map<string, Promise<SandboxRegistryEntry | null>> = new Map();

    constructor(private readonly db: RegistryDatabase) {}

    async persist(session: SandboxSession): Promise<void> {
        await this.db.query(
            `INSERT INTO workspaces (user_id, slug, name, sandbox_id, sandbox_status, created_at, sandbox_last_activity_at, sandbox_novnc_url, sandbox_plan)
             VALUES ($1, 'default', 'Default Workspace', $2, $3, $4, $5, $6, $7)
             ON CONFLICT (user_id) DO UPDATE SET
                 sandbox_id = EXCLUDED.sandbox_id,
                 sandbox_status = EXCLUDED.sandbox_status,
                 sandbox_last_activity_at = EXCLUDED.sandbox_last_activity_at,
                 sandbox_novnc_url = EXCLUDED.sandbox_novnc_url,
                 sandbox_plan = EXCLUDED.sandbox_plan,
                 updated_at = NOW()`,
            [session.userId, session.sandboxId, session.status, session.createdAt, session.lastActivityAt, session.novncUrl || null, session.sandboxPlan || null]
        );
        this.invalidate(session.userId);
    }

    async updateStatus(userId: string, status: SandboxState): Promise<void> {
        const pausedAt = status === 'paused' ? new Date() : null;
        await this.db.query(
            `UPDATE workspaces SET sandbox_status = $2, sandbox_paused_at = $3, sandbox_last_activity_at = NOW(), updated_at = NOW()
             WHERE user_id = $1`,
            [userId, status, pausedAt]
        );
        this.invalidate(userId);
    }

    async incrementResumeCount(userId: string): Promise<void> {
        await this.db.query(
            `UPDATE workspaces SET sandbox_resume_count = sandbox_resume_count + 1, updated_at = NOW()
             WHERE user_id = $1`,
            [userId],
        );
        this.invalidate(userId);
    }

    /**
     * Combined updateStatus('running') + incrementResumeCount in a single SQL round-trip.
     * Used by resume flow as fire-and-forget to avoid two sequential invalidations.
     */
    async markResumed(userId: string): Promise<void> {
        // Eager invalidate: prevent stale 'paused' reads during async DB write
        this.invalidate(userId);
        await this.db.query(
            `UPDATE workspaces
             SET sandbox_status = 'running',
                 sandbox_paused_at = NULL,
                 sandbox_resume_count = sandbox_resume_count + 1,
                 sandbox_last_activity_at = NOW(),
                 updated_at = NOW()
             WHERE user_id = $1`,
            [userId],
        );
        this.invalidate(userId);
    }

    /** Invalidate cache for a user. Call after external DB writes. */
    invalidate(userId: string): void {
        this.cache.delete(userId);
        this.inflight.delete(userId);
    }

    async getByUserId(userId: string): Promise<SandboxRegistryEntry | null> {
        const cached = this.cache.get(userId);
        if (cached && Date.now() < cached.expiresAt) {
            return cached.value;
        }

        // Collapse concurrent misses into a single DB query
        const pending = this.inflight.get(userId);
        if (pending) return pending;

        const promise = this.db.query<SandboxRegistryEntry>(
            `SELECT id, user_id, slug, name, sandbox_id, sandbox_status, sandbox_template_version,
                    sandbox_active_agent_id, sandbox_active_execution_count, created_at,
                    sandbox_paused_at, sandbox_last_activity_at, sandbox_total_runtime_seconds,
                    sandbox_resume_count, sandbox_novnc_url, sandbox_plan
             FROM workspaces WHERE user_id = $1`,
            [userId],
        ).then(result => {
            const value = result.rows[0] || null;
            this.cache.set(userId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
            this.inflight.delete(userId);
            this.evictExpired();
            return value;
        }).catch(err => {
            this.inflight.delete(userId);
            throw err;
        });

        this.inflight.set(userId, promise);
        return promise;
    }

    /** Remove expired entries when cache grows beyond threshold. */
    private evictExpired(): void {
        if (this.cache.size <= EVICTION_THRESHOLD) return;
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (now >= entry.expiresAt) {
                this.cache.delete(key);
            }
        }
    }
}
