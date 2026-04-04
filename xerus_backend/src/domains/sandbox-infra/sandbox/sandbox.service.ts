// Daytona Sandbox Service — per-user lifecycle: create, resume, pause, kill
import { logger } from '../../../utils/logger';
import { SANDBOX_CONFIG } from './sandbox.config';
import {
    SandboxSession,
    SandboxRegistryEntry,
    CreateSandboxOptions,
    SandboxOperationResult,
    SandboxStatusResponse,
} from './sandbox.types';
import { SandboxProvider, getDefaultProvider } from './providers';
import type { SessionHandle } from './providers';
import type { SandboxFileSystem } from '../workspace/workspace.manager';
import type { DaytonaProvider } from './providers/daytona.provider';
import { SandboxRegistry } from './sandbox-registry';
import { createWorkspaceTar, restoreWorkspaceTar } from './snapshot-helpers';
import { getOrCreateRunnerSession } from './runner-session';
import {
    runWorkspaceClone,
    runWorkspacePersonalize,
    runRunnerInstall,
    runFullWorkspaceSetup,
    runWorkspaceHealthCheck,
    runBrowserSetup,
} from './sandbox-setup';
import type { S3BackupService } from '../storage/s3-backup.service';

const log = logger('SandboxService');

// Database interface (injected dependency)
export interface SandboxDatabase {
    query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export class SandboxService {
    // In-memory session cache. Assumes single Node.js process — if horizontally scaled,
    // use the SandboxRegistry (DB-backed with 3s TTL) as the authoritative source instead.
    private sessions: Map<string, SandboxSession> = new Map();
    private creating: Map<string, Promise<SandboxSession>> = new Map();
    private db: SandboxDatabase;
    private provider: SandboxProvider;
    private registry: SandboxRegistry;
    private s3Backup: S3BackupService | undefined;

    constructor(db: SandboxDatabase, provider?: SandboxProvider, s3Backup?: S3BackupService) {
        this.db = db;
        this.provider = provider || getDefaultProvider();
        this.registry = new SandboxRegistry(db);
        this.s3Backup = s3Backup;
    }

    getProvider(): SandboxProvider { return this.provider; }

    /** Invalidate registry cache for a user. Call after external DB writes to sandbox_status. */
    invalidateRegistryCache(userId: string): void {
        this.registry.invalidate(userId);
    }

    getDaytonaProvider(): DaytonaProvider {
        const provider = this.provider as unknown as DaytonaProvider;
        if (typeof provider.executeCommand !== 'function') {
            throw new Error('Provider does not support executeCommand — Daytona provider required');
        }
        return provider;
    }

    private getSetupDeps() {
        return {
            getDaytonaProvider: () => this.getDaytonaProvider(),
            getSandboxFs: (sandboxId: string) => this.getSandboxFs(sandboxId),
            db: this.db,
        };
    }

    async getOrCreateSandbox(options: CreateSandboxOptions): Promise<SandboxSession> {
        const { userId } = options;

        const cached = this.sessions.get(userId);
        if (cached && cached.status === 'running') {
            cached.lastActivityAt = new Date();
            return cached;
        }

        // Deduplicate concurrent calls for the same user
        const inflight = this.creating.get(userId);
        if (inflight) return inflight;

        const promise = this.doGetOrCreate(options).finally(() => this.creating.delete(userId));
        this.creating.set(userId, promise);
        return promise;
    }

    private async doGetOrCreate(options: CreateSandboxOptions): Promise<SandboxSession> {
        const resumed = await this.tryResumeSandbox(options.userId);
        if (resumed) {
            return resumed;
        }

        return await this.createSandbox(options);
    }

    async createSandbox(options: CreateSandboxOptions): Promise<SandboxSession> {
        const { userId, template, timeoutMs, envVars } = options;
        const startTime = Date.now();

        // Kill any existing sandbox for this user to prevent orphaning
        const existing = await this.registry.getByUserId(userId);
        if (existing && existing.sandbox_status !== 'killed' && existing.sandbox_id) {
            try {
                await this.provider.kill(existing.sandbox_id);
                log.info('Killed previous sandbox', { sandbox_id: existing.sandbox_id, user_id: userId });
            } catch (err) {
                // Sandbox may already be deleted externally — log and continue
                log.warn('Could not kill previous sandbox', { sandbox_id: existing.sandbox_id, error: (err as Error).message });
            }
            this.sessions.delete(userId);
        }

        const sandbox = await this.provider.create({
            snapshot: template || SANDBOX_CONFIG.snapshot,
            timeoutMs: timeoutMs || SANDBOX_CONFIG.operationTimeoutMs,
            envVars,
            metadata: {
                user_id: userId,
                created_at: new Date().toISOString(),
            },
        });

        const deps = this.getSetupDeps();

        // Clone xerus-workspace template repo (provides all static files)
        await runWorkspaceClone(sandbox.sandboxId, deps);

        // Restore latest S3 snapshot if available (user data: memory, agents, KB)
        await this.tryRestoreSnapshot(sandbox.sandboxId, userId);

        // Write dynamic content (userId in settings, master memory seeds, company.db)
        // Runs AFTER restore so personalize fixes up any stale config from snapshot
        await runWorkspacePersonalize(sandbox.sandboxId, userId, deps);

        // Complete workspace setup: git init, context dirs, Node.js verify, agent sync
        // Must run BEFORE runner install — runner install needs npm which needs Node.js
        const setupReport = await runFullWorkspaceSetup(sandbox.sandboxId, userId, deps);

        // Install runner bundle and npm dependencies (idempotent)
        // Node.js is guaranteed available after runFullWorkspaceSetup
        await runRunnerInstall(sandbox.sandboxId, deps);

        // Browser setup is LAZY — only runs on first browser_* HITL scenario
        // via ensureBrowserReady(). Avoids ~300MB Chromium download for non-browser agents.

        const session: SandboxSession = {
            sandboxId: sandbox.sandboxId,
            userId,
            status: 'running',
            createdAt: new Date(),
            lastActivityAt: new Date(),
            wasResumed: false,
            activeExecutionCount: 0,
            agentSessions: new Map(),
            setupReport,
        };

        this.sessions.set(userId, session);
        await this.registry.persist(session);

        log.info('Created sandbox', { sandbox_id: sandbox.sandboxId, user_id: userId, duration_ms: Date.now() - startTime });
        return session;
    }

    async resumeSandbox(userId: string): Promise<SandboxSession | null> { return this.tryResumeSandbox(userId); }

    async pauseSandbox(userId: string): Promise<SandboxOperationResult> {
        const startTime = Date.now();
        const session = this.sessions.get(userId);

        if (!session) {
            return { success: false, sandboxId: '', message: 'No active sandbox found for user', durationMs: Date.now() - startTime };
        }

        if (session.activeExecutionCount > 0) {
            return {
                success: false,
                sandboxId: session.sandboxId,
                message: `Cannot pause sandbox with ${session.activeExecutionCount} active executions`,
                durationMs: Date.now() - startTime,
            };
        }

        try {
            // Best-effort S3 backup before pause (failure does not block pause)
            await this.tryCreateSnapshot(session.sandboxId, userId);

            await this.provider.pause(session.sandboxId);
            session.status = 'paused';
            session.lastActivityAt = new Date();
            this.sessions.set(userId, session);
            await this.registry.updateStatus(userId, 'paused');

            log.info('Paused sandbox', { sandbox_id: session.sandboxId, user_id: userId, duration_ms: Date.now() - startTime });
            return { success: true, sandboxId: session.sandboxId, durationMs: Date.now() - startTime };
        } catch (error) {
            // Cleanup: sandbox is gone, update local and registry state
            log.warn('Failed to pause sandbox', { sandbox_id: session.sandboxId, error: (error as Error).message });
            this.sessions.delete(userId);
            await this.registry.updateStatus(userId, 'killed');
            // Fail-fast: re-throw after cleanup so caller can handle
            throw error;
        }
    }

    async killSandbox(userId: string): Promise<SandboxOperationResult> {
        const startTime = Date.now();
        const session = this.sessions.get(userId);

        if (!session) {
            const registryEntry = await this.registry.getByUserId(userId);
            if (registryEntry && registryEntry.sandbox_status !== 'killed') {
                await this.provider.kill(registryEntry.sandbox_id!);
                await this.registry.updateStatus(userId, 'killed');
            }
            return {
                success: true,
                sandboxId: registryEntry?.sandbox_id || '',
                message: 'No active session, cleaned up registry',
                durationMs: Date.now() - startTime,
            };
        }

        // Best-effort S3 backup before kill (failure does not block kill)
        await this.tryCreateSnapshot(session.sandboxId, userId);

        let killError: unknown;
        try {
            await this.provider.kill(session.sandboxId);
        } catch (err) {
            killError = err;
        } finally {
            // Always clean up local state — sandbox is gone regardless
            this.sessions.delete(userId);
            await this.registry.updateStatus(userId, 'killed');
        }

        if (killError) throw killError;

        log.info('Killed sandbox', { sandbox_id: session.sandboxId, user_id: userId, duration_ms: Date.now() - startTime });
        return { success: true, sandboxId: session.sandboxId, durationMs: Date.now() - startTime };
    }

    async getSandboxStatus(userId: string): Promise<SandboxStatusResponse> {
        const s = this.sessions.get(userId);
        const r = await this.registry.getByUserId(userId);
        return {
            userId,
            sandboxId: s?.sandboxId || r?.sandbox_id || null,
            status: s?.status || r?.sandbox_status || 'none',
            lastActivityAt: s?.lastActivityAt || r?.sandbox_last_activity_at || null,
            activeExecutionCount: s?.activeExecutionCount || r?.sandbox_active_execution_count || 0,
            resumeCount: r?.sandbox_resume_count || 0,
            totalRuntimeSeconds: r?.sandbox_total_runtime_seconds || 0,
        };
    }

    incrementExecutionCount(userId: string): void {
        const session = this.sessions.get(userId);
        if (session) { session.activeExecutionCount++; session.lastActivityAt = new Date(); }
    }

    decrementExecutionCount(userId: string): void {
        const session = this.sessions.get(userId);
        if (session && session.activeExecutionCount > 0) { session.activeExecutionCount--; session.lastActivityAt = new Date(); }
    }

    getActiveExecutionCount(userId: string): number { return this.sessions.get(userId)?.activeExecutionCount || 0; }

    getSession(userId: string): SandboxSession | null {
        return this.sessions.get(userId) ?? null;
    }

    hasSandbox(userId: string): boolean {
        const session = this.sessions.get(userId);
        return session !== undefined && session.status !== 'killed';
    }

    getActiveSessions(): SandboxSession[] { return Array.from(this.sessions.values()).filter((s) => s.status === 'running'); }

    /** Clear in-memory session and registry cache for a user. Called by cleanup jobs that kill/pause sandboxes externally. */
    clearCachedSession(userId: string): void {
        this.sessions.delete(userId);
        this.registry.invalidate(userId);
    }

    /**
     * Look up an existing agent session handle by slug.
     * Returns null if no session exists for the agent (does NOT create one).
     * Used by inbound message routing to forward human messages to a running agent.
     */
    getAgentHandle(userId: string, agentSlug: string): SessionHandle | null {
        const session = this.sessions.get(userId);
        if (!session || session.status !== 'running') return null;
        const entry = session.agentSessions.get(agentSlug);
        return entry?.handle ?? null;
    }

    async getOrCreateRunner(
        userId: string,
        sandboxId: string,
        envVars: Record<string, string>,
        agentSlug?: string,
        adapterType?: import('./providers').AgentSessionOptions['adapterType'],
        systemPrompt?: string,
    ): Promise<SessionHandle> {
        const session = this.sessions.get(userId);
        if (!session || session.status !== 'running') {
            throw new Error('No running sandbox for user');
        }
        return getOrCreateRunnerSession(session, sandboxId, envVars, this.getDaytonaProvider(), agentSlug, adapterType, systemPrompt);
    }

    /**
     * Lazily initialize browser infrastructure (Chromium + noVNC) on first use.
     * Called when a browser_* HITL scenario triggers. Idempotent — skips if already set up.
     * Returns the noVNC URL for the browser panel.
     */
    async ensureBrowserReady(userId: string): Promise<string> {
        const session = this.sessions.get(userId);
        if (!session || session.status !== 'running') {
            throw new Error('No running sandbox for user');
        }

        // Already set up — return cached URL
        if (session.novncUrl) {
            log.debug('ensureBrowserReady: returning cached novncUrl', { user_id: userId, sandbox_id: session.sandboxId });
            return session.novncUrl;
        }
        log.info('ensureBrowserReady: running fresh browser setup', { user_id: userId, sandbox_id: session.sandboxId });


        const deps = this.getSetupDeps();
        const browserSetup = await runBrowserSetup(session.sandboxId, deps);
        session.novncUrl = browserSetup.novncUrl;

        // Persist noVNC URL to registry for resume
        await this.db.query(
            `UPDATE workspaces SET sandbox_novnc_url = $2, updated_at = NOW() WHERE user_id = $1`,
            [userId, browserSetup.novncUrl],
        );
        this.registry.invalidate(userId);

        return browserSetup.novncUrl;
    }

    /**
     * Lazily initialize web terminal (ttyd + claude) on first use. Idempotent.
     * Returns the signed ttyd URL for the terminal panel.
     */
    async ensureTerminalReady(userId: string): Promise<string> {
        const session = this.sessions.get(userId);
        if (!session || session.status !== 'running') {
            throw new Error('No running sandbox for user');
        }

        if (session.terminalUrl) {
            return session.terminalUrl;
        }

        const provider = this.getDaytonaProvider();
        const { installTerminalServer } = await import('./runner-installer');
        await installTerminalServer(provider, session.sandboxId);
        const url = await provider.startTerminal(session.sandboxId);
        session.terminalUrl = url;

        return url;
    }

    async getSandboxFs(sandboxId: string): Promise<SandboxFileSystem> {
        const provider = this.provider as { createFileSystem?(id: string): Promise<SandboxFileSystem> };
        if (typeof provider.createFileSystem !== 'function') {
            throw new Error('Provider does not support createFileSystem — cannot access sandbox filesystem');
        }
        return provider.createFileSystem(sandboxId);
    }

    /** Best-effort S3 snapshot before pause/kill. Never blocks lifecycle operations. */
    private async tryCreateSnapshot(sandboxId: string, userId: string): Promise<void> {
        if (!this.s3Backup) return;
        try {
            const provider = this.getDaytonaProvider();
            const tarBuffer = await createWorkspaceTar(provider, sandboxId);
            const result = await this.s3Backup.createSnapshot(userId, tarBuffer);
            log.info('S3 snapshot created', { user_id: userId, snapshot_key: result.snapshotKey, size_bytes: result.sizeBytes });
        } catch (err) {
            log.warn('S3 snapshot failed (non-blocking)', { user_id: userId, error: (err as Error).message });
        }
    }

    /** Restore latest S3 snapshot. No snapshot → continue. Corrupt/failed snapshot → delete and continue. */
    private async tryRestoreSnapshot(sandboxId: string, userId: string): Promise<void> {
        if (!this.s3Backup) return;

        const latestKey = await this.s3Backup.getLatestSnapshot(userId);
        if (!latestKey) {
            log.info('No S3 snapshot found, starting fresh', { user_id: userId });
            return;
        }

        // Validate snapshot belongs to this user (defense-in-depth)
        const expectedPrefix = `${userId}/snapshots/`;
        if (!latestKey.startsWith(expectedPrefix)) {
            throw new Error(`Snapshot key does not belong to user ${userId}: ${latestKey}`);
        }

        try {
            const provider = this.getDaytonaProvider();
            const snapshot = await this.s3Backup.restoreSnapshot(latestKey);
            await restoreWorkspaceTar(provider, sandboxId, snapshot.content);
            log.info('Restored S3 snapshot', { user_id: userId, snapshot_key: latestKey, size_bytes: snapshot.sizeBytes });
        } catch (err) {
            // Corrupt snapshot (e.g., wrong encoding from older code). Delete it so the
            // next pause creates a clean one, and continue with a fresh workspace.
            log.warn('Snapshot restore failed, deleting corrupt snapshot and continuing fresh', { user_id: userId, error: (err as Error).message });
            try {
                await this.s3Backup.deleteSnapshot(latestKey);
                log.info('Deleted corrupt snapshot', { snapshot_key: latestKey });
            } catch (delErr) {
                log.warn('Failed to delete corrupt snapshot', { error: (delErr as Error).message });
            }
        }
    }

    private async tryResumeSandbox(userId: string): Promise<SandboxSession | null> {
        const startTime = Date.now();

        const cached = this.sessions.get(userId);
        if (cached && cached.status === 'paused') {
            log.debug('tryResume: found cached paused session, connecting');
            const tConnect = Date.now();
            const connected = await this.connectToSandbox(cached.sandboxId);
            log.debug('connect (cached paused)', { duration_ms: Date.now() - tConnect, success: connected });
            if (connected) {
                cached.status = 'running';
                cached.wasResumed = true;
                cached.lastActivityAt = new Date();
                // Clear warm-path caches — filesystem state may have changed while paused
                cached.runnerHandle = undefined;
                cached.runnerEnvVars = undefined;
                this.sessions.set(userId, cached);

                // Health check + DB mutation run in parallel; mutation is fire-and-forget
                const tHealth = Date.now();
                const healthCheckPromise = runWorkspaceHealthCheck(cached.sandboxId, userId, this.getSetupDeps());
                void this.registry.markResumed(userId).catch(err =>
                    log.warn('Fire-and-forget markResumed failed', { user_id: userId, error: (err as Error).message }),
                );
                await healthCheckPromise;
                log.debug('healthCheck (cached)', { duration_ms: Date.now() - tHealth });

                log.info('Resumed sandbox', { sandbox_id: cached.sandboxId, user_id: userId, duration_ms: Date.now() - startTime });
                return cached;
            }
            this.sessions.delete(userId);
        } else if (cached && cached.status === 'running') {
            log.debug('tryResume: found cached running session (skip resume)');
        } else {
            log.debug('tryResume: no cached session, checking registry');
        }

        const tRegistry = Date.now();
        const registryEntry = await this.registry.getByUserId(userId);
        log.debug('registry lookup', { duration_ms: Date.now() - tRegistry, status: registryEntry?.sandbox_status || 'none' });
        if (registryEntry && (registryEntry.sandbox_status === 'paused' || registryEntry.sandbox_status === 'running')) {
            const logLabel = registryEntry.sandbox_status === 'paused' ? 'Resumed sandbox' : 'Reconnected to running sandbox';
            const result = await this.resumeFromRegistry(registryEntry, userId, startTime, logLabel);
            if (result) return result;
        }

        return null;
    }

    private async resumeFromRegistry(
        entry: SandboxRegistryEntry,
        userId: string,
        startTime: number,
        logLabel: string,
    ): Promise<SandboxSession | null> {
        if (!entry.sandbox_id) {
            return null;
        }

        const tConnect = Date.now();
        const connected = await this.connectToSandbox(entry.sandbox_id);
        log.debug('connect (registry)', { duration_ms: Date.now() - tConnect, success: connected });
        if (!connected) {
            await this.registry.updateStatus(userId, 'killed');
            return null;
        }

        const session: SandboxSession = {
            sandboxId: entry.sandbox_id,
            userId,
            status: 'running',
            createdAt: entry.created_at,
            lastActivityAt: new Date(),
            wasResumed: true,
            activeExecutionCount: 0,
            agentSessions: new Map(),
        };

        this.sessions.set(userId, session);

        // Health check + DB mutation run in parallel; mutation is fire-and-forget
        const tHealth = Date.now();
        const healthCheckPromise = runWorkspaceHealthCheck(entry.sandbox_id, userId, this.getSetupDeps());
        void this.registry.markResumed(userId).catch(err =>
            log.warn('Fire-and-forget markResumed failed', { user_id: userId, error: (err as Error).message }),
        );
        await healthCheckPromise;
        log.debug('healthCheck (registry)', { duration_ms: Date.now() - tHealth });

        log.info(`${logLabel}`, { sandbox_id: entry.sandbox_id, user_id: userId, duration_ms: Date.now() - startTime });
        return session;
    }

    private async connectToSandbox(sandboxId: string): Promise<boolean> {
        try {
            await this.provider.connect(sandboxId);
            return true;
        } catch (error) {
            log.warn('Failed to connect to sandbox', { sandbox_id: sandboxId, error: (error as Error).message });
            return false;
        }
    }

}
