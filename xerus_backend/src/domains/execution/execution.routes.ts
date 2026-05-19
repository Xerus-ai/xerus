// Execution API Routes
// REST endpoints for agent execution lifecycle:
// - GET    /execute/conversations              -> List conversations (workspace.db)
// - GET    /execute/conversations/:id          -> Get conversation with messages
// - POST   /execute/conversations              -> Create conversation
// - PATCH  /execute/conversations/:id          -> Update conversation title
// - DELETE /execute/conversations/:id          -> Delete conversation (soft)
// - GET    /execute/conversations/:id/stream   -> Long-lived SSE stream per conversation
// - POST   /execute/conversations/:id/messages -> Submit message (returns 202)
// - POST   /execute/:id/respond                -> HITL response
// - POST   /execute/:id/cancel                 -> Cancel execution
// - GET    /execute/:id/status                 -> Get execution status
// - GET    /execute/schedules                  -> List schedules (workspace.db)
// - POST   /execute/schedules                  -> Create schedule
// - PATCH  /execute/schedules/:id              -> Update schedule
// - DELETE /execute/schedules/:id              -> Delete schedule
// - GET    /execute/schedules/runs             -> List schedule runs (workspace.db)

import { Router, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';
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
    validateMessageBody,
    validateRespondBody,
    validateCancelBody,
} from './execution.validators';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';
import { requireRunningSandbox, getDaytonaProvider } from '../sandbox-infra/sandbox/sandbox-route-helpers';
import agentFilesRouter from './agent-files.routes';
import conversationRouter from '../conversations/conversation.routes';
import scheduleFrontendRouter, { setScheduleFrontendRoutesDeps } from './schedule.routes';
import { getConversation } from '../conversations/workspace-db.service';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const log = logger('ExecutionRoutes');
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

export interface ExecutionRoutesDeps {
    sandboxService: SandboxService;
}

let deps: ExecutionRoutesDeps | null = null;

export function setExecutionRoutesDeps(d: ExecutionRoutesDeps): void {
    deps = d;
    // Also initialize schedule frontend routes with the same sandbox service
    setScheduleFrontendRoutesDeps({ sandboxService: d.sandboxService });
}

function getDeps(): ExecutionRoutesDeps {
    if (!deps) {
        throw new Error('ExecutionRoutes dependencies not initialized');
    }
    return deps;
}

// -----------------------------------------------------------------------------
// Router
// -----------------------------------------------------------------------------

const router = Router();
const auth = authenticateFirebaseToken;

// Mount agent file API sub-routes
router.use('/agents', agentFilesRouter);

// Mount conversation CRUD routes (workspace.db queries)
// MUST be before /conversations/:id/stream to ensure proper route matching
router.use('/conversations', conversationRouter);

// Mount schedule CRUD + run history routes (workspace.db queries)
router.use('/schedules', scheduleFrontendRouter);

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

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
        const provider = getDaytonaProvider(sandboxService);

        // Enforce per-user stream limit
        if (sseRegistry.countForUser(req.user.uid) >= MAX_STREAMS_PER_USER) {
            throw new BadRequestError(`Too many active streams (max ${MAX_STREAMS_PER_USER})`);
        }

        const conversation = await getConversation(provider, sandboxId, conversationId);
        if (!conversation) {
            throw new NotFoundError('Conversation');
        }

        // Create long-lived SSE stream and register it
        const stream = new StreamingResponse(res);
        sseRegistry.register(req.user.uid, conversationId, stream);

        log.info('SSE stream opened', { user_id: req.user.uid, conversation_id: conversationId });

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
            log.info('SSE stream closed', { user_id: req.user!.uid, conversation_id: conversationId, open_seconds: Math.round((Date.now() - (res.locals.startTime || Date.now())) / 1000) });
            clearInterval(heartbeatInterval);
            const current = sseRegistry.get(req.user!.uid, conversationId);
            if (current === stream) {
                sseRegistry.unregister(req.user!.uid, conversationId);
            }
        });

        // Log if the underlying socket errors or closes unexpectedly
        req.socket.once('error', (err) => {
            log.error('SSE socket error', { conversation_id: conversationId, error: err.message });
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

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
        const provider = getDaytonaProvider(sandboxService);

        const conversation = await getConversation(provider, sandboxId, conversationId);
        if (!conversation) {
            throw new NotFoundError('Conversation');
        }

        const agentSlug = conversation.agent_slug;
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
            log.error('Background execution failed', { error: (err as Error).message });
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
