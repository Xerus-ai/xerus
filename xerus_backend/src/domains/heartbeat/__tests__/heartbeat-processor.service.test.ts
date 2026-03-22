// Heartbeat Processor Service Tests
// Tests context message building, HEARTBEAT.md parsing, and output routing.
// All functions are pure (no DB, no mocks) - deterministic input/output.

import {
    buildContextMessage,
    parseHeartbeatMd,
    parseRoutingTags,
    naturalLanguageToCron,
    HeartbeatRequest,
} from '../heartbeat-processor.service';
import { NormalizedEvent } from '../normalized-event.types';

// -----------------------------------------------------------------------------
// buildContextMessage
// -----------------------------------------------------------------------------

describe('buildContextMessage', () => {
    describe('scheduled trigger', () => {
        it('should include time, last run, and snapshot instructions', () => {
            const request: HeartbeatRequest = {
                agent_id: 1,
                user_id: 'user_1',
                trigger_type: 'scheduled',
                last_run_at: new Date('2026-02-15T08:00:00Z'),
                snapshot_path: 'context/snapshot/latest.md',
            };

            const message = buildContextMessage(request);

            expect(message).toContain('Scheduled heartbeat.');
            expect(message).toContain('Last run: 2026-02-15T08:00:00.000Z');
            expect(message).toContain('Read your HEARTBEAT.md and context/snapshot/latest.md.');
            expect(message).toContain('Snapshot available at: context/snapshot/latest.md');
        });

        it('should show "never" for first-time scheduled heartbeat', () => {
            const request: HeartbeatRequest = {
                agent_id: 1,
                user_id: 'user_1',
                trigger_type: 'scheduled',
                last_run_at: null,
            };

            const message = buildContextMessage(request);

            expect(message).toContain('Last run: never');
        });

        it('should work without snapshot_path', () => {
            const request: HeartbeatRequest = {
                agent_id: 1,
                user_id: 'user_1',
                trigger_type: 'scheduled',
                last_run_at: null,
            };

            const message = buildContextMessage(request);

            expect(message).not.toContain('Snapshot available at:');
        });
    });

    describe('event trigger', () => {
        it('should include app, event_type, and payload', () => {
            const event: NormalizedEvent = {
                app: 'gmail',
                event_type: 'new_email',
                payload: { from: 'ceo@company.com', subject: 'Q4 Budget' },
                source_provider: 'pipedream',
                received_at: new Date('2026-02-15T09:00:00Z'),
                account_id: 'acct_123',
            };

            const request: HeartbeatRequest = {
                agent_id: 1,
                user_id: 'user_1',
                trigger_type: 'event',
                event,
            };

            const message = buildContextMessage(request);

            expect(message).toContain('Event: gmail.new_email');
            expect(message).toContain('Payload:');
            expect(message).toContain('"from": "ceo@company.com"');
            expect(message).toContain('Read your HEARTBEAT.md event handler for gmail.new_email.');
        });

        it('should throw if event is missing for event trigger', () => {
            const request: HeartbeatRequest = {
                agent_id: 1,
                user_id: 'user_1',
                trigger_type: 'event',
            };

            expect(() => buildContextMessage(request)).toThrow(
                'Event heartbeat request requires an event payload'
            );
        });
    });

    describe('manual trigger', () => {
        it('should return the user message as-is', () => {
            const request: HeartbeatRequest = {
                agent_id: 1,
                user_id: 'user_1',
                trigger_type: 'manual',
                message: 'Run the weekly report now',
            };

            const message = buildContextMessage(request);

            expect(message).toBe('Run the weekly report now');
        });

        it('should return default message when no message provided', () => {
            const request: HeartbeatRequest = {
                agent_id: 1,
                user_id: 'user_1',
                trigger_type: 'manual',
            };

            const message = buildContextMessage(request);

            expect(message).toBe('Manual heartbeat triggered. Read your HEARTBEAT.md.');
        });
    });
});

// -----------------------------------------------------------------------------
// parseHeartbeatMd
// -----------------------------------------------------------------------------

describe('parseHeartbeatMd', () => {
    const SAMPLE_HEARTBEAT_MD = `# HEARTBEAT - Inbox Izzy

## Identity
An email and communications assistant focused on inbox management.

## Scheduled

### Every 30 minutes
- Review context/snapshot/latest.md for new items
- Categorize by priority
- Flag anything needing immediate attention

### Daily at 09:00 [America/New_York]
- Generate morning briefing from snapshot
- Summarize VIP communications
- List today's calendar

### Weekly on Monday at 09:00
- Weekly activity summary
- Pattern analysis across the week

## Events

### On: gmail.new_email [filter: "from:vip-list"]
- Read event payload for sender, subject, snippet
- [ALERT @human] with summary and draft response

### On: github.check_suite.failure
- Analyze failure from event payload
- [POST #dev] with diagnosis and suggested fix

## Routing
- Urgent findings: [ALERT @human]
- Team updates: [POST #channel-slug]

## Constraints
- Token budget: 8000 per scheduled heartbeat
`;

    it('should parse identity section', () => {
        const parsed = parseHeartbeatMd(SAMPLE_HEARTBEAT_MD);
        expect(parsed.identity).toBe(
            'An email and communications assistant focused on inbox management.'
        );
    });

    it('should parse scheduled entries with cron expressions', () => {
        const parsed = parseHeartbeatMd(SAMPLE_HEARTBEAT_MD);

        expect(parsed.schedules).toHaveLength(3);

        expect(parsed.schedules[0].interval_text).toBe('Every 30 minutes');
        expect(parsed.schedules[0].cron_expression).toBe('*/30 * * * *');
        expect(parsed.schedules[0].tasks).toHaveLength(3);
        expect(parsed.schedules[0].tasks[0]).toBe(
            'Review context/snapshot/latest.md for new items'
        );

        expect(parsed.schedules[1].interval_text).toBe('Daily at 09:00 [America/New_York]');
        expect(parsed.schedules[1].cron_expression).toBe('0 9 * * *');

        expect(parsed.schedules[2].interval_text).toBe('Weekly on Monday at 09:00');
        expect(parsed.schedules[2].cron_expression).toBe('0 9 * * 1');
    });

    it('should parse event entries with app, event_type, and filter', () => {
        const parsed = parseHeartbeatMd(SAMPLE_HEARTBEAT_MD);

        expect(parsed.events).toHaveLength(2);

        expect(parsed.events[0].app).toBe('gmail');
        expect(parsed.events[0].event_type).toBe('new_email');
        expect(parsed.events[0].filter).toBe('from:vip-list');
        expect(parsed.events[0].instructions).toHaveLength(2);

        expect(parsed.events[1].app).toBe('github');
        expect(parsed.events[1].event_type).toBe('check_suite.failure');
        expect(parsed.events[1].filter).toBeNull();
    });

    it('should handle empty content', () => {
        const parsed = parseHeartbeatMd('');
        expect(parsed.identity).toBeNull();
        expect(parsed.schedules).toHaveLength(0);
        expect(parsed.events).toHaveLength(0);
    });

    it('should handle content with only identity', () => {
        const content = `# HEARTBEAT - Agent\n\n## Identity\nA test agent.`;
        const parsed = parseHeartbeatMd(content);
        expect(parsed.identity).toBe('A test agent.');
        expect(parsed.schedules).toHaveLength(0);
        expect(parsed.events).toHaveLength(0);
    });
});

// -----------------------------------------------------------------------------
// naturalLanguageToCron
// -----------------------------------------------------------------------------

describe('naturalLanguageToCron', () => {
    it('should parse "Every 30 minutes"', () => {
        expect(naturalLanguageToCron('Every 30 minutes')).toBe('*/30 * * * *');
    });

    it('should parse "Every 5 minutes"', () => {
        expect(naturalLanguageToCron('Every 5 minutes')).toBe('*/5 * * * *');
    });

    it('should parse "Every 1 hour"', () => {
        expect(naturalLanguageToCron('Every 1 hour')).toBe('0 */1 * * *');
    });

    it('should parse "Every 2 hours"', () => {
        expect(naturalLanguageToCron('Every 2 hours')).toBe('0 */2 * * *');
    });

    it('should parse "Daily at 09:00"', () => {
        expect(naturalLanguageToCron('Daily at 09:00')).toBe('0 9 * * *');
    });

    it('should parse "Daily at 14:30"', () => {
        expect(naturalLanguageToCron('Daily at 14:30')).toBe('30 14 * * *');
    });

    it('should parse "Weekly on Monday at 09:00"', () => {
        expect(naturalLanguageToCron('Weekly on Monday at 09:00')).toBe('0 9 * * 1');
    });

    it('should parse "Weekly on Friday at 17:00"', () => {
        expect(naturalLanguageToCron('Weekly on Friday at 17:00')).toBe('0 17 * * 5');
    });

    it('should parse "Hourly"', () => {
        expect(naturalLanguageToCron('Hourly')).toBe('0 * * * *');
    });

    it('should parse "Every half hour"', () => {
        expect(naturalLanguageToCron('Every half hour')).toBe('*/30 * * * *');
    });

    it('should return empty string for unparseable input', () => {
        expect(naturalLanguageToCron('some random text')).toBe('');
    });

    it('should be case-insensitive', () => {
        expect(naturalLanguageToCron('EVERY 15 MINUTES')).toBe('*/15 * * * *');
        expect(naturalLanguageToCron('daily at 10:00')).toBe('0 10 * * *');
    });

    it('should handle timezone suffix in daily expressions', () => {
        // "Daily at 09:00 [America/New_York]" - the cron only cares about HH:MM
        expect(naturalLanguageToCron('Daily at 09:00 [America/New_York]')).toBe('0 9 * * *');
    });
});

// -----------------------------------------------------------------------------
// parseRoutingTags
// -----------------------------------------------------------------------------

describe('parseRoutingTags', () => {
    const defaultConfig = {
        suppress_token: 'HEARTBEAT_OK',
        default_channel_id: 42,
    };

    describe('suppress token', () => {
        it('should detect HEARTBEAT_OK as suppressed', () => {
            const result = parseRoutingTags('HEARTBEAT_OK', defaultConfig);

            expect(result.suppressed).toBe(true);
            expect(result.posts).toHaveLength(0);
            expect(result.memory_updates).toHaveLength(0);
            expect(result.alerts).toHaveLength(0);
            expect(result.logs).toHaveLength(0);
        });

        it('should detect custom suppress token', () => {
            const config = { suppress_token: 'ALL_CLEAR', default_channel_id: 1 };
            const result = parseRoutingTags('ALL_CLEAR', config);

            expect(result.suppressed).toBe(true);
        });

        it('should trim whitespace when checking suppress token', () => {
            const result = parseRoutingTags('  HEARTBEAT_OK  ', defaultConfig);
            expect(result.suppressed).toBe(true);
        });

        it('should not suppress if token is embedded in other content', () => {
            const result = parseRoutingTags(
                'Status: HEARTBEAT_OK - everything is fine',
                defaultConfig
            );
            expect(result.suppressed).toBe(false);
        });
    });

    describe('[POST] routing', () => {
        it('should route [POST #channel-slug] to specific channel', () => {
            const output = '[POST #dev] CI pipeline failed on main branch';
            const result = parseRoutingTags(output, defaultConfig);

            expect(result.suppressed).toBe(false);
            expect(result.posts).toHaveLength(1);
            expect(result.posts[0].channel_slug).toBe('dev');
            expect(result.posts[0].content).toBe('CI pipeline failed on main branch');
        });

        it('should handle multiple [POST] tags', () => {
            const output = [
                '[POST #dev] Build failed',
                '[POST #alerts] Critical: production down',
            ].join('\n');
            const result = parseRoutingTags(output, defaultConfig);

            expect(result.posts).toHaveLength(2);
            expect(result.posts[0].channel_slug).toBe('dev');
            expect(result.posts[1].channel_slug).toBe('alerts');
        });
    });

    describe('[ALERT] routing', () => {
        it('should route [ALERT @human] to default channel with alert flag', () => {
            const output = '[ALERT @human] VIP email from CEO requires immediate response';
            const result = parseRoutingTags(output, defaultConfig);

            expect(result.alerts).toHaveLength(1);
            expect(result.alerts[0].content).toBe(
                'VIP email from CEO requires immediate response'
            );
            expect(result.alerts[0].channel_slug).toBe('42');
        });
    });

    describe('[MEMORY] routing', () => {
        it('should capture [MEMORY] content as memory updates', () => {
            const output = '[MEMORY] User prefers morning email summaries';
            const result = parseRoutingTags(output, defaultConfig);

            expect(result.memory_updates).toHaveLength(1);
            expect(result.memory_updates[0]).toBe('User prefers morning email summaries');
            expect(result.posts).toHaveLength(0);
        });
    });

    describe('[LOG] routing', () => {
        it('should capture [LOG] content without posting', () => {
            const output = '[LOG] Checked 5 emails, all promotional';
            const result = parseRoutingTags(output, defaultConfig);

            expect(result.logs).toHaveLength(1);
            expect(result.logs[0]).toBe('Checked 5 emails, all promotional');
            expect(result.posts).toHaveLength(0);
        });
    });

    describe('mixed tags', () => {
        it('should handle output with multiple tag types', () => {
            const output = [
                '[POST #dev] PR #42 needs review',
                '[ALERT @human] Production error rate spiking',
                '[MEMORY] Agent noticed pattern: errors correlate with deployments',
                '[LOG] Checked 3 monitoring dashboards',
            ].join('\n');

            const result = parseRoutingTags(output, defaultConfig);

            expect(result.posts).toHaveLength(1);
            expect(result.alerts).toHaveLength(1);
            expect(result.memory_updates).toHaveLength(1);
            expect(result.logs).toHaveLength(1);
        });
    });

    describe('no tags (default channel)', () => {
        it('should post to default channel when no tags present', () => {
            const output = 'Here is your morning briefing with 3 items.';
            const result = parseRoutingTags(output, defaultConfig);

            expect(result.posts).toHaveLength(1);
            expect(result.posts[0].channel_slug).toBe('42');
            expect(result.posts[0].content).toBe(
                'Here is your morning briefing with 3 items.'
            );
        });

        it('should use "default" when default_channel_id is null', () => {
            const config = { suppress_token: 'HEARTBEAT_OK', default_channel_id: null };
            const output = 'Some output text';
            const result = parseRoutingTags(output, config);

            expect(result.posts[0].channel_slug).toBe('default');
        });
    });

    describe('raw output preservation', () => {
        it('should preserve raw output in all cases', () => {
            const output = '[POST #dev] test content';
            const result = parseRoutingTags(output, defaultConfig);
            expect(result.raw).toBe(output);
        });

        it('should preserve raw output for suppressed heartbeats', () => {
            const result = parseRoutingTags('HEARTBEAT_OK', defaultConfig);
            expect(result.raw).toBe('HEARTBEAT_OK');
        });
    });

    describe('edge cases', () => {
        it('should handle empty output as default channel post', () => {
            const result = parseRoutingTags('', defaultConfig);
            // Empty trimmed string is not the suppress token, and no tags found
            // so it falls through to default channel
            expect(result.suppressed).toBe(false);
        });

        it('should skip empty content after tags', () => {
            const output = '[LOG] ';
            const result = parseRoutingTags(output, defaultConfig);
            // LOG content is empty after trim, so it's skipped
            // No routed content means fallback to default
            expect(result.logs).toHaveLength(0);
        });
    });
});
