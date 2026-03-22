// Inbox Domain Types
// Types for bridging execution triggers with the inbox system

// -----------------------------------------------------------------------------
// Trigger-to-Channel Routing
// -----------------------------------------------------------------------------

/**
 * The 5 trigger types that can create inbox items, mapped from prompt architecture.
 * Each trigger type has a different channel routing strategy.
 * Inlined here to avoid cross-domain import from execution/queue.
 */
export type ExecutionTriggerType = 'user_message' | 'mention' | 'team' | 'schedule' | 'heartbeat';

// -----------------------------------------------------------------------------
// Content Type
// Matches inbox_items.content_type CHECK constraint from database-schema.md
// -----------------------------------------------------------------------------

export const INBOX_CONTENT_TYPES = [
    'deliverable',
    'plan',
    'report',
    'analysis',
    'output',
    'guidance',
    'proactive_finding',
    'daily_digest',
] as const;

export type InboxContentType = (typeof INBOX_CONTENT_TYPES)[number];

// -----------------------------------------------------------------------------
// Priority
// Matches inbox_items.priority CHECK constraint from database-schema.md
// -----------------------------------------------------------------------------

export const INBOX_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;

export type InboxPriority = (typeof INBOX_PRIORITIES)[number];

// -----------------------------------------------------------------------------
// Status
// Matches inbox_items.status CHECK constraint from database-schema.md
// -----------------------------------------------------------------------------

export const INBOX_STATUSES = ['in_progress', 'delivered', 'approved', 'rejected', 'archived'] as const;

export type InboxStatus = (typeof INBOX_STATUSES)[number];

// -----------------------------------------------------------------------------
// Channel Resolution Context
// Provides the information needed to determine the target channel
// -----------------------------------------------------------------------------

export interface ChannelResolutionContext {
    trigger_type: ExecutionTriggerType;
    user_id: string;
    agent_slug: string;
    /** Channel ID from chat context (for user_message trigger) */
    channel_id?: string;
    /** Schedule ID (for schedule trigger) */
    schedule_id?: number;
    /** Team ID (for team trigger) */
    team_id?: number;
    /** Thread/channel ID where the @mention occurred */
    mention_channel_id?: string;
}

// -----------------------------------------------------------------------------
// Create In-Progress Item Input
// Called when a long-running execution starts
// -----------------------------------------------------------------------------

export interface CreateInProgressInput {
    user_id: string;
    agent_slug: string;
    trigger_type: ExecutionTriggerType;
    execution_id: string;
    title: string;
    summary: string;
    /** Channel ID from chat context (user_message trigger) */
    channel_id?: string;
    /** Schedule ID (schedule trigger) */
    schedule_id?: number;
    /** Team ID (team trigger) */
    team_id?: number;
    /** Mention channel ID (mention trigger) */
    mention_channel_id?: string;
    /** Conversation ID for chat-originated tasks */
    conversation_id?: string;
    /** Priority override (defaults to trigger-based priority) */
    priority?: InboxPriority;
    /** Metadata to attach to the inbox item */
    metadata?: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Mark Delivered Input
// Called when execution completes with output
// -----------------------------------------------------------------------------

export interface MarkDeliveredInput {
    item_id: string;
    content: string;
    summary?: string;
    content_type?: InboxContentType;
    requires_approval?: boolean;
    /** Due date from task context */
    due_date?: Date;
    /** Metadata to merge */
    metadata?: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Inbox Item (DB row shape)
// Matches the inbox_items table from database-schema.md
// -----------------------------------------------------------------------------

export interface InboxItem {
    item_id: string;
    user_id: string;
    channel_id: string | null;
    agent_slug: string | null;
    team_id: number | null;
    conversation_id: string | null;
    schedule_id: number | null;
    title: string;
    summary: string | null;
    content: string;
    content_type: InboxContentType;
    status: InboxStatus;
    requires_approval: boolean;
    is_read: boolean;
    is_archived: boolean;
    priority: InboxPriority;
    due_date: Date | null;
    revision_number: number;
    metadata: Record<string, unknown>;
    created_at: Date;
    updated_at: Date;
    delivered_at: Date | null;
}

// -----------------------------------------------------------------------------
// SSE Event Payload
// Sent to connected clients when inbox items change
// -----------------------------------------------------------------------------

export interface InboxSSENewItemPayload {
    type: 'new_item';
    item: {
        item_id: string;
        title: string;
        summary: string | null;
        status: InboxStatus;
        content_type: InboxContentType;
        requires_approval: boolean;
        priority: InboxPriority;
        agent_slug: string | null;
        channel_id: string | null;
        created_at: string;
    };
}

export interface InboxSSEItemUpdatedPayload {
    type: 'item_updated';
    item_id: string;
    changes: {
        content?: string;
        summary?: string;
        status?: InboxStatus;
        content_type?: InboxContentType;
        revision_number?: number;
        delivered_at?: string;
        requires_approval?: boolean;
        priority?: InboxPriority;
    };
    updated_at: string;
}

// -----------------------------------------------------------------------------
// Dependency Interfaces
// Clean interfaces for external services (no concrete imports)
// -----------------------------------------------------------------------------

/**
 * Interface for resolving the target channel for an inbox item.
 * Encapsulates the channel lookup logic per trigger type.
 */
export interface ChannelResolver {
    /**
     * Resolve the target channel ID based on trigger context.
     * Returns null if no channel can be determined (item will be uncategorized).
     */
    resolveChannel(context: ChannelResolutionContext): Promise<string | null>;
}

/**
 * Interface for inbox item database operations.
 */
export interface InboxItemRepository {
    /**
     * Insert a new inbox item and return the created row.
     */
    createItem(input: {
        user_id: string;
        channel_id: string | null;
        agent_slug: string;
        team_id?: number | null;
        conversation_id?: string | null;
        schedule_id?: number | null;
        title: string;
        summary: string;
        content: string;
        content_type: InboxContentType;
        status: InboxStatus;
        requires_approval: boolean;
        priority: InboxPriority;
        due_date?: Date | null;
        metadata: Record<string, unknown>;
    }): Promise<InboxItem>;

    /**
     * Update an existing inbox item for delivery.
     */
    markDelivered(
        itemId: string,
        update: {
            content: string;
            summary?: string;
            content_type?: InboxContentType;
            requires_approval?: boolean;
            priority?: InboxPriority;
            due_date?: Date | null;
            metadata?: Record<string, unknown>;
        }
    ): Promise<InboxItem>;

    /**
     * Get an inbox item by ID.
     */
    getItem(itemId: string): Promise<InboxItem | null>;
}

/**
 * Interface for SSE broadcasting to connected clients.
 */
export interface InboxSSEBroadcaster {
    /**
     * Send a new_item SSE event to all of the user's connections.
     */
    broadcastNewItem(userId: string, payload: InboxSSENewItemPayload): void;

    /**
     * Send an item_updated SSE event to all of the user's connections.
     */
    broadcastItemUpdated(userId: string, payload: InboxSSEItemUpdatedPayload): void;
}

// -----------------------------------------------------------------------------
// Trigger-to-Priority Mapping
// Default priority derived from trigger type urgency
// -----------------------------------------------------------------------------

export const TRIGGER_PRIORITY_MAP: Record<ExecutionTriggerType, InboxPriority> = {
    user_message: 'high',
    mention: 'high',
    team: 'normal',
    schedule: 'normal',
    heartbeat: 'low',
};
