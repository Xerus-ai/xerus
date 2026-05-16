// Event Routing Resilience
//
// Wraps routeEventToBackend so a single bad runner event cannot kill the
// entire execution session. Fatal pipeline-invariant errors still propagate;
// other handler exceptions are logged, counted, and degraded into a
// 'notification' stream event. After MAX_CONSECUTIVE_HANDLER_ERRORS in a row
// the latest error is re-thrown (the runner is producing nothing but bad
// events — there is nothing to recover).

import { logger } from '../../utils/logger';
import { PipelineInvariantError } from './errors';
import { routeEventToBackend } from './runner-event-router';
import type { PipelineContext, ResolvedExecutionDeps } from './execution-pipeline.types';

const log = logger('EventResilience');

/** Maximum consecutive non-fatal handler failures before escalating to fatal. */
export const MAX_CONSECUTIVE_HANDLER_ERRORS = 5;

/** Mutable state for routeEventWithResilience across iterations of the event loop. */
export interface ResilienceState {
    consecutiveErrors: number;
}

export function createResilienceState(): ResilienceState {
    return { consecutiveErrors: 0 };
}

export async function routeEventWithResilience(
    eventType: string,
    raw: Record<string, unknown>,
    ctx: PipelineContext,
    deps: ResolvedExecutionDeps,
    state: ResilienceState,
): Promise<void> {
    try {
        await routeEventToBackend(eventType, raw, ctx, deps);
        state.consecutiveErrors = 0;
    } catch (err) {
        if (err instanceof PipelineInvariantError) {
            throw err;
        }
        state.consecutiveErrors++;
        log.error('Event routing failed (non-fatal)', {
            event_type: eventType,
            error: (err as Error).message,
            consecutive_errors: state.consecutiveErrors,
        });
        if (state.consecutiveErrors >= MAX_CONSECUTIVE_HANDLER_ERRORS) {
            throw err;
        }
        if (!ctx.stream.isClosed()) {
            ctx.stream.send('notification', {
                priority: 'error',
                message: 'A processing error occurred but your agent is still running.',
            });
        }
    }
}
