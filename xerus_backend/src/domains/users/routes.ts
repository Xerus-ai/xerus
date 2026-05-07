// Users Domain Routes
// REST API endpoints for user management

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { authenticateFirebaseToken, verifyFirebaseToken } from '../../middleware/auth';
import { userService } from './service';
import { creditService } from './credit-service';
import { apiKeyService } from './api-key-service';
import { cliAuthService } from './cli-auth.service';
import { UserUnauthorizedError, UserForbiddenError } from './errors';
import { userValidator } from './validators';
import { strictRateLimit } from '../../middleware/rate-limit';
import { query } from '../../database/connection';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';

const router = Router();
const auth = authenticateFirebaseToken;

// Dependency injection for SandboxService
export function setUserRoutesDeps(deps: { sandboxService: SandboxService }): void {
    cliAuthService.setSandboxService(deps.sandboxService);
}

// POST /api/v1/users/find-or-create - Login/Register
// Uses verifyFirebaseToken (no DB lookup) so new users can be created
router.post('/find-or-create', verifyFirebaseToken, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new UserUnauthorizedError();
        }

        const uid = req.body.uid || req.user.uid;
        const email = req.body.email || req.user.email;
        const display_name = req.body.display_name || req.user.name;
        const avatar_url = req.body.avatar_url;

        // Validate UID matches authenticated user
        if (req.user.uid !== uid) {
            throw new UserForbiddenError('Cannot create/update user for different UID');
        }

        const result = await userService.findOrCreate({
            firebase_uid: uid,
            email,
            display_name,
            avatar_url,
        });

        // Check workspace existence to determine onboarding state
        const wsCheck = await query(
            'SELECT 1 FROM workspaces WHERE user_id = $1 LIMIT 1',
            [result.user.user_id],
        );

        // If user is inactive and invite mode is on, signal frontend to show invite gate
        const inviteRequired = !result.user.is_active && process.env.INVITE_ONLY_MODE === 'true';

        sendResponse(
            res,
            result.created ? 201 : 200,
            {
                user_id: result.user.user_id,
                email: result.user.email,
                display_name: result.user.display_name,
                role: result.user.role,
                plan_type: result.credit_balance.plan_type,
                credits_available: result.credit_balance.balance,
                created_at: result.user.created_at,
                is_new: result.created,
                has_workspace: wsCheck.rows.length > 0,
                invite_required: inviteRequired,
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/users/me - Get profile
router.get('/me', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new UserUnauthorizedError();
        }

        const user = await userService.getByFirebaseUid(req.user.uid);
        const [creditBalance, wsCheck] = await Promise.all([
            creditService.getBalance(user.user_id),
            query('SELECT 1 FROM workspaces WHERE user_id = $1 LIMIT 1', [user.user_id]),
        ]);

        sendResponse(
            res,
            200,
            {
                user_id: user.user_id,
                email: user.email,
                display_name: user.display_name,
                avatar_url: user.avatar_url,
                role: user.role,
                plan_type: creditBalance.plan_type,
                credits_available: creditBalance.balance,
                credits_reset_date: creditBalance.reset_date,
                subscription_status: user.subscription_status,
                subscription_current_period_end: user.subscription_current_period_end,
                polar_customer_id: user.polar_customer_id,
                timezone: user.timezone,
                is_active: user.is_active,
                created_at: user.created_at,
                last_login: user.last_login,
                has_workspace: wsCheck.rows.length > 0,
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

// PATCH /api/v1/users/me - Update profile
router.patch('/me', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new UserUnauthorizedError();
        }

        const currentUser = await userService.getByFirebaseUid(req.user.uid);
        const user = await userService.update(currentUser.user_id, req.body);

        sendResponse(
            res,
            200,
            {
                user_id: user.user_id,
                email: user.email,
                display_name: user.display_name,
                avatar_url: user.avatar_url,
                timezone: user.timezone,
                updated_at: user.updated_at,
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

// DELETE /api/v1/users/me - Delete own account
router.delete('/me', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new UserUnauthorizedError();
        }

        const currentUser = await userService.getByFirebaseUid(req.user.uid);
        const result = await userService.delete(currentUser.user_id);

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

// GET /api/v1/users/credits - Get credit balance
router.get('/credits', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new UserUnauthorizedError();
        }

        const currentUser = await userService.getByFirebaseUid(req.user.uid);
        const balance = await creditService.getBalance(currentUser.user_id);

        sendResponse(
            res,
            200,
            {
                plan_type: balance.plan_type,
                credits_available: balance.balance,
                credits_used: balance.used,
                credits_reset_date: balance.reset_date,
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/users/credits/history - Get credit usage history
router.get('/credits/history', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new UserUnauthorizedError();
        }

        const currentUser = await userService.getByFirebaseUid(req.user.uid);

        const { page, limit, operation, start_date, end_date } = req.query;

        const options = {
            page: page ? parseInt(page as string, 10) : undefined,
            limit: limit ? parseInt(limit as string, 10) : undefined,
            operation: operation as 'deduct' | 'reset' | 'add' | 'refund' | undefined,
            start_date: start_date ? new Date(start_date as string) : undefined,
            end_date: end_date ? new Date(end_date as string) : undefined,
        };

        const result = await creditService.getHistory(currentUser.user_id, options);

        sendResponse(
            res,
            200,
            {
                history: result.history,
                pagination: result.pagination,
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

// ===== API KEY ENDPOINTS =====

// GET /api/v1/users/api-keys - Get API key status
router.get('/api-keys', auth, strictRateLimit, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new UserUnauthorizedError();
        }

        const currentUser = await userService.getByFirebaseUid(req.user.uid);
        const status = await apiKeyService.getStatus(currentUser.user_id);

        sendResponse(res, 200, status, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/users/api-keys - Set API key
router.post('/api-keys', auth, strictRateLimit, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new UserUnauthorizedError();
        }

        const currentUser = await userService.getByFirebaseUid(req.user.uid);
        const result = await apiKeyService.set(currentUser.user_id, req.body);

        sendResponse(
            res,
            200,
            {
                provider: result.provider,
                is_set: result.is_set,
                key_hint: result.key_hint,
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

// DELETE /api/v1/users/api-keys/:provider - Delete API key
router.delete('/api-keys/:provider', auth, strictRateLimit, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new UserUnauthorizedError();
        }

        const { provider } = req.params;
        userValidator.validateApiProvider(provider);

        const currentUser = await userService.getByFirebaseUid(req.user.uid);
        await apiKeyService.delete(currentUser.user_id, provider as any);

        sendResponse(
            res,
            200,
            {
                deleted: true,
                provider,
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/users/api-keys/:provider/validate - Validate stored API key
router.post('/api-keys/:provider/validate', auth, strictRateLimit, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new UserUnauthorizedError();
        }

        const { provider } = req.params;
        userValidator.validateApiProvider(provider);

        const currentUser = await userService.getByFirebaseUid(req.user.uid);
        const isValid = await apiKeyService.validate(currentUser.user_id, provider as any);

        sendResponse(
            res,
            200,
            {
                valid: isValid,
                provider,
                message: isValid ? 'API key is valid' : 'API key not set or invalid',
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

// ===== CLI AUTH ENDPOINTS =====

// POST /api/v1/users/cli-auth-trigger - Trigger CLI auth login in sandbox
// Runs `claude auth login` or `codex auth login` and returns the auth URL
router.post('/cli-auth-trigger', auth, strictRateLimit, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new UserUnauthorizedError();
        }

        const { adapter } = req.body;
        if (!adapter || !['claudecode', 'codex'].includes(adapter)) {
            throw new UserForbiddenError('Invalid adapter type. Must be "claudecode" or "codex".');
        }

        const currentUser = await userService.getByFirebaseUid(req.user.uid);
        const result = await cliAuthService.triggerLogin(currentUser.user_id, adapter);

        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/users/cli-auth-complete - Complete CLI auth by delivering the OAuth code
// User pastes the code from the failed localhost redirect; backend delivers it to the CLI inside the sandbox
router.post('/cli-auth-complete', auth, strictRateLimit, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new UserUnauthorizedError();
        }

        const { adapter, code } = req.body;
        if (!adapter || !['claudecode', 'codex'].includes(adapter)) {
            throw new UserForbiddenError('Invalid adapter type. Must be "claudecode" or "codex".');
        }
        if (!code || typeof code !== 'string' || code.trim().length === 0) {
            throw new UserForbiddenError('Authorization code is required.');
        }

        const currentUser = await userService.getByFirebaseUid(req.user.uid);
        const result = await cliAuthService.completeLogin(currentUser.user_id, adapter, code);

        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/users/cli-auth-status - Get CLI authentication status
// Checks sandbox credential files and user API keys to determine auth method
router.get('/cli-auth-status', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new UserUnauthorizedError();
        }

        const currentUser = await userService.getByFirebaseUid(req.user.uid);
        const authStatus = await cliAuthService.fetchAuthStatus(currentUser.user_id);

        sendResponse(res, 200, authStatus, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
