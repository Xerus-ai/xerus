// Notification Hook Tests
// Tests for routing notifications to inbox and push notifications

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '..', '.env') });

import {
    NotificationHandler,
    NotificationHandlerDeps,
    NotificationContext,
} from '../notification.hook';
import { NotificationInput } from '../hooks.types';
import { StreamEvent } from '../../types';

// -----------------------------------------------------------------------------
// Mock Types
// -----------------------------------------------------------------------------

interface InboxItem {
    channel_id: string;
    agent_id: string;
    message: string;
    priority: string;
    action_required: boolean;
    notification_type: string;
}

interface PushNotification {
    user_id: string;
    title: string;
    body: string;
    priority: string;
}

// -----------------------------------------------------------------------------
// Mock Services
// -----------------------------------------------------------------------------

class InMemoryInboxService {
    public items: InboxItem[] = [];

    async createItem(item: InboxItem): Promise<{ id: string }> {
        this.items.push(item);
        return { id: `item-${this.items.length}` };
    }

    clear(): void {
        this.items = [];
    }
}

class InMemoryPushService {
    public notifications: PushNotification[] = [];

    async sendPush(notification: PushNotification): Promise<void> {
        this.notifications.push(notification);
    }

    clear(): void {
        this.notifications = [];
    }
}

class InMemorySSEEmitter {
    public events: StreamEvent[] = [];

    emit(event: StreamEvent): void {
        this.events.push(event);
    }

    clear(): void {
        this.events = [];
    }
}

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createTestInput(overrides: Partial<NotificationInput> = {}): NotificationInput {
    return {
        session_id: 'session-123',
        transcript_path: '/path/to/transcript',
        cwd: '/workspace',
        notification_type: 'task_complete',
        message: 'Task completed successfully',
        priority: 'medium',
        action_required: false,
        ...overrides,
    };
}

function createTestContext(overrides: Partial<NotificationContext> = {}): NotificationContext {
    return {
        agent_id: 123,
        agent_slug: 'test-agent',
        user_id: 'user-456',
        primary_channel_id: 'channel-789',
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('NotificationHandler', () => {
    let handler: NotificationHandler;
    let inMemoryInbox: InMemoryInboxService;
    let inMemoryPush: InMemoryPushService;
    let inMemorySSE: InMemorySSEEmitter;
    let context: NotificationContext;

    beforeEach(() => {
        inMemoryInbox = new InMemoryInboxService();
        inMemoryPush = new InMemoryPushService();
        inMemorySSE = new InMemorySSEEmitter();
        context = createTestContext();

        const deps: NotificationHandlerDeps = {
            inboxService: inMemoryInbox,
            pushService: inMemoryPush,
            sseEmitter: inMemorySSE,
        };

        handler = new NotificationHandler(deps, context);
    });

    afterEach(() => {
        inMemoryInbox.clear();
        inMemoryPush.clear();
        inMemorySSE.clear();
    });

    describe('handle', () => {
        it('should create inbox item for every notification', async () => {
            const input = createTestInput();

            const result = await handler.handle(input);

            expect(result.success).toBe(true);
            expect(inMemoryInbox.items).toHaveLength(1);
            expect(inMemoryInbox.items[0].message).toBe('Task completed successfully');
        });

        it('should route to agent primary channel', async () => {
            const input = createTestInput();

            await handler.handle(input);

            expect(inMemoryInbox.items[0].channel_id).toBe('channel-789');
            expect(inMemoryInbox.items[0].agent_id).toBe('123');
        });

        it('should send push notification for high priority', async () => {
            const input = createTestInput({ priority: 'high' });

            await handler.handle(input);

            expect(inMemoryPush.notifications).toHaveLength(1);
            expect(inMemoryPush.notifications[0].priority).toBe('high');
        });

        it('should send push notification for critical priority', async () => {
            const input = createTestInput({ priority: 'critical' });

            await handler.handle(input);

            expect(inMemoryPush.notifications).toHaveLength(1);
            expect(inMemoryPush.notifications[0].priority).toBe('critical');
        });

        it('should NOT send push for low/medium priority', async () => {
            const lowInput = createTestInput({ priority: 'low' });
            const mediumInput = createTestInput({ priority: 'medium' });

            await handler.handle(lowInput);
            await handler.handle(mediumInput);

            expect(inMemoryPush.notifications).toHaveLength(0);
        });

        it('should support actionRequired flag', async () => {
            const input = createTestInput({ action_required: true });

            await handler.handle(input);

            expect(inMemoryInbox.items[0].action_required).toBe(true);
        });

        it('should emit SSE event for new notification', async () => {
            const input = createTestInput();

            await handler.handle(input);

            expect(inMemorySSE.events).toHaveLength(1);
            expect(inMemorySSE.events[0].type).toBe('notification');
        });

        it('should include notification type in inbox item', async () => {
            const input = createTestInput({ notification_type: 'error_alert' });

            await handler.handle(input);

            expect(inMemoryInbox.items[0].notification_type).toBe('error_alert');
        });
    });

    describe('priority handling', () => {
        it('should default to medium priority if not specified', async () => {
            const input = createTestInput();
            delete (input as { priority?: string }).priority;

            await handler.handle(input);

            expect(inMemoryInbox.items[0].priority).toBe('medium');
        });

        it('should preserve all priority levels', async () => {
            const priorities = ['low', 'medium', 'high', 'critical'] as const;

            for (const priority of priorities) {
                const input = createTestInput({ priority });
                await handler.handle(input);
            }

            expect(inMemoryInbox.items.map((i) => i.priority)).toEqual(priorities);
        });
    });

    describe('error handling', () => {
        it('should throw on inbox error (fail-fast)', async () => {
            const failingInbox = {
                createItem: async () => {
                    throw new Error('Inbox unavailable');
                },
            };

            const failingDeps: NotificationHandlerDeps = {
                inboxService: failingInbox,
                pushService: inMemoryPush,
                sseEmitter: inMemorySSE,
            };

            const failingHandler = new NotificationHandler(failingDeps, context);
            const input = createTestInput();

            // Fail-fast: inbox errors propagate immediately
            await expect(failingHandler.handle(input)).rejects.toThrow('Inbox unavailable');
        });

        it('should continue on push notification error', async () => {
            const failingPush = {
                sendPush: async () => {
                    throw new Error('Push service down');
                },
            };

            const deps: NotificationHandlerDeps = {
                inboxService: inMemoryInbox,
                pushService: failingPush,
                sseEmitter: inMemorySSE,
            };

            const handlerWithFailingPush = new NotificationHandler(deps, context);
            const input = createTestInput({ priority: 'high' });

            // Should still succeed - push is best effort
            const result = await handlerWithFailingPush.handle(input);

            expect(result.success).toBe(true);
            expect(inMemoryInbox.items).toHaveLength(1);
        });
    });

    describe('context handling', () => {
        it('should use agent context for routing', async () => {
            const customContext = createTestContext({
                agent_id: 999,
                primary_channel_id: 'custom-channel',
            });

            const customHandler = new NotificationHandler(
                { inboxService: inMemoryInbox, pushService: inMemoryPush, sseEmitter: inMemorySSE },
                customContext
            );

            const input = createTestInput();
            await customHandler.handle(input);

            expect(inMemoryInbox.items[0].agent_id).toBe('999');
            expect(inMemoryInbox.items[0].channel_id).toBe('custom-channel');
        });

        it('should use user_id for push notifications', async () => {
            const input = createTestInput({ priority: 'critical' });

            await handler.handle(input);

            expect(inMemoryPush.notifications[0].user_id).toBe('user-456');
        });
    });
});
