// Connections Routes
// REST endpoints for file_connections table in workspace.db:
// - GET    /connections?file_path=...  -> connections for a file
// - GET    /connections?target_type=...&target_ref=...  -> files connected to a target
// - POST   /connections               -> create connection
// - DELETE /connections/:id            -> remove connection

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { requireRunningSandbox, getDaytonaProvider } from '../sandbox-infra/sandbox/sandbox-route-helpers';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';
import { validateDrivePath } from './drive-path-validator';
import {
    getConnectionsForFile,
    getConnectionsForTarget,
    createConnection,
    deleteConnection,
} from './connections.service';

// -----------------------------------------------------------------------------
// Types for dependency injection
// -----------------------------------------------------------------------------

export interface ConnectionsRouteDeps {
    sandboxService: SandboxService;
}

// -----------------------------------------------------------------------------
// Factory: creates the connections sub-router
// -----------------------------------------------------------------------------

const VALID_TARGET_TYPES = ['agent', 'channel', 'file'];

export function createConnectionsRouter(deps: ConnectionsRouteDeps): Router {
    const router = Router();
    const auth = authenticateFirebaseToken;

    // GET /connections?file_path=... OR ?target_type=...&target_ref=...
    router.get('/connections', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) throw new UnauthorizedError();

            const sandboxId = await requireRunningSandbox(deps.sandboxService, req.user.uid);
            const provider = getDaytonaProvider(deps.sandboxService);

            const filePath = req.query.file_path as string | undefined;
            const targetType = req.query.target_type as string | undefined;
            const targetRef = req.query.target_ref as string | undefined;

            if (filePath) {
                const connections = await getConnectionsForFile(provider, sandboxId, filePath);
                sendResponse(res, 200, { connections }, startTime);
            } else if (targetType && targetRef) {
                if (!VALID_TARGET_TYPES.includes(targetType)) {
                    throw new BadRequestError(`target_type must be one of: ${VALID_TARGET_TYPES.join(', ')}`);
                }
                const connections = await getConnectionsForTarget(provider, sandboxId, targetType, targetRef);
                sendResponse(res, 200, { connections }, startTime);
            } else {
                throw new BadRequestError('Either file_path or both target_type and target_ref query params are required');
            }
        } catch (err) {
            next(err);
        }
    });

    // POST /connections { file_path, target_type, target_ref }
    router.post('/connections', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) throw new UnauthorizedError();

            const { file_path, target_type, target_ref } = req.body;

            if (typeof file_path !== 'string' || !file_path) {
                throw new BadRequestError('file_path is required');
            }
            if (file_path.length > 1024) {
                throw new BadRequestError('file_path too long');
            }
            if (typeof target_type !== 'string' || !VALID_TARGET_TYPES.includes(target_type)) {
                throw new BadRequestError(`target_type must be one of: ${VALID_TARGET_TYPES.join(', ')}`);
            }
            if (typeof target_ref !== 'string' || !target_ref) {
                throw new BadRequestError('target_ref is required');
            }
            if (target_ref.length > 256) {
                throw new BadRequestError('target_ref too long');
            }

            // Validate path to prevent traversal and injection
            const validatedPath = validateDrivePath(file_path);

            const sandboxId = await requireRunningSandbox(deps.sandboxService, req.user.uid);
            const provider = getDaytonaProvider(deps.sandboxService);

            const connection = await createConnection(
                provider, sandboxId, validatedPath, target_type, target_ref, req.user.uid,
            );

            sendResponse(res, 201, { connection }, startTime);
        } catch (err) {
            next(err);
        }
    });

    // DELETE /connections/:id
    router.delete('/connections/:id', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) throw new UnauthorizedError();

            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                throw new BadRequestError('id must be a number');
            }

            const sandboxId = await requireRunningSandbox(deps.sandboxService, req.user.uid);
            const provider = getDaytonaProvider(deps.sandboxService);

            await deleteConnection(provider, sandboxId, id);
            sendResponse(res, 200, { deleted: true, id }, startTime);
        } catch (err) {
            next(err);
        }
    });

    return router;
}
