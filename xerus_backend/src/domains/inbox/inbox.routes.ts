// Inbox Routes
// REST API endpoints for inbox item management and SSE streaming

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { sseAuth, createSseTokenHandler } from '../../middleware/sse-auth';
import { query } from '../../database/connection';
import { InMemoryInboxSSEBroadcaster } from './inbox-sse.broadcaster';

const router = Router();
const auth = authenticateFirebaseToken;

export const inboxSSEBroadcaster = new InMemoryInboxSSEBroadcaster();

// POST /api/v1/inbox/sse-token - Issue a short-lived, single-use token for inbox SSE auth
router.post('/sse-token', auth, createSseTokenHandler());

// GET /api/v1/inbox/sse - SSE stream for real-time inbox updates
// IMPORTANT: Must be registered before /:itemId to avoid Express matching "sse" as a param
// Uses sseAuth (short-lived token from POST /sse-token) instead of raw JWT in URL
router.get('/sse', sseAuth, (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.uid;
    if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    inboxSSEBroadcaster.addClient(userId, res);

    req.on('close', () => {
        inboxSSEBroadcaster.removeClient(userId, res);
    });
});

// GET /api/v1/inbox - List inbox items for authenticated user
router.get('/', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const status = req.query.status as string | undefined;
        const channelId = req.query.channel_id as string | undefined;
        const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
        const offset = parseInt(req.query.offset as string, 10) || 0;

        const conditions: string[] = ['user_id = $1', 'is_archived = false'];
        const params: unknown[] = [userId];
        let paramIndex = 2;

        if (status) {
            conditions.push(`status = $${paramIndex}`);
            params.push(status);
            paramIndex++;
        }

        if (channelId) {
            conditions.push(`channel_id = $${paramIndex}`);
            params.push(channelId);
            paramIndex++;
        }

        const whereClause = conditions.join(' AND ');
        params.push(limit, offset);

        const result = await query(
            `SELECT * FROM inbox_items
             WHERE ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            params
        );

        sendResponse(res, 200, result.rows, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/inbox/:itemId - Get single inbox item
router.get('/:itemId', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const { itemId } = req.params;
        const result = await query(
            `SELECT * FROM inbox_items WHERE item_id = $1 AND user_id = $2`,
            [itemId, userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Inbox item not found' } });
            return;
        }

        sendResponse(res, 200, result.rows[0], startTime);
    } catch (err) {
        next(err);
    }
});

// PATCH /api/v1/inbox/:itemId/read - Mark item as read
router.patch('/:itemId/read', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const { itemId } = req.params;
        const result = await query(
            `UPDATE inbox_items SET is_read = true, updated_at = NOW()
             WHERE item_id = $1 AND user_id = $2
             RETURNING *`,
            [itemId, userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Inbox item not found' } });
            return;
        }

        sendResponse(res, 200, result.rows[0], startTime);
    } catch (err) {
        next(err);
    }
});

// PATCH /api/v1/inbox/:itemId/archive - Archive item
router.patch('/:itemId/archive', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const { itemId } = req.params;
        const result = await query(
            `UPDATE inbox_items SET is_archived = true, status = 'archived', updated_at = NOW()
             WHERE item_id = $1 AND user_id = $2
             RETURNING *`,
            [itemId, userId]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Inbox item not found' } });
            return;
        }

        sendResponse(res, 200, result.rows[0], startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
