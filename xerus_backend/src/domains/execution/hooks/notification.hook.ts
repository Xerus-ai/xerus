// Notification Hook
// Routes notifications to inbox and push notifications based on priority

import { NotificationInput, HookResult } from './hooks.types';
import { StreamEvent, NotificationEventContent } from '../types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface NotificationContext {
    agent_id: number;
    agent_slug: string;
    user_id: string;
    primary_channel_id?: string;
}

export interface InboxItem {
    channel_id: string;
    agent_id: string;
    message: string;
    priority: string;
    action_required: boolean;
    notification_type: string;
}

export interface InboxService {
    createItem(item: InboxItem): Promise<{ id: string }>;
}

export interface PushNotification {
    user_id: string;
    title: string;
    body: string;
    priority: string;
}

export interface PushService {
    sendPush(notification: PushNotification): Promise<void>;
}

export interface NotificationSSEEmitter {
    emit(event: StreamEvent): void;
}

export interface NotificationHandlerDeps {
    inboxService: InboxService;
    pushService: PushService;
    sseEmitter: NotificationSSEEmitter;
    onPushFailure?: (error: string) => void;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const HIGH_PRIORITY_LEVELS = ['high', 'critical'];
const DEFAULT_PRIORITY = 'medium';

// -----------------------------------------------------------------------------
// Notification Handler
// -----------------------------------------------------------------------------

export class NotificationHandler {
    private readonly deps: NotificationHandlerDeps;
    private readonly context: NotificationContext;

    constructor(deps: NotificationHandlerDeps, context: NotificationContext) {
        this.deps = deps;
        this.context = context;
    }

    async handle(input: NotificationInput): Promise<HookResult> {
        const priority = input.priority || DEFAULT_PRIORITY;

        // 1. Create inbox item (required) - fail-fast on error
        await this.createInboxItem(input, priority);

        // 2. Send push notification (best effort for high/critical)
        if (this.shouldSendPush(priority)) {
            await this.sendPushNotification(input, priority);
        }

        // 3. Emit SSE event
        this.emitNotificationEvent(input, priority);

        return { success: true };
    }

    // -------------------------------------------------------------------------
    // Private Methods
    // -------------------------------------------------------------------------

    private async createInboxItem(
        input: NotificationInput,
        priority: string
    ): Promise<void> {
        const item: InboxItem = {
            channel_id: this.context.primary_channel_id || 'default',
            agent_id: String(this.context.agent_id),
            message: input.message,
            priority,
            action_required: input.action_required || false,
            notification_type: input.notification_type,
        };

        await this.deps.inboxService.createItem(item);
    }

    private shouldSendPush(priority: string): boolean {
        return HIGH_PRIORITY_LEVELS.includes(priority);
    }

    private async sendPushNotification(
        input: NotificationInput,
        priority: string
    ): Promise<void> {
        const notification: PushNotification = {
            user_id: this.context.user_id,
            title: this.buildPushTitle(input),
            body: input.message,
            priority,
        };

        try {
            await this.deps.pushService.sendPush(notification);
        } catch (error) {
            // Push is best effort - emit warning but don't fail the hook
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (this.deps.onPushFailure) {
                this.deps.onPushFailure(message);
            }
        }
    }

    private buildPushTitle(input: NotificationInput): string {
        const typeLabel = this.formatNotificationType(input.notification_type);
        return `${this.context.agent_slug}: ${typeLabel}`;
    }

    private formatNotificationType(type: string): string {
        return type
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());
    }

    private emitNotificationEvent(
        input: NotificationInput,
        priority: string
    ): void {
        const content: NotificationEventContent = {
            notification_type: input.notification_type,
            message: input.message,
            priority,
            action_required: input.action_required || false,
            agent_slug: this.context.agent_slug,
        };

        const event: StreamEvent = {
            type: 'notification',
            execution_id: input.session_id,
            content,
            timestamp: new Date().toISOString(),
        };

        this.deps.sseEmitter.emit(event);
    }
}

