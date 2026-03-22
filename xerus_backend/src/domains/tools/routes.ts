// Tools Domain Routes
// REST API endpoints for Pipedream Connect integration

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { authenticateFirebaseToken, requireRole } from '../../middleware/auth';
import { toolsService } from './service';
import { getPipedreamClient } from '../../shared/clients/pipedream';

const router = Router();
const auth = authenticateFirebaseToken;
const requireAdmin = requireRole(['admin']);

// GET /api/v1/tools - List all available connectors (Pipedream apps) with search and pagination
router.get('/', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const { page, limit, search, category } = req.query;
        const categories = Array.isArray(category)
            ? category.flatMap((value) => String(value).split(',')).map((value) => value.trim()).filter(Boolean)
            : typeof category === 'string'
                ? category.split(',').map((value) => value.trim()).filter(Boolean)
                : undefined;

        const result = await toolsService.listAppsFromDB({
            page: page ? parseInt(page as string, 10) : undefined,
            limit: limit ? parseInt(limit as string, 10) : undefined,
            search: search as string | undefined,
            categories,
        });

        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/tools/connect-token - Generate fresh Connect token for SDK
router.post('/connect-token', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const serverOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) ?? ['http://localhost:3002'];
        const clientOrigins = Array.isArray(req.body.allowed_origins) ? (req.body.allowed_origins as string[]) : [];
        const allowed_origins = clientOrigins.length > 0
            ? clientOrigins.filter(o => serverOrigins.includes(o))
            : serverOrigins;
        if (allowed_origins.length === 0) {
            res.status(400).json({ error: 'No valid allowed_origins provided' });
            return;
        }

        const result = await toolsService.startConnection({
            user_id: req.user!.uid,
            allowed_origins,
        });

        // Return format expected by Pipedream SDK tokenCallback
        // Must include connect_url for frontend to display
        sendResponse(res, 200, {
            token: result.token,
            expires_at: result.expires_at,
            connect_url: result.connect_url
        }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/tools/apps - List available apps
router.post('/apps', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const { query, limit } = req.body;

        const result = await toolsService.listApps({ query, limit });

        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/tools/accounts - Get connected accounts from Pipedream
router.get('/accounts', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const { app } = req.query;

        // Use backend client to fetch accounts from Pipedream (it has projectId)
        const pipedreamClient = getPipedreamClient();

        const accountsResponse = await pipedreamClient.getAccounts({
            external_user_id: req.user!.uid,
            app: app as string | undefined,
        });

        sendResponse(res, 200, accountsResponse.data, startTime);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/v1/tools/accounts/:pipedream_account_id - Disconnect account
router.delete('/accounts/:pipedream_account_id', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const { pipedream_account_id } = req.params;

        await toolsService.disconnectAccount({
            pipedream_account_id,
            user_id: req.user!.uid,
        });

        sendResponse(
            res,
            200,
            {
                message: `Account ${pipedream_account_id} disconnected successfully`,
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/tools/actions/:app_slug - List actions for app
router.get('/actions/:app_slug', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const { app_slug } = req.params;
        const { query, limit } = req.query;

        const result = await toolsService.listActions({
            app_slug,
            query: query as string | undefined,
            limit: limit ? parseInt(limit as string) : undefined,
        });

        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/tools/triggers/:app_slug - List triggers for app
router.get('/triggers/:app_slug', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const { app_slug } = req.params;
        const { query, limit } = req.query;

        const result = await toolsService.listTriggers({
            app_slug,
            query: query as string | undefined,
            limit: limit ? parseInt(limit as string) : undefined,
        });

        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/tools/action/:action_key - Get action details
router.get('/action/:action_key', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const { action_key } = req.params;

        const action = await toolsService.getAction({
            action_key,
        });

        sendResponse(res, 200, action, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/tools/execute - Execute action
router.post('/execute', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const { action_key, pipedream_account_id, params } = req.body;

        const result = await toolsService.executeAction({
            user_id: req.user!.uid,
            action_key,
            pipedream_account_id,
            params,
        });

        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/tools/options - Get dynamic action options
router.post('/options', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const { action_key, prop_name, configured_props } = req.body;

        const options = await toolsService.getActionOptions({
            user_id: req.user!.uid,
            action_key,
            prop_name,
            configured_props,
        });

        sendResponse(res, 200, options, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/tools/stats/:app_slug - Get tool usage statistics
router.get('/stats/:app_slug', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const { app_slug } = req.params;

        const stats = await toolsService.getToolStats(req.user!.uid, app_slug);

        sendResponse(res, 200, stats, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/tools/hide/:app_slug - Hide app from UI (admin only)
router.post('/hide/:app_slug', auth, requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const { app_slug } = req.params;

        await toolsService.hideApp(app_slug);

        sendResponse(res, 200, { message: `App ${app_slug} hidden` }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/tools/show/:app_slug - Show hidden app in UI (admin only)
router.post('/show/:app_slug', auth, requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const { app_slug } = req.params;

        await toolsService.showApp(app_slug);

        sendResponse(res, 200, { message: `App ${app_slug} visible` }, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/tools/hidden - List all hidden apps (admin only)
router.get('/hidden', auth, requireAdmin, async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const hiddenApps = await toolsService.getHiddenApps();

        sendResponse(res, 200, hiddenApps, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/tools/:app_slug - Get a single app by slug
router.get('/:app_slug', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const { app_slug } = req.params;
        const app = await toolsService.getAppBySlug(app_slug);
        sendResponse(res, 200, app, startTime);
    } catch (err) {
        next(err);
    }
});

export { router as toolsRouter };
