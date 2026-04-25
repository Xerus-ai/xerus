// Drive Lifecycle/Admin Routes
// Extracted from drive.routes.ts for file size compliance
// - GET  /stream     -> SSE stream for file changes
// - POST /ensure     -> Ensure sandbox is running
// - POST /pause      -> Pause sandbox
// - POST /start      -> Resume sandbox
// - POST /stop       -> Stop sandbox
// - POST /backup     -> Trigger S3 backup
// - GET  /status     -> Sandbox status
// - POST /terminal   -> Start web terminal
// - POST /browser    -> Start browser session
// - GET  /snapshots  -> List S3 snapshots
// - POST /restore    -> Restore from S3 snapshot

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { sseAuth, createSseTokenHandler } from '../../middleware/sse-auth';
import type { DriveService } from './drive.service';
import type { InMemoryWorkspaceSSEBroadcaster } from './workspace-sse.broadcaster';

// -----------------------------------------------------------------------------
// Types for dependency injection
// -----------------------------------------------------------------------------

export interface LifecycleRouteDeps {
    getDriveService: () => DriveService;
    workspaceSSEBroadcaster: InMemoryWorkspaceSSEBroadcaster;
}

// -----------------------------------------------------------------------------
// Factory: creates the lifecycle sub-router
// -----------------------------------------------------------------------------

export function createLifecycleRouter(deps: LifecycleRouteDeps): Router {
    const router = Router();
    const auth = authenticateFirebaseToken;

    // POST /sse-token - Issue a short-lived, single-use token for workspace SSE auth
    router.post('/sse-token', auth, createSseTokenHandler());

    // GET /stream - SSE stream for real-time workspace file change events
    // Uses sseAuth (short-lived token from POST /sse-token) instead of raw JWT in URL
    router.get('/stream', sseAuth, (req: AuthenticatedRequest, res: Response) => {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.flushHeaders();

        res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

        deps.workspaceSSEBroadcaster.addClient(userId, res);

        req.on('close', () => {
            deps.workspaceSSEBroadcaster.removeClient(userId, res);
        });
    });

    // POST /ensure - ensure sandbox is running (idempotent)
    router.post(
        '/ensure',
        auth,
        async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            const startTime = res.locals.startTime || Date.now();
            try {
                if (!req.user) throw new UnauthorizedError();

                const service = deps.getDriveService();
                const status = await service.ensureSandbox(req.user.uid);

                sendResponse(res, 200, status, startTime);
            } catch (err) {
                next(err);
            }
        },
    );

    // POST /pause - pause the user's sandbox
    router.post(
        '/pause',
        auth,
        async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            const startTime = res.locals.startTime || Date.now();
            try {
                if (!req.user) throw new UnauthorizedError();

                const service = deps.getDriveService();
                const result = await service.pauseSandbox(req.user.uid);

                sendResponse(res, 200, result, startTime);
            } catch (err) {
                next(err);
            }
        },
    );

    // POST /start - resume the user's sandbox
    router.post(
        '/start',
        auth,
        async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            const startTime = res.locals.startTime || Date.now();
            try {
                if (!req.user) throw new UnauthorizedError();

                const service = deps.getDriveService();
                const session = await service.startSandbox(req.user.uid);

                sendResponse(res, 200, {
                    started: session !== null,
                    sandboxId: session?.sandboxId ?? null,
                }, startTime);
            } catch (err) {
                next(err);
            }
        },
    );

    // POST /stop - kill the user's sandbox
    router.post(
        '/stop',
        auth,
        async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            const startTime = res.locals.startTime || Date.now();
            try {
                if (!req.user) throw new UnauthorizedError();

                const service = deps.getDriveService();
                const result = await service.stopSandbox(req.user.uid);

                sendResponse(res, 200, result, startTime);
            } catch (err) {
                next(err);
            }
        },
    );

    // POST /backup - trigger on-demand .memory/ backup to S3
    router.post(
        '/backup',
        auth,
        async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            const startTime = res.locals.startTime || Date.now();
            try {
                if (!req.user) throw new UnauthorizedError();

                const service = deps.getDriveService();
                const result = await service.triggerBackup(req.user.uid);

                sendResponse(res, 200, result, startTime);
            } catch (err) {
                next(err);
            }
        },
    );

    // GET /status
    router.get(
        '/status',
        auth,
        async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            const startTime = res.locals.startTime || Date.now();
            try {
                if (!req.user) throw new UnauthorizedError();

                const service = deps.getDriveService();
                const status = await service.getStatus(req.user.uid);

                sendResponse(res, 200, status, startTime);
            } catch (err) {
                next(err);
            }
        },
    );

    // POST /terminal - start web terminal with claude, return ttyd URL
    router.post(
        '/terminal',
        auth,
        async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            const startTime = res.locals.startTime || Date.now();
            try {
                if (!req.user) throw new UnauthorizedError();

                const service = deps.getDriveService();
                const result = await service.startTerminal(req.user.uid);

                sendResponse(res, 200, result, startTime);
            } catch (err) {
                next(err);
            }
        },
    );

    // POST /browser - start browser infrastructure, return noVNC URL
    router.post(
        '/browser',
        auth,
        async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            const startTime = res.locals.startTime || Date.now();
            try {
                if (!req.user) throw new UnauthorizedError();

                const service = deps.getDriveService();
                const result = await service.startBrowser(req.user.uid);

                sendResponse(res, 200, result, startTime);
            } catch (err) {
                next(err);
            }
        },
    );

    // GET /snapshots - list available S3 snapshots
    router.get(
        '/snapshots',
        auth,
        async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            const startTime = res.locals.startTime || Date.now();
            try {
                if (!req.user) throw new UnauthorizedError();

                const service = deps.getDriveService();
                const snapshots = await service.listSnapshots(req.user.uid);

                sendResponse(res, 200, snapshots, startTime);
            } catch (err) {
                next(err);
            }
        },
    );

    // POST /restore - restore workspace from an S3 snapshot
    router.post(
        '/restore',
        auth,
        async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            const startTime = res.locals.startTime || Date.now();
            try {
                if (!req.user) throw new UnauthorizedError();

                const { snapshotKey } = req.body;
                if (typeof snapshotKey !== 'string' || !snapshotKey.trim()) {
                    throw new BadRequestError('snapshotKey is required and must be a non-empty string');
                }

                const SNAPSHOT_KEY_PATTERN = /^[A-Za-z0-9_-]+\/snapshots\/[^/]+\.tar\.gz$/;
                if (!snapshotKey.startsWith(`${req.user.uid}/`) || !SNAPSHOT_KEY_PATTERN.test(snapshotKey)) {
                    throw new BadRequestError('Access denied: invalid or unauthorized snapshot key');
                }

                const service = deps.getDriveService();
                await service.restoreFromSnapshot(req.user.uid, snapshotKey);

                sendResponse(res, 200, { restored: true }, startTime);
            } catch (err) {
                next(err);
            }
        },
    );

    // POST /sync-template - selectively overlay platform-owned paths from the
    // xerus-workspace template repo onto the user's sandbox.
    // Body: { dryRun?: boolean } — when true, returns the list of paths that
    // would change without applying any filesystem mutations.
    router.post(
        '/sync-template',
        auth,
        async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            const startTime = res.locals.startTime || Date.now();
            try {
                if (!req.user) throw new UnauthorizedError();

                const dryRunRaw = req.body?.dryRun;
                if (dryRunRaw !== undefined && typeof dryRunRaw !== 'boolean') {
                    throw new BadRequestError('dryRun must be a boolean when provided');
                }
                const dryRun = dryRunRaw === true;

                const service = deps.getDriveService();
                const result = await service.syncTemplate(req.user.uid, dryRun);

                sendResponse(
                    res,
                    200,
                    {
                        ...result,
                        platformPaths: service.listSyncTemplatePaths(),
                    },
                    startTime,
                );
            } catch (err) {
                next(err);
            }
        },
    );

    // DELETE /snapshots - remove an S3 snapshot owned by the user
    router.delete(
        '/snapshots',
        auth,
        async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            const startTime = res.locals.startTime || Date.now();
            try {
                if (!req.user) throw new UnauthorizedError();

                const { snapshotKey } = req.body;
                if (typeof snapshotKey !== 'string' || !snapshotKey.trim()) {
                    throw new BadRequestError('snapshotKey is required and must be a non-empty string');
                }

                const SNAPSHOT_KEY_PATTERN = /^[A-Za-z0-9_-]+\/snapshots\/[^/]+\.tar\.gz$/;
                if (!snapshotKey.startsWith(`${req.user.uid}/`) || !SNAPSHOT_KEY_PATTERN.test(snapshotKey)) {
                    throw new BadRequestError('Access denied: invalid or unauthorized snapshot key');
                }

                const service = deps.getDriveService();
                await service.deleteSnapshot(req.user.uid, snapshotKey);

                sendResponse(res, 200, { deleted: true, snapshotKey }, startTime);
            } catch (err) {
                next(err);
            }
        },
    );

    return router;
}
