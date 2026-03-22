// Snapshot Service
// Orchestrates pre-fetch of data before heartbeat execution.
// Runs T-5 min before scheduled heartbeats, no LLM involvement.
// Writes formatted markdown to context/snapshot/latest.md in agent workspace.

import { createHash } from 'crypto';
import {
    SnapshotConfig,
    SnapshotResult,
    SnapshotSourceError,
    SourceFetchResult,
    SourceCacheEntry,
    CircuitBreakerState,
    CreateSnapshotConfigDTO,
    UpdateSnapshotConfigDTO,
    MAX_CACHE_AGE_MS,
    CIRCUIT_BREAKER_THRESHOLD,
} from './snapshot.types';
import { SnapshotConfigRepository, snapshotConfigRepository } from './snapshot-config.repository';
import { SnapshotExecutionRepository, snapshotExecutionRepository } from './snapshot-execution.repository';
import { fetchSource, hasFetcher } from './source-fetchers';
import { formatSnapshotMarkdown } from './snapshot-formatter';
import { HeartbeatStateRepository, heartbeatStateRepository } from '../heartbeat-state.repository';
import type { SandboxFileSystem } from '../../execution';

// Snapshot file path within agent workspace (relative to agent root)
const SNAPSHOT_RELATIVE_PATH = 'context/snapshot/latest.md';

const MAX_CACHE_ENTRIES = 500;

export class SnapshotService {
    // In-memory caches: acceptable for single-instance deployment.
    // State resets on restart (circuit breakers re-arm, cache rebuilds on first fetch).
    // Migrate to DB-backed stats if multi-instance deployment is needed.
    // Capped at MAX_CACHE_ENTRIES to prevent unbounded memory growth.
    private readonly lastKnownGood: Map<string, SourceCacheEntry> = new Map();
    private readonly circuitBreakers: Map<string, CircuitBreakerState> = new Map();

    constructor(
        private readonly configRepository: SnapshotConfigRepository = snapshotConfigRepository,
        private readonly executionRepository: SnapshotExecutionRepository = snapshotExecutionRepository,
        private readonly stateRepository: HeartbeatStateRepository = heartbeatStateRepository
    ) {}

    // -------------------------------------------------------------------------
    // Configuration
    // -------------------------------------------------------------------------

    async getConfig(agentId: number): Promise<SnapshotConfig | null> {
        return this.configRepository.getByAgentId(agentId);
    }

    async createConfig(data: CreateSnapshotConfigDTO): Promise<SnapshotConfig> {
        return this.configRepository.upsert(data);
    }

    async updateConfig(agentId: number, data: UpdateSnapshotConfigDTO): Promise<SnapshotConfig | null> {
        return this.configRepository.update(agentId, data);
    }

    async deleteConfig(agentId: number): Promise<boolean> {
        return this.configRepository.deleteByAgentId(agentId);
    }

    // -------------------------------------------------------------------------
    // Execution
    // -------------------------------------------------------------------------

    async runSnapshot(
        agentId: number,
        agentName: string,
        agentWorkspacePath: string,
        sandboxFs: SandboxFileSystem
    ): Promise<SnapshotResult> {
        const startTime = Date.now();

        const config = await this.configRepository.getByAgentId(agentId);
        if (!config) {
            throw new Error(`No snapshot config found for agent ${agentId}`);
        }

        if (!config.enabled) {
            throw new Error(`Snapshot is disabled for agent ${agentId}`);
        }

        // Read last_processed_ids for context-aware fetching
        const state = await this.stateRepository.getByAgentId(agentId);
        const lastProcessedIds = state?.last_processed_ids ?? {};

        // Fetch all sources in parallel
        const { results, errors } = await this.fetchAllSources(
            agentId,
            config.sources,
            lastProcessedIds
        );

        const durationMs = Date.now() - startTime;

        // Format snapshot markdown
        const snapshotContent = formatSnapshotMarkdown(
            agentName,
            results,
            errors,
            durationMs
        );

        // Compute hash to detect unchanged snapshots
        const snapshotHash = computeSnapshotHash(snapshotContent);
        const previousHash = state?.last_snapshot_hash ?? null;
        const unchanged = previousHash === snapshotHash;

        // Write snapshot to workspace
        const snapshotPath = `${agentWorkspacePath}/${SNAPSHOT_RELATIVE_PATH}`;
        await this.writeSnapshotToWorkspace(sandboxFs, snapshotPath, snapshotContent);

        // Record execution in DB
        await this.executionRepository.create({
            agent_id: agentId,
            sources_fetched: results.filter(r => r.status === 'ok').length,
            sources_failed: errors.length,
            duration_ms: durationMs,
            snapshot_hash: snapshotHash,
            file_path: snapshotPath,
            errors,
        });

        // Update last_snapshot_hash in heartbeat state
        if (state) {
            await this.stateRepository.updateSnapshotHash(agentId, snapshotHash);
        }

        return {
            agent_id: agentId,
            sources_fetched: results.filter(r => r.status === 'ok').length,
            sources_failed: errors.length,
            duration_ms: durationMs,
            file_path: snapshotPath,
            snapshot_hash: snapshotHash,
            errors,
            unchanged,
        };
    }

    // -------------------------------------------------------------------------
    // Source Fetching (parallel with circuit breaker + cache)
    // -------------------------------------------------------------------------

    private async fetchAllSources(
        agentId: number,
        sources: SnapshotConfig['sources'],
        lastProcessedIds: Record<string, string>
    ): Promise<{ results: SourceFetchResult[]; errors: SnapshotSourceError[] }> {
        const results: SourceFetchResult[] = [];
        const errors: SnapshotSourceError[] = [];

        const fetchPromises = sources.map(async (source) => {
            const cacheKey = this.buildCacheKey(agentId, source.app);
            const circuitState = this.getCircuitState(cacheKey);

            // Circuit breaker: if tripped, alert user directly
            if (circuitState.tripped) {
                const cachedData = this.lastKnownGood.get(cacheKey);
                if (cachedData) {
                    const cacheAge = Date.now() - cachedData.fetched_at.getTime();
                    results.push({
                        app: source.app,
                        status: 'stale',
                        fetched_at: cachedData.fetched_at,
                        data: cachedData.data,
                        item_ids: cachedData.item_ids,
                        cache_age_ms: cacheAge,
                    });
                    errors.push({
                        app: source.app,
                        error: `Circuit breaker tripped (${circuitState.consecutive_failures} consecutive failures)`,
                        used_cache: true,
                        cache_age_ms: cacheAge,
                    });
                } else {
                    errors.push({
                        app: source.app,
                        error: `Circuit breaker tripped (${circuitState.consecutive_failures} consecutive failures). No cached data.`,
                        used_cache: false,
                    });
                }
                return;
            }

            // Skip unknown fetchers
            if (!hasFetcher(source.app)) {
                errors.push({
                    app: source.app,
                    error: `No fetcher registered for app: ${source.app}`,
                    used_cache: false,
                });
                return;
            }

            try {
                const result = await fetchSource(source, lastProcessedIds);
                results.push(result);

                // Update last-known-good cache (with eviction)
                this.lastKnownGood.set(cacheKey, {
                    app: source.app,
                    data: result.data,
                    fetched_at: result.fetched_at,
                    item_ids: result.item_ids,
                });
                this.evictOldest(this.lastKnownGood);

                // Reset circuit breaker on success
                this.resetCircuit(cacheKey, source.app);
            } catch (error) {
                const errMessage = error instanceof Error ? error.message : String(error);

                // Record failure in circuit breaker
                this.recordCircuitFailure(cacheKey, source.app);

                // Try last-known-good cache
                const cachedData = this.lastKnownGood.get(cacheKey);
                if (cachedData) {
                    const cacheAge = Date.now() - cachedData.fetched_at.getTime();
                    if (cacheAge < MAX_CACHE_AGE_MS) {
                        results.push({
                            app: source.app,
                            status: 'stale',
                            fetched_at: cachedData.fetched_at,
                            data: cachedData.data,
                            item_ids: cachedData.item_ids,
                            cache_age_ms: cacheAge,
                        });
                        errors.push({
                            app: source.app,
                            error: errMessage,
                            used_cache: true,
                            cache_age_ms: cacheAge,
                        });
                        return;
                    }
                }

                // No usable cache
                errors.push({
                    app: source.app,
                    error: errMessage,
                    used_cache: false,
                });
            }
        });

        await Promise.allSettled(fetchPromises);

        return { results, errors };
    }

    // -------------------------------------------------------------------------
    // Workspace File Write
    // -------------------------------------------------------------------------

    private async writeSnapshotToWorkspace(
        sandboxFs: SandboxFileSystem,
        snapshotPath: string,
        content: string
    ): Promise<void> {
        // Ensure the snapshot directory exists
        const dirPath = snapshotPath.substring(0, snapshotPath.lastIndexOf('/'));
        const dirExists = await sandboxFs.exists(dirPath);
        if (!dirExists) {
            await sandboxFs.mkdir(dirPath);
        }

        await sandboxFs.writeFile(snapshotPath, content);
    }

    // -------------------------------------------------------------------------
    // Circuit Breaker
    // -------------------------------------------------------------------------

    private buildCacheKey(agentId: number, app: string): string {
        return `${agentId}:${app}`;
    }

    private getCircuitState(key: string): CircuitBreakerState {
        return this.circuitBreakers.get(key) ?? {
            app: key.split(':')[1] || key,
            consecutive_failures: 0,
            last_failure_at: null,
            tripped: false,
        };
    }

    private recordCircuitFailure(key: string, _app?: string): void {
        const state = this.getCircuitState(key);
        state.consecutive_failures++;
        state.last_failure_at = new Date();
        state.tripped = state.consecutive_failures >= CIRCUIT_BREAKER_THRESHOLD;
        this.circuitBreakers.set(key, state);
        this.evictOldest(this.circuitBreakers);
    }

    private resetCircuit(key: string, _app?: string): void {
        const appName = key.split(':')[1] || key;
        this.circuitBreakers.set(key, {
            app: appName,
            consecutive_failures: 0,
            last_failure_at: null,
            tripped: false,
        });
        this.evictOldest(this.circuitBreakers);
    }

    /** Evict oldest entries when map exceeds MAX_CACHE_ENTRIES. */
    private evictOldest<V>(map: Map<string, V>): void {
        if (map.size <= MAX_CACHE_ENTRIES) return;
        // Map iterates in insertion order; delete oldest entries
        const excess = map.size - MAX_CACHE_ENTRIES;
        let deleted = 0;
        for (const key of map.keys()) {
            if (deleted >= excess) break;
            map.delete(key);
            deleted++;
        }
    }

    getCircuitBreakerState(agentId: number, app: string): CircuitBreakerState {
        return this.getCircuitState(this.buildCacheKey(agentId, app));
    }

    resetCircuitBreaker(agentId: number, app: string): void {
        this.resetCircuit(this.buildCacheKey(agentId, app), app);
    }

    // -------------------------------------------------------------------------
    // Execution History
    // -------------------------------------------------------------------------

    async getLastExecution(agentId: number) {
        return this.executionRepository.getLatestByAgentId(agentId);
    }

    async listExecutions(agentId: number, limit?: number, offset?: number) {
        return this.executionRepository.listByAgentId(agentId, limit, offset);
    }
}

// -----------------------------------------------------------------------------
// Hash Helper
// -----------------------------------------------------------------------------

function computeSnapshotHash(content: string): string {
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
}

export const snapshotService = new SnapshotService();
