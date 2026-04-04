// Metadata Sync Service Tests
// Tests use an in-memory database implementation (not a mock)

import {
    MetadataSyncService,
    SyncDatabase,
    SyncQueryResult,
    MetadataSyncEvent,
    SYNC_ENTITY_TYPES,
} from '../index';

// -----------------------------------------------------------------------------
// In-Memory Database (NOT a mock - real behavior tracking)
// Simulates Neon DB tables with in-memory storage
// -----------------------------------------------------------------------------

interface StoredRow {
    id: string;
    [key: string]: unknown;
}

class InMemoryDatabase implements SyncDatabase {
    private workspaces: StoredRow[] = [];
    private nextId = 1;

    async query(text: string, values?: unknown[]): Promise<SyncQueryResult> {
        const normalized = text.replace(/\s+/g, ' ').trim();

        if (normalized.includes('INSERT INTO workspaces')) {
            return this.handleWorkspaceUpsert(values ?? []);
        }
        if (normalized.includes('SELECT id::text FROM workspaces')) {
            return this.handleWorkspaceLookup(values ?? []);
        }

        return { rows: [] };
    }

    // -- Workspace --

    private handleWorkspaceUpsert(values: unknown[]): SyncQueryResult {
        const userId = values[0] as string;
        const slug = values[1] as string;
        const existing = this.workspaces.find(
            (w) => w.user_id === userId && w.slug === slug
        );
        if (existing) {
            existing.name = values[2] as string;
            if (values[3] !== null) existing.description = values[3];
            return { rows: [{ id: existing.id }] };
        }
        const id = String(this.nextId++);
        this.workspaces.push({
            id,
            user_id: userId,
            slug,
            name: values[2] as string,
            description: values[3],
        });
        return { rows: [{ id }] };
    }

    private handleWorkspaceLookup(values: unknown[]): SyncQueryResult {
        const userId = values[0] as string;
        const workspace = this.workspaces.find((w) => w.user_id === userId);
        if (!workspace) return { rows: [] };
        return { rows: [{ id: workspace.id }] };
    }

    // -- Test Helpers --

    seedWorkspace(workspace: StoredRow): void {
        this.workspaces.push(workspace);
    }
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('MetadataSyncService', () => {
    let db: InMemoryDatabase;
    let service: MetadataSyncService;

    beforeEach(() => {
        db = new InMemoryDatabase();
        db.seedWorkspace({ id: 'ws-1', user_id: 'user-1', slug: 'default', name: 'Default Workspace' });
        service = new MetadataSyncService(db);
    });

    describe('sync entity type validation', () => {
        it('should throw for unknown entity type', async () => {
            const event: MetadataSyncEvent = {
                entity: 'unknown' as never,
                user_id: 'user-1',
                payload: { slug: 'test', name: 'test' },
            };

            await expect(service.sync(event)).rejects.toThrow('Unknown sync entity type: unknown');
        });
    });

    describe('workspace sync', () => {
        it('should create new workspace', async () => {
            const result = await service.sync({
                entity: 'workspace',
                user_id: 'user-2',
                payload: { slug: 'my-workspace', name: 'My Workspace', description: 'Test workspace' },
            });

            expect(result.success).toBe(true);
            expect(result.entity).toBe('workspace');
            expect(result.id).toBeDefined();
        });

        it('should upsert existing workspace', async () => {
            const result = await service.sync({
                entity: 'workspace',
                user_id: 'user-1',
                payload: { slug: 'default', name: 'Updated Workspace' },
            });

            expect(result.success).toBe(true);
            expect(result.id).toBe('ws-1');
        });
    });
});

describe('SYNC_ENTITY_TYPES', () => {
    it('should have only workspace entity type', () => {
        expect(SYNC_ENTITY_TYPES).toContain('workspace');
        expect(SYNC_ENTITY_TYPES).toHaveLength(1);
    });

    it('should not contain domain, channel, or channel_message', () => {
        expect(SYNC_ENTITY_TYPES).not.toContain('domain');
        expect(SYNC_ENTITY_TYPES).not.toContain('channel');
        expect(SYNC_ENTITY_TYPES).not.toContain('channel_message');
        expect(SYNC_ENTITY_TYPES).not.toContain('task');
    });
});
