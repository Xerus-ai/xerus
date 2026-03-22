// Digest Dispatcher
// Thin orchestrator that wires DailyDigest formatting to activity collection
// and heartbeat dispatch. Produces dispatch-ready prompts for the Xerus agent.
//
// Flow: collect activity -> check skip -> format prompt -> return result
// Caller (job/scheduler) handles actual dispatch to agent and execution recording.

import type {
    DigestVariant,
    DigestActivityData,
    DailyDigestConfig,
    DigestResult,
    ActivityDataCollector,
} from './daily-digest.types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Subset of DailyDigestService methods needed by the dispatcher.
 * Keeps coupling minimal — dispatcher doesn't need recordDigestExecution.
 */
export interface DigestFormatter {
    hasActivity(activityData: DigestActivityData): boolean;
    buildHeartbeatPrompt(variant: DigestVariant, activityData: DigestActivityData, timezone: string): string;
    generateDigest(variant: DigestVariant, config: DailyDigestConfig, activityData: DigestActivityData): DigestResult;
}

export interface DigestDispatcherDeps {
    formatter: DigestFormatter;
    activityCollector: ActivityDataCollector;
}

export interface DigestDispatchResult {
    variant: DigestVariant;
    skipped: boolean;
    skip_reason: string | null;
    prompt: string | null;
    digest: DigestResult;
    activity_data: DigestActivityData;
}

// -----------------------------------------------------------------------------
// Lookback Window
// -----------------------------------------------------------------------------

/**
 * Calculate the lookback window start time for activity collection.
 *
 * - standup: Last 24 hours (yesterday's activity)
 * - report: Since midnight today (today's activity)
 */
export function calculateLookbackWindow(variant: DigestVariant, now: Date = new Date()): Date {
    if (variant === 'standup') {
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    // Report: midnight today
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    return today;
}

// -----------------------------------------------------------------------------
// Digest Dispatcher
// -----------------------------------------------------------------------------

/**
 * Orchestrates digest preparation: collects activity, formats prompt, returns
 * dispatch-ready result. Does NOT handle dispatch or execution recording — that's
 * the caller's responsibility (separation of concerns).
 *
 * Usage:
 *   const dispatcher = new DigestDispatcher({ formatter: digestService, activityCollector });
 *   const result = await dispatcher.prepareDigest('standup', config);
 *   if (!result.skipped) {
 *       await dispatch(result.prompt, config.xerus_agent_id);
 *       await digestService.recordDigestExecution({ ... });
 *   }
 */
export class DigestDispatcher {
    private readonly deps: DigestDispatcherDeps;

    constructor(deps: DigestDispatcherDeps) {
        this.deps = deps;
    }

    /**
     * Prepare a digest for dispatch. Returns the prompt and metadata.
     * Fail-fast: throws if activity collection or formatting fails.
     */
    async prepareDigest(variant: DigestVariant, config: DailyDigestConfig): Promise<DigestDispatchResult> {
        const since = calculateLookbackWindow(variant);
        const activityData = await this.deps.activityCollector.collectForUser(config.user_id, since);

        const digest = this.deps.formatter.generateDigest(variant, config, activityData);

        if (digest.skipped) {
            return {
                variant,
                skipped: true,
                skip_reason: digest.skip_reason,
                prompt: null,
                digest,
                activity_data: activityData,
            };
        }

        const prompt = this.deps.formatter.buildHeartbeatPrompt(variant, activityData, config.timezone);

        return {
            variant,
            skipped: false,
            skip_reason: null,
            prompt,
            digest,
            activity_data: activityData,
        };
    }
}
