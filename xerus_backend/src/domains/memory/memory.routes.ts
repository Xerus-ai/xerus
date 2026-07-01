// Memory Routes
// REST API endpoint for agent memory search index
// Pattern: workspace-scoped via workspaces table (matches execution.routes.ts)

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { query } from '../../database/connection';

const router = Router();
const auth = authenticateFirebaseToken;

// GET /api/v1/memory?agentId=123
router.get('/', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const agentSlug = req.query.agentSlug as string | undefined;
        if (!agentSlug) {
            res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'agentSlug query parameter is required' } });
            return;
        }

        // Resolve workspace for authenticated user
        const wsResult = await query<{ id: string }>(
            `SELECT id FROM workspaces WHERE user_id = $1 LIMIT 1`,
            [userId]
        );
        if (wsResult.rows.length === 0) {
            sendResponse(res, 200, [], startTime);
            return;
        }
        const workspaceId = wsResult.rows[0].id;

        const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
        const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

        const result = await query(
            `SELECT id, content, file_path, memory_type, scope, created_at
             FROM memory_search_index
             WHERE workspace_id = $1::uuid AND agent_slug = $2
             ORDER BY memory_type, created_at DESC
             LIMIT $3 OFFSET $4`,
            [workspaceId, agentSlug, limit, offset]
        );

        sendResponse(res, 200, result.rows, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
