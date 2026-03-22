// Digest Dispatcher Tests
// Tests the wiring between DailyDigest formatting and activity data collection.
// Uses real DailyDigestService for formatting (no mocks).

import { DigestDispatcher, calculateLookbackWindow } from '../digest-dispatcher';
import { DailyDigestService } from '../daily-digest.service';
import type {
    DigestActivityData,
    DailyDigestConfig,
    ActivityDataCollector,
} from '../daily-digest.types';

// -----------------------------------------------------------------------------
// In-Memory Activity Data Collector (real implementation, tracks calls)
// -----------------------------------------------------------------------------

interface CollectorCall {
    userId: string;
    since: Date;
    result: DigestActivityData;
    timestamp: number;
}

class InMemoryActivityDataCollector implements ActivityDataCollector {
    private defaultData: DigestActivityData;
    private calls: CollectorCall[] = [];
    private shouldFail = false;
    private failureError: Error | null = null;

    constructor(defaultData?: DigestActivityData) {
        this.defaultData = defaultData ?? {
            completed_tasks: [],
            in_progress_tasks: [],
            blocked_items: [],
            heartbeat_alerts: [],
            credit_usage: { credits_used: 0, credits_remaining: 100, top_consumers: [] },
        };
    }

    setData(data: DigestActivityData): void {
        this.defaultData = data;
    }

    setFailure(error: Error): void {
        this.shouldFail = true;
        this.failureError = error;
    }

    clearFailure(): void {
        this.shouldFail = false;
        this.failureError = null;
    }

    async collectForUser(userId: string, since: Date): Promise<DigestActivityData> {
        this.calls.push({
            userId,
            since,
            result: this.defaultData,
            timestamp: Date.now(),
        });

        if (this.shouldFail && this.failureError) {
            throw this.failureError;
        }

        return this.defaultData;
    }

    getCalls(): CollectorCall[] {
        return [...this.calls];
    }

    getLastCall(): CollectorCall | undefined {
        return this.calls[this.calls.length - 1];
    }

    wasCalled(): boolean {
        return this.calls.length > 0;
    }

    callCount(): number {
        return this.calls.length;
    }
}

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createDigestConfig(overrides: Partial<DailyDigestConfig> = {}): DailyDigestConfig {
    return {
        user_id: 'user-123',
        enabled: true,
        standup_cron: '0 9 * * *',
        report_cron: '0 18 * * *',
        timezone: 'UTC',
        skip_on_no_activity: true,
        xerus_agent_id: 1,
        default_channel_id: null,
        ...overrides,
    };
}

function createActivityData(overrides: Partial<DigestActivityData> = {}): DigestActivityData {
    return {
        completed_tasks: [],
        in_progress_tasks: [],
        blocked_items: [],
        heartbeat_alerts: [],
        credit_usage: { credits_used: 0, credits_remaining: 100, top_consumers: [] },
        ...overrides,
    };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('DigestDispatcher', () => {
    let digestService: DailyDigestService;

    beforeEach(() => {
        // Real DailyDigestService — no mocks
        digestService = new DailyDigestService();
    });

    describe('prepareDigest', () => {
        it('should collect activity and return formatted prompt for standup', async () => {
            const activityData = createActivityData({
                completed_tasks: [
                    { agent_id: 1, agent_name: 'SEO Agent', title: 'Keyword research done', channel_id: null, completed_at: new Date() },
                ],
                credit_usage: { credits_used: 10, credits_remaining: 90, top_consumers: [] },
            });

            const collector = new InMemoryActivityDataCollector(activityData);
            const dispatcher = new DigestDispatcher({ formatter: digestService, activityCollector: collector });

            const result = await dispatcher.prepareDigest('standup', createDigestConfig());

            expect(result.skipped).toBe(false);
            expect(result.variant).toBe('standup');
            expect(result.prompt).toContain('morning standup');
            expect(result.prompt).toContain('SEO Agent');
            expect(result.prompt).toContain('Keyword research done');
            expect(result.digest.variant).toBe('standup');
            expect(result.activity_data).toBe(activityData);
        });

        it('should collect activity and return formatted prompt for report', async () => {
            const activityData = createActivityData({
                completed_tasks: [
                    { agent_id: 2, agent_name: 'Writer', title: 'Blog post published', channel_id: null, completed_at: new Date() },
                ],
                heartbeat_alerts: [
                    { agent_id: 3, agent_name: 'Monitor', alert_content: 'Traffic spike detected', created_at: new Date() },
                ],
                credit_usage: { credits_used: 30, credits_remaining: 70, top_consumers: [{ agent_name: 'Writer', credits: 20 }] },
            });

            const collector = new InMemoryActivityDataCollector(activityData);
            const dispatcher = new DigestDispatcher({ formatter: digestService, activityCollector: collector });

            const result = await dispatcher.prepareDigest('report', createDigestConfig());

            expect(result.skipped).toBe(false);
            expect(result.variant).toBe('report');
            expect(result.prompt).toContain('end-of-day report');
            expect(result.prompt).toContain('Writer');
            expect(result.prompt).toContain('Blog post published');
            expect(result.prompt).toContain('Traffic spike detected');
        });

        it('should pass correct userId to activity collector', async () => {
            const collector = new InMemoryActivityDataCollector();
            const dispatcher = new DigestDispatcher({ formatter: digestService, activityCollector: collector });

            await dispatcher.prepareDigest('standup', createDigestConfig({ user_id: 'user-abc' }));

            expect(collector.wasCalled()).toBe(true);
            expect(collector.getLastCall()!.userId).toBe('user-abc');
        });

        it('should use 24h lookback for standup', async () => {
            const collector = new InMemoryActivityDataCollector();
            const dispatcher = new DigestDispatcher({ formatter: digestService, activityCollector: collector });

            const before = new Date();
            await dispatcher.prepareDigest('standup', createDigestConfig());
            const after = new Date();

            const sinceTime = collector.getLastCall()!.since.getTime();
            const expectedApprox = before.getTime() - 24 * 60 * 60 * 1000;

            // Should be approximately 24 hours ago (within 1 second tolerance)
            expect(sinceTime).toBeGreaterThanOrEqual(expectedApprox - 1000);
            expect(sinceTime).toBeLessThanOrEqual(after.getTime() - 24 * 60 * 60 * 1000 + 1000);
        });

        it('should use midnight lookback for report', async () => {
            const collector = new InMemoryActivityDataCollector();
            const dispatcher = new DigestDispatcher({ formatter: digestService, activityCollector: collector });

            await dispatcher.prepareDigest('report', createDigestConfig());

            const sinceTime = collector.getLastCall()!.since;
            expect(sinceTime.getHours()).toBe(0);
            expect(sinceTime.getMinutes()).toBe(0);
            expect(sinceTime.getSeconds()).toBe(0);
        });

        it('should skip when no activity and skip_on_no_activity is true', async () => {
            const collector = new InMemoryActivityDataCollector(createActivityData());
            const dispatcher = new DigestDispatcher({ formatter: digestService, activityCollector: collector });

            const result = await dispatcher.prepareDigest(
                'standup',
                createDigestConfig({ skip_on_no_activity: true }),
            );

            expect(result.skipped).toBe(true);
            expect(result.skip_reason).toBe('No activity for the day');
            expect(result.prompt).toBeNull();
            expect(result.digest.skipped).toBe(true);
        });

        it('should not skip when no activity but skip_on_no_activity is false', async () => {
            const collector = new InMemoryActivityDataCollector(createActivityData());
            const dispatcher = new DigestDispatcher({ formatter: digestService, activityCollector: collector });

            const result = await dispatcher.prepareDigest(
                'report',
                createDigestConfig({ skip_on_no_activity: false }),
            );

            expect(result.skipped).toBe(false);
            expect(result.prompt).not.toBeNull();
        });

        it('should throw if activity collection fails (fail-fast)', async () => {
            const collector = new InMemoryActivityDataCollector();
            collector.setFailure(new Error('DB connection timeout'));
            const dispatcher = new DigestDispatcher({ formatter: digestService, activityCollector: collector });

            await expect(
                dispatcher.prepareDigest('standup', createDigestConfig()),
            ).rejects.toThrow('DB connection timeout');
        });

        it('should include activity_data in result for caller inspection', async () => {
            const activityData = createActivityData({
                completed_tasks: [
                    { agent_id: 1, agent_name: 'A', title: 'T1', channel_id: null, completed_at: new Date() },
                    { agent_id: 2, agent_name: 'B', title: 'T2', channel_id: null, completed_at: new Date() },
                ],
            });

            const collector = new InMemoryActivityDataCollector(activityData);
            const dispatcher = new DigestDispatcher({ formatter: digestService, activityCollector: collector });

            const result = await dispatcher.prepareDigest('standup', createDigestConfig());

            expect(result.activity_data.completed_tasks).toHaveLength(2);
            expect(result.activity_data.completed_tasks[0].agent_name).toBe('A');
        });

        it('should respect timezone from config', async () => {
            const activityData = createActivityData({
                credit_usage: { credits_used: 5, credits_remaining: 95, top_consumers: [] },
            });

            const collector = new InMemoryActivityDataCollector(activityData);
            const dispatcher = new DigestDispatcher({ formatter: digestService, activityCollector: collector });

            const result = await dispatcher.prepareDigest(
                'standup',
                createDigestConfig({ timezone: 'Asia/Tokyo', skip_on_no_activity: false }),
            );

            expect(result.prompt).not.toBeNull();
            // The prompt contains a date formatted for the config's timezone
            expect(result.digest.title).toContain('Daily Standup');
        });
    });
});

describe('calculateLookbackWindow', () => {
    it('should return 24 hours ago for standup', () => {
        const now = new Date('2026-02-18T09:00:00Z');
        const since = calculateLookbackWindow('standup', now);

        expect(since.toISOString()).toBe('2026-02-17T09:00:00.000Z');
    });

    it('should return midnight today for report', () => {
        const now = new Date('2026-02-18T18:30:00Z');
        const since = calculateLookbackWindow('report', now);

        expect(since.getHours()).toBe(0);
        expect(since.getMinutes()).toBe(0);
        expect(since.getSeconds()).toBe(0);
        expect(since.getDate()).toBe(now.getDate());
    });
});
