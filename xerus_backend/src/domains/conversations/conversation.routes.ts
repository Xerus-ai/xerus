// Conversation Routes
// REST endpoints for conversation CRUD (queries workspace.db on sandbox)
// Mounted under /api/v1/execute/conversations

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { BadRequestError, UnauthorizedError, NotFoundError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';
import { requireRunningSandbox, getDaytonaProvider } from '../sandbox-infra/sandbox/sandbox-route-helpers';
import {
    listConversations,
    getConversationWithMessages,
    createConversation,
    updateConversation,
    deleteConversation,
} from './workspace-db.service';

// -----------------------------------------------------------------------------
// Validators
// -----------------------------------------------------------------------------

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateConversationId(id: string): void {
    if (!id || !UUID_REGEX.test(id)) {
        throw new BadRequestError('conversation id must be a valid UUID');
    }
}

// -----------------------------------------------------------------------------
// Dependency Injection
// -----------------------------------------------------------------------------

export interface ConversationRoutesDeps {
    sandboxService: SandboxService;
}

let deps: ConversationRoutesDeps | null = null;

export function setConversationRoutesDeps(d: ConversationRoutesDeps): void {
    deps = d;
}

function getDeps(): ConversationRoutesDeps {
    if (!deps) {
        throw new Error('ConversationRoutes dependencies not initialized');
    }
    return deps;
}

// -----------------------------------------------------------------------------
// Router
// -----------------------------------------------------------------------------

const router = Router();
const auth = authenticateFirebaseToken;

// GET /api/v1/execute/conversations - List conversations
router.get('/', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new UnauthorizedError();

        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

        if (limit !== undefined && (isNaN(limit) || limit < 1)) {
            throw new BadRequestError('limit must be a positive integer');
        }
        if (offset !== undefined && (isNaN(offset) || offset < 0)) {
            throw new BadRequestError('offset must be a non-negative integer');
        }

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
        const provider = getDaytonaProvider(sandboxService);

        const result = await listConversations(provider, sandboxId, { limit, offset });
        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/execute/conversations/:id - Get conversation with messages
router.get('/:id', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new UnauthorizedError();
        validateConversationId(req.params.id);

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
        const provider = getDaytonaProvider(sandboxService);

        const result = await getConversationWithMessages(provider, sandboxId, req.params.id);
        if (!result) {
            throw new NotFoundError('Conversation');
        }
        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/execute/conversations - Create conversation
router.post('/', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new UnauthorizedError();

        const { agent_slug, title } = req.body;

        if (!agent_slug || typeof agent_slug !== 'string' || !agent_slug.trim()) {
            throw new BadRequestError('agent_slug is required');
        }

        if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
            throw new BadRequestError('title must be a non-empty string');
        }

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
        const provider = getDaytonaProvider(sandboxService);

        const result = await createConversation(provider, sandboxId, agent_slug.trim(), title?.trim());
        sendResponse(res, 201, result, startTime);
    } catch (err) {
        next(err);
    }
});

// PATCH /api/v1/execute/conversations/:id - Update conversation (title)
router.patch('/:id', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new UnauthorizedError();
        validateConversationId(req.params.id);

        const { title } = req.body;

        if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
            throw new BadRequestError('title must be a non-empty string');
        }

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
        const provider = getDaytonaProvider(sandboxService);

        const result = await updateConversation(provider, sandboxId, req.params.id, { title: title?.trim() });
        if (!result) {
            throw new NotFoundError('Conversation');
        }
        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/v1/execute/conversations/:id - Delete conversation (soft delete)
router.delete('/:id', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new UnauthorizedError();
        validateConversationId(req.params.id);

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
        const provider = getDaytonaProvider(sandboxService);

        await deleteConversation(provider, sandboxId, req.params.id);
        sendResponse(res, 204, null, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
