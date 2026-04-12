// Tags Routes
// REST endpoints for file_tags table in workspace.db:
// - GET    /tags?file_path=...  -> tags for a file
// - GET    /tags?tag=...        -> files with a tag
// - POST   /tags                -> add tag to a file
// - DELETE /tags/:id            -> remove tag
// - GET    /tags/list           -> list all unique tags with counts

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { requireRunningSandbox, getDaytonaProvider } from '../sandbox-infra/sandbox/sandbox-route-helpers';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';
import { validateDrivePath } from './drive-path-validator';
import {
    getTagsForFile,
    getFilesByTag,
    createTag,
    deleteTag,
    listTags,
} from './tags.service';

// -----------------------------------------------------------------------------
// Types for dependency injection
// -----------------------------------------------------------------------------

export interface TagsRouteDeps {
    sandboxService: SandboxService;
}

// -----------------------------------------------------------------------------
// Factory: creates the tags sub-router
// -----------------------------------------------------------------------------

export function createTagsRouter(deps: TagsRouteDeps): Router {
    const router = Router();
    const auth = authenticateFirebaseToken;

    // GET /tags/list — list all unique tags with file counts
    // Defined before /tags to avoid matching /tags/:id pattern conflicts
    router.get('/tags/list', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) throw new UnauthorizedError();

            const sandboxId = await requireRunningSandbox(deps.sandboxService, req.user.uid);
            const provider = getDaytonaProvider(deps.sandboxService);

            const tags = await listTags(provider, sandboxId);
            sendResponse(res, 200, { tags }, startTime);
        } catch (err) {
            next(err);
        }
    });

    // GET /tags?file_path=... OR ?tag=...
    router.get('/tags', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) throw new UnauthorizedError();

            const sandboxId = await requireRunningSandbox(deps.sandboxService, req.user.uid);
            const provider = getDaytonaProvider(deps.sandboxService);

            const filePath = req.query.file_path as string | undefined;
            const tag = req.query.tag as string | undefined;

            if (filePath) {
                const tags = await getTagsForFile(provider, sandboxId, filePath);
                sendResponse(res, 200, { tags }, startTime);
            } else if (tag) {
                const files = await getFilesByTag(provider, sandboxId, tag);
                sendResponse(res, 200, { files }, startTime);
            } else {
                throw new BadRequestError('Either file_path or tag query param is required');
            }
        } catch (err) {
            next(err);
        }
    });

    // POST /tags { file_path, tag }
    router.post('/tags', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) throw new UnauthorizedError();

            const { file_path, tag } = req.body;

            if (typeof file_path !== 'string' || !file_path) {
                throw new BadRequestError('file_path is required');
            }
            if (file_path.length > 1024) {
                throw new BadRequestError('file_path too long');
            }
            if (typeof tag !== 'string' || !tag) {
                throw new BadRequestError('tag is required');
            }
            if (tag.length > 128) {
                throw new BadRequestError('tag too long');
            }

            // Validate path to prevent traversal and injection
            const validatedPath = validateDrivePath(file_path);

            const sandboxId = await requireRunningSandbox(deps.sandboxService, req.user.uid);
            const provider = getDaytonaProvider(deps.sandboxService);

            const created = await createTag(provider, sandboxId, validatedPath, tag);
            sendResponse(res, 201, { tag: created }, startTime);
        } catch (err) {
            next(err);
        }
    });

    // DELETE /tags/:id
    router.delete('/tags/:id', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) throw new UnauthorizedError();

            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                throw new BadRequestError('id must be a number');
            }

            const sandboxId = await requireRunningSandbox(deps.sandboxService, req.user.uid);
            const provider = getDaytonaProvider(deps.sandboxService);

            await deleteTag(provider, sandboxId, id);
            sendResponse(res, 200, { deleted: true, id }, startTime);
        } catch (err) {
            next(err);
        }
    });

    return router;
}
