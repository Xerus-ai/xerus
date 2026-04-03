// Metadata Sync Types
// One-way sync: Workspace (runner) -> Neon DB (backend)
// Only workspace syncs to Neon.
// Domain, channel, channel_message, task are now workspace DB source of truth.
// Reference: EXECUTION_ARCHITECTURE_v2.md Section 10

// -----------------------------------------------------------------------------
// Sync Event Types (emitted by runner via stdout)
// -----------------------------------------------------------------------------

// Agent sync is handled directly by metadata-sync-router.ts (agent_registry only).
// Domain, channel, channel_message, task removed — workspace DB is source of truth.
// These entity types are routed through MetadataSyncService.sync().
export const SYNC_ENTITY_TYPES = [
    'workspace',
] as const;

export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

// -----------------------------------------------------------------------------
// Sync Payloads (data sent from runner)
// -----------------------------------------------------------------------------

export interface WorkspaceSyncPayload {
    slug: string;
    name: string;
    description?: string;
}

// -----------------------------------------------------------------------------
// Sync Event (the full event from runner stdout)
// -----------------------------------------------------------------------------

export interface MetadataSyncEvent {
    entity: SyncEntityType;
    user_id: string;
    payload: WorkspaceSyncPayload;
}

// -----------------------------------------------------------------------------
// Sync Result
// -----------------------------------------------------------------------------

export interface SyncResult {
    entity: SyncEntityType;
    success: boolean;
    id?: string;
    error?: string;
}

// -----------------------------------------------------------------------------
// Database Interface (injectable for testing)
// -----------------------------------------------------------------------------

export interface SyncQueryResult {
    rows: Array<{ id: string }>;
}

export interface SyncDatabase {
    query(text: string, values?: unknown[]): Promise<SyncQueryResult>;
}
