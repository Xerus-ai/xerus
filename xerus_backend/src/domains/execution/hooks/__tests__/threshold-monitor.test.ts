// Context Threshold Monitor Tests

import {
    ThresholdMonitor,
    ThresholdLevel,
    ThresholdConfig,
    ContextThresholdExceededError,
    DEFAULT_THRESHOLD_CONFIG,
    createThresholdMonitor,
} from '../threshold-monitor';

describe('ThresholdMonitor', () => {
    let monitor: ThresholdMonitor;

    beforeEach(() => {
        monitor = new ThresholdMonitor();
    });

    describe('constructor', () => {
        it('should use default thresholds when none provided', () => {
            const config = monitor.getConfig();

            expect(config.thresholds).toHaveLength(5);
            expect(config.repeat_mode).toBe('once_per_tier_reset_on_compaction');
        });

        it('should accept custom thresholds', () => {
            const customConfig: ThresholdConfig = {
                thresholds: [
                    { percent: 50, level: 'warn', message: 'Half full' },
                    { percent: 90, level: 'critical', message: 'Almost full' },
                ],
                repeat_mode: 'once_per_tier',
            };

            const customMonitor = new ThresholdMonitor(customConfig);
            const config = customMonitor.getConfig();

            expect(config.thresholds).toHaveLength(2);
            expect(config.thresholds[0].percent).toBe(50);
            expect(config.repeat_mode).toBe('once_per_tier');
        });

        it('should sort thresholds by percent ascending', () => {
            const customConfig: ThresholdConfig = {
                thresholds: [
                    { percent: 90, level: 'critical', message: 'Critical' },
                    { percent: 60, level: 'warn', message: 'Warning' },
                    { percent: 75, level: 'prepare', message: 'Prepare' },
                ],
                repeat_mode: 'once_per_tier',
            };

            const customMonitor = new ThresholdMonitor(customConfig);
            const config = customMonitor.getConfig();

            expect(config.thresholds[0].percent).toBe(60);
            expect(config.thresholds[1].percent).toBe(75);
            expect(config.thresholds[2].percent).toBe(90);
        });
    });

    describe('checkThreshold', () => {
        it('should return null when below all thresholds', () => {
            const result = monitor.checkThreshold(50);

            expect(result).toBeNull();
        });

        it('should return result when crossing 60% monitor threshold', () => {
            const result = monitor.checkThreshold(60);

            expect(result).not.toBeNull();
            expect(result!.level).toBe('monitor');
            expect(result!.percent).toBe(60);
            expect(result!.should_emit_sse).toBe(true);
            expect(result!.additional_context).toBeUndefined();
        });

        it('should return result with message when crossing 75% prepare threshold', () => {
            const result = monitor.checkThreshold(75);

            expect(result).not.toBeNull();
            expect(result!.level).toBe('prepare');
            expect(result!.additional_context).toContain('.memory/agents/{you}/working.md');
        });

        it('should return result with message when crossing 85% compact threshold', () => {
            const result = monitor.checkThreshold(85);

            expect(result).not.toBeNull();
            expect(result!.level).toBe('compact');
            expect(result!.additional_context).toContain('/compact');
        });

        it('should return result with message when crossing 92% critical threshold', () => {
            const result = monitor.checkThreshold(92);

            expect(result).not.toBeNull();
            expect(result!.level).toBe('critical');
            expect(result!.additional_context).toContain('Stop new work');
        });

        it('should throw ContextThresholdExceededError at 95% fail threshold', () => {
            expect(() => monitor.checkThreshold(95)).toThrow(ContextThresholdExceededError);
            expect(() => monitor.checkThreshold(95)).toThrow('Context at 95% - refusing to send to LLM');
        });

        it('should throw ContextThresholdExceededError above 95%', () => {
            expect(() => monitor.checkThreshold(99)).toThrow(ContextThresholdExceededError);
        });

        it('should substitute percentage placeholder in message', () => {
            const customConfig: ThresholdConfig = {
                thresholds: [
                    {
                        percent: 70,
                        level: 'test',
                        message: 'Context at {percentage}%, {remaining}% remaining',
                    },
                ],
                repeat_mode: 'once_per_tier',
            };

            const customMonitor = new ThresholdMonitor(customConfig);
            const result = customMonitor.checkThreshold(72);

            expect(result).not.toBeNull();
            expect(result!.additional_context).toBe('Context at 72%, 28% remaining');
        });

        it('should return highest crossed threshold', () => {
            // First check at 60% returns monitor level
            const result1 = monitor.checkThreshold(60);
            expect(result1!.level).toBe('monitor');

            // Reset to test fresh
            const freshMonitor = new ThresholdMonitor();

            // Jump directly to 92% - should return critical (highest crossed)
            const result2 = freshMonitor.checkThreshold(92);
            expect(result2!.level).toBe('critical');
        });
    });

    describe('repeat_mode: once_per_tier_reset_on_compaction (default)', () => {
        it('should fire each tier only once', () => {
            // First hit at 60%
            const result1 = monitor.checkThreshold(60);
            expect(result1!.level).toBe('monitor');

            // Second check at same level - should not fire again
            const result2 = monitor.checkThreshold(62);
            expect(result2).toBeNull();

            // Cross next threshold
            const result3 = monitor.checkThreshold(75);
            expect(result3!.level).toBe('prepare');

            // Check same level again - should not fire
            const result4 = monitor.checkThreshold(78);
            expect(result4).toBeNull();
        });

        it('should reset fired tiers on compaction', () => {
            // Fire the 60% threshold
            const result1 = monitor.checkThreshold(60);
            expect(result1!.level).toBe('monitor');

            // Should not fire again
            const result2 = monitor.checkThreshold(62);
            expect(result2).toBeNull();

            // Reset on compaction
            monitor.resetOnCompaction();

            // Should fire again
            const result3 = monitor.checkThreshold(60);
            expect(result3!.level).toBe('monitor');
        });
    });

    describe('repeat_mode: once_per_tier', () => {
        it('should fire each tier only once and NOT reset on compaction', () => {
            const config: ThresholdConfig = {
                thresholds: DEFAULT_THRESHOLD_CONFIG.thresholds,
                repeat_mode: 'once_per_tier',
            };
            const onceMonitor = new ThresholdMonitor(config);

            // Fire the 60% threshold
            const result1 = onceMonitor.checkThreshold(60);
            expect(result1!.level).toBe('monitor');

            // Reset on compaction - should NOT reset in this mode
            onceMonitor.resetOnCompaction();

            // Should NOT fire again
            const result2 = onceMonitor.checkThreshold(60);
            expect(result2).toBeNull();
        });
    });

    describe('repeat_mode: every_turn', () => {
        it('should fire on every check when threshold is crossed', () => {
            const config: ThresholdConfig = {
                thresholds: DEFAULT_THRESHOLD_CONFIG.thresholds,
                repeat_mode: 'every_turn',
            };
            const everyTurnMonitor = new ThresholdMonitor(config);

            // Fire the 60% threshold
            const result1 = everyTurnMonitor.checkThreshold(60);
            expect(result1!.level).toBe('monitor');

            // Should fire again
            const result2 = everyTurnMonitor.checkThreshold(62);
            expect(result2!.level).toBe('monitor');

            // And again
            const result3 = everyTurnMonitor.checkThreshold(65);
            expect(result3!.level).toBe('monitor');
        });

        it('should return highest applicable tier on every turn', () => {
            const config: ThresholdConfig = {
                thresholds: DEFAULT_THRESHOLD_CONFIG.thresholds,
                repeat_mode: 'every_turn',
            };
            const everyTurnMonitor = new ThresholdMonitor(config);

            // At 85% - should return compact
            const result1 = everyTurnMonitor.checkThreshold(85);
            expect(result1!.level).toBe('compact');

            // At 60% - should return monitor (not compact)
            const result2 = everyTurnMonitor.checkThreshold(60);
            expect(result2!.level).toBe('monitor');

            // Back at 85% - should return compact
            const result3 = everyTurnMonitor.checkThreshold(86);
            expect(result3!.level).toBe('compact');
        });
    });

    describe('getFiredTiers', () => {
        it('should return empty set initially', () => {
            const firedTiers = monitor.getFiredTiers();
            expect(firedTiers.size).toBe(0);
        });

        it('should track fired tiers', () => {
            monitor.checkThreshold(60);
            monitor.checkThreshold(75);

            const firedTiers = monitor.getFiredTiers();

            expect(firedTiers.has('monitor')).toBe(true);
            expect(firedTiers.has('prepare')).toBe(true);
            expect(firedTiers.has('compact')).toBe(false);
        });

        it('should return a copy to prevent external modification', () => {
            monitor.checkThreshold(60);

            const firedTiers1 = monitor.getFiredTiers();
            const firedTiers2 = monitor.getFiredTiers();

            expect(firedTiers1).not.toBe(firedTiers2);
            expect(firedTiers1).toEqual(firedTiers2);
        });
    });

    describe('resetOnCompaction', () => {
        it('should clear all fired tiers in default mode', () => {
            monitor.checkThreshold(60);
            monitor.checkThreshold(75);

            expect(monitor.getFiredTiers().size).toBe(2);

            monitor.resetOnCompaction();

            expect(monitor.getFiredTiers().size).toBe(0);
        });

        it('should not clear fired tiers in once_per_tier mode', () => {
            const config: ThresholdConfig = {
                thresholds: DEFAULT_THRESHOLD_CONFIG.thresholds,
                repeat_mode: 'once_per_tier',
            };
            const onceMonitor = new ThresholdMonitor(config);

            onceMonitor.checkThreshold(60);
            onceMonitor.checkThreshold(75);

            expect(onceMonitor.getFiredTiers().size).toBe(2);

            onceMonitor.resetOnCompaction();

            expect(onceMonitor.getFiredTiers().size).toBe(2);
        });
    });

    describe('createSSEEvent', () => {
        it('should create context_warning SSE event', () => {
            const result = monitor.checkThreshold(75);
            const event = monitor.createSSEEvent('exec-123', result!, 96000, 128000);

            expect(event.type).toBe('context_warning');
            expect(event.execution_id).toBe('exec-123');
            expect(event.success).toBe(true);

            const content = event.content as {
                warningType: string;
                currentUsage: number;
                maxBudget: number;
                percentUsed: number;
            };
            expect(content.warningType).toBe('approaching_limit');
            expect(content.currentUsage).toBe(96000);
            expect(content.maxBudget).toBe(128000);
            expect(content.percentUsed).toBe(75);
        });

        it('should set warningType to at_limit for critical level', () => {
            const result = monitor.checkThreshold(92);
            const event = monitor.createSSEEvent('exec-123', result!, 117760, 128000);

            const content = event.content as { warningType: string };
            expect(content.warningType).toBe('at_limit');
        });

        it('should include recommendation in meta', () => {
            const result = monitor.checkThreshold(85);
            const event = monitor.createSSEEvent('exec-123', result!, 108800, 128000);

            const meta = event.meta as { level: string; recommendation: string };
            expect(meta.level).toBe('compact');
            expect(meta.recommendation).toContain('/compact');
        });
    });
});

describe('ContextThresholdExceededError', () => {
    it('should have correct properties', () => {
        const error = new ContextThresholdExceededError(95);

        expect(error.name).toBe('ContextThresholdExceededError');
        expect(error.usagePercent).toBe(95);
        expect(error.message).toBe('Context at 95% - refusing to send to LLM');
        expect(error.statusCode).toBe(413);
        expect(error.code).toBe('CONTEXT_THRESHOLD_EXCEEDED');
    });

    it('should include usage percent in message', () => {
        const error = new ContextThresholdExceededError(98);

        expect(error.message).toBe('Context at 98% - refusing to send to LLM');
        expect(error.usagePercent).toBe(98);
    });
});

describe('DEFAULT_THRESHOLD_CONFIG', () => {
    it('should have 5 thresholds', () => {
        expect(DEFAULT_THRESHOLD_CONFIG.thresholds).toHaveLength(5);
    });

    it('should have correct levels', () => {
        const levels = DEFAULT_THRESHOLD_CONFIG.thresholds.map((t) => t.level);
        expect(levels).toEqual(['monitor', 'prepare', 'compact', 'critical', 'fail']);
    });

    it('should have correct percentages', () => {
        const percents = DEFAULT_THRESHOLD_CONFIG.thresholds.map((t) => t.percent);
        expect(percents).toEqual([60, 75, 85, 92, 95]);
    });

    it('should have messages for action tiers (not monitor)', () => {
        const actionTiers = DEFAULT_THRESHOLD_CONFIG.thresholds.filter((t) => t.level !== 'monitor');
        for (const tier of actionTiers) {
            expect(tier.message).toBeDefined();
            expect(tier.message!.length).toBeGreaterThan(0);
        }
    });

    it('should have default repeat_mode of once_per_tier_reset_on_compaction', () => {
        expect(DEFAULT_THRESHOLD_CONFIG.repeat_mode).toBe('once_per_tier_reset_on_compaction');
    });
});

describe('createThresholdMonitor factory', () => {
    it('should create monitor with default config', () => {
        const monitor = createThresholdMonitor();
        const config = monitor.getConfig();

        expect(config.thresholds).toHaveLength(5);
        expect(config.repeat_mode).toBe('once_per_tier_reset_on_compaction');
    });

    it('should create monitor with custom config', () => {
        const monitor = createThresholdMonitor({
            thresholds: [{ percent: 80, level: 'warn', message: 'High usage' }],
            repeat_mode: 'every_turn',
        });
        const config = monitor.getConfig();

        expect(config.thresholds).toHaveLength(1);
        expect(config.repeat_mode).toBe('every_turn');
    });

    it('should merge partial config with defaults', () => {
        const monitor = createThresholdMonitor({
            repeat_mode: 'once_per_tier',
        });
        const config = monitor.getConfig();

        // Uses default thresholds but custom repeat_mode
        expect(config.thresholds).toHaveLength(5);
        expect(config.repeat_mode).toBe('once_per_tier');
    });
});

describe('ThresholdLevel type', () => {
    it('should define standard levels', () => {
        // Type checking - these should compile
        const levels: ThresholdLevel[] = ['monitor', 'prepare', 'compact', 'critical', 'fail'];
        expect(levels).toHaveLength(5);
    });

    it('should allow custom string levels', () => {
        // Custom levels should also work
        const customLevel: ThresholdLevel = 'custom_warning';
        expect(typeof customLevel).toBe('string');
    });
});

describe('Integration scenarios', () => {
    it('should handle typical session flow', () => {
        const monitor = new ThresholdMonitor();

        // Session starts at low usage
        expect(monitor.checkThreshold(30)).toBeNull();
        expect(monitor.checkThreshold(45)).toBeNull();

        // Usage grows, crosses monitor threshold
        const r1 = monitor.checkThreshold(60);
        expect(r1!.level).toBe('monitor');

        // Continue working
        expect(monitor.checkThreshold(65)).toBeNull();
        expect(monitor.checkThreshold(70)).toBeNull();

        // Cross prepare threshold
        const r2 = monitor.checkThreshold(75);
        expect(r2!.level).toBe('prepare');

        // Continue working
        expect(monitor.checkThreshold(80)).toBeNull();

        // Cross compact threshold
        const r3 = monitor.checkThreshold(85);
        expect(r3!.level).toBe('compact');

        // User triggers compaction, usage drops
        monitor.resetOnCompaction();

        // After compaction, usage is lower but crosses thresholds again
        const r4 = monitor.checkThreshold(62);
        expect(r4!.level).toBe('monitor');

        const r5 = monitor.checkThreshold(76);
        expect(r5!.level).toBe('prepare');
    });

    it('should handle rapid context growth', () => {
        const monitor = new ThresholdMonitor();

        // Usage jumps straight to critical - should get critical, not earlier tiers
        const result = monitor.checkThreshold(93);
        expect(result!.level).toBe('critical');

        // Check that all tiers up to critical are marked as fired
        const firedTiers = monitor.getFiredTiers();
        expect(firedTiers.has('monitor')).toBe(true);
        expect(firedTiers.has('prepare')).toBe(true);
        expect(firedTiers.has('compact')).toBe(true);
        expect(firedTiers.has('critical')).toBe(true);
        expect(firedTiers.has('fail')).toBe(false);
    });

    it('should hard fail at 95% to protect LLM call', () => {
        const monitor = new ThresholdMonitor();

        // Safe at 94%
        const result = monitor.checkThreshold(94);
        expect(result!.level).toBe('critical');

        // Hard fail at 95% - this is the guardrail
        expect(() => monitor.checkThreshold(95)).toThrow(ContextThresholdExceededError);
    });
});
