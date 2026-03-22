// Heartbeat Runner v2 Tests
// Tests active hours checking, stdout event emission, config parsing

import fs from 'fs';
import path from 'path';
import os from 'os';
import { Writable } from 'stream';
import { HeartbeatRunner, isWithinActiveHours } from '../heartbeat-runner';
import { StdoutEmitter } from '../stdout-emitter';

describe('HeartbeatRunner', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xerus-heartbeat-test-'));
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function setupAgent(slug: string, config: Record<string, unknown>): void {
        const agentDir = path.join(tmpDir, 'agents', slug);
        fs.mkdirSync(agentDir, { recursive: true });
        fs.writeFileSync(path.join(agentDir, 'config.json'), JSON.stringify(config), 'utf-8');
    }

    function createTestEmitter(): { emitter: StdoutEmitter; lines: string[] } {
        const lines: string[] = [];
        const stream = new Writable({
            write(chunk, _encoding, callback) {
                lines.push(chunk.toString());
                callback();
            },
        });
        return { emitter: new StdoutEmitter(stream), lines };
    }

    // -------------------------------------------------------------------------
    // Basic timer behavior (preserved from v1)
    // -------------------------------------------------------------------------

    it('fires heartbeat on schedule', () => {
        setupAgent('seo-writer', {
            heartbeat: { enabled: true, interval_minutes: 1 },
        });

        const runner = new HeartbeatRunner(tmpDir);
        const fired: string[] = [];
        runner.on('fire', (event: { agent_slug: string }) => {
            fired.push(event.agent_slug);
        });

        runner.start();
        jest.advanceTimersByTime(60_000);
        expect(fired).toContain('seo-writer');
        runner.stop();
    });

    it('includes HEARTBEAT.md content in prompt', () => {
        const agentDir = path.join(tmpDir, 'agents', 'seo-writer');
        fs.mkdirSync(agentDir, { recursive: true });
        fs.writeFileSync(
            path.join(agentDir, 'config.json'),
            JSON.stringify({ heartbeat: { enabled: true, interval_minutes: 1 } }),
        );
        fs.writeFileSync(
            path.join(agentDir, 'HEARTBEAT.md'),
            '## Scheduled\n- Review keyword rankings\n- Check backlinks',
        );

        const runner = new HeartbeatRunner(tmpDir);
        let receivedPrompt = '';
        runner.on('fire', (event: { prompt: string }) => {
            receivedPrompt = event.prompt;
        });

        runner.start();
        jest.advanceTimersByTime(60_000);

        expect(receivedPrompt).toContain('Review keyword rankings');
        expect(receivedPrompt).toContain('Check backlinks');
        expect(receivedPrompt).toContain('== Your Schedule ==');
        runner.stop();
    });

    it('omits empty section headers when no soul files exist', () => {
        setupAgent('seo-writer', {
            heartbeat: { enabled: true, interval_minutes: 1 },
        });

        const runner = new HeartbeatRunner(tmpDir);
        let receivedPrompt = '';
        runner.on('fire', (event: { prompt: string }) => {
            receivedPrompt = event.prompt;
        });

        runner.start();
        jest.advanceTimersByTime(60_000);

        expect(receivedPrompt).toContain('[Heartbeat] seo-writer');
        expect(receivedPrompt).not.toContain('== Your Current State ==');
        expect(receivedPrompt).not.toContain('== Your Identity ==');
        expect(receivedPrompt).not.toContain('== Your Schedule ==');
        expect(receivedPrompt).toContain('update your STATUS.md');
        runner.stop();
    });

    it('includes STATUS.md content in heartbeat prompt', () => {
        const agentDir = path.join(tmpDir, 'agents', 'seo-writer');
        fs.mkdirSync(agentDir, { recursive: true });
        fs.writeFileSync(
            path.join(agentDir, 'config.json'),
            JSON.stringify({ heartbeat: { enabled: true, interval_minutes: 1 } }),
        );
        fs.writeFileSync(
            path.join(agentDir, 'STATUS.md'),
            '# Status\n\n## Current State\n- Mood: focused\n- Energy: high',
        );

        const runner = new HeartbeatRunner(tmpDir);
        let receivedPrompt = '';
        runner.on('fire', (event: { prompt: string }) => {
            receivedPrompt = event.prompt;
        });

        runner.start();
        jest.advanceTimersByTime(60_000);

        expect(receivedPrompt).toContain('== Your Current State ==');
        expect(receivedPrompt).toContain('Mood: focused');
        expect(receivedPrompt).toContain('Energy: high');
        runner.stop();
    });

    it('includes SOUL.md content in heartbeat prompt', () => {
        const agentDir = path.join(tmpDir, 'agents', 'seo-writer');
        fs.mkdirSync(agentDir, { recursive: true });
        fs.writeFileSync(
            path.join(agentDir, 'config.json'),
            JSON.stringify({ heartbeat: { enabled: true, interval_minutes: 1 } }),
        );
        fs.writeFileSync(
            path.join(agentDir, 'SOUL.md'),
            '# Soul\n\n## Identity\nName: SEO Writer\nRole: Content strategist',
        );

        const runner = new HeartbeatRunner(tmpDir);
        let receivedPrompt = '';
        runner.on('fire', (event: { prompt: string }) => {
            receivedPrompt = event.prompt;
        });

        runner.start();
        jest.advanceTimersByTime(60_000);

        expect(receivedPrompt).toContain('== Your Identity ==');
        expect(receivedPrompt).toContain('Name: SEO Writer');
        expect(receivedPrompt).toContain('Role: Content strategist');
        runner.stop();
    });

    it('omits sections for missing files but keeps present ones', () => {
        // Only HEARTBEAT.md exists, no STATUS.md or SOUL.md
        const agentDir = path.join(tmpDir, 'agents', 'seo-writer');
        fs.mkdirSync(agentDir, { recursive: true });
        fs.writeFileSync(
            path.join(agentDir, 'config.json'),
            JSON.stringify({ heartbeat: { enabled: true, interval_minutes: 1 } }),
        );
        fs.writeFileSync(path.join(agentDir, 'HEARTBEAT.md'), '## Scheduled\n- Daily check');

        const runner = new HeartbeatRunner(tmpDir);
        let receivedPrompt = '';
        runner.on('fire', (event: { prompt: string }) => {
            receivedPrompt = event.prompt;
        });

        runner.start();
        jest.advanceTimersByTime(60_000);

        expect(receivedPrompt).toContain('[Heartbeat] seo-writer');
        expect(receivedPrompt).not.toContain('== Your Current State ==');
        expect(receivedPrompt).not.toContain('== Your Identity ==');
        expect(receivedPrompt).toContain('== Your Schedule ==');
        expect(receivedPrompt).toContain('Daily check');
        expect(receivedPrompt).toContain('update your STATUS.md');
        runner.stop();
    });

    it('includes all soul files when all exist', () => {
        const agentDir = path.join(tmpDir, 'agents', 'seo-writer');
        fs.mkdirSync(agentDir, { recursive: true });
        fs.writeFileSync(
            path.join(agentDir, 'config.json'),
            JSON.stringify({ heartbeat: { enabled: true, interval_minutes: 1 } }),
        );
        fs.writeFileSync(path.join(agentDir, 'HEARTBEAT.md'), '## Scheduled\n- Check rankings');
        fs.writeFileSync(path.join(agentDir, 'STATUS.md'), '- Mood: energetic');
        fs.writeFileSync(path.join(agentDir, 'SOUL.md'), '## Identity\nName: SEO Pro');

        const runner = new HeartbeatRunner(tmpDir);
        let receivedPrompt = '';
        runner.on('fire', (event: { prompt: string }) => {
            receivedPrompt = event.prompt;
        });

        runner.start();
        jest.advanceTimersByTime(60_000);

        expect(receivedPrompt).toContain('Check rankings');
        expect(receivedPrompt).toContain('Mood: energetic');
        expect(receivedPrompt).toContain('Name: SEO Pro');
        expect(receivedPrompt).toContain('update your STATUS.md');
        runner.stop();
    });

    it('does not fire for disabled heartbeats', () => {
        setupAgent('seo-writer', {
            heartbeat: { enabled: false, interval_minutes: 1 },
        });

        const runner = new HeartbeatRunner(tmpDir);
        const fired: string[] = [];
        runner.on('fire', (event: { agent_slug: string }) => {
            fired.push(event.agent_slug);
        });

        runner.start();
        jest.advanceTimersByTime(120_000);
        expect(fired).toHaveLength(0);
        runner.stop();
    });

    it('ignores agents without heartbeat config', () => {
        setupAgent('seo-writer', { model: 'claude-sonnet-4-5-20250929' });

        const runner = new HeartbeatRunner(tmpDir);
        const fired: string[] = [];
        runner.on('fire', (event: { agent_slug: string }) => {
            fired.push(event.agent_slug);
        });

        runner.start();
        jest.advanceTimersByTime(120_000);
        expect(fired).toHaveLength(0);
        runner.stop();
    });

    it('lists heartbeat info', () => {
        setupAgent('seo-writer', {
            heartbeat: { enabled: true, interval_minutes: 5 },
        });
        setupAgent('ad-optimizer', {
            heartbeat: { enabled: false, interval_minutes: 10 },
        });

        const runner = new HeartbeatRunner(tmpDir);
        runner.start();

        const list = runner.listHeartbeats();
        expect(list).toHaveLength(2);

        const seo = list.find(h => h.agent_slug === 'seo-writer');
        expect(seo?.enabled).toBe(true);
        expect(seo?.interval_minutes).toBe(5);

        runner.stop();
    });

    it('handles missing agents directory gracefully', () => {
        const runner = new HeartbeatRunner(tmpDir);
        runner.start();
        jest.advanceTimersByTime(120_000);
        runner.stop();
    });

    it('stops all timers on stop()', () => {
        setupAgent('seo-writer', {
            heartbeat: { enabled: true, interval_minutes: 1 },
        });

        const runner = new HeartbeatRunner(tmpDir);
        const fired: string[] = [];
        runner.on('fire', (event: { agent_slug: string }) => {
            fired.push(event.agent_slug);
        });

        runner.start();
        runner.stop();

        jest.advanceTimersByTime(120_000);
        expect(fired).toHaveLength(0);
    });

    it('applies offset for staggered heartbeats', () => {
        setupAgent('seo-writer', {
            heartbeat: { enabled: true, interval_minutes: 5, offset_minutes: 2 },
        });

        const runner = new HeartbeatRunner(tmpDir);
        const fired: string[] = [];
        runner.on('fire', (event: { agent_slug: string }) => {
            fired.push(event.agent_slug);
        });

        runner.start();

        // At 1 minute: should NOT have fired yet (offset is 2 minutes)
        jest.advanceTimersByTime(60_000);
        expect(fired).toHaveLength(0);

        // At 2 minutes: should fire (initial offset reached)
        jest.advanceTimersByTime(60_000);
        expect(fired).toHaveLength(1);

        runner.stop();
    });

    // -------------------------------------------------------------------------
    // Active Hours (v2 feature)
    // -------------------------------------------------------------------------

    it('skips heartbeat outside active hours', () => {
        // Set system time to 10:00 UTC on a Monday (Jan 5 1970)
        jest.setSystemTime(new Date('1970-01-05T10:00:00Z'));

        // Active hours: 14-16 UTC, so 10:00 is outside
        setupAgent('seo-writer', {
            heartbeat: { enabled: true, interval_minutes: 1 },
            active_hours: {
                timezone: 'UTC',
                start_hour: 14,
                end_hour: 16,
                days: [0, 1, 2, 3, 4, 5, 6],
            },
        });

        const runner = new HeartbeatRunner(tmpDir);
        const fired: string[] = [];
        const skipped: Array<{ agent_slug: string; reason: string }> = [];
        runner.on('fire', (event: { agent_slug: string }) => {
            fired.push(event.agent_slug);
        });
        runner.on('skip', (event: { agent_slug: string; reason: string }) => {
            skipped.push(event);
        });

        runner.start();
        jest.advanceTimersByTime(60_000);

        expect(fired).toHaveLength(0);
        expect(skipped).toHaveLength(1);
        expect(skipped[0].reason).toBe('outside_active_hours');

        runner.stop();
    });

    it('fires heartbeat within active hours', () => {
        // Set system time to 10:00 UTC on a Monday (Jan 5 1970, day=1)
        jest.setSystemTime(new Date('1970-01-05T10:00:00Z'));

        setupAgent('seo-writer', {
            heartbeat: { enabled: true, interval_minutes: 1 },
            active_hours: {
                timezone: 'UTC',
                start_hour: 8,
                end_hour: 18,
                days: [0, 1, 2, 3, 4, 5, 6],
            },
        });

        const runner = new HeartbeatRunner(tmpDir);
        const fired: string[] = [];
        runner.on('fire', (event: { agent_slug: string }) => {
            fired.push(event.agent_slug);
        });

        runner.start();
        jest.advanceTimersByTime(60_000);

        expect(fired).toHaveLength(1);

        runner.stop();
    });

    it('skips heartbeat on excluded day', () => {
        // Set system time to Wednesday 10:00 UTC (Jan 7 1970, day=3)
        jest.setSystemTime(new Date('1970-01-07T10:00:00Z'));

        // Only allow Monday (1) and Friday (5), Wednesday excluded
        setupAgent('seo-writer', {
            heartbeat: { enabled: true, interval_minutes: 1 },
            active_hours: {
                timezone: 'UTC',
                start_hour: 0,
                end_hour: 24,
                days: [1, 5],
            },
        });

        const runner = new HeartbeatRunner(tmpDir);
        const fired: string[] = [];
        const skipped: Array<{ reason: string }> = [];
        runner.on('fire', (event: { agent_slug: string }) => {
            fired.push(event.agent_slug);
        });
        runner.on('skip', (event: { reason: string }) => {
            skipped.push(event);
        });

        runner.start();
        jest.advanceTimersByTime(60_000);

        expect(fired).toHaveLength(0);
        expect(skipped).toHaveLength(1);
        expect(skipped[0].reason).toBe('outside_active_hours');

        runner.stop();
    });

    it('fires heartbeat when no active_hours configured (always active)', () => {
        setupAgent('seo-writer', {
            heartbeat: { enabled: true, interval_minutes: 1 },
        });

        const runner = new HeartbeatRunner(tmpDir);
        const fired: string[] = [];
        runner.on('fire', (event: { agent_slug: string }) => {
            fired.push(event.agent_slug);
        });

        runner.start();
        jest.advanceTimersByTime(60_000);
        expect(fired).toHaveLength(1);

        runner.stop();
    });

    // -------------------------------------------------------------------------
    // StdoutEmitter integration (v2 feature)
    // -------------------------------------------------------------------------

    it('emits heartbeat_fired via StdoutEmitter', () => {
        setupAgent('seo-writer', {
            heartbeat: { enabled: true, interval_minutes: 1 },
        });

        const { emitter, lines } = createTestEmitter();
        const runner = new HeartbeatRunner(tmpDir, { emitter });

        runner.start();
        jest.advanceTimersByTime(60_000);

        const events = lines.map(l => JSON.parse(l));
        const heartbeatEvent = events.find(e => e.event === 'heartbeat_fired');
        expect(heartbeatEvent).toBeDefined();
        expect(heartbeatEvent.agent_slug).toBe('seo-writer');
        expect(heartbeatEvent.timestamp).toBeDefined();

        runner.stop();
    });

    it('emits heartbeat_skipped via StdoutEmitter when outside active hours', () => {
        // 10:00 UTC Monday, active 14-16 = outside
        jest.setSystemTime(new Date('1970-01-05T10:00:00Z'));

        setupAgent('seo-writer', {
            heartbeat: { enabled: true, interval_minutes: 1 },
            active_hours: {
                timezone: 'UTC',
                start_hour: 14,
                end_hour: 16,
                days: [0, 1, 2, 3, 4, 5, 6],
            },
        });

        const { emitter, lines } = createTestEmitter();
        const runner = new HeartbeatRunner(tmpDir, { emitter });

        runner.start();
        jest.advanceTimersByTime(60_000);

        const events = lines.map(l => JSON.parse(l));
        const skippedEvent = events.find(e => e.event === 'heartbeat_skipped');
        expect(skippedEvent).toBeDefined();
        expect(skippedEvent.agent_slug).toBe('seo-writer');
        expect(skippedEvent.data.reason).toBe('outside_active_hours');

        runner.stop();
    });

    it('does not emit stdout events when no emitter provided', () => {
        setupAgent('seo-writer', {
            heartbeat: { enabled: true, interval_minutes: 1 },
        });

        // No emitter - should not throw
        const runner = new HeartbeatRunner(tmpDir);
        const fired: string[] = [];
        runner.on('fire', (event: { agent_slug: string }) => {
            fired.push(event.agent_slug);
        });

        runner.start();
        jest.advanceTimersByTime(60_000);
        expect(fired).toHaveLength(1);

        runner.stop();
    });

    // -------------------------------------------------------------------------
    // getHeartbeatInfo
    // -------------------------------------------------------------------------

    it('returns heartbeat info with active_hours', () => {
        setupAgent('seo-writer', {
            heartbeat: { enabled: true, interval_minutes: 5 },
            active_hours: {
                timezone: 'America/New_York',
                start_hour: 8,
                end_hour: 22,
                days: [1, 2, 3, 4, 5],
            },
        });

        const runner = new HeartbeatRunner(tmpDir);
        runner.start();

        const info = runner.getHeartbeatInfo('seo-writer');
        expect(info).toBeDefined();
        expect(info!.active_hours).toBeDefined();
        expect(info!.active_hours!.timezone).toBe('America/New_York');
        expect(info!.active_hours!.start_hour).toBe(8);
        expect(info!.active_hours!.end_hour).toBe(22);
        expect(info!.active_hours!.days).toEqual([1, 2, 3, 4, 5]);

        runner.stop();
    });
});

// -----------------------------------------------------------------------------
// isWithinActiveHours (pure function tests)
// -----------------------------------------------------------------------------

describe('isWithinActiveHours', () => {
    // Use explicit Date objects instead of relying on jest.useFakeTimers(),
    // since Intl.DateTimeFormat may bypass faked Date internals.

    it('returns true when current hour is within range', () => {
        // Midnight UTC on Thursday Jan 1 1970
        const now = new Date('1970-01-01T00:00:00Z');
        const result = isWithinActiveHours({
            timezone: 'UTC',
            start_hour: 0,
            end_hour: 8,
            days: [0, 1, 2, 3, 4, 5, 6],
        }, now);
        expect(result).toBe(true);
    });

    it('returns false when current hour is outside range', () => {
        const now = new Date('1970-01-01T00:00:00Z');
        const result = isWithinActiveHours({
            timezone: 'UTC',
            start_hour: 9,
            end_hour: 17,
            days: [0, 1, 2, 3, 4, 5, 6],
        }, now);
        expect(result).toBe(false);
    });

    it('returns false when current day is excluded', () => {
        // Jan 1 1970 = Thursday (day 4), only allow Mon-Wed (1,2,3)
        const now = new Date('1970-01-01T00:00:00Z');
        const result = isWithinActiveHours({
            timezone: 'UTC',
            start_hour: 0,
            end_hour: 24,
            days: [1, 2, 3],
        }, now);
        expect(result).toBe(false);
    });

    it('handles wrap-around hours (start > end)', () => {
        // Midnight UTC (hour 0), active from 22:00 to 06:00
        const now = new Date('1970-01-01T00:00:00Z');
        const result = isWithinActiveHours({
            timezone: 'UTC',
            start_hour: 22,
            end_hour: 6,
            days: [0, 1, 2, 3, 4, 5, 6],
        }, now);
        // Hour 0 is between 22-6 (after midnight)
        expect(result).toBe(true);
    });

    it('returns false during wrap-around gap', () => {
        // 10:00 UTC on Thursday
        const now = new Date('1970-01-01T10:00:00Z');
        const result = isWithinActiveHours({
            timezone: 'UTC',
            start_hour: 22,
            end_hour: 6,
            days: [0, 1, 2, 3, 4, 5, 6],
        }, now);
        // Hour 10 is NOT between 22-6
        expect(result).toBe(false);
    });

    it('handles afternoon hours correctly', () => {
        const now = new Date('1970-01-01T14:30:00Z');
        const result = isWithinActiveHours({
            timezone: 'UTC',
            start_hour: 8,
            end_hour: 22,
            days: [0, 1, 2, 3, 4, 5, 6],
        }, now);
        expect(result).toBe(true);
    });
});
