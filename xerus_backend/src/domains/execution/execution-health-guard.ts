// Execution Health Guard
// Monitors runner activity during processEventStream and aborts if the runner
// becomes unresponsive mid-execution. Complements the first-event timeout in
// execution-pipeline.ts which only covers the initial connection phase.
//
// Design: periodic interval checks time since last event. If stale beyond
// ACTIVITY_TIMEOUT_MS, sends a health probe via sendCommand. If the probe
// gets no response within PROBE_RESPONSE_TIMEOUT_MS, aborts the stream via
// AbortController so the pipeline error path handles cleanup.

import { sendCommand } from '../sandbox-infra/sandbox';
import type { SessionHandle } from '../sandbox-infra/sandbox/providers/daytona-runner';

const LOG_PREFIX = '[HealthGuard]';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

/** How long without any event before we consider the runner potentially stale. */
const ACTIVITY_TIMEOUT_MS = 60_000;

/** How often to check for activity staleness. */
const CHECK_INTERVAL_MS = 15_000;

/** How long to wait for a health probe response before declaring the runner dead. */
const PROBE_RESPONSE_TIMEOUT_MS = 10_000;

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
 * Create a health guard that monitors runner liveness during event streaming.
 *
 * The guard starts a periodic interval. On each tick it checks whether any
 * events have been received within ACTIVITY_TIMEOUT_MS. If not, it sends a
 * health probe to the runner. If the runner does not produce any event within
 * PROBE_RESPONSE_TIMEOUT_MS after the probe, the guard aborts its signal.
 *
 * The caller must:
 * 1. Call `recordActivity()` on every received event
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
                console.error(
                    `${LOG_PREFIX} [${executionId.slice(0, 8)}] Runner unresponsive: no events for ${msSinceActivity}ms, `
                    + `health probe sent ${msSinceProbe}ms ago with no response — aborting stream`,
                );
                ac.abort();
                return;
            }
            // Probe still pending, wait for next tick
            return;
        }

        // If activity is recent, nothing to do
        if (msSinceActivity < ACTIVITY_TIMEOUT_MS) return;

        // Activity is stale — send a health probe
        console.warn(
            `${LOG_PREFIX} [${executionId.slice(0, 8)}] No events for ${msSinceActivity}ms — sending health probe`,
        );
        probeSentAt = Date.now();

        try {
            await sendCommand(handle, { type: 'health' });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(
                `${LOG_PREFIX} [${executionId.slice(0, 8)}] Health probe send failed: ${msg} — aborting stream`,
            );
            ac.abort();
        }
    }

    const intervalId = setInterval(() => {
        tick().catch((err: unknown) => {
            console.error(
                `${LOG_PREFIX} [${executionId.slice(0, 8)}] Unexpected error in health check tick: ${(err as Error).message}`,
            );
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
