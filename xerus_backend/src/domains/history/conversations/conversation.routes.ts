// Conversation Routes
// REST endpoints for conversation CRUD (sidebar, history).
// Mounted under /api/v1/execute/conversations

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../../types';
import { sendResponse } from '../../../utils/response';
import { BadRequestError, UnauthorizedError } from '../../../utils/errors';
import { authenticateFirebaseToken } from '../../../middleware/auth';
import {
    listConversations,
    getConversation,
    createConversation,
    updateConversation,
    deleteConversation,
} from './conversation.service';

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
// Router
// -----------------------------------------------------------------------------

const router = Router();
const auth = authenticateFirebaseToken;

// GET /api/v1/execute/conversations - List conversations (sidebar)
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

        const result = await listConversations(req.user.uid, { limit, offset });
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

        const result = await getConversation(req.user.uid, req.params.id);
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

        if (agent_slug !== undefined && agent_slug !== null) {
            if (typeof agent_slug !== 'string' || !agent_slug.trim()) {
                throw new BadRequestError('agent_slug must be a non-empty string');
            }
        }

        if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
            throw new BadRequestError('title must be a non-empty string');
        }

        const result = await createConversation(
            req.user.uid,
            agent_slug ?? null,
            title?.trim(),
        );
        sendResponse(res, 201, result, startTime);
    } catch (err) {
        next(err);
    }
});

// PATCH /api/v1/execute/conversations/:id - Update conversation (rename)
router.patch('/:id', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new UnauthorizedError();
        validateConversationId(req.params.id);

        const { title } = req.body;
        if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
            throw new BadRequestError('title must be a non-empty string');
        }

        const result = await updateConversation(req.user.uid, req.params.id, {
            title: title?.trim(),
        });
        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/v1/execute/conversations/:id - Delete conversation
router.delete('/:id', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new UnauthorizedError();
        validateConversationId(req.params.id);

        await deleteConversation(req.user.uid, req.params.id);
        sendResponse(res, 200, { deleted: true }, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
