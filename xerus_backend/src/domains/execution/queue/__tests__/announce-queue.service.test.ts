// Subagent Announce Queue Tests
// Tests for batching and delivering subagent completion notifications to user inbox



import {
    AnnounceQueueService,
    AnnounceQueueServiceDeps,
    AnnounceQueueItem,
    AnnounceContext,
    DROP_POLICIES,
} from '../announce-queue.service';
import { AnnounceQueueDrainError } from '../command-queue.errors';

// -----------------------------------------------------------------------------
// Mock Types
// -----------------------------------------------------------------------------

interface InboxMessage {
    channel_id: string;
    message: string;
    agent_slug: string;
    timestamp: Date;
}

// -----------------------------------------------------------------------------
// Mock Inbox Writer
// -----------------------------------------------------------------------------

class InMemoryInboxWriter {
    public messages: InboxMessage[] = [];

    async writeToInbox(item: InboxMessage): Promise<{ id: string }> {
        this.messages.push(item);
        return { id: `msg-${this.messages.length}` };
    }

    clear(): void {
        this.messages = [];
    }
}

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createTestContext(overrides: Partial<AnnounceContext> = {}): AnnounceContext {
    return {
        user_id: 'user-123',
        primary_channel_id: 'channel-456',
        session_id: 'session-789',
        ...overrides,
    };
}

function createTestItem(overrides: Partial<AnnounceQueueItem> = {}): AnnounceQueueItem {
    return {
        subagent_type: 'research-agent',
        subagent_name: 'Research Agent',
        success: true,
        duration_ms: 1500,
        summary: 'Completed research task',
        queued_at: new Date(),
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('AnnounceQueueService', () => {
    let service: AnnounceQueueService;
    let inMemoryInbox: InMemoryInboxWriter;
    let context: AnnounceContext;

    beforeEach(() => {
        inMemoryInbox = new InMemoryInboxWriter();
        context = createTestContext();

        const deps: AnnounceQueueServiceDeps = {
            inboxWriter: inMemoryInbox,
        };

        service = new AnnounceQueueService(deps, context);
    });

    afterEach(() => {
        inMemoryInbox.clear();
        service.dispose();
    });

    describe('enqueue', () => {
        it('should add item to queue', () => {
            const item = createTestItem();

            service.enqueue(item);

            expect(service.getQueueSize()).toBe(1);
        });

        it('should accept multiple items', () => {
            service.enqueue(createTestItem({ subagent_type: 'agent-1' }));
            service.enqueue(createTestItem({ subagent_type: 'agent-2' }));
            service.enqueue(createTestItem({ subagent_type: 'agent-3' }));

            expect(service.getQueueSize()).toBe(3);
        });

        it('should apply FIFO drop policy when queue is full', () => {
            const service = new AnnounceQueueService(
                { inboxWriter: inMemoryInbox },
                context,
                { maxQueueSize: 3, dropPolicy: 'fifo' }
            );

            service.enqueue(createTestItem({ subagent_type: 'oldest' }));
            service.enqueue(createTestItem({ subagent_type: 'middle' }));
            service.enqueue(createTestItem({ subagent_type: 'newest' }));
            service.enqueue(createTestItem({ subagent_type: 'newest-2' }));

            expect(service.getQueueSize()).toBe(3);
            const items = service.peekAll();
            expect(items[0].subagent_type).toBe('middle');
        });

        it('should apply LIFO drop policy when queue is full', () => {
            const service = new AnnounceQueueService(
                { inboxWriter: inMemoryInbox },
                context,
                { maxQueueSize: 3, dropPolicy: 'lifo' }
            );

            service.enqueue(createTestItem({ subagent_type: 'first' }));
            service.enqueue(createTestItem({ subagent_type: 'second' }));
            service.enqueue(createTestItem({ subagent_type: 'third' }));
            service.enqueue(createTestItem({ subagent_type: 'fourth' }));

            // LIFO drops most recent existing item (third) to make room for fourth
            expect(service.getQueueSize()).toBe(3);
            const items = service.peekAll();
            expect(items[0].subagent_type).toBe('first');
            expect(items[1].subagent_type).toBe('second');
            expect(items[2].subagent_type).toBe('fourth');
        });

        it('should reject new items when using reject policy', () => {
            const service = new AnnounceQueueService(
                { inboxWriter: inMemoryInbox },
                context,
                { maxQueueSize: 2, dropPolicy: 'reject' }
            );

            service.enqueue(createTestItem({ subagent_type: 'first' }));
            service.enqueue(createTestItem({ subagent_type: 'second' }));
            const result = service.enqueue(createTestItem({ subagent_type: 'third' }));

            expect(result.accepted).toBe(false);
            expect(result.dropped).toBe(true);
            expect(service.getQueueSize()).toBe(2);
        });

        it('should return accepted result when queue has space', () => {
            const result = service.enqueue(createTestItem());

            expect(result.accepted).toBe(true);
            expect(result.dropped).toBe(false);
        });
    });

    describe('drain', () => {
        it('should clear queue after drain', async () => {
            service.enqueue(createTestItem());
            service.enqueue(createTestItem());

            await service.drain();

            expect(service.getQueueSize()).toBe(0);
        });

        it('should write batched message to inbox', async () => {
            service.enqueue(createTestItem({ subagent_name: 'Agent A', summary: 'Task A done' }));
            service.enqueue(createTestItem({ subagent_name: 'Agent B', summary: 'Task B done' }));

            await service.drain();

            expect(inMemoryInbox.messages).toHaveLength(1);
            expect(inMemoryInbox.messages[0].message).toContain('Agent A');
            expect(inMemoryInbox.messages[0].message).toContain('Agent B');
        });

        it('should route to correct channel', async () => {
            service.enqueue(createTestItem());

            await service.drain();

            expect(inMemoryInbox.messages[0].channel_id).toBe('channel-456');
        });

        it('should return drain result with count', async () => {
            service.enqueue(createTestItem());
            service.enqueue(createTestItem());
            service.enqueue(createTestItem());

            const result = await service.drain();

            expect(result.drained_count).toBe(3);
        });

        it('should skip drain if queue is empty', async () => {
            const result = await service.drain();

            expect(result.drained_count).toBe(0);
            expect(result.skipped).toBe(true);
            expect(inMemoryInbox.messages).toHaveLength(0);
        });

        it('should include success/failure indicators in message', async () => {
            service.enqueue(createTestItem({ success: true, subagent_name: 'Success Agent' }));
            service.enqueue(createTestItem({ success: false, subagent_name: 'Failed Agent', error: 'Timeout' }));

            await service.drain();

            const message = inMemoryInbox.messages[0].message;
            expect(message).toContain('Success Agent');
            expect(message).toContain('Failed Agent');
            expect(message).toContain('Timeout');
        });
    });

    describe('scheduleDrain', () => {
        it('should debounce multiple schedule calls', async () => {
            service.enqueue(createTestItem());

            service.scheduleDrain(50);
            service.scheduleDrain(50);
            service.scheduleDrain(50);

            // Wait for debounce to complete
            await new Promise((resolve) => setTimeout(resolve, 100));

            expect(inMemoryInbox.messages).toHaveLength(1);
        });

        it('should drain after debounce delay', async () => {
            service.enqueue(createTestItem());

            service.scheduleDrain(30);

            expect(service.getQueueSize()).toBe(1);

            await new Promise((resolve) => setTimeout(resolve, 50));

            expect(service.getQueueSize()).toBe(0);
            expect(inMemoryInbox.messages).toHaveLength(1);
        });

        it('should cancel scheduled drain on dispose', async () => {
            service.enqueue(createTestItem());
            service.scheduleDrain(100);

            service.dispose();

            await new Promise((resolve) => setTimeout(resolve, 150));

            expect(inMemoryInbox.messages).toHaveLength(0);
        });
    });

    describe('message formatting', () => {
        it('should format single completion clearly', async () => {
            service.enqueue(
                createTestItem({
                    subagent_name: 'Research Agent',
                    summary: 'Found 5 relevant articles',
                    duration_ms: 2500,
                })
            );

            await service.drain();

            const message = inMemoryInbox.messages[0].message;
            expect(message).toContain('Research Agent');
            expect(message).toContain('Found 5 relevant articles');
        });

        it('should format multiple completions as list', async () => {
            service.enqueue(createTestItem({ subagent_name: 'Agent A' }));
            service.enqueue(createTestItem({ subagent_name: 'Agent B' }));
            service.enqueue(createTestItem({ subagent_name: 'Agent C' }));

            await service.drain();

            const message = inMemoryInbox.messages[0].message;
            expect(message).toContain('3 agents completed');
        });

        it('should include timestamp in message', async () => {
            service.enqueue(createTestItem());

            await service.drain();

            expect(inMemoryInbox.messages[0].timestamp).toBeInstanceOf(Date);
        });

        it('should set agent_slug to xerus-master for system notifications', async () => {
            service.enqueue(createTestItem());

            await service.drain();

            expect(inMemoryInbox.messages[0].agent_slug).toBe('xerus-master');
        });
    });

    describe('error handling', () => {
        it('should throw AnnounceQueueDrainError on inbox write error', async () => {
            const failingInbox = {
                writeToInbox: async () => {
                    throw new Error('Inbox unavailable');
                },
            };

            const failingService = new AnnounceQueueService(
                { inboxWriter: failingInbox },
                context
            );

            failingService.enqueue(createTestItem());

            await expect(failingService.drain()).rejects.toThrow(AnnounceQueueDrainError);
            await expect(failingService.drain()).rejects.toThrow('Inbox unavailable');
        });

        it('should keep queue intact on drain failure', async () => {
            const failingInbox = {
                writeToInbox: async () => {
                    throw new Error('Network error');
                },
            };

            const failingService = new AnnounceQueueService(
                { inboxWriter: failingInbox },
                context
            );

            failingService.enqueue(createTestItem());

            // Drain throws, so we catch to verify queue state
            try {
                await failingService.drain();
            } catch {
                // Expected to throw
            }

            // Queue should still have the item for retry
            expect(failingService.getQueueSize()).toBe(1);
        });
    });

    describe('configuration', () => {
        it('should use default max queue size of 50', () => {
            expect(service.getMaxQueueSize()).toBe(50);
        });

        it('should use default debounce delay of 500ms', () => {
            expect(service.getDebounceDelay()).toBe(500);
        });

        it('should allow custom configuration', () => {
            const customService = new AnnounceQueueService(
                { inboxWriter: inMemoryInbox },
                context,
                { maxQueueSize: 100, debounceDelayMs: 1000, dropPolicy: 'lifo' }
            );

            expect(customService.getMaxQueueSize()).toBe(100);
            expect(customService.getDebounceDelay()).toBe(1000);
        });
    });
});

describe('DROP_POLICIES', () => {
    it('should export all drop policies', () => {
        expect(DROP_POLICIES).toContain('fifo');
        expect(DROP_POLICIES).toContain('lifo');
        expect(DROP_POLICIES).toContain('reject');
    });
});
