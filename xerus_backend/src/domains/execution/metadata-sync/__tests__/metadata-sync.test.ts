// Metadata Sync Service Tests
// Tests use an in-memory database implementation (not a mock)

import {
    MetadataSyncService,
    SyncDatabase,
    SyncQueryResult,
    MetadataSyncEvent,
    DomainSyncPayload,
    ChannelSyncPayload,
    ChannelMessageSyncPayload,
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
    private domains: StoredRow[] = [];
    private channels: StoredRow[] = [];
    private channelMessages: StoredRow[] = [];
    private nextId = 1;

    async query(text: string, values?: unknown[]): Promise<SyncQueryResult> {
        const normalized = text.replace(/\s+/g, ' ').trim();

        if (normalized.includes('INSERT INTO workspaces')) {
            return this.handleWorkspaceUpsert(values ?? []);
        }
        if (normalized.includes('SELECT id::text FROM workspaces')) {
            return this.handleWorkspaceLookup(values ?? []);
        }
        if (normalized.includes('INSERT INTO domains')) {
            return this.handleDomainUpsert(values ?? []);
        }
        if (normalized.includes('SELECT id::text FROM domains')) {
            return this.handleDomainLookup(values ?? []);
        }
        if (normalized.includes('INSERT INTO channels')) {
            return this.handleChannelUpsert(values ?? []);
        }
        if (normalized.includes('SELECT c.id::text FROM channels')) {
            return this.handleChannelLookup(values ?? []);
        }
        if (normalized.includes('INSERT INTO channel_messages')) {
            return this.handleMessageInsert(values ?? []);
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

    // -- Domain --

    private handleDomainUpsert(values: unknown[]): SyncQueryResult {
        // syncDomain now sends 5 params: [userId, workspaceId, slug, name, description]
        const userId = values[0] as string;
        const slug = values[2] as string;
        const existing = this.domains.find(
            (d) => d.user_id === userId && d.slug === slug
        );
        if (existing) {
            existing.name = values[3] as string;
            if (values[4] !== null) existing.description = values[4];
            return { rows: [{ id: existing.id }] };
        }
        const id = String(this.nextId++);
        this.domains.push({
            id,
            user_id: userId,
            workspace_id: values[1] as string,
            slug,
            name: values[3] as string,
            description: values[4],
        });
        return { rows: [{ id }] };
    }

    private handleDomainLookup(values: unknown[]): SyncQueryResult {
        const userId = values[0] as string;
        const slug = values[1] as string;
        const domain = this.domains.find(
            (d) => d.user_id === userId && d.slug === slug
        );
        if (!domain) return { rows: [] };
        return { rows: [{ id: domain.id }] };
    }

    // -- Channel --

    private handleChannelUpsert(values: unknown[]): SyncQueryResult {
        const domainId = values[0] as string;
        const slug = values[2] as string;
        const existing = this.channels.find(
            (c) => c.domain_id === domainId && c.slug === slug
        );
        if (existing) {
            existing.name = values[3] as string;
            if (values[4] !== null) existing.description = values[4];
            if (values[5] !== null) existing.agent_count = values[5];
            return { rows: [{ id: existing.id }] };
        }
        const id = String(this.nextId++);
        this.channels.push({
            id,
            domain_id: domainId,
            user_id: values[1] as string,
            slug,
            name: values[3] as string,
            description: values[4],
            agent_count: values[5],
        });
        return { rows: [{ id }] };
    }

    private handleChannelLookup(values: unknown[]): SyncQueryResult {
        const userId = values[0] as string;
        const domainSlug = values[1] as string;
        const channelSlug = values[2] as string;

        const domain = this.domains.find(
            (d) => d.user_id === userId && d.slug === domainSlug
        );
        if (!domain) return { rows: [] };

        const channel = this.channels.find(
            (c) => c.domain_id === domain.id && c.slug === channelSlug
        );
        if (!channel) return { rows: [] };

        return { rows: [{ id: channel.id }] };
    }

    // -- Channel Message --

    private handleMessageInsert(values: unknown[]): SyncQueryResult {
        const id = String(this.nextId++);
        this.channelMessages.push({
            id,
            channel_id: values[0] as string,
            sender_type: values[1] as string,
            sender_slug: values[2] as string,
            content: values[3] as string,
            message_type: values[4] as string,
            metadata: values[5] as string,
        });
        return { rows: [{ id }] };
    }

    // -- Test Helpers --

    seedWorkspace(workspace: StoredRow): void {
        this.workspaces.push(workspace);
    }

    seedDomain(domain: StoredRow): void {
        this.domains.push(domain);
    }

    seedChannel(channel: StoredRow): void {
        this.channels.push(channel);
    }

    getDomains(): StoredRow[] {
        return this.domains;
    }

    getChannels(): StoredRow[] {
        return this.channels;
    }

    getMessages(): StoredRow[] {
        return this.channelMessages;
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

    describe('domain sync', () => {
        it('should create new domain', async () => {
            const result = await service.sync({
                entity: 'domain',
                user_id: 'user-1',
                payload: {
                    slug: 'marketing',
                    name: 'Marketing',
                    description: 'Marketing department',
                } as DomainSyncPayload,
            });

            expect(result.success).toBe(true);
            expect(result.entity).toBe('domain');
            expect(result.id).toBeDefined();

            const domains = db.getDomains();
            expect(domains).toHaveLength(1);
            expect(domains[0].slug).toBe('marketing');
            expect(domains[0].name).toBe('Marketing');
        });

        it('should upsert existing domain', async () => {
            db.seedDomain({
                id: '10',
                user_id: 'user-1',
                slug: 'marketing',
                name: 'Old Name',
            });

            const result = await service.sync({
                entity: 'domain',
                user_id: 'user-1',
                payload: {
                    slug: 'marketing',
                    name: 'Marketing v2',
                } as DomainSyncPayload,
            });

            expect(result.success).toBe(true);
            expect(result.id).toBe('10');

            const domains = db.getDomains();
            expect(domains).toHaveLength(1);
            expect(domains[0].name).toBe('Marketing v2');
        });
    });

    describe('channel sync', () => {
        beforeEach(() => {
            db.seedDomain({
                id: '10',
                user_id: 'user-1',
                slug: 'marketing',
                name: 'Marketing',
            });
        });

        it('should create new channel under domain', async () => {
            const result = await service.sync({
                entity: 'channel',
                user_id: 'user-1',
                payload: {
                    domain_slug: 'marketing',
                    slug: 'seo',
                    name: 'SEO Channel',
                    description: 'SEO team',
                    agent_count: 3,
                } as ChannelSyncPayload,
            });

            expect(result.success).toBe(true);
            expect(result.entity).toBe('channel');
            expect(result.id).toBeDefined();

            const channels = db.getChannels();
            expect(channels).toHaveLength(1);
            expect(channels[0].slug).toBe('seo');
            expect(channels[0].domain_id).toBe('10');
        });

        it('should throw when domain not found', async () => {
            await expect(
                service.sync({
                    entity: 'channel',
                    user_id: 'user-1',
                    payload: {
                        domain_slug: 'nonexistent',
                        slug: 'seo',
                        name: 'SEO',
                    } as ChannelSyncPayload,
                })
            ).rejects.toThrow('Domain not found');
        });

        it('should upsert existing channel', async () => {
            db.seedChannel({
                id: '20',
                domain_id: '10',
                user_id: 'user-1',
                slug: 'seo',
                name: 'Old SEO',
                agent_count: 1,
            });

            const result = await service.sync({
                entity: 'channel',
                user_id: 'user-1',
                payload: {
                    domain_slug: 'marketing',
                    slug: 'seo',
                    name: 'SEO v2',
                    agent_count: 5,
                } as ChannelSyncPayload,
            });

            expect(result.success).toBe(true);
            expect(result.id).toBe('20');

            const channels = db.getChannels();
            expect(channels).toHaveLength(1);
            expect(channels[0].name).toBe('SEO v2');
            expect(channels[0].agent_count).toBe(5);
        });
    });

    describe('channel_message sync', () => {
        beforeEach(() => {
            db.seedDomain({
                id: '10',
                user_id: 'user-1',
                slug: 'marketing',
                name: 'Marketing',
            });
            db.seedChannel({
                id: '20',
                domain_id: '10',
                user_id: 'user-1',
                slug: 'seo',
                name: 'SEO',
            });
        });

        it('should insert channel message', async () => {
            const result = await service.sync({
                entity: 'channel_message',
                user_id: 'user-1',
                payload: {
                    domain_slug: 'marketing',
                    channel_slug: 'seo',
                    sender_type: 'agent',
                    sender_slug: 'seo-writer',
                    content: 'Published new blog post',
                    message_type: 'chat',
                    metadata: { task_id: 'task-1' },
                } as ChannelMessageSyncPayload,
            });

            expect(result.success).toBe(true);
            expect(result.entity).toBe('channel_message');
            expect(result.id).toBeDefined();

            const messages = db.getMessages();
            expect(messages).toHaveLength(1);
            expect(messages[0].channel_id).toBe('20');
            expect(messages[0].sender_slug).toBe('seo-writer');
            expect(messages[0].content).toBe('Published new blog post');
        });

        it('should throw when channel not found', async () => {
            await expect(
                service.sync({
                    entity: 'channel_message',
                    user_id: 'user-1',
                    payload: {
                        domain_slug: 'marketing',
                        channel_slug: 'nonexistent',
                        sender_type: 'agent',
                        sender_slug: 'seo-writer',
                        content: 'test',
                    } as ChannelMessageSyncPayload,
                })
            ).rejects.toThrow('Channel not found');
        });

        it('should default message_type to chat', async () => {
            await service.sync({
                entity: 'channel_message',
                user_id: 'user-1',
                payload: {
                    domain_slug: 'marketing',
                    channel_slug: 'seo',
                    sender_type: 'human',
                    sender_slug: 'user-1',
                    content: 'Hello team',
                } as ChannelMessageSyncPayload,
            });

            const messages = db.getMessages();
            expect(messages[0].message_type).toBe('chat');
        });

        it('should handle system messages', async () => {
            const result = await service.sync({
                entity: 'channel_message',
                user_id: 'user-1',
                payload: {
                    domain_slug: 'marketing',
                    channel_slug: 'seo',
                    sender_type: 'system',
                    sender_slug: 'xerus',
                    content: 'Agent seo-writer joined the channel',
                    message_type: 'system',
                } as ChannelMessageSyncPayload,
            });

            expect(result.success).toBe(true);
            const messages = db.getMessages();
            expect(messages[0].sender_type).toBe('system');
        });
    });
});

describe('SYNC_ENTITY_TYPES', () => {
    it('should have all five entity types', () => {
        expect(SYNC_ENTITY_TYPES).toContain('workspace');
        expect(SYNC_ENTITY_TYPES).toContain('domain');
        expect(SYNC_ENTITY_TYPES).toContain('channel');
        expect(SYNC_ENTITY_TYPES).toContain('channel_message');
        expect(SYNC_ENTITY_TYPES).toContain('task');
        expect(SYNC_ENTITY_TYPES).toHaveLength(5);
    });
});
