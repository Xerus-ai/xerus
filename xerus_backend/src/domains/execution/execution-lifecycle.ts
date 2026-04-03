// Execution Lifecycle Helpers
// Extracted from execution.service.ts — error handling and cleanup logic.

import { logger } from '../../utils/logger';
import type { ResolvedExecutionDeps, PipelineContext, ExecutionServiceDeps } from './execution-pipeline.types';
import { DomainError } from '../../utils/errors';
import { getConversation, deleteConversation } from '../conversations/workspace-db.service';

const log = logger('ExecutionLifecycle');

/**
 * Handle execution failure: update DB session/conversation, send error to stream.
 * Errors during cleanup are caught and logged to avoid masking the original error.
 */
export async function handleExecutionError(
    deps: ExecutionServiceDeps,
    ctx: PipelineContext,
    error: unknown,
): Promise<void> {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error('Execution failed', { execution_id: ctx.executionId, error: err.message });

    if (ctx.sessionId) {
        try {
            await deps.db.query(
                `UPDATE execution_sessions SET status = 'failed', agent_response = $2, completed_at = NOW() WHERE id = $1`,
                [ctx.sessionId, ctx.responseText || null],
            );
        } catch (dbErr) {
            // Cleanup errors are intentionally caught and logged, not re-thrown.
            // Re-throwing here would mask the original execution error.
            log.error('Failed to update session', { session_id: ctx.sessionId, error: (dbErr as Error).message });
        }
    } else if (ctx.conversationId && ctx.conversationId !== ctx.request.conversationId) {
        // Conversation was created by this execution but session record was never inserted.
        // Delete the orphan to avoid ghost conversations in the sidebar.
        try {
            if (ctx.sandboxId && deps.sandboxService) {
                const provider = (deps as ResolvedExecutionDeps).sandboxService.getDaytonaProvider();
                const conv = await getConversation(provider, ctx.sandboxId, ctx.conversationId);
                if (conv && conv.message_count === 0) {
                    await deleteConversation(provider, ctx.sandboxId, ctx.conversationId);
                }
            }
        } catch (dbErr) {
            log.error('Failed to clean up orphaned conversation', { conversation_id: ctx.conversationId, error: (dbErr as Error).message });
        }
    }

    if (!ctx.stream.isClosed()) {
        // Sanitize: only expose error details for known DomainError types.
        // Unknown errors get a generic message to prevent leaking internals.
        const sanitizedError = err instanceof DomainError
            ? err
            : new Error('An internal error occurred');
        ctx.stream.sendError(sanitizedError, {
            requestId: ctx.executionId,
            traceId: ctx.executionId,
            responseTimeMs: Date.now() - ctx.startedAt,
        });
    }
}

/**
 * Post-execution cleanup: release lane, decrement sandbox count, reset credit tracker.
 * Stream is NOT closed — it belongs to the conversation, not the execution.
 */
export function cleanupExecution(resolved: ResolvedExecutionDeps, ctx: PipelineContext): void {
    // Runner persists between executions. Don't send 'done'.
    // Runner is killed when sandbox pauses/stops (scheduler handles this).

    // Unregister stream from HITL emitter
    if (ctx.sessionId && resolved.activeStreamEmitter) {
        resolved.activeStreamEmitter.unregister(ctx.sessionId);
    }

    if (ctx.laneId) {
        try {
            resolved.queueService.release(ctx.laneId);
        } catch (releaseErr) {
            // Cleanup errors are intentionally caught and logged, not re-thrown.
            // Re-throwing here would mask the original execution error.
            log.error('Failed to release lane', { lane_id: ctx.laneId, error: (releaseErr as Error).message });
        }
    }

    if (ctx.sandboxId) {
        resolved.sandboxService.decrementExecutionCount(ctx.request.userId);
    }

    resolved.creditTracker.resetContext();

    if (ctx.announceQueue) {
        ctx.announceQueue.dispose();
    }

    // Stream belongs to the conversation (long-lived SSE), NOT this execution.
    // Do NOT close it here — the GET /stream route manages stream lifecycle.
}
