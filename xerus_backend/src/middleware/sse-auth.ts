// Shared SSE Token Auth
// Short-lived, single-use tokens for authenticating EventSource connections.
// EventSource cannot send Authorization headers, so we exchange the Firebase JWT
// for a short-lived token via POST, then pass that token as a query param.
//
// Used by: execution, inbox, and workspace SSE streams.

import crypto from 'crypto';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { UnauthorizedError } from '../utils/errors';
import { sendResponse } from '../utils/response';
import { authenticateFirebaseToken } from './auth';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const SSE_TOKEN_TTL_MS = 30_000;
const SSE_TOKEN_CLEANUP_INTERVAL_MS = 60_000;

// -----------------------------------------------------------------------------
// Token Store
// -----------------------------------------------------------------------------

interface SseTokenEntry {
    userId: string;
    email: string;
    role?: string;
    expires: number;
}

const sseTokenStore = new Map<string, SseTokenEntry>();

// Periodic cleanup of expired tokens
const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [token, entry] of sseTokenStore) {
        if (entry.expires <= now) {
            sseTokenStore.delete(token);
        }
    }
}, SSE_TOKEN_CLEANUP_INTERVAL_MS);

export function shutdownSseAuth(): void {
    clearInterval(cleanupTimer);
}

// -----------------------------------------------------------------------------
// Middleware: validate a short-lived, single-use SSE token from query param
// -----------------------------------------------------------------------------

export function sseAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
    const queryToken = req.query.token as string | undefined;
    if (!queryToken) {
        console.warn('[SSE Auth] Token missing from query params');
        next(new UnauthorizedError('SSE token required'));
        return;
    }

    const tokenPrefix = queryToken.slice(0, 8);
    const entry = sseTokenStore.get(queryToken);
    if (!entry) {
        console.warn(`[SSE Auth] Token ${tokenPrefix}... not found in store (store size: ${sseTokenStore.size}). Likely consumed on prior request or lost on server restart.`);
        next(new UnauthorizedError('Invalid SSE token'));
        return;
    }

    // Check expiry before consuming the token
    if (entry.expires <= Date.now()) {
        sseTokenStore.delete(queryToken);
        console.warn(`[SSE Auth] Token ${tokenPrefix}... expired (age: ${Date.now() - (entry.expires - SSE_TOKEN_TTL_MS)}ms)`);
        next(new UnauthorizedError('SSE token expired'));
        return;
    }

    // Delete immediately (single-use)
    sseTokenStore.delete(queryToken);

    req.user = {
        uid: entry.userId,
        email: entry.email,
        role: entry.role as 'admin' | 'user' | undefined,
    };

    next();
}

// -----------------------------------------------------------------------------
// Route handler factory: POST /sse-token
// Returns an Express route handler that issues a short-lived SSE token.
// Attach to any router: router.post('/sse-token', auth, createSseTokenHandler());
// -----------------------------------------------------------------------------

export function createSseTokenHandler() {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) {
                throw new UnauthorizedError();
            }

            if (sseTokenStore.size >= 10000) {
                res.status(503).json({ error: 'Too many pending SSE connections' });
                return;
            }

            const token = crypto.randomBytes(32).toString('hex');
            sseTokenStore.set(token, {
                userId: req.user.uid,
                email: req.user.email,
                role: req.user.role,
                expires: Date.now() + SSE_TOKEN_TTL_MS,
            });

            sendResponse(res, 200, {
                token,
                expires_in_ms: SSE_TOKEN_TTL_MS,
            }, startTime);
        } catch (err) {
            next(err);
        }
    };
}

// Re-export for convenience so routes can do: import { sseAuth, createSseTokenHandler, authenticateFirebaseToken } from '...'
export { authenticateFirebaseToken };

// Expose store for backward compat with execution routes (they read sseTokenStore directly)
export { sseTokenStore, SSE_TOKEN_TTL_MS };
