// Heartbeat Inbox Integration Service
// Routes heartbeat output to inbox channels based on agent-decided routing tags.
// Handles [POST], [ALERT] routing to channels, suppression, and alert rate limiting.

import type { HeartbeatOutput } from './heartbeat-processor.service';
import type { HeartbeatConfig } from './types';
import type {
    InboxItemRepository,
    InboxSSEBroadcaster,
    InboxItem,
    InboxSSENewItemPayload,
    InboxPriority,
} from '../inbox/inbox.types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ChannelSlugResolver {
    resolveChannelSlug(channelId: string, slug: string): Promise<string | null>;
}

export interface ProcessHeartbeatOutputInput {
    agent_slug: string;
    user_id: string;
    execution_id: string;
    config: HeartbeatConfig;
    output: HeartbeatOutput;
    existing_alerts_sent?: number;
}

export interface ProcessHeartbeatOutputResult {
    inbox_posts: number;
    alerts_sent: number;
    memory_updates: number;
    logs: number;
}

// -----------------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------------

export class HeartbeatInboxService {
    private readonly channelSlugResolver: ChannelSlugResolver;
    private readonly repository: InboxItemRepository;
    private readonly sseBroadcaster: InboxSSEBroadcaster;

    constructor(
        channelSlugResolver: ChannelSlugResolver,
        repository: InboxItemRepository,
        sseBroadcaster: InboxSSEBroadcaster
    ) {
        this.channelSlugResolver = channelSlugResolver;
        this.repository = repository;
        this.sseBroadcaster = sseBroadcaster;
    }

    async processHeartbeatOutput(input: ProcessHeartbeatOutputInput): Promise<ProcessHeartbeatOutputResult> {
        const { output, config } = input;

        if (output.suppressed) {
            return {
                inbox_posts: 0,
                alerts_sent: 0,
                memory_updates: output.memory_updates.length,
                logs: output.logs.length,
            };
        }

        let inboxPosts = 0;
        let alertsSent = 0;
        const existingAlerts = input.existing_alerts_sent ?? 0;
        const maxAlerts = config.max_alerts_per_hour;

        // Process [POST] tags -> inbox items
        for (const post of output.posts) {
            const channelId = await this.resolveChannelId(post.channel_slug, config);
            const item = await this.createHeartbeatInboxItem({
                user_id: input.user_id,
                agent_slug: input.agent_slug,
                execution_id: input.execution_id,
                channel_id: channelId,
                content: post.content,
                priority: 'low',
                requires_approval: false,
            });
            this.emitNewItemEvent(item);
            inboxPosts++;
        }

        // Process [ALERT] tags -> inbox items with critical priority
        for (const alert of output.alerts) {
            if (existingAlerts + alertsSent >= maxAlerts) {
                break;
            }

            const channelId = this.resolveAlertChannelId(alert.channel_slug, config);
            const item = await this.createHeartbeatInboxItem({
                user_id: input.user_id,
                agent_slug: input.agent_slug,
                execution_id: input.execution_id,
                channel_id: channelId,
                content: alert.content,
                priority: 'critical',
                requires_approval: false,
            });
            this.emitNewItemEvent(item);
            alertsSent++;
        }

        return {
            inbox_posts: inboxPosts,
            alerts_sent: alertsSent,
            memory_updates: output.memory_updates.length,
            logs: output.logs.length,
        };
    }

    // -------------------------------------------------------------------------
    // Private Methods
    // -------------------------------------------------------------------------

    private async resolveChannelId(
        slug: string,
        config: HeartbeatConfig
    ): Promise<string | null> {
        // If the slug is 'default', use the default_channel_id directly
        if (slug === 'default') {
            return config.default_channel_id !== null
                ? String(config.default_channel_id)
                : null;
        }

        // If the slug is a numeric string (from default_channel_id), use directly
        if (this.isNumericString(slug)) {
            return slug;
        }

        // Resolve named slug via the channel slug resolver
        // We need a project context - use default_channel_id as the project anchor
        if (config.default_channel_id !== null) {
            const resolved = await this.channelSlugResolver.resolveChannelSlug(
                config.default_channel_id,
                slug
            );
            if (resolved !== null) {
                return resolved;
            }
            // Slug not found - fall back to default_channel_id
            return String(config.default_channel_id);
        }

        // No default channel configured, slug resolution not possible
        return null;
    }

    private resolveAlertChannelId(
        channelSlug: string,
        config: HeartbeatConfig
    ): string | null {
        // Alerts always go to the default channel (or the specified one if numeric)
        if (this.isNumericString(channelSlug)) {
            return channelSlug;
        }
        return config.default_channel_id !== null
            ? String(config.default_channel_id)
            : null;
    }

    private async createHeartbeatInboxItem(params: {
        user_id: string;
        agent_slug: string;
        execution_id: string;
        channel_id: string | null;
        content: string;
        priority: InboxPriority;
        requires_approval: boolean;
    }): Promise<InboxItem> {
        const title = this.generateTitle(params.content);

        return this.repository.createItem({
            user_id: params.user_id,
            agent_slug: params.agent_slug,
            channel_id: params.channel_id,
            title,
            summary: params.content,
            content: params.content,
            content_type: 'proactive_finding',
            status: 'delivered',
            requires_approval: params.requires_approval,
            priority: params.priority,
            metadata: {
                execution_id: params.execution_id,
                source: 'heartbeat',
            },
        });
    }

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

    private generateTitle(content: string): string {
        const maxLength = 80;
        const firstLine = content.split('\n')[0].trim();

        if (firstLine.length <= maxLength) {
            return firstLine;
        }

        return firstLine.slice(0, maxLength - 3) + '...';
    }

    private isNumericString(value: string): boolean {
        return /^\d+$/.test(value);
    }
}
