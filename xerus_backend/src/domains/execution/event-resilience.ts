// Event Routing Resilience
//
// Wraps routeEventToBackend so a single bad runner event cannot kill the entire
// execution session — WITHOUT ever swallowing an error silently.
//
// Fatal errors always propagate (fail-fast). They bubble up to the pipeline's
// error handler, which marks the execution failed and emits the terminal SSE
// error (done, success: false) the frontend renders as a failed run:
//   - PipelineInvariantError — a missing required dep/state; the pipeline is broken.
//   - Programmer errors — a bug in our own code or SQL (TypeError/ReferenceError,
//     undefined table/column/function, malformed query). Recovering would only
//     hide the defect.
//
// Transient external errors (DB temporarily unavailable, network blip) are the
// only errors that may be caught. They are logged with structure, counted, and
// surfaced to the user as a visible 'notification' (the agent is still running).
// After MAX_CONSECUTIVE_HANDLER_ERRORS transient failures in a row the latest
// error is re-thrown — the runner is producing nothing usable, so escalate to
// fatal instead of looping.

import { logger } from '../../utils/logger';
import { PipelineInvariantError } from './errors';
import { routeEventToBackend } from './runner-event-router';
import type { PipelineContext, ResolvedExecutionDeps } from './execution-pipeline.types';

const log = logger('EventResilience');

/** Maximum consecutive transient handler failures before escalating to fatal. */
export const MAX_CONSECUTIVE_HANDLER_ERRORS = 5;

// PostgreSQL SQLSTATE class 42 = "Syntax Error or Access Rule Violation":
// undefined_table (42P01), undefined_column (42703), undefined_function (42883),
// syntax_error (42601), etc. These are query/schema bugs, never transient.
const PROGRAMMER_ERROR_SQLSTATE_CLASS = '42';

// JS runtime errors that only occur from a code defect (calling/accessing an
// undefined function or value, referencing an undefined name).
const PROGRAMMER_ERROR_NAMES: ReadonlySet<string> = new Set(['TypeError', 'ReferenceError']);

/** Mutable state for routeEventWithResilience across iterations of the event loop. */
export interface ResilienceState {
    consecutiveErrors: number;
}

export function createResilienceState(): ResilienceState {
    return { consecutiveErrors: 0 };
}

/**
 * Distinguish a programmer error (a bug — fail fast) from a transient external
 * error (a DB/network blip — degrade and keep running). Programmer errors are
 * defects in our own code or SQL: a missing table/column/function, a malformed
 * query, or a JS type/reference violation. They must never be swallowed.
 */
function isProgrammerError(err: unknown): boolean {
    if (!(err instanceof Error)) {
        return false;
    }
    if (PROGRAMMER_ERROR_NAMES.has(err.name)) {
        return true;
    }
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' && code.startsWith(PROGRAMMER_ERROR_SQLSTATE_CLASS);
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
        const error = err as Error;
        const errorCode = (err as { code?: unknown }).code ?? null;

        // Fail-fast: pipeline invariants and programmer errors surface immediately
        // so the execution is marked failed. Never degraded, never swallowed.
        if (err instanceof PipelineInvariantError || isProgrammerError(err)) {
            log.error('Event routing failed (fatal)', {
                event_type: eventType,
                error: error.message,
                error_name: error.name,
                error_code: errorCode,
                fatal: true,
            });
            throw err;
        }

        state.consecutiveErrors++;
        log.error('Event routing failed (transient)', {
            event_type: eventType,
            error: error.message,
            error_code: errorCode,
            consecutive_errors: state.consecutiveErrors,
            fatal: false,
        });

        // Too many transient failures in a row — the runner is producing nothing
        // usable. Escalate to fatal so the execution fails instead of looping.
        if (state.consecutiveErrors >= MAX_CONSECUTIVE_HANDLER_ERRORS) {
            throw err;
        }

        // Surface the degraded error to the user. The agent is still running, so
        // this is a non-terminal 'notification' (priority 'error'), NOT a 'done'
        // error — visible, never silent.
        if (!ctx.stream.isClosed()) {
            ctx.stream.send('notification', {
                priority: 'error',
                message: 'A processing error occurred but your agent is still running.',
            });
        }
    }
}
