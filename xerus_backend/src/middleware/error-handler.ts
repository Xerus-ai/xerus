import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { sendError } from '../utils/response';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
    const startTime = res.locals.startTime || Date.now();

    if (err instanceof AppError) {
        sendError(res, err.statusCode, err.code, err.message, startTime);
        return;
    }

    console.error('Unhandled error:', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
    });

    sendError(res, 500, 'INTERNAL_ERROR', process.env.NODE_ENV === 'development' ? err.message : 'Internal server error', startTime);
}

export function notFoundHandler(_req: Request, res: Response): void {
    const startTime = res.locals.startTime || Date.now();
    sendError(res, 404, 'NOT_FOUND', 'Not found', startTime);
}
