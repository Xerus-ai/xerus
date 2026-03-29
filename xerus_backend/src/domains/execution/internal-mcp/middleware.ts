// Internal MCP Auth Middleware
// Validates requests from sandbox MCP server

import { Response, NextFunction } from 'express';
import { BadRequestError, UnauthorizedError } from '../../../utils/errors';
import { InternalMcpRequest } from './types';

// Fail-fast: require XERUS_INTERNAL_API_TOKEN at startup (no silent fallback)
const INTERNAL_API_TOKEN = process.env.XERUS_INTERNAL_API_TOKEN;
if (!INTERNAL_API_TOKEN) {
    throw new Error('XERUS_INTERNAL_API_TOKEN is required');
}

/**
 * Validates requests from sandbox MCP server.
 * Expects Bearer token in Authorization header matching XERUS_INTERNAL_API_TOKEN.
 * Also extracts user_id from request body for authorization context.
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
        // Token is guaranteed to exist due to startup check
        if (token !== INTERNAL_API_TOKEN) {
            throw new UnauthorizedError('Invalid internal API token');
        }

        // Extract user context from request body
        // MCP server should include user_id in each tool call
        const userId = req.body.user_id;
        if (!userId) {
            throw new BadRequestError('user_id required for internal MCP calls');
        }

        req.sandbox = {
            userId,
            workspaceId: req.body.workspace_id,
        };

        next();
    } catch (error) {
        next(error);
    }
}
