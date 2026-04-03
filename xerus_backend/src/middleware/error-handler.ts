import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { sendError } from '../utils/response';
import { logger } from '../utils/logger';

const log = logger('ErrorHandler');

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
    const startTime = res.locals.startTime || Date.now();

    if (err instanceof AppError) {
        sendError(res, err.statusCode, err.code, err.message, startTime);
        return;
    }

    log.error(`Unhandled error on ${req.method} ${req.path}`, err);

    sendError(res, 500, 'INTERNAL_ERROR', process.env.NODE_ENV === 'development' ? err.message : 'Internal server error', startTime);
}

export function notFoundHandler(_req: Request, res: Response): void {
    const startTime = res.locals.startTime || Date.now();
    sendError(res, 404, 'NOT_FOUND', 'Not found', startTime);
}
