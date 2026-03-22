// History Routes
// REST API endpoint for execution session history
// Pattern: workspace-scoped via workspaces table (matches execution.routes.ts)

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { query } from '../../database/connection';

const router = Router();
const auth = authenticateFirebaseToken;

// GET /api/v1/history?agentSlug=my-agent&status=completed&limit=50
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

        const status = req.query.status as string | undefined;
        const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);

        // Resolve workspace for authenticated user
        const wsResult = await query<{ id: string }>(
            `SELECT id FROM workspaces WHERE user_id = $1 LIMIT 1`,
            [userId]
        );
        if (wsResult.rows.length === 0) {
            // User hasn't completed onboarding yet — no sessions can exist
            sendResponse(res, 200, [], startTime);
            return;
        }
        const workspaceId = wsResult.rows[0].id;

        const conditions: string[] = ['es.workspace_id = $1::uuid', 'es.agent_slug = $2'];
        const params: unknown[] = [workspaceId, agentSlug];
        let paramIndex = 3;

        if (status) {
            conditions.push(`es.status = $${paramIndex}`);
            params.push(status);
            paramIndex++;
        }

        params.push(limit);
        const whereClause = conditions.join(' AND ');

        params.push(Math.max(parseInt(req.query.offset as string, 10) || 0, 0));

        const result = await query(
            `SELECT es.id, es.agent_slug, es.status, es.trigger_type,
                    es.input_tokens, es.output_tokens, es.credits_used,
                    es.started_at, es.completed_at, es.created_at, es.updated_at
             FROM execution_sessions es
             WHERE ${whereClause}
             ORDER BY es.created_at DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            params
        );

        sendResponse(res, 200, result.rows, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
