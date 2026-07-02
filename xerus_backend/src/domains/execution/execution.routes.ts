// Execution API Routes
// REST endpoints for agent execution lifecycle:
// - GET    /execute/conversations              -> List conversations (workspace.db)
// - GET    /execute/conversations/:id          -> Get conversation with messages
// - POST   /execute/conversations              -> Create conversation
// - PATCH  /execute/conversations/:id          -> Update conversation title
// - DELETE /execute/conversations/:id          -> Delete conversation (soft)
// - GET    /execute/conversations/:id/stream   -> Long-lived SSE stream per conversation
// - POST   /execute/conversations/:id/messages -> Submit message (returns 202)
// - GET    /execute/schedules                  -> List schedules (workspace.db)
// - POST   /execute/schedules                  -> Create schedule
// - PATCH  /execute/schedules/:id              -> Update schedule
// - DELETE /execute/schedules/:id              -> Delete schedule
// - GET    /execute/schedules/runs             -> List schedule runs (workspace.db)
//
// Neon-backed session lifecycle routes (/sessions, /:id/respond, /:id/cancel,
// /:id/status) live in execution-lifecycle.routes.ts and are mounted below,
// after the conversation/stream routes to preserve route-matching precedence.

import { Router, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';
import rateLimit from 'express-rate-limit';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { BadRequestError, UnauthorizedError, NotFoundError, RateLimitError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { sseAuth, createSseTokenHandler } from '../../middleware/sse-auth';
import { StreamingResponse } from './streaming/stream.handler';
import { sseRegistry } from './streaming/sse-registry';
import { validateUUID, validateMessageBody } from './execution.validators';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';
import { requireRunningSandbox, getDaytonaProvider } from '../sandbox-infra/sandbox/sandbox-route-helpers';
import agentFilesRouter from './agent-files.routes';
import conversationRouter from '../conversations/conversation.routes';
import scheduleFrontendRouter, { setScheduleFrontendRoutesDeps } from './schedule.routes';
import { getConversation } from '../conversations/workspace-db.service';
import executionLifecycleRouter from './execution-lifecycle.routes';
import { getExecutionService, setExecutionService } from './execution-service.registry';

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

        // Allow per-message agent override: if agent_slug is in the request body, use it
        // instead of the conversation's default agent. This enables the frontend agent
        // dropdown to route individual messages to a different agent.
        const agentSlug = (typeof req.body.agent_slug === 'string' && req.body.agent_slug.trim())
            ? req.body.agent_slug.trim()
            : conversation.agent_slug;
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

// Mount Neon-backed session lifecycle routes (/sessions, /:id/respond,
// /:id/cancel, /:id/status). Registered last so the specific routes above
// (e.g. /conversations/:id/stream, /sse-token) keep matching precedence.
router.use('/', executionLifecycleRouter);

// -----------------------------------------------------------------------------
// Re-exports (backward compatibility)
// -----------------------------------------------------------------------------

// Callers (index.ts, jobs/digest-scheduler.ts, internal-mcp/channel-task.routes.ts)
// import these from execution.routes; the implementations live in the shared
// execution-service.registry module.
export { getExecutionService, setExecutionService };

export default router;
