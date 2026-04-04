// Test implementations for inbox dependencies
// Uses in-memory implementations for unit testing.
// DatabaseInboxItemRepository now uses workspace DB (requires sandbox),
// so tests use a standalone in-memory implementation.

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

import type {
    ChannelResolver,
    ChannelResolutionContext,
    InboxItemRepository,
    InboxItem,
    InboxSSEBroadcaster,
    InboxSSENewItemPayload,
    InboxSSEItemUpdatedPayload,
    InboxContentType,
    InboxStatus,
    InboxPriority,
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
// InMemoryInboxItemRepository
// In-memory implementation of InboxItemRepository for unit testing.
// Replaces DatabaseInboxItemRepositoryWithTracking since the real repo now
// requires a sandbox (workspace DB).
// -----------------------------------------------------------------------------

type CreateItemInput = Parameters<InboxItemRepository['createItem']>[0];
type MarkDeliveredUpdate = Parameters<InboxItemRepository['markDelivered']>[1];

let nextItemId = 1;

export class DatabaseInboxItemRepositoryWithTracking implements InboxItemRepository {
    private items = new Map<string, InboxItem>();
    private getItemOverride: InboxItem | null | undefined;
    readonly createItemCalls = new CallTracker<[CreateItemInput], InboxItem>();
    readonly markDeliveredCalls = new CallTracker<[string, MarkDeliveredUpdate], InboxItem>();
    readonly getItemCalls = new CallTracker<[string], InboxItem | null>();

    constructor(options?: { getItemResult?: InboxItem | null }) {
        this.getItemOverride = options?.getItemResult !== undefined
            ? options.getItemResult
            : undefined; // undefined means "use in-memory store"
    }

    setGetItemResult(result: InboxItem | null): void {
        this.getItemOverride = result;
    }

    async createItem(input: CreateItemInput): Promise<InboxItem> {
        const itemId = `item-${nextItemId++}`;
        const now = new Date();
        const item: InboxItem = {
            item_id: itemId,
            user_id: input.user_id,
            channel_id: input.channel_id,
            agent_slug: input.agent_slug,
            team_id: input.team_id ?? null,
            conversation_id: input.conversation_id ?? null,
            schedule_id: input.schedule_id ?? null,
            title: input.title,
            summary: input.summary,
            content: input.content,
            content_type: input.content_type,
            status: input.status,
            requires_approval: input.requires_approval,
            is_read: false,
            is_archived: false,
            priority: input.priority,
            due_date: input.due_date ?? null,
            revision_number: 1,
            metadata: input.metadata,
            created_at: now,
            updated_at: now,
            delivered_at: null,
        };
        this.items.set(itemId, item);
        this.createItemCalls.record([input], item);
        return item;
    }

    async markDelivered(itemId: string, update: MarkDeliveredUpdate): Promise<InboxItem> {
        const existing = this.items.get(itemId);
        if (!existing) {
            throw new Error(`Inbox item '${itemId}' not found`);
        }
        const now = new Date();
        const updated: InboxItem = {
            ...existing,
            status: 'delivered' as InboxStatus,
            content: update.content,
            summary: update.summary ?? existing.summary,
            content_type: update.content_type ?? existing.content_type,
            requires_approval: update.requires_approval ?? existing.requires_approval,
            delivered_at: now,
            updated_at: now,
            revision_number: existing.revision_number + 1,
            metadata: { ...existing.metadata, ...(update.metadata ?? {}) },
        };
        this.items.set(itemId, updated);
        this.markDeliveredCalls.record([itemId, update], updated);
        return updated;
    }

    async getItem(itemId: string): Promise<InboxItem | null> {
        if (this.getItemOverride !== undefined) {
            this.getItemCalls.record([itemId], this.getItemOverride);
            return this.getItemOverride;
        }
        const item = this.items.get(itemId) ?? null;
        this.getItemCalls.record([itemId], item);
        return item;
    }

    async cleanup(): Promise<void> {
        this.items.clear();
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
        content_type: 'deliverable' as InboxContentType,
        status: 'in_progress' as InboxStatus,
        requires_approval: false,
        is_read: false,
        is_archived: false,
        priority: 'normal' as InboxPriority,
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
    // No DB cleanup needed - in-memory implementation
}
