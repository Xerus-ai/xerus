// Snapshot Service Types
// Types for snapshot configuration, execution, and source fetching

// -----------------------------------------------------------------------------
// Snapshot Config (from snapshot_configs table)
// -----------------------------------------------------------------------------

export interface SnapshotConfig {
    id: number;
    agent_id: number;
    enabled: boolean;
    run_before_ms: number;
    sources: SnapshotSource[];
    created_at: Date;
    updated_at: Date;
}

export interface SnapshotConfigRow {
    id: number;
    agent_id: number;
    enabled: boolean;
    run_before_ms: number;
    sources: SnapshotSource[] | string;
    created_at: Date;
    updated_at: Date;
}

// -----------------------------------------------------------------------------
// Snapshot Source Configuration
// -----------------------------------------------------------------------------

export interface SnapshotSource {
    app: string;
    action: string;
    params: Record<string, unknown>;
    format: 'summary' | 'full';
    timeout_ms: number;
}

// -----------------------------------------------------------------------------
// Snapshot Config DTOs
// -----------------------------------------------------------------------------

export interface CreateSnapshotConfigDTO {
    agent_id: number;
    enabled?: boolean;
    run_before_ms?: number;
    sources?: SnapshotSource[];
}

export interface UpdateSnapshotConfigDTO {
    enabled?: boolean;
    run_before_ms?: number;
    sources?: SnapshotSource[];
}

// -----------------------------------------------------------------------------
// Snapshot Execution (from snapshot_executions table)
// -----------------------------------------------------------------------------

export interface SnapshotExecution {
    id: string;
    agent_id: number;
    sources_fetched: number;
    sources_failed: number;
    duration_ms: number | null;
    snapshot_hash: string | null;
    file_path: string | null;
    errors: SnapshotSourceError[];
    created_at: Date;
}

export interface SnapshotExecutionRow {
    id: string;
    agent_id: number;
    sources_fetched: number;
    sources_failed: number;
    duration_ms: number | null;
    snapshot_hash: string | null;
    file_path: string | null;
    errors: SnapshotSourceError[] | string;
    created_at: Date;
}

// -----------------------------------------------------------------------------
// Snapshot Execution DTO
// -----------------------------------------------------------------------------

export interface CreateSnapshotExecutionDTO {
    agent_id: number;
    sources_fetched: number;
    sources_failed: number;
    duration_ms: number;
    snapshot_hash: string | null;
    file_path: string | null;
    errors: SnapshotSourceError[];
}

// -----------------------------------------------------------------------------
// Source Fetcher Types
// -----------------------------------------------------------------------------

export interface SnapshotSourceError {
    app: string;
    error: string;
    used_cache: boolean;
    cache_age_ms?: number;
}

export interface SourceFetchResult {
    app: string;
    status: 'ok' | 'failed' | 'stale';
    fetched_at: Date;
    data: string;
    item_ids?: string[];
    error?: string;
    cache_age_ms?: number;
}

// -----------------------------------------------------------------------------
// Snapshot Result (returned by SnapshotService.runSnapshot)
// -----------------------------------------------------------------------------

export interface SnapshotResult {
    agent_id: number;
    sources_fetched: number;
    sources_failed: number;
    duration_ms: number;
    file_path: string;
    snapshot_hash: string;
    errors: SnapshotSourceError[];
    unchanged: boolean;
}

// -----------------------------------------------------------------------------
// Circuit Breaker State
// -----------------------------------------------------------------------------

export interface CircuitBreakerState {
    app: string;
    consecutive_failures: number;
    last_failure_at: Date | null;
    tripped: boolean;
}

// -----------------------------------------------------------------------------
// Source Cache Entry (last-known-good)
// -----------------------------------------------------------------------------

export interface SourceCacheEntry {
    app: string;
    data: string;
    fetched_at: Date;
    item_ids?: string[];
}

// Default timeout for individual source fetchers (30 seconds)
export const DEFAULT_SOURCE_TIMEOUT_MS = 30000;

// Maximum cache age before data is considered too stale (1 hour)
export const MAX_CACHE_AGE_MS = 3600000;

// Circuit breaker threshold (3 consecutive failures)
export const CIRCUIT_BREAKER_THRESHOLD = 3;
