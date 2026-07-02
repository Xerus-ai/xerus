// Execution Lifecycle Routes
// Neon-backed execution session endpoints:
// - GET    /execute/sessions        -> List execution sessions (Neon PostgreSQL)
// - POST   /execute/:id/respond     -> HITL response
// - POST   /execute/:id/cancel      -> Cancel execution
// - GET    /execute/:id/status      -> Get execution status
//
// Extracted from execution.routes.ts to keep files under 400 lines.
// Mounted at '/' by execution.routes.ts AFTER the conversation/stream routes,
// so earlier specific routes keep their matching precedence.

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { BadRequestError, UnauthorizedError, NotFoundError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { query } from '../../database/connection';
import { getSessionControlService } from '../platform-tools/platform/tools/session-control.tools';
import {
    serializeExecutionStatus,
    serializeHITLAcknowledgment,
    serializeCancellationResult,
} from './streaming/response.contract';
import { buildExecutionTimeline } from './execution-timeline';
import type { ToolCallDetail } from './execution-pipeline.types';
import {
    validateUUID,
    validateRespondBody,
    validateCancelBody,
} from './execution.validators';
import { getExecutionService } from './execution-service.registry';

const router = Router();
const auth = authenticateFirebaseToken;

// GET /api/v1/execute/sessions - List execution sessions (Neon PostgreSQL)
// Supports ?agent_slug=... &limit=... &offset=...
router.get('/sessions', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new UnauthorizedError();

        const agentSlug = req.query.agent_slug as string | undefined;
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
        const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

        if (isNaN(limit) || limit < 1) {
            throw new BadRequestError('limit must be a positive integer');
        }
        if (isNaN(offset) || offset < 0) {
            throw new BadRequestError('offset must be a non-negative integer');
        }

        // limit and offset are validated integers above, so safe to interpolate.
        // Binding them as parameters causes "could not determine data type" on
        // Neon/Postgres because LIMIT/OFFSET positions don't give pg enough
        // context to infer the type.
        const params: unknown[] = [req.user.uid];
        let agentFilter = '';
        if (agentSlug) {
            agentFilter = 'AND es.agent_slug = $2';
            params.push(agentSlug);
        }

        const result = await query<SessionListRow>(
            `SELECT es.id, es.agent_slug, es.status, es.trigger_type,
                    es.user_prompt, es.input_tokens, es.output_tokens,
                    es.credits_used, es.started_at, es.completed_at, es.created_at
             FROM execution_sessions es
             JOIN workspaces w ON es.workspace_id = w.id
             WHERE w.user_id = $1 ${agentFilter}
             ORDER BY es.created_at DESC
             LIMIT ${limit} OFFSET ${offset}`,
            params,
        );

        const countResult = await query<{ count: string }>(
            `SELECT COUNT(*) as count
             FROM execution_sessions es
             JOIN workspaces w ON es.workspace_id = w.id
             WHERE w.user_id = $1 ${agentFilter}`,
            params,
        );

        const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

        sendResponse(res, 200, { sessions: result.rows, total }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/execute/:id/respond - HITL response
router.post('/:id/respond', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new UnauthorizedError();
        }

        validateUUID(req.params.id, 'execution id');
        const validated = validateRespondBody(req.body);

        const sessionControl = getSessionControlService();

        // Validate guidance_id BEFORE resuming to avoid accidentally resolving the wrong pause
        if (validated.guidance_id) {
            const state = await sessionControl.getSessionState(req.user.uid, { sessionId: req.params.id });
            const activePauseId = state.pendingApproval?.pauseId;
            if (activePauseId && activePauseId !== validated.guidance_id) {
                throw new BadRequestError(
                    `guidance_id mismatch: expected ${activePauseId}, got ${validated.guidance_id}`,
                );
            }
        }

        const resumeResult = await sessionControl.resumeExecution(req.user.uid, {
            sessionId: req.params.id,
            approved: validated.accepted,
            feedback: validated.response_value,
        });

        // Forward HITL response to the runner process via stdin
        const executionService = getExecutionService();
        const sent = await executionService.respondToHitl(
            req.params.id,
            resumeResult.pauseId,
            validated.accepted,
            validated.response_value,
        );
        if (!sent) {
            throw new NotFoundError('Active execution not found; runner may have restarted');
        }

        const response = serializeHITLAcknowledgment({
            executionId: req.params.id,
            guidanceId: validated.guidance_id,
            accepted: validated.accepted,
            responseValue: validated.response_value,
        });

        sendResponse(res, 200, response, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/execute/:id/cancel - Cancel execution
router.post('/:id/cancel', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new UnauthorizedError();
        }

        validateUUID(req.params.id, 'execution id');
        const validated = validateCancelBody(req.body);

        // Verify ownership before allowing cancellation
        const ownershipCheck = await query(
            `SELECT es.id FROM execution_sessions es
             JOIN workspaces w ON es.workspace_id = w.id
             WHERE es.id = $1::uuid AND w.user_id = $2`,
            [req.params.id, req.user.uid],
        );
        if (ownershipCheck.rows.length === 0) {
            throw new NotFoundError('Execution session');
        }

        const executionService = getExecutionService();
        const cancelled = executionService.cancelExecution(req.params.id);

        if (cancelled) {
            await query(
                `UPDATE execution_sessions SET status = 'cancelled', completed_at = NOW()
                 WHERE id = $1::uuid`,
                [req.params.id],
            );
        }

        const response = serializeCancellationResult({
            executionId: req.params.id,
            cancelled,
            method: validated.method,
            reason: validated.reason,
        });

        sendResponse(res, 200, response, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/execute/:id/status - Get execution status
router.get('/:id/status', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new UnauthorizedError();
        }

        validateUUID(req.params.id, 'execution id');

        const result = await query<StatusRow>(
            `SELECT es.id, es.status, es.agent_slug, es.started_at, es.completed_at,
                    es.input_tokens, es.output_tokens, es.credits_used, es.message_metadata, es.key_source
             FROM execution_sessions es
             JOIN workspaces w ON es.workspace_id = w.id
             WHERE es.id = $1::uuid AND w.user_id = $2`,
            [req.params.id, req.user.uid],
        );

        if (result.rows.length === 0) {
            throw new NotFoundError('Execution session');
        }

        const row = result.rows[0];

        if (!row.started_at && row.status !== 'pending') {
            throw new Error(`Data integrity: execution ${row.id} has status '${row.status}' but null started_at`);
        }

        // Tool calls are persisted in message_metadata JSONB (no dedicated column).
        // Build a step-level timeline for the "View work" panel; the summary's
        // toolCalls count is derived from the same array.
        const rawToolCalls: ToolCallDetail[] = Array.isArray(row.message_metadata?.tool_calls)
            ? (row.message_metadata.tool_calls as ToolCallDetail[])
            : [];
        const timeline = buildExecutionTimeline(rawToolCalls);

        const response = serializeExecutionStatus({
            executionId: row.id,
            status: row.status as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
            agentSlug: row.agent_slug,
            startedAt: row.started_at ? row.started_at.toISOString() : new Date().toISOString(),
            completedAt: row.completed_at?.toISOString(),
            summary: row.status === 'completed' ? {
                totalTokens: (row.input_tokens ?? 0) + (row.output_tokens ?? 0),
                durationMs: row.completed_at && row.started_at
                    ? new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()
                    : 0,
                toolCalls: rawToolCalls.length,
                agentsUsed: 1,
                billingType: row.key_source ?? undefined,
            } : undefined,
            steps: timeline.steps,
            filesChanged: timeline.files_changed,
        });

        sendResponse(res, 200, response, startTime);
    } catch (err) {
        next(err);
    }
});

// -----------------------------------------------------------------------------
// DB Row Types
// -----------------------------------------------------------------------------

interface StatusRow {
    id: string;
    status: string;
    agent_slug: string;
    started_at: Date | null;
    completed_at: Date | null;
    input_tokens: number | null;
    output_tokens: number | null;
    credits_used: string | null;
    message_metadata: { tool_calls?: unknown[] } | null;
    key_source: 'byok' | 'platform' | null;
}

interface SessionListRow {
    id: string;
    agent_slug: string;
    status: string;
    trigger_type: string | null;
    user_prompt: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    credits_used: string | null;
    started_at: Date | null;
    completed_at: Date | null;
    created_at: Date;
}

export default router;
