// Metadata Sync Service
// One-way sync: Workspace (runner) -> Neon DB (backend)
// Runner pushes metadata updates after workspace changes.
// Backend upserts into Neon DB tables for frontend read cache.
// Reference: EXECUTION_ARCHITECTURE_v2.md Section 10, Section 14

import {
    MetadataSyncEvent,
    SyncResult,
    SyncDatabase,
    WorkspaceSyncPayload,
    DomainSyncPayload,
    ChannelSyncPayload,
    ChannelMessageSyncPayload,
    TaskSyncPayload,
    SYNC_ENTITY_TYPES,
    SyncEntityType,
} from './metadata-sync.types';

// -----------------------------------------------------------------------------
// Metadata Sync Service
// -----------------------------------------------------------------------------

export class MetadataSyncService {
    private readonly db: SyncDatabase;

    constructor(db: SyncDatabase) {
        this.db = db;
    }

    async sync(event: MetadataSyncEvent): Promise<SyncResult> {
        if (!SYNC_ENTITY_TYPES.includes(event.entity as SyncEntityType)) {
            throw new Error(`Unknown sync entity type: ${event.entity}`);
        }

        switch (event.entity) {
            case 'workspace':
                return this.syncWorkspace(event.user_id, event.payload as WorkspaceSyncPayload);
            case 'domain':
                return this.syncDomain(event.user_id, event.payload as DomainSyncPayload);
            case 'channel':
                return this.syncChannel(event.user_id, event.payload as ChannelSyncPayload);
            case 'channel_message':
                return this.syncChannelMessage(event.user_id, event.payload as ChannelMessageSyncPayload);
            case 'task':
                return this.syncTask(event.user_id, event.payload as TaskSyncPayload);
        }
    }

    // -------------------------------------------------------------------------
    // Workspace Sync
    // -------------------------------------------------------------------------

    private async syncWorkspace(userId: string, payload: WorkspaceSyncPayload): Promise<SyncResult> {
        const result = await this.db.query(
            `INSERT INTO workspaces (user_id, slug, name, description)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, slug)
             DO UPDATE SET
                 name = EXCLUDED.name,
                 description = COALESCE(EXCLUDED.description, workspaces.description),
                 updated_at = NOW()
             RETURNING id::text`,
            [userId, payload.slug, payload.name, payload.description ?? null]
        );

        return { entity: 'workspace', success: true, id: result.rows[0].id };
    }

    // -------------------------------------------------------------------------
    // Domain Sync
    // -------------------------------------------------------------------------

    private async syncDomain(userId: string, payload: DomainSyncPayload): Promise<SyncResult> {
        // Single query: resolve workspace_id and upsert domain in one round-trip
        const result = await this.db.query(
            `INSERT INTO domains (user_id, workspace_id, slug, name, description)
             SELECT $1, w.id, $2, $3, $4
             FROM workspaces w WHERE w.user_id = $1
             ON CONFLICT (workspace_id, slug)
             DO UPDATE SET
                 name = EXCLUDED.name,
                 description = COALESCE(EXCLUDED.description, domains.description),
                 updated_at = NOW()
             RETURNING id::text`,
            [userId, payload.slug, payload.name, payload.description ?? null]
        );

        if (result.rows.length === 0) {
            throw new Error(`No workspace found for user_id=${userId}`);
        }

        return { entity: 'domain', success: true, id: result.rows[0].id };
    }

    // -------------------------------------------------------------------------
    // Channel Sync
    // -------------------------------------------------------------------------

    private async syncChannel(userId: string, payload: ChannelSyncPayload): Promise<SyncResult> {
        // Single query: resolve domain_id and upsert channel in one round-trip
        const result = await this.db.query(
            `INSERT INTO channels (domain_id, user_id, slug, name, description, agent_count)
             SELECT d.id, $1, $3, $4, $5, $6
             FROM domains d WHERE d.user_id = $1 AND d.slug = $2
             ON CONFLICT (domain_id, slug)
             DO UPDATE SET
                 name = EXCLUDED.name,
                 description = COALESCE(EXCLUDED.description, channels.description),
                 agent_count = COALESCE(EXCLUDED.agent_count, channels.agent_count),
                 updated_at = NOW()
             RETURNING id::text`,
            [
                userId,
                payload.domain_slug,
                payload.slug,
                payload.name,
                payload.description ?? null,
                payload.agent_count ?? 0,
            ]
        );

        if (result.rows.length === 0) {
            throw new Error(`Domain not found: user_id=${userId}, slug=${payload.domain_slug}`);
        }

        return { entity: 'channel', success: true, id: result.rows[0].id };
    }

    // -------------------------------------------------------------------------
    // Channel Message Sync
    // -------------------------------------------------------------------------

    private async syncChannelMessage(
        userId: string,
        payload: ChannelMessageSyncPayload
    ): Promise<SyncResult> {
        // Single query: resolve channel_id via JOIN and insert message in one round-trip
        const result = await this.db.query(
            `INSERT INTO channel_messages (channel_id, sender_type, sender_slug, content, message_type, metadata)
             SELECT c.id, $4, $5, $6, $7, $8
             FROM channels c
             JOIN domains d ON d.id = c.domain_id
             WHERE d.user_id = $1 AND d.slug = $2 AND c.slug = $3
             RETURNING id::text`,
            [
                userId,
                payload.domain_slug,
                payload.channel_slug,
                payload.sender_type,
                payload.sender_slug,
                payload.content,
                payload.message_type ?? 'chat',
                JSON.stringify(payload.metadata ?? {}),
            ]
        );

        if (result.rows.length === 0) {
            throw new Error(
                `Channel not found: user_id=${userId}, domain=${payload.domain_slug}, channel=${payload.channel_slug}`
            );
        }

        return { entity: 'channel_message', success: true, id: result.rows[0].id };
    }

    // -------------------------------------------------------------------------
    // Task Sync
    // -------------------------------------------------------------------------

    private async syncTask(userId: string, payload: TaskSyncPayload): Promise<SyncResult> {
        // Resolve channel_id from domain/channel slug path
        const parts = payload.channel_id.split('/');
        let channelId: string;

        if (parts.length >= 2) {
            const result = await this.db.query(
                `SELECT c.id::text FROM channels c
                 JOIN domains d ON d.id = c.domain_id
                 WHERE d.user_id = $1 AND d.slug = $2 AND c.slug = $3`,
                [userId, parts[0], parts[1]]
            );
            if (result.rows.length === 0) {
                throw new Error(`Channel not found: ${payload.channel_id}`);
            }
            channelId = result.rows[0].id;
        } else {
            const result = await this.db.query(
                `SELECT c.id::text FROM channels c
                 JOIN domains d ON d.id = c.domain_id
                 WHERE d.user_id = $1 AND c.slug = $2 LIMIT 1`,
                [userId, payload.channel_id]
            );
            if (result.rows.length === 0) {
                throw new Error(`Channel not found: ${payload.channel_id}`);
            }
            channelId = result.rows[0].id;
        }

        // Validate status is present (no backward-compat mapping)
        if (!payload.status) {
            throw new Error('Task sync payload missing status');
        }
        const status = payload.status;

        const result = await this.db.query(
            `INSERT INTO tasks (beads_id, channel_id, user_id, title, description, status, priority, assigned_agents, subtasks)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (channel_id, beads_id)
             DO UPDATE SET
                 title = EXCLUDED.title,
                 description = COALESCE(EXCLUDED.description, tasks.description),
                 status = EXCLUDED.status,
                 priority = EXCLUDED.priority,
                 assigned_agents = EXCLUDED.assigned_agents,
                 subtasks = EXCLUDED.subtasks,
                 updated_at = NOW()
             RETURNING id::text`,
            [
                payload.id, channelId, userId, payload.title,
                payload.description ?? '',
                status,
                payload.priority ?? 'medium',
                payload.assigned_agents ?? [],
                JSON.stringify(payload.subtasks ?? []),
            ]
        );

        return { entity: 'task', success: true, id: result.rows[0].id };
    }
}

// Factory function
export function createMetadataSyncService(db: SyncDatabase): MetadataSyncService {
    return new MetadataSyncService(db);
}
