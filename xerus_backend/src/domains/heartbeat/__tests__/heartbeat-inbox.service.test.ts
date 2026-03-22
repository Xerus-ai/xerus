// Heartbeat Inbox Integration Service Tests
// Tests for routing heartbeat output to inbox channels

import { HeartbeatInboxService } from '../heartbeat-inbox.service';
import type {
    HeartbeatOutput,
} from '../heartbeat-processor.service';
import type { HeartbeatConfig } from '../types';
import {
    createTestHeartbeatInboxDeps,
} from '../../inbox/__tests__/test-implementations';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createTestConfig(overrides: Partial<HeartbeatConfig> = {}): HeartbeatConfig {
    return {
        id: 1,
        agent_id: 42,
        user_id: 'user-123',
        enabled: true,
        cron_expression: '0 */30 * * *',
        timezone: 'UTC',
        active_hours_start: null,
        active_hours_end: null,
        weekdays_only: false,
        prompt: null,
        max_duration_seconds: 300,
        retry_on_failure: true,
        token_budget: 8000,
        event_token_budget: 4000,
        max_alerts_per_hour: 3,
        suppress_token: 'HEARTBEAT_OK',
        tool_allowlist: null,
        default_channel_id: 10,
        stagger_offset_ms: 0,
        created_at: new Date('2025-02-14T10:00:00Z'),
        updated_at: new Date('2025-02-14T10:00:00Z'),
        ...overrides,
    };
}

function createTestOutput(overrides: Partial<HeartbeatOutput> = {}): HeartbeatOutput {
    return {
        raw: '[POST #seo] Rankings dropped 15%',
        suppressed: false,
        posts: [{ channel_slug: 'seo', content: 'Rankings dropped 15%' }],
        memory_updates: [],
        alerts: [],
        logs: [],
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('HeartbeatInboxService', () => {
    describe('constructor', () => {
        it('should create service with dependencies', () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );
            expect(service).toBeInstanceOf(HeartbeatInboxService);
        });
    });

    describe('processHeartbeatOutput', () => {
        it('should return early for suppressed output', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            const output = createTestOutput({
                raw: 'HEARTBEAT_OK',
                suppressed: true,
                posts: [],
                alerts: [],
            });

            const result = await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-001',
                config: createTestConfig(),
                output,
            });

            expect(result.inbox_posts).toBe(0);
            expect(result.alerts_sent).toBe(0);
            expect(repository.createItemCalls.wasCalled()).toBe(false);
            expect(sseBroadcaster.newItems).toHaveLength(0);
        });

        it('should create inbox items for each post', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            const output = createTestOutput({
                posts: [
                    { channel_slug: 'seo', content: 'Rankings dropped 15%' },
                    { channel_slug: 'content', content: 'New blog post draft ready' },
                ],
            });

            const result = await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-002',
                config: createTestConfig(),
                output,
            });

            expect(result.inbox_posts).toBe(2);
            expect(repository.createItemCalls.callCount()).toBe(2);
        });

        it('should create inbox items with proactive_finding content type', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            const output = createTestOutput({
                posts: [{ channel_slug: 'seo', content: 'Rankings dropped 15%' }],
            });

            await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-003',
                config: createTestConfig(),
                output,
            });

            expect(repository.createItemCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({
                    content_type: 'proactive_finding',
                    status: 'delivered',
                })
            );
        });

        it('should resolve channel slug via channelSlugResolver', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            const output = createTestOutput({
                posts: [{ channel_slug: 'seo', content: 'Test' }],
            });

            await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-004',
                config: createTestConfig({ default_channel_id: 10 }),
                output,
            });

            expect(channelSlugResolver.resolveChannelSlugCalls.getLastCall()?.args).toEqual([10, 'seo']);
        });

        it('should use default_channel_id string when slug resolution returns null', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            channelSlugResolver.setResult(null);

            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            const output = createTestOutput({
                posts: [{ channel_slug: 'unknown-channel', content: 'Test' }],
            });

            await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-005',
                config: createTestConfig({ default_channel_id: 10 }),
                output,
            });

            expect(repository.createItemCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({ channel_id: '10' })
            );
        });

        it('should use null channel_id when no default and slug resolution fails', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            channelSlugResolver.setResult(null);

            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            const output = createTestOutput({
                posts: [{ channel_slug: 'unknown', content: 'Test' }],
            });

            await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-005b',
                config: createTestConfig({ default_channel_id: null }),
                output,
            });

            expect(repository.createItemCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({ channel_id: null })
            );
        });

        it('should emit SSE new_item event for each post', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            const output = createTestOutput({
                posts: [
                    { channel_slug: 'seo', content: 'Finding 1' },
                    { channel_slug: 'content', content: 'Finding 2' },
                ],
            });

            await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-006',
                config: createTestConfig(),
                output,
            });

            expect(sseBroadcaster.newItems).toHaveLength(2);
            expect(sseBroadcaster.newItems[0].type).toBe('new_item');
            expect(sseBroadcaster.newItems[0].item.content_type).toBe('proactive_finding');
        });

        it('should handle alerts with critical priority and SSE notification', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            const output = createTestOutput({
                posts: [],
                alerts: [{ content: 'Budget exceeded!', channel_slug: '10' }],
            });

            const result = await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-007',
                config: createTestConfig(),
                output,
            });

            expect(result.alerts_sent).toBe(1);
            expect(repository.createItemCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({
                    priority: 'critical',
                    content_type: 'proactive_finding',
                })
            );
            expect(sseBroadcaster.newItems).toHaveLength(1);
        });

        it('should enforce max_alerts_per_hour from config', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            const config = createTestConfig({ max_alerts_per_hour: 2 });
            const output = createTestOutput({
                posts: [],
                alerts: [
                    { content: 'Alert 1', channel_slug: '10' },
                    { content: 'Alert 2', channel_slug: '10' },
                    { content: 'Alert 3 - should be skipped', channel_slug: '10' },
                ],
            });

            const result = await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-008',
                config,
                output,
            });

            // Only 2 alerts should be processed (max_alerts_per_hour = 2)
            expect(result.alerts_sent).toBe(2);
            // 2 alerts created, 1 skipped
            expect(repository.createItemCalls.callCount()).toBe(2);
        });

        it('should respect existing alerts_sent count', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            const config = createTestConfig({ max_alerts_per_hour: 3 });
            const output = createTestOutput({
                posts: [],
                alerts: [
                    { content: 'Alert 1', channel_slug: '10' },
                    { content: 'Alert 2', channel_slug: '10' },
                    { content: 'Alert 3', channel_slug: '10' },
                ],
            });

            // Already sent 2 alerts this hour
            const result = await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-009',
                config,
                output,
                existing_alerts_sent: 2,
            });

            // Only 1 more alert allowed (3 - 2 = 1)
            expect(result.alerts_sent).toBe(1);
            expect(repository.createItemCalls.callCount()).toBe(1);
        });

        it('should not create any alerts when already at max', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            const config = createTestConfig({ max_alerts_per_hour: 3 });
            const output = createTestOutput({
                posts: [],
                alerts: [{ content: 'This should be skipped', channel_slug: '10' }],
            });

            const result = await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-010',
                config,
                output,
                existing_alerts_sent: 3,
            });

            expect(result.alerts_sent).toBe(0);
            expect(repository.createItemCalls.wasCalled()).toBe(false);
        });

        it('should handle posts to default channel when slug is default_channel_id string', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            // When the processor sets channel_slug to the default_channel_id string
            const output = createTestOutput({
                posts: [{ channel_slug: '10', content: 'Default channel post' }],
            });

            await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-011',
                config: createTestConfig({ default_channel_id: 10 }),
                output,
            });

            // Should NOT try to resolve a numeric string as a slug
            expect(channelSlugResolver.resolveChannelSlugCalls.wasCalled()).toBe(false);
            expect(repository.createItemCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({ channel_id: '10' })
            );
        });

        it('should skip [LOG] and [MEMORY] tags - they are not inbox posts', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            const output = createTestOutput({
                posts: [],
                alerts: [],
                memory_updates: ['Remember this pattern for next time'],
                logs: ['Debug: checked 15 data sources'],
            });

            const result = await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-012',
                config: createTestConfig(),
                output,
            });

            // No inbox posts created for memory and log entries
            expect(result.inbox_posts).toBe(0);
            expect(result.alerts_sent).toBe(0);
            expect(repository.createItemCalls.wasCalled()).toBe(false);
        });

        it('should return memory_updates and logs counts in result', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            const output = createTestOutput({
                posts: [{ channel_slug: 'seo', content: 'Findings' }],
                alerts: [{ content: 'Alert!', channel_slug: '10' }],
                memory_updates: ['Note 1', 'Note 2'],
                logs: ['Log entry'],
            });

            const result = await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-013',
                config: createTestConfig(),
                output,
            });

            expect(result.inbox_posts).toBe(1);
            expect(result.alerts_sent).toBe(1);
            expect(result.memory_updates).toBe(2);
            expect(result.logs).toBe(1);
        });

        it('should include execution_id and heartbeat metadata in inbox item', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            const output = createTestOutput({
                posts: [{ channel_slug: 'seo', content: 'Test' }],
            });

            await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-014',
                config: createTestConfig(),
                output,
            });

            expect(repository.createItemCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({
                    metadata: expect.objectContaining({
                        execution_id: 'exec-014',
                        source: 'heartbeat',
                    }),
                })
            );
        });

        it('should set requires_approval for alerts', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            const output = createTestOutput({
                posts: [],
                alerts: [{ content: 'Critical alert', channel_slug: '10' }],
            });

            await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-015',
                config: createTestConfig(),
                output,
            });

            // Alerts set requires_approval = false (they are notifications, not approvals)
            // Priority is critical though
            expect(repository.createItemCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({
                    priority: 'critical',
                })
            );
        });

        it('should generate title from post content', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            const longContent = 'Rankings dropped 15% for 3 target keywords this week. Analysis shows competitor AcmeSEO launched similar features.';
            const output = createTestOutput({
                posts: [{ channel_slug: 'seo', content: longContent }],
            });

            await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-016',
                config: createTestConfig(),
                output,
            });

            const callArgs = repository.createItemCalls.getCalls()[0].args[0];
            // Title should be truncated from content
            expect(callArgs.title.length).toBeLessThanOrEqual(80);
            expect(callArgs.title).toContain('Rankings dropped');
        });

        it('should handle mixed posts and alerts in single output', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            const output = createTestOutput({
                posts: [
                    { channel_slug: 'seo', content: 'SEO update' },
                    { channel_slug: 'content', content: 'Content update' },
                ],
                alerts: [{ content: 'Budget warning', channel_slug: '10' }],
                memory_updates: ['Pattern observed'],
                logs: ['Checked sources'],
            });

            const result = await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-017',
                config: createTestConfig(),
                output,
            });

            expect(result.inbox_posts).toBe(2);
            expect(result.alerts_sent).toBe(1);
            expect(result.memory_updates).toBe(1);
            expect(result.logs).toBe(1);
            // 2 posts + 1 alert = 3 SSE events
            expect(sseBroadcaster.newItems).toHaveLength(3);
        });
    });

    describe('resolveChannelId', () => {
        it('should resolve slug to channel ID via resolver', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            channelSlugResolver.setResult('resolved-channel-id');

            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            const output = createTestOutput({
                posts: [{ channel_slug: 'marketing', content: 'Update' }],
            });

            await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-018',
                config: createTestConfig({ default_channel_id: 5 }),
                output,
            });

            expect(channelSlugResolver.resolveChannelSlugCalls.getLastCall()?.args).toEqual([5, 'marketing']);
        });

        it('should use numeric slug directly when it matches default_channel_id', async () => {
            const { channelSlugResolver, repository, sseBroadcaster } = createTestHeartbeatInboxDeps();
            const service = new HeartbeatInboxService(
                channelSlugResolver,
                repository,
                sseBroadcaster
            );

            // Slug is 'default' (set by parser when no channel specified and no default_channel_id)
            const output = createTestOutput({
                posts: [{ channel_slug: 'default', content: 'No specific channel' }],
            });

            await service.processHeartbeatOutput({
                agent_id: 42,
                user_id: 'user-123',
                execution_id: 'exec-019',
                config: createTestConfig({ default_channel_id: null }),
                output,
            });

            // 'default' is a special slug, should not call resolver
            expect(channelSlugResolver.resolveChannelSlugCalls.wasCalled()).toBe(false);
            expect(repository.createItemCalls.getLastCall()?.args[0]).toEqual(
                expect.objectContaining({ channel_id: null })
            );
        });
    });
});
