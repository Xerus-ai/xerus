// Invite Codes Domain Routes
// REST API endpoints for invite code management

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { verifyFirebaseToken, authenticateFirebaseToken, requireRole } from '../../middleware/auth';
import { inviteCodeRateLimit } from '../../middleware/rate-limit';
import { inviteCodeService } from './service';

const router = Router();

// POST /api/v1/invite-codes/redeem - Redeem an invite code
router.post('/redeem', verifyFirebaseToken, inviteCodeRateLimit, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new Error('Authentication required');
        }

        const { code } = req.body;
        const result = await inviteCodeService.redeemCode(code, req.user.uid);

        sendResponse(
            res,
            200,
            {
                activated: result.activated,
                message: 'Account activated successfully',
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/invite-codes/generate - Generate invite codes (admin only)
router.post('/generate', authenticateFirebaseToken, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new Error('Authentication required');
        }

        const { count, expires_at } = req.body;
        const result = await inviteCodeService.generateCodes(
            req.user.uid,
            count,
            expires_at ? new Date(expires_at) : null
        );

        sendResponse(
            res,
            201,
            {
                codes: result.codes,
                count: result.codes.length,
                expires_at: result.expires_at,
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/invite-codes - List all codes (admin only)
router.get('/', authenticateFirebaseToken, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const { limit, offset } = req.query;

        const result = await inviteCodeService.listCodes(
            limit ? parseInt(limit as string, 10) : undefined,
            offset ? parseInt(offset as string, 10) : undefined
        );

        sendResponse(
            res,
            200,
            {
                codes: result.codes.map(c => ({
                    id: c.id,
                    code: c.code,
                    created_by: c.created_by,
                    used_by: c.used_by,
                    used_at: c.used_at,
                    expires_at: c.expires_at,
                    is_used: c.is_used,
                    created_at: c.created_at,
                })),
                total: result.total,
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

export default router;
