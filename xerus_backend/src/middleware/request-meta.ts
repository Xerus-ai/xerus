import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function requestMeta(req: Request, res: Response, next: NextFunction): void {
    res.locals.startTime = Date.now();
    res.locals.requestId = req.headers['x-request-id']?.toString() || crypto.randomUUID();
    res.locals.traceId = req.headers['x-trace-id']?.toString() || crypto.randomUUID();

    res.setHeader('X-Request-Id', res.locals.requestId);
    res.setHeader('X-Trace-Id', res.locals.traceId);

    next();
}
