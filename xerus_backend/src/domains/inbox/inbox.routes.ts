// Inbox Routes
// REST API endpoints for inbox item management and SSE streaming
// Queries workspace.db (SQLite) on sandbox via provider.executeCommand()

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { BadRequestError, UnauthorizedError, NotFoundError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { sseAuth, createSseTokenHandler } from '../../middleware/sse-auth';
import { InMemoryInboxSSEBroadcaster } from './inbox-sse.broadcaster';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';
import { requireRunningSandbox, getDaytonaProvider } from '../sandbox-infra/sandbox/sandbox-route-helpers';
import {
    listInboxItems,
    getInboxItem,
    markInboxItemRead,
    archiveInboxItem,
} from './inbox-workspace-db.service';
import type { InboxItemRow } from './inbox-workspace-db.service';

// -----------------------------------------------------------------------------
// Dependency Injection
// -----------------------------------------------------------------------------

export interface InboxRoutesDeps {
    sandboxService: SandboxService;
}

let deps: InboxRoutesDeps | null = null;

export function setInboxRoutesDeps(d: InboxRoutesDeps): void {
    deps = d;
}

function getDeps(): InboxRoutesDeps {
    if (!deps) {
        throw new Error('InboxRoutes dependencies not initialized');
    }
    return deps;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Map workspace DB inbox_items row to a frontend-compatible shape.
 * Workspace uses integer id, agent_slug/sender_slug, and workspace-specific status values.
 */
function mapItemToResponse(row: InboxItemRow): Record<string, unknown> {
    let parsedMetadata: Record<string, unknown> | null = null;
    if (row.metadata) {
        try {
            parsedMetadata = JSON.parse(row.metadata) as Record<string, unknown>;
        } catch {
            parsedMetadata = null;
        }
    }

    return {
        id: row.id,
        agent_slug: row.agent_slug,
        sender_slug: row.sender_slug,
        message_type: row.message_type,
        subject: row.subject,
        content: row.content,
        metadata: parsedMetadata,
        priority: row.priority,
        status: row.status,
        received_at: row.received_at,
        read_at: row.read_at,
        actioned_at: row.actioned_at,
    };
}

// -----------------------------------------------------------------------------
// Router
// -----------------------------------------------------------------------------

const router = Router();
const auth = authenticateFirebaseToken;

export const inboxSSEBroadcaster = new InMemoryInboxSSEBroadcaster();

// POST /api/v1/inbox/sse-token - Issue a short-lived, single-use token for inbox SSE auth
router.post('/sse-token', auth, createSseTokenHandler());

// GET /api/v1/inbox/sse - SSE stream for real-time inbox updates
// Must be registered before /:itemId to avoid Express matching "sse" as a param
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

// GET /api/v1/inbox - List inbox items from workspace DB
router.get('/', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new UnauthorizedError();

        const status = req.query.status as string | undefined;
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

        if (limit !== undefined && (isNaN(limit) || limit < 1)) {
            throw new BadRequestError('limit must be a positive integer');
        }
        if (offset !== undefined && (isNaN(offset) || offset < 0)) {
            throw new BadRequestError('offset must be a non-negative integer');
        }

        const validStatuses = ['unread', 'read', 'actioned', 'archived'];
        if (status && !validStatuses.includes(status)) {
            throw new BadRequestError(`status must be one of: ${validStatuses.join(', ')}`);
        }

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
        const provider = getDaytonaProvider(sandboxService);

        const result = await listInboxItems(provider, sandboxId, {
            status: status as 'unread' | 'read' | 'actioned' | 'archived' | undefined,
            limit,
            offset,
        });

        sendResponse(res, 200, {
            items: result.items.map(mapItemToResponse),
            total: result.total,
        }, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/inbox/:itemId - Get single inbox item from workspace DB
router.get('/:itemId', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new UnauthorizedError();

        const itemId = parseInt(req.params.itemId, 10);
        if (isNaN(itemId) || itemId < 1) {
            throw new BadRequestError('itemId must be a positive integer');
        }

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
        const provider = getDaytonaProvider(sandboxService);

        const item = await getInboxItem(provider, sandboxId, itemId);
        if (!item) {
            throw new NotFoundError('Inbox item');
        }

        sendResponse(res, 200, mapItemToResponse(item), startTime);
    } catch (err) {
        next(err);
    }
});

// PATCH /api/v1/inbox/:itemId/read - Mark item as read in workspace DB
router.patch('/:itemId/read', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new UnauthorizedError();

        const itemId = parseInt(req.params.itemId, 10);
        if (isNaN(itemId) || itemId < 1) {
            throw new BadRequestError('itemId must be a positive integer');
        }

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
        const provider = getDaytonaProvider(sandboxService);

        const item = await markInboxItemRead(provider, sandboxId, itemId);
        if (!item) {
            throw new NotFoundError('Inbox item');
        }

        sendResponse(res, 200, mapItemToResponse(item), startTime);
    } catch (err) {
        next(err);
    }
});

// PATCH /api/v1/inbox/:itemId/archive - Archive item in workspace DB
router.patch('/:itemId/archive', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new UnauthorizedError();

        const itemId = parseInt(req.params.itemId, 10);
        if (isNaN(itemId) || itemId < 1) {
            throw new BadRequestError('itemId must be a positive integer');
        }

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
        const provider = getDaytonaProvider(sandboxService);

        const item = await archiveInboxItem(provider, sandboxId, itemId);
        if (!item) {
            throw new NotFoundError('Inbox item');
        }

        sendResponse(res, 200, mapItemToResponse(item), startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
