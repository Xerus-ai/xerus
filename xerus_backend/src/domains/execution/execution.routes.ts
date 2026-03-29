// Execution API Routes
// REST endpoints for agent execution lifecycle:
// - GET  /execute/conversations/:id/stream   -> Long-lived SSE stream per conversation
// - POST /execute/conversations/:id/messages  -> Submit message (returns 202)
// - POST /execute/:id/respond                -> HITL response
// - POST /execute/:id/cancel                 -> Cancel execution
// - GET  /execute/:id/status                 -> Get execution status

import { Router, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { BadRequestError, UnauthorizedError, NotFoundError, RateLimitError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { sseAuth, createSseTokenHandler } from '../../middleware/sse-auth';
import { query } from '../../database/connection';
import { ExecutionService } from './execution.service';
import { StreamingResponse } from './streaming/stream.handler';
import { sseRegistry } from './streaming/sse-registry';
import { getSessionControlService } from './platform/tools/session-control.tools';
import {
    serializeExecutionStatus,
    serializeHITLAcknowledgment,
    serializeCancellationResult,
} from './streaming/response.contract';
import {
    validateUUID,
    validateMessageBody,
    validateRespondBody,
    validateCancelBody,
} from './execution.validators';
import agentFilesRouter from './agent-files.routes';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_STREAMS_PER_USER = 10;

// -----------------------------------------------------------------------------
// Rate Limiter (per-user, keyed by Firebase UID)
// -----------------------------------------------------------------------------

const executionRateLimit = rateLimit({
    windowMs: 60_000,
    max: 10,
    keyGenerator: (req: AuthenticatedRequest) => req.user?.uid ?? 'anonymous',
    standardHeaders: true,
    legacyHeaders: false,
    handler: () => {
        throw new RateLimitError();
    },
    validate: { xForwardedForHeader: false },
});

// -----------------------------------------------------------------------------
// Router
// -----------------------------------------------------------------------------

const router = Router();
const auth = authenticateFirebaseToken;

// Mount agent file API sub-routes
router.use('/agents', agentFilesRouter);

// POST /api/v1/execute/sse-token - Issue a short-lived, single-use token for SSE auth
router.post('/sse-token', auth, createSseTokenHandler());

// GET /api/v1/execute/conversations/:id/stream - Long-lived SSE stream per conversation
router.get('/conversations/:id/stream', sseAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) {
            throw new UnauthorizedError();
        }

        const conversationId = req.params.id;
        validateUUID(conversationId, 'conversation id');

        // Enforce per-user stream limit
        if (sseRegistry.countForUser(req.user.uid) >= MAX_STREAMS_PER_USER) {
            throw new BadRequestError(`Too many active streams (max ${MAX_STREAMS_PER_USER})`);
        }

        // Verify conversation belongs to this user
        const result = await query<{ id: string; agent_slug: string | null }>(
            `SELECT id, agent_slug FROM conversations WHERE id = $1 AND user_id = $2`,
            [conversationId, req.user.uid],
        );
        if (result.rows.length === 0) {
            throw new NotFoundError('Conversation');
        }

        // Create long-lived SSE stream and register it
        const stream = new StreamingResponse(res);
        sseRegistry.register(req.user.uid, conversationId, stream);

        console.log(`[SSE] Stream opened for user=${req.user.uid} conv=${conversationId}`);

        // Send initial meta event so frontend knows connection is live
        stream.send('meta', { conversationId });

        // Heartbeat every 30s to keep connection alive through proxies
        const heartbeatInterval = setInterval(() => {
            if (stream.isClosed()) {
                clearInterval(heartbeatInterval);
                return;
            }
            stream.sendHeartbeat();
        }, HEARTBEAT_INTERVAL_MS);

        // Cleanup on client disconnect — only unregister if this stream is still
        // the active one. A newer connectStream call may have replaced it in the
        // registry; blindly unregistering would delete the replacement stream.
        res.on('close', () => {
            console.log(`[SSE] Stream closed for user=${req.user!.uid} conv=${conversationId} (was open ${Math.round((Date.now() - (res.locals.startTime || Date.now())) / 1000)}s)`);
            clearInterval(heartbeatInterval);
            const current = sseRegistry.get(req.user!.uid, conversationId);
            if (current === stream) {
                sseRegistry.unregister(req.user!.uid, conversationId);
            }
        });

        // Log if the underlying socket errors or closes unexpectedly
        req.socket.once('error', (err) => {
            console.error(`[SSE] Socket error for conv=${conversationId}:`, err.message);
        });

        // Do NOT call next() or end the response — stream stays open
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/execute/conversations/:id/messages - Submit a message to an active stream
router.post('/conversations/:id/messages', auth, executionRateLimit, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new UnauthorizedError();
        }

        const conversationId = req.params.id;
        validateUUID(conversationId, 'conversation id');
        const validated = validateMessageBody(req.body);

        // Look up conversation to get agent_id (ownership verified by user_id WHERE clause)
        const convResult = await query<{ id: string; agent_slug: string | null }>(
            `SELECT id, agent_slug FROM conversations WHERE id = $1 AND user_id = $2`,
            [conversationId, req.user.uid],
        );
        if (convResult.rows.length === 0) {
            throw new NotFoundError('Conversation');
        }

        const agentSlug = convResult.rows[0].agent_slug;
        if (!agentSlug) {
            throw new BadRequestError('Conversation has no associated agent');
        }

        // Look up active SSE stream for this user+conversation
        const stream = sseRegistry.get(req.user.uid, conversationId);
        if (!stream) {
            throw new BadRequestError('No active stream for this conversation. Connect via GET /conversations/:id/stream first.');
        }

        const executionService = getExecutionService();

        // Return 202 immediately — execution runs in background on the SSE stream
        sendResponse(res, 202, {
            execution_id: null,
            conversation_id: conversationId,
        }, startTime);

        // Fire-and-forget: start execution in background
        executionService.startExecution({
            request: {
                agentSlug,
                task: validated.task,
                userId: req.user.uid,
                coordinationMode: validated.coordination_mode,
                context: validated.context,
                conversationId,
            },
            stream,
            triggerType: 'user_message',
        }).catch(err => {
            console.error('[ExecutionRoutes] Background execution failed:', (err as Error).message);
            if (!stream.isClosed()) {
                stream.sendError(new Error('Execution failed to start'));
            }
        });
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

        const resumeResult = await sessionControl.resumeExecution(req.user.uid, {
            sessionId: req.params.id,
            approved: validated.accepted,
            feedback: validated.response_value,
        });

        // Validate that the client-supplied guidance_id matches the actual pause
        if (validated.guidance_id && validated.guidance_id !== resumeResult.pauseId) {
            throw new BadRequestError(
                `guidance_id mismatch: expected ${resumeResult.pauseId}, got ${validated.guidance_id}`,
            );
        }

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
                    es.input_tokens, es.output_tokens, es.credits_used, es.message_metadata
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

        // Derive tool call count from message_metadata JSONB (no dedicated column exists)
        const toolCalls = Array.isArray(row.message_metadata?.tool_calls)
            ? row.message_metadata.tool_calls.length
            : 0;

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
                toolCalls,
                agentsUsed: 1,
            } : undefined,
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
}

// -----------------------------------------------------------------------------
// Lazy Service Access
// -----------------------------------------------------------------------------

let executionServiceInstance: ExecutionService | null = null;

function getExecutionService(): ExecutionService {
    if (!executionServiceInstance) {
        throw new Error('ExecutionService not initialized. Call setExecutionService() at startup.');
    }
    return executionServiceInstance;
}

export function setExecutionService(service: ExecutionService): void {
    executionServiceInstance = service;
}

export default router;
