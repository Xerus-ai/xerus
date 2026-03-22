// Context Threshold Monitor
// Monitors context usage and injects steering messages at graduated thresholds
// Inspired by cc-context-awareness pattern

import { DomainError } from '../../../utils/errors';
import { StreamEvent, ContextWarningEventContent } from '../types';
import { createContextWarningEvent } from '../streaming/stream.events';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type ThresholdLevel = 'monitor' | 'prepare' | 'compact' | 'critical' | 'fail' | string;

type RepeatMode = 'once_per_tier_reset_on_compaction' | 'once_per_tier' | 'every_turn';

export interface ThresholdEntry {
    percent: number;
    level: ThresholdLevel;
    message?: string;
}

export interface ThresholdConfig {
    thresholds: ThresholdEntry[];
    repeat_mode: RepeatMode;
}

export interface ThresholdResult {
    level: ThresholdLevel;
    percent: number;
    message?: string;
    additional_context?: string;
    should_emit_sse: boolean;
}

// -----------------------------------------------------------------------------
// Error Class
// -----------------------------------------------------------------------------

export class ContextThresholdExceededError extends DomainError {
    public readonly usagePercent: number;

    constructor(usagePercent: number) {
        super(`Context at ${usagePercent}% - refusing to send to LLM`, 413, 'CONTEXT_THRESHOLD_EXCEEDED');
        this.name = 'ContextThresholdExceededError';
        this.usagePercent = usagePercent;
    }
}

// -----------------------------------------------------------------------------
// Default Configuration
// -----------------------------------------------------------------------------

export const DEFAULT_THRESHOLD_CONFIG: ThresholdConfig = {
    thresholds: [
        {
            percent: 60,
            level: 'monitor',
            // No message - just log warning and emit SSE
        },
        {
            percent: 75,
            level: 'prepare',
            message: 'Save progress to .memory/agents/{you}/working.md now.',
        },
        {
            percent: 85,
            level: 'compact',
            message: 'Wrap up current subtask, save state to .memory/agents/{you}/working.md, suggest /compact to user.',
        },
        {
            percent: 92,
            level: 'critical',
            message: 'Stop new work. Save everything to .memory/agents/{you}/working.md. Compact immediately.',
        },
        {
            percent: 95,
            level: 'fail',
            message: 'Context limit exceeded.',
        },
    ],
    repeat_mode: 'once_per_tier_reset_on_compaction',
};

// -----------------------------------------------------------------------------
// Threshold Monitor
// -----------------------------------------------------------------------------

export class ThresholdMonitor {
    private readonly config: ThresholdConfig;
    private firedTiers: Set<ThresholdLevel> = new Set();

    constructor(config?: Partial<ThresholdConfig>) {
        this.config = {
            thresholds: config?.thresholds
                ? [...config.thresholds].sort((a, b) => a.percent - b.percent)
                : [...DEFAULT_THRESHOLD_CONFIG.thresholds],
            repeat_mode: config?.repeat_mode ?? DEFAULT_THRESHOLD_CONFIG.repeat_mode,
        };
    }

    /**
     * Check if any threshold has been crossed and return appropriate result.
     * @param usedPercent Current context usage as a percentage (0-100)
     * @returns ThresholdResult if threshold crossed, null otherwise
     * @throws ContextThresholdExceededError at 95% (fail threshold)
     */
    checkThreshold(usedPercent: number): ThresholdResult | null {
        // Find all crossed thresholds
        const crossedThresholds = this.config.thresholds.filter((t) => usedPercent >= t.percent);

        if (crossedThresholds.length === 0) {
            return null;
        }

        // Get the highest crossed threshold
        const highestCrossed = crossedThresholds[crossedThresholds.length - 1];

        // Check for fail threshold - hard fail, throw error
        if (highestCrossed.level === 'fail') {
            throw new ContextThresholdExceededError(usedPercent);
        }

        // For 'every_turn' mode, always fire
        if (this.config.repeat_mode === 'every_turn') {
            // Mark all crossed tiers as fired for tracking
            for (const threshold of crossedThresholds) {
                this.firedTiers.add(threshold.level);
            }

            // Find the highest applicable tier for this usage level
            const applicableThreshold = this.findHighestApplicable(usedPercent);
            if (!applicableThreshold) {
                return null;
            }

            return this.buildResult(applicableThreshold, usedPercent);
        }

        // For 'once_per_tier' and 'once_per_tier_reset_on_compaction' modes
        // Find the highest unfired threshold that has been crossed
        const unfiredCrossed = crossedThresholds.filter((t) => !this.firedTiers.has(t.level));

        if (unfiredCrossed.length === 0) {
            return null;
        }

        // Mark all crossed thresholds as fired (including ones below current)
        for (const threshold of crossedThresholds) {
            this.firedTiers.add(threshold.level);
        }

        // Return the highest newly crossed threshold
        const highestUnfired = unfiredCrossed[unfiredCrossed.length - 1];
        return this.buildResult(highestUnfired, usedPercent);
    }

    /**
     * Find the highest threshold that applies to the current usage.
     */
    private findHighestApplicable(usedPercent: number): ThresholdEntry | null {
        const applicable = this.config.thresholds.filter(
            (t) => usedPercent >= t.percent && t.level !== 'fail'
        );

        if (applicable.length === 0) {
            return null;
        }

        return applicable[applicable.length - 1];
    }

    /**
     * Build a ThresholdResult from a threshold entry.
     */
    private buildResult(threshold: ThresholdEntry, usedPercent: number): ThresholdResult {
        const remaining = 100 - usedPercent;
        const additionalContext = threshold.message
            ? threshold.message
                  .replace('{percentage}', String(usedPercent))
                  .replace('{remaining}', String(remaining))
            : undefined;

        return {
            level: threshold.level,
            percent: threshold.percent,
            message: threshold.message,
            additional_context: additionalContext,
            should_emit_sse: true,
        };
    }

    /**
     * Reset fired tiers on compaction.
     * Only clears if repeat_mode is 'once_per_tier_reset_on_compaction'.
     */
    resetOnCompaction(): void {
        if (this.config.repeat_mode === 'once_per_tier_reset_on_compaction') {
            this.firedTiers.clear();
        }
    }

    /**
     * Get a copy of the currently fired tier levels.
     */
    getFiredTiers(): Set<ThresholdLevel> {
        return new Set(this.firedTiers);
    }

    /**
     * Get the current configuration.
     */
    getConfig(): ThresholdConfig {
        return {
            thresholds: [...this.config.thresholds],
            repeat_mode: this.config.repeat_mode,
        };
    }

    /**
     * Create an SSE event for context warning.
     */
    createSSEEvent(
        executionId: string,
        result: ThresholdResult,
        tokensUsed: number,
        tokensMax: number
    ): StreamEvent {
        const warningType = this.getWarningType(result.level);

        const content: ContextWarningEventContent = {
            warningType,
            currentUsage: tokensUsed,
            maxBudget: tokensMax,
            percentUsed: result.percent,
        };

        const meta = {
            level: result.level,
            recommendation: result.additional_context ?? result.message ?? 'Monitor context usage',
        };

        return createContextWarningEvent(executionId, content, meta);
    }

    /**
     * Map threshold level to warning type.
     */
    private getWarningType(level: ThresholdLevel): ContextWarningEventContent['warningType'] {
        switch (level) {
            case 'critical':
            case 'fail':
                return 'at_limit';
            default:
                return 'approaching_limit';
        }
    }
}

// -----------------------------------------------------------------------------
// Factory Functions
// -----------------------------------------------------------------------------

/**
 * Create a threshold monitor with optional custom config.
 * Partial config is merged with defaults.
 */
export function createThresholdMonitor(config?: Partial<ThresholdConfig>): ThresholdMonitor {
    return new ThresholdMonitor(config);
}
