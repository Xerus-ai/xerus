// Message Bridge Tests
// Tests for bidirectional message routing: runner <-> backend <-> frontend
// Uses real NeonDB PostgreSQL database



import { query } from '../../../../database/connection';
import {
    MessageBridgeService,
    ChannelNotFoundError,
    ChannelNotFoundByIdError,
    NoChannelLeadError,
    createMessageBridgeService,
} from '../message-bridge.service';
import {
    MessageBridgeRepository,
    MessageBridgeDatabase,
} from '../message-bridge.repository';

// -----------------------------------------------------------------------------
// Real Database Adapter
// -----------------------------------------------------------------------------

const realDb: MessageBridgeDatabase = {
    async query<T>(text: string, values?: unknown[]) {
        const result = await query<T>(text, values);
        return { rows: result.rows };
    },
};

// -----------------------------------------------------------------------------
// Test Data Setup / Teardown
// -----------------------------------------------------------------------------

const TEST_PREFIX = 'xmsgbridge_' + Date.now();
const TEST_USER_1 = TEST_PREFIX + '_user1';
const TEST_USER_2 = TEST_PREFIX + '_user2';

let DOMAIN_ID_1: string;
let DOMAIN_ID_2: string;
let CHANNEL_ID_1: string; // general in acme-corp for user1
let CHANNEL_ID_2: string; // marketing in acme-corp for user1
let CHANNEL_ID_3: string; // dev in other-project for user2

async function seedTestData(): Promise<void> {
    // Create test users
    for (const userId of [TEST_USER_1, TEST_USER_2]) {
        const email = `${userId}_${Math.random().toString(36).substring(7)}@test.com`;
        await query(
            `INSERT INTO users (user_id, email, display_name)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email`,
            [userId, email, 'Test User']
        );
    }

    // Create domains
    const d1 = await query<{ id: string }>(
        `INSERT INTO domains (user_id, slug, name) VALUES ($1, $2, $3) RETURNING id`,
        [TEST_USER_1, TEST_PREFIX + '_acme-corp', 'Acme Corp']
    );
    DOMAIN_ID_1 = d1.rows[0].id;

    const d2 = await query<{ id: string }>(
        `INSERT INTO domains (user_id, slug, name) VALUES ($1, $2, $3) RETURNING id`,
        [TEST_USER_2, TEST_PREFIX + '_other-project', 'Other Project']
    );
    DOMAIN_ID_2 = d2.rows[0].id;

    // Create channels
    const ch1 = await query<{ id: string }>(
        `INSERT INTO channels (domain_id, user_id, slug, name) VALUES ($1, $2, $3, $4) RETURNING id`,
        [DOMAIN_ID_1, TEST_USER_1, 'general', 'General']
    );
    CHANNEL_ID_1 = ch1.rows[0].id;

    const ch2 = await query<{ id: string }>(
        `INSERT INTO channels (domain_id, user_id, slug, name) VALUES ($1, $2, $3, $4) RETURNING id`,
        [DOMAIN_ID_1, TEST_USER_1, 'marketing', 'Marketing']
    );
    CHANNEL_ID_2 = ch2.rows[0].id;

    const ch3 = await query<{ id: string }>(
        `INSERT INTO channels (domain_id, user_id, slug, name) VALUES ($1, $2, $3, $4) RETURNING id`,
        [DOMAIN_ID_2, TEST_USER_2, 'dev', 'Development']
    );
    CHANNEL_ID_3 = ch3.rows[0].id;

    // Create agents in agent_registry for user1's domain (for findChannelLead)
    await query(
        `INSERT INTO agent_registry (slug, user_id, agent_type, created_at)
         VALUES ($1, $2, $3, $4)`,
        [TEST_PREFIX + '_content-writer', TEST_USER_1, 'private', '2025-01-01T00:00:00Z']
    );
    await query(
        `INSERT INTO agent_registry (slug, user_id, agent_type, created_at)
         VALUES ($1, $2, $3, $4)`,
        [TEST_PREFIX + '_seo-specialist', TEST_USER_1, 'private', '2025-01-02T00:00:00Z']
    );
}

async function cleanupTestData(): Promise<void> {
    // Delete in reverse FK order
    await query(`DELETE FROM channel_messages WHERE channel_id IN (SELECT id FROM channels WHERE user_id LIKE $1)`, [TEST_PREFIX + '%']);
    await query(`DELETE FROM channels WHERE user_id LIKE $1`, [TEST_PREFIX + '%']);
    await query(`DELETE FROM domains WHERE user_id LIKE $1`, [TEST_PREFIX + '%']);
    await query(`DELETE FROM agent_registry WHERE slug LIKE $1`, [TEST_PREFIX + '%']);
    await query(`DELETE FROM users WHERE user_id LIKE $1`, [TEST_PREFIX + '%']);
}

// -----------------------------------------------------------------------------
// Helper
// -----------------------------------------------------------------------------

function createTestSetup() {
    const repository = new MessageBridgeRepository(realDb);
    const service = new MessageBridgeService({ repository });
    return { repository, service };
}

// Use the test prefix domain slug for lookups (since we prefixed slugs)
const ACME_SLUG = TEST_PREFIX + '_acme-corp';


// -----------------------------------------------------------------------------
// MessageBridgeRepository Tests
// -----------------------------------------------------------------------------

// Skipped: depends on NeonDB domains/channels/channel_messages tables dropped in migration 084.
// These entities now live in workspace.db (SQLite on Daytona sandbox).
describe.skip('MessageBridgeRepository', () => {
    beforeAll(async () => {
        await cleanupTestData();
        await seedTestData();
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    describe('insertMessage', () => {
        it('should insert a message and return the row', async () => {
            const { repository } = createTestSetup();

            const row = await repository.insertMessage({
                channel_id: CHANNEL_ID_1,
                sender_type: 'agent',
                sender_slug: 'content-writer',
                content: 'Draft complete.',
                message_type: 'chat',
            });

            expect(row.id).toBeDefined();
            expect(row.channel_id).toBe(CHANNEL_ID_1);
            expect(row.sender_type).toBe('agent');
            expect(row.sender_slug).toBe('content-writer');
            expect(row.content).toBe('Draft complete.');
            expect(row.message_type).toBe('chat');
            expect(row.created_at).toBeDefined();
        });

        it('should store metadata as JSON', async () => {
            const { repository } = createTestSetup();

            const row = await repository.insertMessage({
                channel_id: CHANNEL_ID_1,
                sender_type: 'agent',
                sender_slug: 'content-writer',
                content: 'Status update',
                message_type: 'status',
                metadata: { task_id: 'task-42', progress: 0.75 },
            });

            expect(row.metadata).toEqual({ task_id: 'task-42', progress: 0.75 });
        });

        it('should default metadata to empty object when not provided', async () => {
            const { repository } = createTestSetup();

            const row = await repository.insertMessage({
                channel_id: CHANNEL_ID_1,
                sender_type: 'human',
                sender_slug: 'user',
                content: 'Hello',
                message_type: 'chat',
            });

            expect(row.metadata).toEqual({});
        });
    });

    describe('queryMessages', () => {
        let queryChannelId: string;

        beforeAll(async () => {
            // Create a dedicated channel for query tests to avoid interference
            const ch = await query<{ id: string }>(
                `INSERT INTO channels (domain_id, user_id, slug, name)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [DOMAIN_ID_1, TEST_USER_1, TEST_PREFIX + '_query-test', 'Query Test']
            );
            queryChannelId = ch.rows[0].id;

            const repo = new MessageBridgeRepository(realDb);
            await repo.insertMessage({
                channel_id: queryChannelId,
                sender_type: 'agent',
                sender_slug: 'writer',
                content: 'First',
                message_type: 'chat',
            });
            // Small delay to ensure distinct timestamps
            await new Promise(r => setTimeout(r, 50));
            await repo.insertMessage({
                channel_id: queryChannelId,
                sender_type: 'human',
                sender_slug: 'user',
                content: 'Second',
                message_type: 'chat',
            });
        });

        it('should return messages for a channel ordered by created_at DESC', async () => {
            const { repository } = createTestSetup();
            const messages = await repository.queryMessages({ channel_id: queryChannelId });

            expect(messages).toHaveLength(2);
            // DESC order - most recent first
            expect(messages[0].created_at >= messages[1].created_at).toBe(true);
        });

        it('should filter by sender_type', async () => {
            const { repository } = createTestSetup();
            const agentMessages = await repository.queryMessages({
                channel_id: queryChannelId,
                sender_type: 'agent',
            });

            expect(agentMessages).toHaveLength(1);
            expect(agentMessages[0].sender_type).toBe('agent');
        });

        it('should not return messages from other channels', async () => {
            const { repository } = createTestSetup();

            // Insert a message in a different channel
            await repository.insertMessage({
                channel_id: CHANNEL_ID_2,
                sender_type: 'agent',
                sender_slug: 'marketer',
                content: 'In channel 2',
                message_type: 'chat',
            });

            const messages = await repository.queryMessages({ channel_id: queryChannelId });
            for (const msg of messages) {
                expect(msg.channel_id).toBe(queryChannelId);
            }
        });

        it('should respect limit', async () => {
            const { repository } = createTestSetup();
            const limited = await repository.queryMessages({ channel_id: queryChannelId, limit: 1 });
            expect(limited).toHaveLength(1);
        });
    });

    describe('findChannelByProjectAndSlug', () => {
        it('should find channel by user, project slug, and channel slug', async () => {
            const { repository } = createTestSetup();
            const channel = await repository.findChannelByProjectAndSlug(TEST_USER_1, ACME_SLUG, 'general');

            expect(channel).not.toBeNull();
            expect(channel!.id).toBe(CHANNEL_ID_1);
            expect(channel!.slug).toBe('general');
            expect(channel!.domain_slug).toBe(ACME_SLUG);
        });

        it('should return null for non-existent channel', async () => {
            const { repository } = createTestSetup();
            const channel = await repository.findChannelByProjectAndSlug(TEST_USER_1, ACME_SLUG, 'nonexistent');
            expect(channel).toBeNull();
        });

        it('should not return channel for wrong user', async () => {
            const { repository } = createTestSetup();
            const channel = await repository.findChannelByProjectAndSlug('user-999', ACME_SLUG, 'general');
            expect(channel).toBeNull();
        });
    });

    describe('findChannelById', () => {
        it('should find channel by id', async () => {
            const { repository } = createTestSetup();
            const channel = await repository.findChannelById(CHANNEL_ID_2);

            expect(channel).not.toBeNull();
            expect(channel!.slug).toBe('marketing');
            expect(channel!.domain_slug).toBe(ACME_SLUG);
        });

        it('should return null for non-existent id', async () => {
            const { repository } = createTestSetup();
            const channel = await repository.findChannelById('00000000-0000-0000-0000-000000000000');
            expect(channel).toBeNull();
        });
    });

    describe('findChannelLead', () => {
        it('should find lead agent for channel', async () => {
            const { repository } = createTestSetup();
            const lead = await repository.findChannelLead(CHANNEL_ID_1);

            expect(lead).not.toBeNull();
            // Returns the earliest-created agent for the user in this domain
            expect(typeof lead).toBe('string');
            expect(lead!.length).toBeGreaterThan(0);
        });

        it('should return null when no lead agent exists', async () => {
            const { repository } = createTestSetup();
            const lead = await repository.findChannelLead(CHANNEL_ID_3);
            expect(lead).toBeNull();
        });
    });
});

// -----------------------------------------------------------------------------
// MessageBridgeService Tests
// -----------------------------------------------------------------------------

describe('MessageBridgeService', () => {
    beforeAll(async () => {
        await cleanupTestData();
        await seedTestData();
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    describe('handleOutboundMessage', () => {
        it('should store agent message and return result', async () => {
            const { service } = createTestSetup();

            const result = await service.handleOutboundMessage(TEST_USER_1, {
                agent_slug: 'content-writer',
                project: ACME_SLUG,
                channel: 'general',
                content: 'Blog post draft ready for review.',
            });

            expect(result.message_id).toBeDefined();
            expect(result.channel_id).toBe(CHANNEL_ID_1);
        });

        it('should use provided message_type', async () => {
            const { service } = createTestSetup();

            await service.handleOutboundMessage(TEST_USER_1, {
                agent_slug: 'content-writer',
                project: ACME_SLUG,
                channel: 'general',
                content: 'Task 50% complete',
                message_type: 'task_update',
            });

            // Verify by querying back
            const repo = new MessageBridgeRepository(realDb);
            const messages = await repo.queryMessages({ channel_id: CHANNEL_ID_1, limit: 1 });
            expect(messages[0].message_type).toBe('task_update');
        });

        it('should store metadata', async () => {
            const { service } = createTestSetup();

            await service.handleOutboundMessage(TEST_USER_1, {
                agent_slug: 'content-writer',
                project: ACME_SLUG,
                channel: 'general',
                content: 'Done',
                metadata: { word_count: 1200 },
            });

            const repo = new MessageBridgeRepository(realDb);
            const messages = await repo.queryMessages({ channel_id: CHANNEL_ID_1, limit: 1 });
            expect(messages[0].metadata).toEqual({ word_count: 1200 });
        });

        it('should throw ChannelNotFoundError for unknown channel', async () => {
            const { service } = createTestSetup();

            await expect(
                service.handleOutboundMessage(TEST_USER_1, {
                    agent_slug: 'writer',
                    project: ACME_SLUG,
                    channel: 'nonexistent',
                    content: 'Hello',
                })
            ).rejects.toThrow(ChannelNotFoundError);
        });

        it('should throw ChannelNotFoundError for wrong user', async () => {
            const { service } = createTestSetup();

            await expect(
                service.handleOutboundMessage('wrong-user', {
                    agent_slug: 'writer',
                    project: ACME_SLUG,
                    channel: 'general',
                    content: 'Hello',
                })
            ).rejects.toThrow(ChannelNotFoundError);
        });
    });

    describe('handleInboundMessage', () => {
        it('should store human message and return runner command', async () => {
            const { service } = createTestSetup();

            const { stored, command } = await service.handleInboundMessage({
                user_id: TEST_USER_1,
                channel_id: CHANNEL_ID_1,
                content: 'Write me a blog post about AI.',
            });

            // Stored message
            expect(stored.sender_type).toBe('human');
            expect(stored.sender_slug).toBe('user');
            expect(stored.content).toBe('Write me a blog post about AI.');
            expect(stored.message_type).toBe('chat');

            // Runner command targets channel lead
            expect(command.cmd).toBe('message');
            // Lead agent is the earliest-created agent in the domain (varies in shared DB)
            expect(typeof command.agent).toBe('string');
            expect(command.agent.length).toBeGreaterThan(0);
            expect(command.content).toBe('Write me a blog post about AI.');
            expect(command.sender).toBe('user');
            expect(command.channel).toBe('general');
            expect(command.project).toBe(ACME_SLUG);
        });

        it('should use explicit target_agent over channel lead', async () => {
            const { service } = createTestSetup();

            const { command } = await service.handleInboundMessage({
                user_id: TEST_USER_1,
                channel_id: CHANNEL_ID_1,
                content: 'Hey seo-specialist, optimize this.',
                target_agent: 'seo-specialist',
            });

            expect(command.agent).toBe('seo-specialist');
        });

        it('should throw ChannelNotFoundByIdError for unknown channel', async () => {
            const { service } = createTestSetup();

            await expect(
                service.handleInboundMessage({
                    user_id: TEST_USER_1,
                    channel_id: '00000000-0000-0000-0000-000000000000',
                    content: 'Hello',
                })
            ).rejects.toThrow(ChannelNotFoundByIdError);
        });

        it('should throw NoChannelLeadError when no lead and no target', async () => {
            const { service } = createTestSetup();

            // ch-3 belongs to user-2 with no agent assigned as lead
            await expect(
                service.handleInboundMessage({
                    user_id: TEST_USER_2,
                    channel_id: CHANNEL_ID_3,
                    content: 'Hello',
                })
            ).rejects.toThrow(NoChannelLeadError);
        });
    });

    describe('queryMessages', () => {
        it('should delegate to repository', async () => {
            const { service } = createTestSetup();

            // Create a dedicated channel for this test
            const ch = await query<{ id: string }>(
                `INSERT INTO channels (domain_id, user_id, slug, name)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [DOMAIN_ID_1, TEST_USER_1, TEST_PREFIX + '_query-svc', 'Query Svc']
            );
            const chId = ch.rows[0].id;

            // Insert some messages via outbound
            const repo = new MessageBridgeRepository(realDb);
            await repo.insertMessage({
                channel_id: chId,
                sender_type: 'agent',
                sender_slug: 'content-writer',
                content: 'First',
                message_type: 'chat',
            });
            await repo.insertMessage({
                channel_id: chId,
                sender_type: 'agent',
                sender_slug: 'content-writer',
                content: 'Second',
                message_type: 'chat',
            });

            const messages = await service.queryMessages({ channel_id: chId });
            expect(messages).toHaveLength(2);
        });
    });
});

// -----------------------------------------------------------------------------
// Factory Tests
// -----------------------------------------------------------------------------

describe('createMessageBridgeService', () => {
    it('should create a MessageBridgeService instance', () => {
        const repository = new MessageBridgeRepository(realDb);
        const service = createMessageBridgeService({ repository });

        expect(service).toBeInstanceOf(MessageBridgeService);
    });
});

// -----------------------------------------------------------------------------
// Error Tests
// -----------------------------------------------------------------------------

describe('Message Bridge Errors', () => {
    it('ChannelNotFoundError should have correct properties', () => {
        const error = new ChannelNotFoundError('my-project', 'my-channel');

        expect(error.name).toBe('ChannelNotFoundError');
        expect(error.project).toBe('my-project');
        expect(error.channel).toBe('my-channel');
        expect(error.message).toBe('Channel not found: my-project/my-channel');
    });

    it('ChannelNotFoundByIdError should have correct properties', () => {
        const error = new ChannelNotFoundByIdError('ch-42');

        expect(error.name).toBe('ChannelNotFoundByIdError');
        expect(error.channelId).toBe('ch-42');
        expect(error.message).toBe('Channel not found by ID: ch-42');
    });

    it('NoChannelLeadError should have correct properties', () => {
        const error = new NoChannelLeadError('ch-99');

        expect(error.name).toBe('NoChannelLeadError');
        expect(error.channelId).toBe('ch-99');
        expect(error.message).toBe('No lead agent found for channel: ch-99');
    });
});
