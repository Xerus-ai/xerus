// Execution Inbox Service Tests
// Tests for the integration between execution triggers and inbox system
// Uses real DatabaseInboxItemRepository via test-implementations

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });

import { ExecutionInboxService } from '../inbox.service';
import type {
    CreateInProgressInput,
    MarkDeliveredInput,
} from '../inbox.types';
import {
    InboxItemNotFoundError,
    InboxItemInvalidStatusError,
} from '../inbox.errors';
import {
    createTestInboxDeps,
    createDefaultInboxItem,
    cleanupInboxTestData,
} from './test-implementations';

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

afterAll(async () => {
    await cleanupInboxTestData();
});

describe('ExecutionInboxService', () => {
    describe('constructor', () => {
        it('should create service with dependencies', () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);
            expect(service).toBeInstanceOf(ExecutionInboxService);
        });
    });

    describe('createInProgressItem', () => {
        it('should create an in_progress inbox item for user_message trigger', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            const input: CreateInProgressInput = {
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'user_message',
                execution_id: 'exec-001',
                title: 'Write competitor analysis',
                summary: 'Working on competitor analysis',
                channel_id: 'channel-from-chat',
            };

            const result = await service.createInProgressItem(input);

            // Real DB returns a UUID, not sequential IDs
            expect(result.item_id).toBeDefined();
            expect(typeof result.item_id).toBe('string');
            expect(result.status).toBe('in_progress');

            expect(repository.createItemCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({
                    user_id: 'user-123',
                    agent_slug: 'test-agent',
                    title: 'Write competitor analysis',
                    summary: 'Working on competitor analysis',
                    content: '',
                    status: 'in_progress',
                    content_type: 'deliverable',
                    requires_approval: false,
                    priority: 'high',
                })
            );
        });

        it('should resolve channel via ChannelResolver', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'heartbeat',
                execution_id: 'exec-002',
                title: 'Heartbeat finding',
                summary: 'Checking metrics',
            });

            expect(channelResolver.resolveChannelCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({
                    trigger_type: 'heartbeat',
                    user_id: 'user-123',
                    agent_slug: 'test-agent',
                })
            );
        });

        it('should set priority based on trigger type when not overridden', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            // heartbeat trigger -> low priority
            await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'heartbeat',
                execution_id: 'exec-003',
                title: 'Proactive check',
                summary: 'Checking SEO metrics',
            });

            expect(repository.createItemCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({ priority: 'low' })
            );
        });

        it('should use priority override when provided', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'heartbeat',
                execution_id: 'exec-004',
                title: 'Critical finding',
                summary: 'Site is down',
                priority: 'critical',
            });

            expect(repository.createItemCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({ priority: 'critical' })
            );
        });

        it('should pass channel_id for user_message trigger', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'user_message',
                execution_id: 'exec-005',
                title: 'Chat task',
                summary: 'From chat',
                channel_id: 'chat-channel-id',
            });

            expect(channelResolver.resolveChannelCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({
                    trigger_type: 'user_message',
                    channel_id: 'chat-channel-id',
                })
            );
        });

        it('should pass team_id for team trigger', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'team',
                execution_id: 'exec-006',
                title: 'Team deliverable',
                summary: 'Team output',
                team_id: 7,
            });

            expect(repository.createItemCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({ team_id: 7 })
            );
        });

        it('should pass schedule_id for schedule trigger', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'schedule',
                execution_id: 'exec-007',
                title: 'Scheduled report',
                summary: 'Weekly digest',
                schedule_id: 15,
            });

            expect(repository.createItemCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({ schedule_id: 15 })
            );
        });

        it('should emit SSE new_item event after creation', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'user_message',
                execution_id: 'exec-008',
                title: 'New task',
                summary: 'Working on it',
            });

            expect(sseBroadcaster.newItems).toHaveLength(1);
            expect(sseBroadcaster.newItems[0].type).toBe('new_item');
            expect(sseBroadcaster.newItems[0].item.item_id).toBeDefined();
            expect(typeof sseBroadcaster.newItems[0].item.item_id).toBe('string');
            expect(sseBroadcaster.newItems[0].item.status).toBe('in_progress');
        });

        it('should store execution_id in metadata', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'user_message',
                execution_id: 'exec-009',
                title: 'Task',
                summary: 'Summary',
            });

            expect(repository.createItemCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({
                    metadata: expect.objectContaining({ execution_id: 'exec-009' }),
                })
            );
        });

        it('should merge custom metadata with execution_id', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'user_message',
                execution_id: 'exec-010',
                title: 'Task',
                summary: 'Summary',
                metadata: { custom_key: 'custom_value' },
            });

            expect(repository.createItemCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({
                    metadata: expect.objectContaining({
                        execution_id: 'exec-010',
                        custom_key: 'custom_value',
                    }),
                })
            );
        });

        it('should pass conversation_id when provided', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'user_message',
                execution_id: 'exec-011',
                title: 'Task',
                summary: 'Summary',
                conversation_id: 'conv-abc',
            });

            expect(repository.createItemCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({ conversation_id: 'conv-abc' })
            );
        });

        it('should set mention_channel_id in resolution context for mention trigger', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'mention',
                execution_id: 'exec-012',
                title: 'Mention task',
                summary: 'From mention',
                mention_channel_id: 'mention-thread-channel',
            });

            expect(channelResolver.resolveChannelCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({
                    trigger_type: 'mention',
                    mention_channel_id: 'mention-thread-channel',
                })
            );
        });
    });

    describe('markDelivered', () => {
        it('should update item status to delivered with content', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            // First create a real in_progress item
            const created = await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'user_message',
                execution_id: 'exec-deliver-1',
                title: 'Write competitor analysis',
                summary: 'Working on competitor analysis',
            });

            const input: MarkDeliveredInput = {
                item_id: created.item_id,
                content: '# Analysis Report\n\nFull analysis here...',
                summary: 'Completed competitor analysis',
                content_type: 'report',
            };

            const result = await service.markDelivered(input);

            expect(result.status).toBe('delivered');
            const lastCall = repository.markDeliveredCalls.getLastCall();
            expect(lastCall?.args[0]).toBe(created.item_id);
            expect(lastCall?.args[1]).toEqual({
                content: '# Analysis Report\n\nFull analysis here...',
                summary: 'Completed competitor analysis',
                content_type: 'report',
                requires_approval: undefined,
                priority: undefined,
                due_date: undefined,
                metadata: undefined,
            });
        });

        it('should throw InboxItemNotFoundError when item does not exist', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            repository.setGetItemResult(null);

            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            await expect(
                service.markDelivered({ item_id: 'nonexistent', content: 'test' })
            ).rejects.toThrow(InboxItemNotFoundError);
        });

        it('should throw InboxItemInvalidStatusError when item is not in_progress', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            repository.setGetItemResult(createDefaultInboxItem({ status: 'delivered' }));

            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            await expect(
                service.markDelivered({ item_id: 'item-001', content: 'test' })
            ).rejects.toThrow(InboxItemInvalidStatusError);
        });

        it('should emit SSE item_updated event after delivery', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            // Create a real in_progress item first
            const created = await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'user_message',
                execution_id: 'exec-deliver-sse',
                title: 'Report task',
                summary: 'Working',
            });

            // Clear SSE events from creation
            sseBroadcaster.updates.length = 0;

            await service.markDelivered({
                item_id: created.item_id,
                content: 'Final report',
                summary: 'Report complete',
                content_type: 'report',
            });

            expect(sseBroadcaster.updates).toHaveLength(1);
            expect(sseBroadcaster.updates[0].type).toBe('item_updated');
            expect(sseBroadcaster.updates[0].item_id).toBe(created.item_id);
            expect(sseBroadcaster.updates[0].changes.status).toBe('delivered');
            expect(sseBroadcaster.updates[0].changes.content).toBe('Final report');
        });

        it('should pass requires_approval flag', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            const created = await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'user_message',
                execution_id: 'exec-deliver-approval',
                title: 'Plan task',
                summary: 'Working on plan',
            });

            await service.markDelivered({
                item_id: created.item_id,
                content: 'Plan draft',
                content_type: 'plan',
                requires_approval: true,
            });

            const lastCall = repository.markDeliveredCalls.getLastCall();
            expect(lastCall?.args[1]).toEqual(
                expect.objectContaining({ requires_approval: true })
            );
        });

        it('should pass due_date when provided', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const dueDate = new Date('2025-03-01T00:00:00Z');
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            const created = await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'user_message',
                execution_id: 'exec-deliver-due',
                title: 'Report task',
                summary: 'Working',
            });

            await service.markDelivered({
                item_id: created.item_id,
                content: 'Report',
                due_date: dueDate,
            });

            const lastCall = repository.markDeliveredCalls.getLastCall();
            expect(lastCall?.args[1]).toEqual(
                expect.objectContaining({ due_date: dueDate })
            );
        });
    });

    describe('trigger-to-priority mapping', () => {
        it.each([
            ['user_message', 'high'],
            ['mention', 'high'],
            ['team', 'normal'],
            ['schedule', 'normal'],
            ['heartbeat', 'low'],
        ] as const)('should map %s trigger to %s priority', async (triggerType, expectedPriority) => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: triggerType,
                execution_id: `exec-${triggerType}`,
                title: `${triggerType} task`,
                summary: 'Test',
            });

            expect(repository.createItemCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({ priority: expectedPriority })
            );
        });
    });

    describe('channel resolution context', () => {
        it('should build correct context for user_message trigger', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'user_message',
                execution_id: 'exec-ctx-1',
                title: 'Task',
                summary: 'Test',
                channel_id: 'chat-ch',
            });

            expect(channelResolver.resolveChannelCalls.getLastCall()?.args[0]).toEqual({
                trigger_type: 'user_message',
                user_id: 'user-123',
                agent_slug: 'test-agent',
                channel_id: 'chat-ch',
                schedule_id: undefined,
                team_id: undefined,
                mention_channel_id: undefined,
            });
        });

        it('should build correct context for schedule trigger', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'schedule',
                execution_id: 'exec-ctx-2',
                title: 'Task',
                summary: 'Test',
                schedule_id: 99,
            });

            expect(channelResolver.resolveChannelCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({
                    trigger_type: 'schedule',
                    schedule_id: 99,
                })
            );
        });

        it('should handle null channel resolution gracefully', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            channelResolver.setResult(null);

            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'heartbeat',
                execution_id: 'exec-null-ch',
                title: 'Task',
                summary: 'Test',
            });

            expect(repository.createItemCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({ channel_id: null })
            );
        });
    });

    describe('SSE broadcasting', () => {
        it('should broadcast new_item with correct payload shape', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'user_message',
                execution_id: 'exec-sse-1',
                title: 'SSE Test',
                summary: 'Testing SSE',
            });

            const payload = sseBroadcaster.newItems[0];
            expect(payload).toEqual({
                type: 'new_item',
                item: expect.objectContaining({
                    item_id: expect.any(String),
                    title: expect.any(String),
                    status: 'in_progress',
                    content_type: 'deliverable',
                    requires_approval: false,
                    agent_slug: 'test-agent',
                    created_at: expect.any(String),
                }),
            });
        });

        it('should broadcast item_updated with delivery changes', async () => {
            const { channelResolver, repository, sseBroadcaster } = createTestInboxDeps();
            const service = new ExecutionInboxService(channelResolver, repository, sseBroadcaster);

            // Create a real in_progress item first
            const created = await service.createInProgressItem({
                user_id: 'user-123',
                agent_slug: 'test-agent',
                trigger_type: 'user_message',
                execution_id: 'exec-sse-2',
                title: 'SSE Update Test',
                summary: 'Working',
            });

            // Clear SSE events from creation
            sseBroadcaster.updates.length = 0;

            await service.markDelivered({
                item_id: created.item_id,
                content: 'Report content',
                summary: 'Done',
                content_type: 'report',
            });

            const payload = sseBroadcaster.updates[0];
            expect(payload.type).toBe('item_updated');
            expect(payload.changes).toEqual(
                expect.objectContaining({
                    status: 'delivered',
                    content: 'Report content',
                    summary: 'Done',
                    content_type: 'report',
                })
            );
            expect(payload.updated_at).toEqual(expect.any(String));
        });
    });
});
