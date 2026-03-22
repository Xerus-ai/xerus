// Execution Inbox Integration Service
// Bridges execution triggers with the inbox system.
// Creates/updates inbox items for all execution types.

import {
    ChannelResolver,
    InboxItemRepository,
    InboxSSEBroadcaster,
    ChannelResolutionContext,
    CreateInProgressInput,
    MarkDeliveredInput,
    InboxItem,
    InboxSSENewItemPayload,
    InboxSSEItemUpdatedPayload,
    TRIGGER_PRIORITY_MAP,
} from './inbox.types';
import {
    InboxItemNotFoundError,
    InboxItemInvalidStatusError,
} from './inbox.errors';

// -----------------------------------------------------------------------------
// ExecutionInboxService
// -----------------------------------------------------------------------------

/**
 * Integrates execution triggers with the inbox system.
 *
 * Responsibilities:
 * - Create in_progress inbox items when long-running executions start
 * - Mark items as delivered when executions complete with output
 * - Route items to the correct channel based on trigger type
 * - Set priority based on trigger urgency
 * - Emit SSE events for real-time UI updates
 */
export class ExecutionInboxService {
    private readonly channelResolver: ChannelResolver;
    private readonly repository: InboxItemRepository;
    private readonly sseBroadcaster: InboxSSEBroadcaster;

    constructor(
        channelResolver: ChannelResolver,
        repository: InboxItemRepository,
        sseBroadcaster: InboxSSEBroadcaster
    ) {
        this.channelResolver = channelResolver;
        this.repository = repository;
        this.sseBroadcaster = sseBroadcaster;
    }

    /**
     * Create an in_progress inbox item when a long-running execution starts.
     *
     * Channel routing:
     * - user_message: channel from chat context
     * - heartbeat: agent's primary channel
     * - schedule: schedule's configured channel
     * - team: team's channel
     * - mention: channel of the mention thread
     */
    async createInProgressItem(input: CreateInProgressInput): Promise<InboxItem> {
        const channelId = await this.resolveTargetChannel(input);
        const priority = input.priority ?? TRIGGER_PRIORITY_MAP[input.trigger_type];
        const metadata = {
            ...input.metadata,
            execution_id: input.execution_id,
            trigger_type: input.trigger_type,
        };

        const item = await this.repository.createItem({
            user_id: input.user_id,
            channel_id: channelId,
            agent_slug: input.agent_slug,
            team_id: input.team_id ?? null,
            conversation_id: input.conversation_id ?? null,
            schedule_id: input.schedule_id ?? null,
            title: input.title,
            summary: input.summary,
            content: '',
            content_type: 'deliverable',
            status: 'in_progress',
            requires_approval: false,
            priority,
            metadata,
        });

        this.emitNewItemEvent(item);

        return item;
    }

    /**
     * Update an existing in_progress item to delivered status.
     * Called when execution completes with output.
     *
     * Validates:
     * - Item exists
     * - Item is in in_progress status
     */
    async markDelivered(input: MarkDeliveredInput): Promise<InboxItem> {
        const existing = await this.repository.getItem(input.item_id);

        if (!existing) {
            throw new InboxItemNotFoundError(input.item_id);
        }

        if (existing.status !== 'in_progress') {
            throw new InboxItemInvalidStatusError(input.item_id, existing.status, 'in_progress');
        }

        const updatedItem = await this.repository.markDelivered(input.item_id, {
            content: input.content,
            summary: input.summary,
            content_type: input.content_type,
            requires_approval: input.requires_approval,
            priority: undefined,
            due_date: input.due_date,
            metadata: input.metadata,
        });

        this.emitItemUpdatedEvent(updatedItem, input);

        return updatedItem;
    }

    // -------------------------------------------------------------------------
    // Private Methods
    // -------------------------------------------------------------------------

    /**
     * Build channel resolution context from input and delegate to ChannelResolver.
     */
    private async resolveTargetChannel(input: CreateInProgressInput): Promise<string | null> {
        const context: ChannelResolutionContext = {
            trigger_type: input.trigger_type,
            user_id: input.user_id,
            agent_slug: input.agent_slug,
            channel_id: input.channel_id,
            schedule_id: input.schedule_id,
            team_id: input.team_id,
            mention_channel_id: input.mention_channel_id,
        };

        return this.channelResolver.resolveChannel(context);
    }

    /**
     * Emit SSE new_item event to notify connected clients.
     */
    private emitNewItemEvent(item: InboxItem): void {
        const payload: InboxSSENewItemPayload = {
            type: 'new_item',
            item: {
                item_id: item.item_id,
                title: item.title,
                summary: item.summary,
                status: item.status,
                content_type: item.content_type,
                requires_approval: item.requires_approval,
                priority: item.priority,
                agent_slug: item.agent_slug,
                channel_id: item.channel_id,
                created_at: item.created_at.toISOString(),
            },
        };

        this.sseBroadcaster.broadcastNewItem(item.user_id, payload);
    }

    /**
     * Emit SSE item_updated event when item is delivered.
     */
    private emitItemUpdatedEvent(item: InboxItem, input: MarkDeliveredInput): void {
        const payload: InboxSSEItemUpdatedPayload = {
            type: 'item_updated',
            item_id: item.item_id,
            changes: {
                status: 'delivered',
                content: input.content,
                summary: input.summary,
                content_type: input.content_type,
                delivered_at: item.delivered_at?.toISOString(),
                requires_approval: input.requires_approval,
            },
            updated_at: item.updated_at.toISOString(),
        };

        this.sseBroadcaster.broadcastItemUpdated(item.user_id, payload);
    }
}
