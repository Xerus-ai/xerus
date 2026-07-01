// Internal MCP Auth Middleware
// Validates requests from sandbox MCP server

import crypto from 'crypto';
import { Response, NextFunction } from 'express';
import { BadRequestError, UnauthorizedError } from '../../../utils/errors';
import { InternalMcpRequest } from './types';

// Fail-fast: require XERUS_INTERNAL_API_TOKEN at startup (no silent fallback)
const INTERNAL_API_TOKEN = process.env.XERUS_INTERNAL_API_TOKEN;
if (!INTERNAL_API_TOKEN) {
    throw new Error('XERUS_INTERNAL_API_TOKEN is required');
}

// Expected sandbox owner — set per-sandbox to bind token to a specific user.
// When set, the middleware validates that client-supplied user_id matches.
// Optional on the backend server (serves all users); required inside sandboxes.
const SANDBOX_USER_ID = process.env.XERUS_SANDBOX_USER_ID;

// Strict format: Firebase UIDs are typically 28+ alphanumeric chars
const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Validates requests from sandbox MCP server.
 * Expects Bearer token in Authorization header matching XERUS_INTERNAL_API_TOKEN.
 * Also extracts user_id from request body for authorization context and
 * validates it against XERUS_SANDBOX_USER_ID when configured.
 */
export async function authenticateInternalMcp(
    req: InternalMcpRequest,
    _res: Response,
    next: NextFunction
): Promise<void> {
    try {
        // Validate internal API token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedError('Missing internal API token');
        }

        const token = authHeader.split('Bearer ')[1];
        const tokenBuf = Buffer.from(token);
        const expectedBuf = Buffer.from(INTERNAL_API_TOKEN!);
        if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
            throw new UnauthorizedError('Invalid internal API token');
        }

        // Extract user context from request body
        // MCP server should include user_id in each tool call
        const userId = req.body.user_id;
        if (!userId || typeof userId !== 'string') {
            throw new BadRequestError('user_id required for internal MCP calls');
        }

        // Validate user_id format to prevent injection of malformed values
        if (!USER_ID_PATTERN.test(userId)) {
            throw new BadRequestError('user_id contains invalid characters');
        }

        // When XERUS_SANDBOX_USER_ID is configured, enforce that the request
        // user_id matches the sandbox owner. This prevents a compromised sandbox
        // from impersonating other users.
        if (SANDBOX_USER_ID && userId !== SANDBOX_USER_ID) {
            throw new UnauthorizedError('user_id does not match sandbox owner');
        }

        req.sandbox = {
            userId,
            workspaceId: req.body.workspace_id,
            agentSlug: typeof req.body._agent_slug === 'string' ? req.body._agent_slug : undefined,
        };

        next();
    } catch (error) {
        next(error);
    }
}
