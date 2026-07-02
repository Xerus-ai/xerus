// Heartbeat Daemon — SUPERSEDED by wake-daemon.ts + in-sandbox 9to5 scheduler.
//
// Previously: polled each running sandbox's workspace.db schedules table and
// fired agent executions directly from the backend. Replaced because:
// 1. O(N) per-sandbox polling doesn't scale
// 2. Dual schedulers (backend + in-sandbox) caused double-fire risk
// 3. In-sandbox 9to5 now fires through POST /internal/v1/schedules/fire
//    which gets full identity resolution, events, channel writes, SSE, billing
//
// Kept as a thin shim exporting start/stop so index.ts doesn't need changes
// beyond the wake-daemon addition. The actual wake-for-sleeping-sandboxes
// logic is in wake-daemon.ts.

import { logger } from '../../../utils/logger';

const log = logger('HeartbeatDaemon');

export interface HeartbeatDaemonDeps {
    sandboxService: unknown;
    executionService: unknown;
    intervalMs?: number;
}

export function startHeartbeatDaemon(_deps: HeartbeatDaemonDeps): void {
    log.info('HeartbeatDaemon superseded by wake-daemon + in-sandbox 9to5 scheduler — no-op');
}

export function stopHeartbeatDaemon(): void {
    // no-op
}

