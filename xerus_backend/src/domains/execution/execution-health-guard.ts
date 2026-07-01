// Execution Health Guard
// Monitors runner activity during processEventStream and aborts if the runner
// becomes unresponsive mid-execution. Complements the first-event timeout in
// execution-pipeline.ts which only covers the initial connection phase.
//
// Design: periodic interval checks time since last event. If stale beyond
// ACTIVITY_TIMEOUT_MS, sends a health probe via sendCommand. If the probe
// gets no response within PROBE_RESPONSE_TIMEOUT_MS, aborts the stream via
// AbortController so the pipeline error path handles cleanup.

import { logger } from '../../utils/logger';
import { sendCommand } from '../sandbox-infra/sandbox';
import type { SessionHandle } from '../sandbox-infra/sandbox/providers/daytona-runner';

const log = logger('HealthGuard');

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

/** How long without any agent-specific event before we consider the execution stale. */
const ACTIVITY_TIMEOUT_MS = 90_000;

/** How often to check for activity staleness. */
const CHECK_INTERVAL_MS = 15_000;

/** How long to wait for a genuine agent event after sending a health probe.
 *  Must be > CHECK_INTERVAL_MS so the check has at least one tick to evaluate.
 *  If no agent-specific event arrives within this window, the runner is declared
 *  unresponsive and the stream is aborted. */
const PROBE_RESPONSE_TIMEOUT_MS = 20_000;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface HealthGuard {
    /** Record that an event was received (resets the activity timer). */
    recordActivity(): void;
    /** Stop the guard. Must be called on both success and error paths. */
    stop(): void;
    /** AbortSignal that fires when the runner is detected as dead. */
    readonly signal: AbortSignal;
}

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

/**
 * Create a health guard that monitors agent-level activity during event streaming.
 *
 * The guard starts a periodic interval. On each tick it checks whether any
 * agent-specific events have been received within ACTIVITY_TIMEOUT_MS. Transport
 * events (health probe responses, system events) do NOT reset the timer — only
 * events from the expected agent count as activity. If the agent is silent beyond
 * the threshold, a health probe is sent to verify the runner is alive. If no
 * genuine agent event arrives within PROBE_RESPONSE_TIMEOUT_MS, the guard aborts.
 *
 * The caller must:
 * 1. Call `recordActivity()` only on agent-specific events (not transport/health)
 * 2. Include `guard.signal` in the combined AbortSignal for streamEvents
 * 3. Call `guard.stop()` in the finally block
 */
export function createHealthGuard(
    handle: SessionHandle,
    executionId: string,
): HealthGuard {
    const ac = new AbortController();
    let lastActivityAt = Date.now();
    let probeSentAt: number | null = null;
    let stopped = false;

    function recordActivity(): void {
        lastActivityAt = Date.now();
        // If a probe was pending and we got activity, the runner is alive
        probeSentAt = null;
    }

    async function tick(): Promise<void> {
        if (stopped || ac.signal.aborted) return;

        const msSinceActivity = Date.now() - lastActivityAt;

        // If a probe is pending, check whether it timed out
        if (probeSentAt !== null) {
            const msSinceProbe = Date.now() - probeSentAt;
            if (msSinceProbe >= PROBE_RESPONSE_TIMEOUT_MS) {
                log.error('Runner unresponsive, aborting stream', { execution_id: executionId, ms_since_activity: msSinceActivity, ms_since_probe: msSinceProbe });
                ac.abort();
                return;
            }
            // Probe still pending, wait for next tick
            return;
        }

        // If activity is recent, nothing to do
        if (msSinceActivity < ACTIVITY_TIMEOUT_MS) return;

        // Activity is stale — send a health probe
        log.warn('No events received, sending health probe', { execution_id: executionId, ms_since_activity: msSinceActivity });
        probeSentAt = Date.now();

        try {
            await sendCommand(handle, { type: 'health' });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log.error('Health probe send failed, aborting stream', { execution_id: executionId, error: msg });
            ac.abort();
        }
    }

    const intervalId = setInterval(() => {
        tick().catch((err: unknown) => {
            log.error('Unexpected error in health check tick', { execution_id: executionId, error: (err as Error).message });
        });
    }, CHECK_INTERVAL_MS);

    function stop(): void {
        if (stopped) return;
        stopped = true;
        clearInterval(intervalId);
    }

    return {
        recordActivity,
        stop,
        get signal() {
            return ac.signal;
        },
    };
}
