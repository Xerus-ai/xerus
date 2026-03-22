import { Response } from 'express';
import crypto from 'crypto';
import { ApiResponse } from '../types';

export function sendResponse<T>(res: Response, statusCode: number, data: T, startTime: number): void {
    const response: ApiResponse<T> = {
        success: statusCode >= 200 && statusCode < 300,
        data,
        meta: {
            request_id: res.locals.requestId || crypto.randomUUID(),
            trace_id: res.locals.traceId || crypto.randomUUID(),
            response_time_ms: Date.now() - startTime,
        },
    };

    res.status(statusCode).json(response);
}

// Express 5 wildcard params (*filePath) return an array of segments.
// This normalizes to a joined string for path-based route handlers.
export function extractWildcardPath(params: Record<string, unknown>): string {
    const raw = params.filePath ?? params[0];
    if (Array.isArray(raw)) return raw.join('/');
    return String(raw || '');
}

export function sendError(res: Response, statusCode: number, code: string, message: string, startTime: number): void {
    const response: ApiResponse = {
        success: false,
        error: {
            code,
            message,
        },
        meta: {
            request_id: res.locals.requestId || crypto.randomUUID(),
            trace_id: res.locals.traceId || crypto.randomUUID(),
            response_time_ms: Date.now() - startTime,
        },
    };

    res.status(statusCode).json(response);
}
