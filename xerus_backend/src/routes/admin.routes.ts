import { Router, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AuthenticatedRequest } from '../types';
import { sendResponse } from '../utils/response';
import { BadRequestError, ForbiddenError } from '../utils/errors';
import { authenticateFirebaseToken, requireRole } from '../middleware/auth';
import { userService, creditService, apiKeyService, userRepository, PlanType } from '../domains/users';
import { toolsService } from '../domains/tools/service';

const router = Router();
const auth = authenticateFirebaseToken;
const requireAdmin = requireRole(['admin']);

// GET /api/v1/admin/users - List all users
router.get('/users', auth, requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const limitRaw = Number(req.query.limit);
        const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 200 ? limitRaw : 50;
        const offsetRaw = Number(req.query.offset);
        const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

        const result = await userService.list(limit, offset);

        sendResponse(
            res,
            200,
            {
                users: result.users.map(user => ({
                    user_id: user.user_id,
                    email: user.email,
                    display_name: user.display_name,
                    role: user.role,
                    plan_type: user.plan_type,
                    created_at: user.created_at,
                    last_login: user.last_login,
                })),
                total: result.total,
                limit,
                offset,
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/admin/users/:id - Get specific user
router.get('/users/:id', auth, requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const { id } = req.params;
        const user = await userService.getById(id);
        const creditBalance = await creditService.getBalance(id);

        sendResponse(
            res,
            200,
            {
                user_id: user.user_id,
                email: user.email,
                display_name: user.display_name,
                role: user.role,
                plan_type: creditBalance.plan_type,
                credits_available: creditBalance.balance,
                reset_date: creditBalance.reset_date,
                created_at: user.created_at,
                updated_at: user.updated_at,
                last_login: user.last_login,
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

// PATCH /api/v1/admin/users/:id - Update user (plan, credits)
router.patch('/users/:id', auth, requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const { id } = req.params;

        const updateSchema = Joi.object({
            plan_type: Joi.string().valid('free', 'starter', 'advanced', 'prodigy'),
            credits_add: Joi.number().integer(),
            platform_key_access: Joi.boolean(),
        }).min(1);

        const { error, value } = updateSchema.validate(req.body);
        if (error) {
            throw new BadRequestError(error.details[0].message);
        }

        let user = await userService.getById(id);
        let creditBalance = await creditService.getBalance(id);
        const updates: string[] = [];

        // Handle plan change
        if (value.plan_type && value.plan_type !== creditBalance.plan_type) {
            user = await userService.updatePlan(id, value.plan_type as PlanType);
            updates.push(`plan_type → ${value.plan_type}`);
        }

        // Handle platform_key_access change
        if (value.platform_key_access !== undefined) {
            user = await userRepository.updatePlatformKeyAccess(id, value.platform_key_access);
            updates.push(`platform_key_access → ${value.platform_key_access}`);
        }

        // Handle credit adjustment
        if (value.credits_add !== undefined && value.credits_add !== 0) {
            if (value.credits_add > 0) {
                creditBalance = await creditService.add(id, value.credits_add, 'Admin adjustment');
                updates.push(`credits +${value.credits_add}`);
            } else {
                creditBalance = await creditService.deduct(id, {
                    amount: Math.abs(value.credits_add),
                    description: 'Admin adjustment',
                });
                updates.push(`credits ${value.credits_add}`);
            }
        }

        sendResponse(
            res,
            200,
            {
                user_id: user.user_id,
                email: user.email,
                display_name: user.display_name,
                role: user.role,
                plan_type: creditBalance.plan_type,
                credits_available: creditBalance.balance,
                updates,
                updated_at: user.updated_at,
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

// DELETE /api/v1/admin/users/:id - Delete user
router.delete('/users/:id', auth, requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const { id } = req.params;

        // Prevent admin from deleting themselves
        const adminUser = await userService.getByFirebaseUid(req.user!.uid);
        if (adminUser.user_id === id) {
            throw new ForbiddenError('Cannot delete your own admin account');
        }

        await apiKeyService.deleteAll(id);
        const result = await userService.delete(id);

        sendResponse(
            res,
            200,
            {
                deleted: result.deleted,
                user_id: result.user_id,
                cleanup: result.cleanup,
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/admin/sync-tools - Trigger manual Pipedream apps sync
router.post('/sync-tools', auth, requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        console.log('[Admin] Manual sync triggered by:', req.user!.uid);
        const result = await toolsService.syncPipedreamApps();

        sendResponse(
            res,
            200,
            {
                message: 'Sync completed successfully',
                synced: result.synced,
                failed: result.failed,
                duration_ms: result.duration_ms,
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

export default router;
