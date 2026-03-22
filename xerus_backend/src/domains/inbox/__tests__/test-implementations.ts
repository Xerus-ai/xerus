// Real test implementations for inbox dependencies
// Uses DatabaseInboxItemRepository for real DB operations with call tracking
// ChannelResolver and SSEBroadcaster are simple implementations (not DB-backed)

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });

// CallTracker copied locally to avoid cross-domain test import from execution
interface MethodCall<TArgs extends unknown[] = unknown[], TResult = unknown> {
    args: TArgs;
    result: TResult;
    timestamp: number;
}

class CallTracker<TArgs extends unknown[] = unknown[], TResult = unknown> {
    private calls: MethodCall<TArgs, TResult>[] = [];

    record(args: TArgs, result: TResult): void {
        this.calls.push({ args, result, timestamp: Date.now() });
    }

    getCalls(): MethodCall<TArgs, TResult>[] {
        return [...this.calls];
    }

    getLastCall(): MethodCall<TArgs, TResult> | undefined {
        return this.calls[this.calls.length - 1];
    }

    wasCalled(): boolean {
        return this.calls.length > 0;
    }

    wasCalledWith(...expectedArgs: TArgs): boolean {
        return this.calls.some(
            (call) => JSON.stringify(call.args) === JSON.stringify(expectedArgs)
        );
    }

    callCount(): number {
        return this.calls.length;
    }

    clear(): void {
        this.calls = [];
    }
}

export { CallTracker };

import { query } from '../../../database/connection';
import { DatabaseInboxItemRepository } from '../inbox-item.repository';
import type {
    ChannelResolver,
    ChannelResolutionContext,
    InboxItemRepository,
    InboxItem,
    InboxSSEBroadcaster,
    InboxSSENewItemPayload,
    InboxSSEItemUpdatedPayload,
} from '../inbox.types';

// -----------------------------------------------------------------------------
// InMemoryChannelResolver (not DB-backed - channels are resolved by trigger context)
// -----------------------------------------------------------------------------

export class InMemoryChannelResolver implements ChannelResolver {
    // Default to null (inbox_items.channel_id is UUID, so fake strings like 'channel-abc' fail)
    private result: string | null = null;
    readonly resolveChannelCalls = new CallTracker<[ChannelResolutionContext], string | null>();

    setResult(result: string | null): void {
        this.result = result;
    }

    async resolveChannel(context: ChannelResolutionContext): Promise<string | null> {
        this.resolveChannelCalls.record([context], this.result);
        return this.result;
    }
}

// -----------------------------------------------------------------------------
// InMemoryChannelSlugResolver (for heartbeat tests)
// -----------------------------------------------------------------------------

export class InMemoryChannelSlugResolver {
    private resolverFn: (channelId: string, slug: string) => string | null;
    readonly resolveChannelSlugCalls = new CallTracker<[string, string], string | null>();

    constructor() {
        this.resolverFn = (_channelId, slug) => `channel-${slug}`;
    }

    /** Override the resolver to always return a fixed value. */
    setResult(result: string | null): void {
        this.resolverFn = () => result;
    }

    async resolveChannelSlug(channelId: string, slug: string): Promise<string | null> {
        const result = this.resolverFn(channelId, slug);
        this.resolveChannelSlugCalls.record([channelId, slug], result);
        return result;
    }
}

// -----------------------------------------------------------------------------
// DatabaseInboxItemRepositoryWithTracking
// Wraps the real DatabaseInboxItemRepository with call tracking for test assertions
// -----------------------------------------------------------------------------

type CreateItemInput = Parameters<InboxItemRepository['createItem']>[0];
type MarkDeliveredUpdate = Parameters<InboxItemRepository['markDelivered']>[1];

const TEST_PREFIX = 'xinbox_impl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
const TEST_USER_ID = TEST_PREFIX + '_user';

// Ensure test user exists for FK constraints
let testUserSeeded = false;
async function ensureTestUser(): Promise<void> {
    if (testUserSeeded) return;
    const email = `${TEST_USER_ID}_${Math.random().toString(36).substring(7)}@test.com`;
    await query(
        `INSERT INTO users (user_id, email, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email`,
        [TEST_USER_ID, email, 'Test User']
    );
    testUserSeeded = true;
}

export class DatabaseInboxItemRepositoryWithTracking implements InboxItemRepository {
    private readonly realRepo = new DatabaseInboxItemRepository();
    private getItemOverride: InboxItem | null | undefined;
    readonly createItemCalls = new CallTracker<[CreateItemInput], InboxItem>();
    readonly markDeliveredCalls = new CallTracker<[string, MarkDeliveredUpdate], InboxItem>();
    readonly getItemCalls = new CallTracker<[string], InboxItem | null>();

    constructor(options?: { getItemResult?: InboxItem | null }) {
        this.getItemOverride = options?.getItemResult !== undefined
            ? options.getItemResult
            : undefined; // undefined means "use real DB"
    }

    setGetItemResult(result: InboxItem | null): void {
        this.getItemOverride = result;
    }

    async createItem(input: CreateItemInput): Promise<InboxItem> {
        // Rewrite user_id to test user for FK constraint
        const dbInput = { ...input, user_id: TEST_USER_ID };
        await ensureTestUser();
        const item = await this.realRepo.createItem(dbInput);
        // Record with original input for test assertions
        this.createItemCalls.record([input], item);
        return item;
    }

    async markDelivered(itemId: string, update: MarkDeliveredUpdate): Promise<InboxItem> {
        const item = await this.realRepo.markDelivered(itemId, update);
        this.markDeliveredCalls.record([itemId, update], item);
        return item;
    }

    async getItem(itemId: string): Promise<InboxItem | null> {
        if (this.getItemOverride !== undefined) {
            this.getItemCalls.record([itemId], this.getItemOverride);
            return this.getItemOverride;
        }
        const item = await this.realRepo.getItem(itemId);
        this.getItemCalls.record([itemId], item);
        return item;
    }

    // Clean up test data created by this repository
    async cleanup(): Promise<void> {
        await query(`DELETE FROM inbox_items WHERE user_id = $1`, [TEST_USER_ID]);
    }
}

// -----------------------------------------------------------------------------
// InMemoryInboxSSEBroadcaster (not DB-backed - tracks SSE events in memory)
// -----------------------------------------------------------------------------

export class InMemoryInboxSSEBroadcaster implements InboxSSEBroadcaster {
    readonly newItems: InboxSSENewItemPayload[] = [];
    readonly updates: InboxSSEItemUpdatedPayload[] = [];

    broadcastNewItem(_userId: string, payload: InboxSSENewItemPayload): void {
        this.newItems.push(payload);
    }

    broadcastItemUpdated(_userId: string, payload: InboxSSEItemUpdatedPayload): void {
        this.updates.push(payload);
    }
}

// -----------------------------------------------------------------------------
// Factory Functions
// -----------------------------------------------------------------------------

export function createDefaultInboxItem(overrides: Partial<InboxItem> = {}): InboxItem {
    return {
        item_id: 'item-001',
        user_id: 'user-123',
        channel_id: null,
        agent_slug: 'test-agent',
        team_id: null,
        conversation_id: null,
        schedule_id: null,
        title: 'Test Task',
        summary: 'Working on test',
        content: '',
        content_type: 'deliverable',
        status: 'in_progress',
        requires_approval: false,
        is_read: false,
        is_archived: false,
        priority: 'normal',
        due_date: null,
        revision_number: 1,
        metadata: {},
        created_at: new Date('2025-02-14T10:00:00Z'),
        updated_at: new Date('2025-02-14T10:00:00Z'),
        delivered_at: null,
        ...overrides,
    };
}

export interface TestInboxDeps {
    channelResolver: InMemoryChannelResolver;
    repository: DatabaseInboxItemRepositoryWithTracking;
    sseBroadcaster: InMemoryInboxSSEBroadcaster;
}

export function createTestInboxDeps(): TestInboxDeps {
    return {
        channelResolver: new InMemoryChannelResolver(),
        repository: new DatabaseInboxItemRepositoryWithTracking(),
        sseBroadcaster: new InMemoryInboxSSEBroadcaster(),
    };
}

export interface TestHeartbeatInboxDeps {
    channelSlugResolver: InMemoryChannelSlugResolver;
    repository: DatabaseInboxItemRepositoryWithTracking;
    sseBroadcaster: InMemoryInboxSSEBroadcaster;
}

export function createTestHeartbeatInboxDeps(): TestHeartbeatInboxDeps {
    return {
        channelSlugResolver: new InMemoryChannelSlugResolver(),
        repository: new DatabaseInboxItemRepositoryWithTracking({ getItemResult: null }),
        sseBroadcaster: new InMemoryInboxSSEBroadcaster(),
    };
}

// Cleanup helper for afterAll blocks
export async function cleanupInboxTestData(): Promise<void> {
    try {
        await query(`DELETE FROM inbox_items WHERE user_id = $1`, [TEST_USER_ID]);
        await query(`DELETE FROM users WHERE user_id = $1`, [TEST_USER_ID]);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('pool') && !msg.includes('closed') && !msg.includes('terminated')) {
            throw err;
        }
    }
    testUserSeeded = false;
}
