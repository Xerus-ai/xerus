// Drive Routes
// REST endpoints for the Workspace Drive feature:
// - GET  /tree          -> Directory tree
// - GET  /files/*path   -> Read file
// - PUT  /files/*path   -> Write file
// - DELETE /files/*path -> Delete file
// - POST /copy          -> Copy file or directory
//
// Sub-routers (extracted for file-size compliance):
// - drive-upload.routes.ts:    POST /upload, GET /export, POST /import
// - drive-lifecycle.routes.ts: GET /stream, POST /ensure|pause|start|stop|backup|terminal|browser, GET /status|snapshots, POST /restore

import { Router, Response, NextFunction } from 'express';
import path from 'path';
import { AuthenticatedRequest } from '../../types';
import { sendResponse, extractWildcardPath } from '../../utils/response';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { DriveService } from './drive.service';
import { getEditability, isEditable } from './editability';
import { validateDrivePath } from './drive-path-validator';
import { reverseSyncToDB } from './reverse-sync';
import { InMemoryWorkspaceSSEBroadcaster } from './workspace-sse.broadcaster';
import type { FileChangeAction } from './workspace-sse.broadcaster';
import { createUploadRouter } from './drive-upload.routes';
import { createLifecycleRouter } from './drive-lifecycle.routes';

function getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.md':
        case '.txt':
            return 'text/plain; charset=utf-8';
        case '.json':
            return 'application/json; charset=utf-8';
        case '.yaml':
        case '.yml':
            return 'application/yaml; charset=utf-8';
        case '.csv':
            return 'text/csv; charset=utf-8';
        case '.xml':
            return 'application/xml; charset=utf-8';
        case '.html':
        case '.htm':
            return 'text/html; charset=utf-8';
        case '.css':
            return 'text/css; charset=utf-8';
        case '.js':
            return 'text/javascript; charset=utf-8';
        case '.ts':
        case '.tsx':
            return 'text/plain; charset=utf-8';
        case '.svg':
            return 'image/svg+xml';
        case '.png':
            return 'image/png';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.gif':
            return 'image/gif';
        case '.webp':
            return 'image/webp';
        case '.pdf':
            return 'application/pdf';
        case '.doc':
            return 'application/msword';
        case '.docx':
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case '.xls':
            return 'application/vnd.ms-excel';
        case '.xlsx':
            return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        case '.ppt':
            return 'application/vnd.ms-powerpoint';
        case '.pptx':
            return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        default:
            return 'application/octet-stream';
    }
}

// -----------------------------------------------------------------------------
// Dependency Injection (follows setAgentFilesDeps pattern)
// -----------------------------------------------------------------------------

let driveServiceInstance: DriveService | null = null;

export function setDriveDeps(service: DriveService): void {
    driveServiceInstance = service;
}

function getDriveService(): DriveService {
    if (!driveServiceInstance) {
        throw new Error('DriveService not initialized. Call setDriveDeps() at startup.');
    }
    return driveServiceInstance;
}

// Workspace SSE broadcaster (user-scoped, file change events)
export const workspaceSSEBroadcaster = new InMemoryWorkspaceSSEBroadcaster();

function emitFileChanged(userId: string, filePath: string, action: FileChangeAction): void {
    workspaceSSEBroadcaster.broadcastFileChanged(userId, {
        type: 'file_changed',
        path: filePath,
        action,
        timestamp: new Date().toISOString(),
    });
}

// -----------------------------------------------------------------------------
// Router
// -----------------------------------------------------------------------------

const router = Router();
const auth = authenticateFirebaseToken;

// Mount sub-routers
const subDeps = { getDriveService, workspaceSSEBroadcaster };
router.use(createLifecycleRouter(subDeps));
router.use(createUploadRouter(subDeps));

// GET /tree?depth=3&preview=true
router.get(
    '/tree',
    auth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) throw new UnauthorizedError();

            const depth = Math.min(
                Math.max(parseInt(String(req.query.depth), 10) || 3, 1),
                10,
            );
            const skipPreviews = req.query.preview === 'false';

            const service = getDriveService();
            const tree = await service.getTree(req.user.uid, depth, skipPreviews);

            sendResponse(res, 200, tree, startTime);
        } catch (err) {
            next(err);
        }
    },
);

// GET /overview — semantic workspace view for sidebar mental model
router.get(
    '/overview',
    auth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) throw new UnauthorizedError();
            const service = getDriveService();
            const overview = await service.getOverview(req.user.uid);
            sendResponse(res, 200, overview, startTime);
        } catch (err) {
            next(err);
        }
    },
);

// GET /files/*path
router.get(
    '/files/*filePath',
    auth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        try {
            if (!req.user) throw new UnauthorizedError();

            const rawPath = extractWildcardPath(req.params as Record<string, unknown>);
            const filePath = validateDrivePath(rawPath);
            const editability = getEditability(filePath);

            const service = getDriveService();
            const result = await service.readFileBuffer(req.user.uid, filePath);
            const fileName = path.basename(filePath);

            res.status(200);
            res.setHeader('Content-Type', getContentType(filePath));
            res.setHeader('Content-Length', String(result.content.length));
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
            res.setHeader('X-Workspace-Path', filePath);
            res.setHeader('X-Workspace-Editability', editability);
            res.setHeader('X-Workspace-Source', result.source);
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.send(result.content);
        } catch (err) {
            next(err);
        }
    },
);

// PUT /files/*path
router.put(
    '/files/*filePath',
    auth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) throw new UnauthorizedError();

            const rawPath = extractWildcardPath(req.params as Record<string, unknown>);
            const filePath = validateDrivePath(rawPath);

            if (!isEditable(filePath)) {
                throw new BadRequestError(`File is not editable: ${filePath}`);
            }

            const { content } = req.body;
            if (typeof content !== 'string') {
                throw new BadRequestError('content is required and must be a string');
            }

            const service = getDriveService();
            await service.writeFile(req.user.uid, filePath, content);

            await reverseSyncToDB('update', filePath, content, req.user.uid);

            emitFileChanged(req.user.uid, filePath, 'modified');

            sendResponse(res, 200, {
                path: filePath,
                written: true,
            }, startTime);
        } catch (err) {
            next(err);
        }
    },
);

// DELETE /files/*path - delete file or directory
router.delete(
    '/files/*filePath',
    auth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) throw new UnauthorizedError();

            const rawPath = extractWildcardPath(req.params as Record<string, unknown>);
            const filePath = validateDrivePath(rawPath);

            if (!isEditable(filePath)) {
                throw new BadRequestError(`File is not deletable: ${filePath}`);
            }

            const service = getDriveService();
            await service.deleteDirectory(req.user.uid, filePath);

            await reverseSyncToDB('delete', filePath, null, req.user.uid);

            emitFileChanged(req.user.uid, filePath, 'deleted');

            sendResponse(res, 200, { path: filePath, deleted: true }, startTime);
        } catch (err) {
            next(err);
        }
    },
);

// POST /copy - copy a file or directory
router.post(
    '/copy',
    auth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) throw new UnauthorizedError();

            const { source, target } = req.body;
            if (typeof source !== 'string' || typeof target !== 'string') {
                throw new BadRequestError('source and target are required strings');
            }

            const sourcePath = validateDrivePath(source);
            const targetPath = validateDrivePath(target);

            const service = getDriveService();
            await service.copyDirectory(req.user.uid, sourcePath, targetPath);

            emitFileChanged(req.user.uid, targetPath, 'created');

            sendResponse(res, 201, { source: sourcePath, target: targetPath, copied: true }, startTime);
        } catch (err) {
            next(err);
        }
    },
);

export default router;
