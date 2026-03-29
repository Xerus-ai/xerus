// Internal MCP Types
// Shared types for internal MCP routes

import { Request } from 'express';

/**
 * Extended request interface with sandbox context.
 * Set by authenticateInternalMcp middleware.
 */
export interface InternalMcpRequest extends Request {
    sandbox?: {
        userId: string;
        workspaceId?: string;
    };
}

/**
 * MCP tool result format expected by minimal-mcp-server.ts.
 * All internal MCP routes return this structure.
 */
export interface McpToolResult {
    success: boolean;
    data?: unknown;
    error?: string;
}
