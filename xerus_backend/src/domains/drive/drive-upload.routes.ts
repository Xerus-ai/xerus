// Drive Upload/Export/Import Routes
// Extracted from drive.routes.ts for file size compliance
// - POST /upload     -> Multipart file upload to knowledge directories
// - GET  /export     -> Download entire workspace as tar.gz
// - POST /import     -> Import a workspace tar.gz archive

import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { uploadRateLimit } from '../../middleware/rate-limit';
import { validateDrivePath } from './drive-path-validator';
import { reverseSyncToDB } from './reverse-sync';
import type { DriveService } from './drive.service';
import type { InMemoryWorkspaceSSEBroadcaster, FileChangeAction } from './workspace-sse.broadcaster';

// -----------------------------------------------------------------------------
// Types for dependency injection
// -----------------------------------------------------------------------------

export interface UploadRouteDeps {
    getDriveService: () => DriveService;
    workspaceSSEBroadcaster: InMemoryWorkspaceSSEBroadcaster;
}

function emitFileChanged(
    broadcaster: InMemoryWorkspaceSSEBroadcaster,
    userId: string,
    filePath: string,
    action: FileChangeAction,
): void {
    broadcaster.broadcastFileChanged(userId, {
        type: 'file_changed',
        path: filePath,
        action,
        timestamp: new Date().toISOString(),
    });
}

// -----------------------------------------------------------------------------
// Multer Config
// -----------------------------------------------------------------------------

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
});

const importUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: (_req: AuthenticatedRequest, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
        const name = file.originalname.toLowerCase();
        if (!name.endsWith('.tar.gz') && !name.endsWith('.tgz')) {
            cb(new BadRequestError('File must be a .tar.gz or .tgz archive'));
            return;
        }
        cb(null, true);
    },
});

// -----------------------------------------------------------------------------
// Factory: creates the upload sub-router
// -----------------------------------------------------------------------------

export function createUploadRouter(deps: UploadRouteDeps): Router {
    const router = Router();
    const auth = authenticateFirebaseToken;

    // POST /upload?path=shared/knowledge/
    router.post(
        '/upload',
        auth,
        uploadRateLimit,
        upload.single('file'),
        async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            const startTime = res.locals.startTime || Date.now();
            try {
                if (!req.user) throw new UnauthorizedError();

                const file = req.file;
                if (!file) {
                    throw new BadRequestError('File is required (multipart field: "file")');
                }

                const targetPath = String(req.query.path || '');
                if (!targetPath) {
                    throw new BadRequestError('path query parameter is required (e.g., shared/knowledge/)');
                }

                const normalized = validateDrivePath(targetPath.endsWith('/') ? `${targetPath}placeholder` : targetPath);
                const targetDir = normalized.replace(/\/placeholder$/, '').replace(/[^/]+$/, '');

                const isKnowledgePath =
                    targetDir.startsWith('shared/knowledge') ||
                    /^agents\/[^/]+\/knowledge/.test(targetDir) ||
                    /^projects\/[^/]+\/knowledge/.test(targetDir);

                if (!isKnowledgePath) {
                    throw new BadRequestError(
                        'Uploads are only allowed to knowledge directories (shared/knowledge/, agents/*/knowledge/, projects/*/knowledge/)',
                    );
                }

                const service = deps.getDriveService();
                await service.uploadFile(
                    req.user.uid,
                    targetPath,
                    file.originalname,
                    file.buffer,
                );

                const uploadedPath = `${targetPath}${targetPath.endsWith('/') ? '' : '/'}${file.originalname}`;

                await reverseSyncToDB('create', uploadedPath, null, req.user.uid);

                emitFileChanged(deps.workspaceSSEBroadcaster, req.user.uid, uploadedPath, 'created');

                sendResponse(res, 201, {
                    path: uploadedPath,
                    size: file.size,
                }, startTime);
            } catch (err) {
                next(err);
            }
        },
    );

    // GET /export - download entire workspace as tar.gz
    router.get(
        '/export',
        auth,
        async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            try {
                if (!req.user) throw new UnauthorizedError();
                const service = deps.getDriveService();
                const buffer = await service.exportWorkspace(req.user.uid);
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                res.setHeader('Content-Type', 'application/gzip');
                res.setHeader('Content-Disposition', `attachment; filename="workspace-${timestamp}.tar.gz"`);
                res.setHeader('Content-Length', String(buffer.length));
                res.send(buffer);
            } catch (err) {
                next(err);
            }
        },
    );

    // POST /import - import a workspace tar.gz archive
    router.post(
        '/import',
        auth,
        importUpload.single('file'),
        async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            const startTime = res.locals.startTime || Date.now();
            try {
                if (!req.user) throw new UnauthorizedError();

                const file = req.file;
                if (!file) {
                    throw new BadRequestError('File is required (multipart field: "file")');
                }

                const ext = file.originalname.toLowerCase();
                if (!ext.endsWith('.tar.gz') && !ext.endsWith('.tgz')) {
                    throw new BadRequestError('File must be a .tar.gz or .tgz archive');
                }

                const service = deps.getDriveService();
                await service.importWorkspace(req.user.uid, file.buffer);

                sendResponse(res, 200, { imported: true, size: file.size }, startTime);
            } catch (err) {
                next(err);
            }
        },
    );

    return router;
}
