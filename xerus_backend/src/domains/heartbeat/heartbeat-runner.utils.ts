// Heartbeat Runner Utility Functions
// Extracted from heartbeat-runner.service.ts for file size compliance

import type { HeartbeatTriggerType, HeartbeatRunResult } from './types';

/**
 * Build a standard skip result for heartbeat pre-flight checks.
 */
export function buildSkipResult(
    agentId: number,
    triggerType: HeartbeatTriggerType,
    runId: string,
    reason: string,
): HeartbeatRunResult {
    return {
        agent_id: agentId,
        trigger_type: triggerType,
        run_id: runId,
        skipped: true,
        skip_reason: reason,
    };
}

/**
 * Check whether the current time falls on a weekday in the given timezone.
 */
export function isWeekday(timezone: string): boolean {
    const day = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(new Date());
    return day !== 'Sat' && day !== 'Sun';
}
