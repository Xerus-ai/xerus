// Metadata Sync Types
// One-way sync: Workspace (runner) -> Neon DB (backend)
// Reference: EXECUTION_ARCHITECTURE_v2.md Section 10

// -----------------------------------------------------------------------------
// Sync Event Types (emitted by runner via stdout)
// -----------------------------------------------------------------------------

// Agent sync is handled directly by metadata-sync-router.ts (agent_registry only).
// These entity types are routed through MetadataSyncService.sync().
export const SYNC_ENTITY_TYPES = [
    'workspace',
    'domain',
    'channel',
    'channel_message',
    'task',
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

export interface DomainSyncPayload {
    slug: string;
    name: string;
    description?: string;
}

export interface ChannelSyncPayload {
    domain_slug: string;
    slug: string;
    name: string;
    description?: string;
    agent_count?: number;
}

export interface ChannelMessageSyncPayload {
    domain_slug: string;
    channel_slug: string;
    sender_type: 'agent' | 'human' | 'system';
    sender_slug: string;
    content: string;
    message_type?: 'chat' | 'task_update' | 'status' | 'system';
    metadata?: Record<string, unknown>;
}

export interface TaskSyncPayload {
    id: string;
    channel_id: string;
    title: string;
    description?: string;
    status?: string;
    priority?: string;
    assigned_agents?: string[];
    subtasks?: Array<{ text: string; done: boolean }>;
}

// -----------------------------------------------------------------------------
// Sync Event (the full event from runner stdout)
// -----------------------------------------------------------------------------

export interface MetadataSyncEvent {
    entity: SyncEntityType;
    user_id: string;
    payload: WorkspaceSyncPayload | DomainSyncPayload | ChannelSyncPayload | ChannelMessageSyncPayload | TaskSyncPayload;
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
