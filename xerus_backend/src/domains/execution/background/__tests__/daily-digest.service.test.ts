// Daily Digest Service Tests - Real Database
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '..', '.env') });

import { query } from '../../../../database/connection';
import { DailyDigestService } from '../daily-digest.service';
import { heartbeatConfigRepository } from '../../../heartbeat/heartbeat-config.repository';
import { heartbeatExecutionRepository } from '../../../heartbeat/heartbeat-execution.repository';
import type { DigestActivityData, DailyDigestConfig } from '../daily-digest.types';

const TEST_USER_ID = 'test_digest_user_' + Date.now();
let TEST_AGENT_ID: number;
let XERUS_AGENT_ID: number;

async function createTestUser(userId: string): Promise<void> {
    const uniqueEmail = `${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`;
    await query(
        `INSERT INTO users (user_id, email, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email`,
        [userId, uniqueEmail, 'Test Digest User']
    );
}

async function createTestAgent(userId: string, name: string): Promise<number> {
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const result = await query<{ id: number }>(
        `INSERT INTO agent_registry (slug, user_id, agent_type)
         VALUES ($1, $2, 'private')
         RETURNING id`,
        [slug, userId]
    );
    return result.rows[0].id;
}

async function cleanupTestData(): Promise<void> {
    await query("DELETE FROM heartbeat_executions WHERE agent_id IN (SELECT id FROM agent_registry WHERE slug LIKE 'test-digest%')");
    await query("DELETE FROM heartbeat_configs WHERE user_id LIKE 'test_digest%'");
    await query("DELETE FROM agent_registry WHERE slug LIKE 'test-digest%'");
    await query("DELETE FROM users WHERE user_id LIKE 'test_digest%'");
}

describe('DailyDigestService', () => {
    let service: DailyDigestService;

    beforeAll(async () => {
        await cleanupTestData();
        await createTestUser(TEST_USER_ID);
        TEST_AGENT_ID = await createTestAgent(TEST_USER_ID, 'Test Digest Worker Agent');
        XERUS_AGENT_ID = await createTestAgent(TEST_USER_ID, 'Test Digest Xerus Agent');

        service = new DailyDigestService(heartbeatExecutionRepository);
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    // -------------------------------------------------------------------------
    // hasActivity
    // -------------------------------------------------------------------------

    describe('hasActivity', () => {
        it('should return false when all activity counts are zero', () => {
            const activityData: DigestActivityData = {
                completed_tasks: [],
                in_progress_tasks: [],
                blocked_items: [],
                heartbeat_alerts: [],
                credit_usage: { credits_used: 0, credits_remaining: 100, top_consumers: [] },
            };

            expect(service.hasActivity(activityData)).toBe(false);
        });

        it('should return true when there are completed tasks', () => {
            const activityData: DigestActivityData = {
                completed_tasks: [
                    {
                        agent_id: TEST_AGENT_ID,
                        agent_name: 'Test Agent',
                        title: 'Done task',
                        channel_id: null,
                        completed_at: new Date(),
                    },
                ],
                in_progress_tasks: [],
                blocked_items: [],
                heartbeat_alerts: [],
                credit_usage: { credits_used: 0, credits_remaining: 100, top_consumers: [] },
            };

            expect(service.hasActivity(activityData)).toBe(true);
        });

        it('should return true when there are in-progress tasks', () => {
            const activityData: DigestActivityData = {
                completed_tasks: [],
                in_progress_tasks: [
                    {
                        agent_id: TEST_AGENT_ID,
                        agent_name: 'Test Agent',
                        title: 'WIP task',
                        channel_id: null,
                        completed_at: null,
                    },
                ],
                blocked_items: [],
                heartbeat_alerts: [],
                credit_usage: { credits_used: 0, credits_remaining: 100, top_consumers: [] },
            };

            expect(service.hasActivity(activityData)).toBe(true);
        });

        it('should return true when there are blocked items', () => {
            const activityData: DigestActivityData = {
                completed_tasks: [],
                in_progress_tasks: [],
                blocked_items: [
                    {
                        agent_id: TEST_AGENT_ID,
                        agent_name: 'Test Agent',
                        title: 'Blocked item',
                        blocked_since: new Date(),
                        reason: 'Needs approval',
                    },
                ],
                heartbeat_alerts: [],
                credit_usage: { credits_used: 0, credits_remaining: 100, top_consumers: [] },
            };

            expect(service.hasActivity(activityData)).toBe(true);
        });

        it('should return true when there are heartbeat alerts', () => {
            const activityData: DigestActivityData = {
                completed_tasks: [],
                in_progress_tasks: [],
                blocked_items: [],
                heartbeat_alerts: [
                    {
                        agent_id: TEST_AGENT_ID,
                        agent_name: 'Test Agent',
                        alert_content: 'SEO rankings dropped',
                        created_at: new Date(),
                    },
                ],
                credit_usage: { credits_used: 0, credits_remaining: 100, top_consumers: [] },
            };

            expect(service.hasActivity(activityData)).toBe(true);
        });

        it('should return true when credits were used', () => {
            const activityData: DigestActivityData = {
                completed_tasks: [],
                in_progress_tasks: [],
                blocked_items: [],
                heartbeat_alerts: [],
                credit_usage: { credits_used: 5, credits_remaining: 95, top_consumers: [] },
            };

            expect(service.hasActivity(activityData)).toBe(true);
        });
    });

    // -------------------------------------------------------------------------
    // buildDigestSummary
    // -------------------------------------------------------------------------

    describe('buildDigestSummary', () => {
        it('should correctly count all summary fields', () => {
            const activityData: DigestActivityData = {
                completed_tasks: [
                    { agent_id: 1, agent_name: 'A', title: 'T1', channel_id: null, completed_at: new Date() },
                    { agent_id: 2, agent_name: 'B', title: 'T2', channel_id: null, completed_at: new Date() },
                ],
                in_progress_tasks: [
                    { agent_id: 3, agent_name: 'C', title: 'T3', channel_id: null, completed_at: null },
                ],
                blocked_items: [
                    { agent_id: 4, agent_name: 'D', title: 'T4', blocked_since: new Date(), reason: null },
                    { agent_id: 5, agent_name: 'E', title: 'T5', blocked_since: new Date(), reason: null },
                    { agent_id: 6, agent_name: 'F', title: 'T6', blocked_since: new Date(), reason: null },
                ],
                heartbeat_alerts: [
                    { agent_id: 7, agent_name: 'G', alert_content: 'Alert 1', created_at: new Date() },
                ],
                credit_usage: { credits_used: 42, credits_remaining: 58, top_consumers: [] },
            };

            const summary = service.buildDigestSummary(activityData);

            expect(summary.tasks_completed).toBe(2);
            expect(summary.tasks_in_progress).toBe(1);
            expect(summary.blocked_items).toBe(3);
            expect(summary.alerts_raised).toBe(1);
            expect(summary.credits_used).toBe(42);
        });

        it('should return zero counts for empty activity', () => {
            const activityData: DigestActivityData = {
                completed_tasks: [],
                in_progress_tasks: [],
                blocked_items: [],
                heartbeat_alerts: [],
                credit_usage: { credits_used: 0, credits_remaining: 100, top_consumers: [] },
            };

            const summary = service.buildDigestSummary(activityData);

            expect(summary.tasks_completed).toBe(0);
            expect(summary.tasks_in_progress).toBe(0);
            expect(summary.blocked_items).toBe(0);
            expect(summary.alerts_raised).toBe(0);
            expect(summary.credits_used).toBe(0);
        });
    });

    // -------------------------------------------------------------------------
    // buildDigestSections
    // -------------------------------------------------------------------------

    describe('buildDigestSections', () => {
        it('should build standup sections with priorities and blockers', () => {
            const activityData: DigestActivityData = {
                completed_tasks: [
                    { agent_id: 1, agent_name: 'Agent A', title: 'Completed analysis', channel_id: '10', completed_at: new Date() },
                ],
                in_progress_tasks: [
                    { agent_id: 2, agent_name: 'Agent B', title: 'Writing blog post', channel_id: '11', completed_at: null },
                ],
                blocked_items: [
                    { agent_id: 3, agent_name: 'Agent C', title: 'Needs data access', blocked_since: new Date(), reason: 'Waiting for approval' },
                ],
                heartbeat_alerts: [],
                credit_usage: { credits_used: 10, credits_remaining: 90, top_consumers: [] },
            };

            const sections = service.buildDigestSections('standup', activityData);

            expect(sections.length).toBeGreaterThan(0);

            const headings = sections.map((s) => s.heading);
            expect(headings).toContain('Yesterday\'s Completions');
            expect(headings).toContain('Today\'s Priorities');
            expect(headings).toContain('Blockers');
        });

        it('should build report sections with highlights and credit usage', () => {
            const activityData: DigestActivityData = {
                completed_tasks: [
                    { agent_id: 1, agent_name: 'Agent A', title: 'Delivered report', channel_id: '10', completed_at: new Date() },
                ],
                in_progress_tasks: [],
                blocked_items: [],
                heartbeat_alerts: [
                    { agent_id: 2, agent_name: 'Agent B', alert_content: 'SEO rankings improved', created_at: new Date() },
                ],
                credit_usage: {
                    credits_used: 25,
                    credits_remaining: 75,
                    top_consumers: [{ agent_name: 'Agent A', credits: 15 }],
                },
            };

            const sections = service.buildDigestSections('report', activityData);

            expect(sections.length).toBeGreaterThan(0);

            const headings = sections.map((s) => s.heading);
            expect(headings).toContain('Completed Today');
            expect(headings).toContain('Highlights');
            expect(headings).toContain('Credit Usage');
        });

        it('should skip empty sections', () => {
            const activityData: DigestActivityData = {
                completed_tasks: [],
                in_progress_tasks: [
                    { agent_id: 1, agent_name: 'Agent A', title: 'Active task', channel_id: null, completed_at: null },
                ],
                blocked_items: [],
                heartbeat_alerts: [],
                credit_usage: { credits_used: 0, credits_remaining: 100, top_consumers: [] },
            };

            const sections = service.buildDigestSections('standup', activityData);

            const headings = sections.map((s) => s.heading);
            expect(headings).not.toContain('Yesterday\'s Completions');
            expect(headings).not.toContain('Blockers');
        });

        it('should mark blocked items as action_required', () => {
            const activityData: DigestActivityData = {
                completed_tasks: [],
                in_progress_tasks: [],
                blocked_items: [
                    { agent_id: 1, agent_name: 'Agent A', title: 'Blocked task', blocked_since: new Date(), reason: 'Approval needed' },
                ],
                heartbeat_alerts: [],
                credit_usage: { credits_used: 0, credits_remaining: 100, top_consumers: [] },
            };

            const sections = service.buildDigestSections('standup', activityData);
            const blockerSection = sections.find((s) => s.heading === 'Blockers');

            expect(blockerSection).toBeDefined();
            expect(blockerSection!.items[0].action_required).toBe(true);
        });
    });

    // -------------------------------------------------------------------------
    // generateDigest
    // -------------------------------------------------------------------------

    describe('generateDigest', () => {
        it('should generate a standup digest with correct structure', () => {
            const config: DailyDigestConfig = {
                user_id: TEST_USER_ID,
                enabled: true,
                standup_cron: '0 9 * * *',
                report_cron: '0 18 * * *',
                timezone: 'UTC',
                skip_on_no_activity: true,
                xerus_agent_id: XERUS_AGENT_ID,
                default_channel_id: null,
            };

            const activityData: DigestActivityData = {
                completed_tasks: [
                    { agent_id: TEST_AGENT_ID, agent_name: 'Worker', title: 'Task done', channel_id: null, completed_at: new Date() },
                ],
                in_progress_tasks: [],
                blocked_items: [],
                heartbeat_alerts: [],
                credit_usage: { credits_used: 5, credits_remaining: 95, top_consumers: [] },
            };

            const digest = service.generateDigest('standup', config, activityData);

            expect(digest.variant).toBe('standup');
            expect(digest.user_id).toBe(TEST_USER_ID);
            expect(digest.skipped).toBe(false);
            expect(digest.skip_reason).toBeNull();
            expect(digest.title).toContain('Daily Standup');
            expect(digest.summary.tasks_completed).toBe(1);
            expect(digest.sections.length).toBeGreaterThan(0);
            expect(digest.generated_at).toBeInstanceOf(Date);
        });

        it('should generate a report digest with correct structure', () => {
            const config: DailyDigestConfig = {
                user_id: TEST_USER_ID,
                enabled: true,
                standup_cron: '0 9 * * *',
                report_cron: '0 18 * * *',
                timezone: 'UTC',
                skip_on_no_activity: false,
                xerus_agent_id: XERUS_AGENT_ID,
                default_channel_id: null,
            };

            const activityData: DigestActivityData = {
                completed_tasks: [],
                in_progress_tasks: [],
                blocked_items: [],
                heartbeat_alerts: [],
                credit_usage: { credits_used: 0, credits_remaining: 100, top_consumers: [] },
            };

            const digest = service.generateDigest('report', config, activityData);

            expect(digest.variant).toBe('report');
            expect(digest.title).toContain('Daily Report');
            expect(digest.skipped).toBe(false);
        });

        it('should skip digest when no activity and skip_on_no_activity is true', () => {
            const config: DailyDigestConfig = {
                user_id: TEST_USER_ID,
                enabled: true,
                standup_cron: '0 9 * * *',
                report_cron: '0 18 * * *',
                timezone: 'UTC',
                skip_on_no_activity: true,
                xerus_agent_id: XERUS_AGENT_ID,
                default_channel_id: null,
            };

            const emptyActivity: DigestActivityData = {
                completed_tasks: [],
                in_progress_tasks: [],
                blocked_items: [],
                heartbeat_alerts: [],
                credit_usage: { credits_used: 0, credits_remaining: 100, top_consumers: [] },
            };

            const digest = service.generateDigest('standup', config, emptyActivity);

            expect(digest.skipped).toBe(true);
            expect(digest.skip_reason).toBe('No activity for the day');
            expect(digest.sections).toEqual([]);
        });

        it('should not skip digest when no activity but skip_on_no_activity is false', () => {
            const config: DailyDigestConfig = {
                user_id: TEST_USER_ID,
                enabled: true,
                standup_cron: '0 9 * * *',
                report_cron: '0 18 * * *',
                timezone: 'UTC',
                skip_on_no_activity: false,
                xerus_agent_id: XERUS_AGENT_ID,
                default_channel_id: null,
            };

            const emptyActivity: DigestActivityData = {
                completed_tasks: [],
                in_progress_tasks: [],
                blocked_items: [],
                heartbeat_alerts: [],
                credit_usage: { credits_used: 0, credits_remaining: 100, top_consumers: [] },
            };

            const digest = service.generateDigest('report', config, emptyActivity);

            expect(digest.skipped).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // buildDigestTitle
    // -------------------------------------------------------------------------

    describe('buildDigestTitle', () => {
        it('should format standup title with date', () => {
            const title = service.buildDigestTitle('standup', 'America/New_York');

            expect(title).toContain('Daily Standup');
            expect(title).toMatch(/Daily Standup - \w+ \d+, \d{4}/);
        });

        it('should format report title with date', () => {
            const title = service.buildDigestTitle('report', 'UTC');

            expect(title).toContain('Daily Report');
            expect(title).toMatch(/Daily Report - \w+ \d+, \d{4}/);
        });
    });

    // -------------------------------------------------------------------------
    // buildHeartbeatPrompt
    // -------------------------------------------------------------------------

    describe('buildHeartbeatPrompt', () => {
        it('should build prompt for standup variant', () => {
            const activityData: DigestActivityData = {
                completed_tasks: [
                    { agent_id: 1, agent_name: 'Agent A', title: 'Task 1', channel_id: null, completed_at: new Date() },
                ],
                in_progress_tasks: [
                    { agent_id: 2, agent_name: 'Agent B', title: 'Task 2', channel_id: null, completed_at: null },
                ],
                blocked_items: [],
                heartbeat_alerts: [],
                credit_usage: { credits_used: 10, credits_remaining: 90, top_consumers: [] },
            };

            const prompt = service.buildHeartbeatPrompt('standup', activityData, 'America/New_York');

            expect(prompt).toContain('morning standup');
            expect(prompt).toContain('Agent A');
            expect(prompt).toContain('Task 1');
            expect(prompt).toContain('Agent B');
            expect(prompt).toContain('Task 2');
        });

        it('should build prompt for report variant', () => {
            const activityData: DigestActivityData = {
                completed_tasks: [],
                in_progress_tasks: [],
                blocked_items: [
                    { agent_id: 1, agent_name: 'Agent A', title: 'Blocked task', blocked_since: new Date(), reason: 'Needs approval' },
                ],
                heartbeat_alerts: [
                    { agent_id: 2, agent_name: 'Agent B', alert_content: 'Alert content', created_at: new Date() },
                ],
                credit_usage: { credits_used: 30, credits_remaining: 70, top_consumers: [{ agent_name: 'Agent B', credits: 20 }] },
            };

            const prompt = service.buildHeartbeatPrompt('report', activityData, 'UTC');

            expect(prompt).toContain('end-of-day report');
            expect(prompt).toContain('Agent A');
            expect(prompt).toContain('Blocked task');
            expect(prompt).toContain('Agent B');
            expect(prompt).toContain('30');
        });

        it('should include credit usage in prompt', () => {
            const activityData: DigestActivityData = {
                completed_tasks: [],
                in_progress_tasks: [],
                blocked_items: [],
                heartbeat_alerts: [],
                credit_usage: {
                    credits_used: 42,
                    credits_remaining: 58,
                    top_consumers: [
                        { agent_name: 'Scout Sally', credits: 25 },
                        { agent_name: 'Wordsmith Wally', credits: 17 },
                    ],
                },
            };

            const prompt = service.buildHeartbeatPrompt('standup', activityData, 'UTC');

            expect(prompt).toContain('42');
            expect(prompt).toContain('58');
        });
    });

    // -------------------------------------------------------------------------
    // recordDigestExecution (real DB)
    // -------------------------------------------------------------------------

    describe('recordDigestExecution', () => {
        it('should record a successful digest execution in heartbeat_executions', async () => {
            const config = await heartbeatConfigRepository.upsert({
                agent_id: XERUS_AGENT_ID,
                user_id: TEST_USER_ID,
                enabled: true,
                cron_expression: '0 9 * * *',
            });

            const execution = await service.recordDigestExecution({
                agent_id: XERUS_AGENT_ID,
                heartbeat_config_id: config.id,
                variant: 'standup',
                outcome: 'success',
                tokens_used: 500,
                inbox_posts: 1,
            });

            expect(execution.agent_id).toBe(XERUS_AGENT_ID);
            expect(execution.trigger_type).toBe('scheduled');
            expect(execution.status).toBe('completed');
            expect(execution.outcome).toBe('success');
            expect(execution.tokens_used).toBe(500);
            expect(execution.inbox_posts).toBe(1);
            expect(execution.event_payload).toEqual({ digest_variant: 'standup' });
        });

        it('should record a skipped digest execution', async () => {
            const config = await heartbeatConfigRepository.upsert({
                agent_id: XERUS_AGENT_ID,
                user_id: TEST_USER_ID,
                enabled: true,
            });

            const execution = await service.recordDigestExecution({
                agent_id: XERUS_AGENT_ID,
                heartbeat_config_id: config.id,
                variant: 'report',
                outcome: 'skipped',
                tokens_used: 0,
                inbox_posts: 0,
            });

            expect(execution.status).toBe('completed');
            expect(execution.outcome).toBe('skipped');
            expect(execution.tokens_used).toBe(0);
            expect(execution.event_payload).toEqual({ digest_variant: 'report' });
        });

        it('should record a failed digest execution with error message', async () => {
            const config = await heartbeatConfigRepository.upsert({
                agent_id: XERUS_AGENT_ID,
                user_id: TEST_USER_ID,
                enabled: true,
            });

            const execution = await service.recordDigestExecution({
                agent_id: XERUS_AGENT_ID,
                heartbeat_config_id: config.id,
                variant: 'standup',
                outcome: 'failure',
                tokens_used: 0,
                inbox_posts: 0,
                error_message: 'LLM API timeout',
            });

            expect(execution.status).toBe('completed');
            expect(execution.outcome).toBe('failure');
            expect(execution.error_message).toBe('LLM API timeout');
        });
    });

    // -------------------------------------------------------------------------
    // formatDateForTimezone
    // -------------------------------------------------------------------------

    describe('formatDateForTimezone', () => {
        it('should format date for UTC timezone', () => {
            const date = new Date('2026-02-14T12:00:00Z');
            const formatted = service.formatDateForTimezone(date, 'UTC');

            expect(formatted).toContain('February');
            expect(formatted).toContain('14');
            expect(formatted).toContain('2026');
        });

        it('should format date for different timezone', () => {
            const date = new Date('2026-02-14T23:00:00Z');
            const formatted = service.formatDateForTimezone(date, 'Asia/Tokyo');

            expect(formatted).toContain('February');
            expect(formatted).toContain('15');
            expect(formatted).toContain('2026');
        });
    });
});
