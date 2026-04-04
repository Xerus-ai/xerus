// Metadata Sync Service
// One-way sync: Workspace (runner) -> Neon DB (backend)
// Runner pushes metadata updates after workspace changes.
// Only workspace syncs to Neon. Tasks, domains, channels are workspace DB source of truth.
// Reference: EXECUTION_ARCHITECTURE_v2.md Section 10, Section 14

import {
    MetadataSyncEvent,
    SyncResult,
    SyncDatabase,
    WorkspaceSyncPayload,
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
}

// Factory function
export function createMetadataSyncService(db: SyncDatabase): MetadataSyncService {
    return new MetadataSyncService(db);
}
