// Knowledge Base Routes
// Handles search_kb, upload_kb, assign_kb MCP tools

import { Router, Response, NextFunction } from 'express';
import { query } from '../../../database/connection';
import { BadRequestError } from '../../../utils/errors';
import { InternalMcpRequest, McpToolResult } from './types';

const MAX_RESULTS = 100;
const MAX_CONTENT_SIZE = 1_048_576; // 1MB

const router = Router();

// POST /mcp/search_kb
router.post('/search_kb', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { query: searchQuery, collection_id, limit } = req.body;
        const userId = req.sandbox!.userId;

        if (!searchQuery || typeof searchQuery !== 'string') {
            throw new BadRequestError('query is required');
        }

        const resultLimit = Math.min(limit || 10, MAX_RESULTS);

        const workspaceResult = await query<{ id: string }>(
            `SELECT id FROM workspaces WHERE user_id = $1 LIMIT 1`,
            [userId],
        );
        if (workspaceResult.rows.length === 0) {
            throw new BadRequestError('Workspace not found');
        }

        const userWorkspaceResult = await query<{ id: string }>(
            `SELECT id FROM user_workspaces WHERE user_id = $1 LIMIT 1`,
            [userId],
        );
        if (userWorkspaceResult.rows.length === 0) {
            const mcpResult: McpToolResult = {
                success: true,
                data: { results: [], total: 0 },
            };
            res.json(mcpResult);
            return;
        }

        const workspaceId = userWorkspaceResult.rows[0].id;
        const searchPattern = `%${searchQuery}%`;

        let queryText = `SELECT id, file_path, content, memory_type, scope, created_at
                         FROM memory_search_index
                         WHERE workspace_id = $1::uuid
                           AND content ILIKE $2`;
        const params: unknown[] = [workspaceId, searchPattern];
        let paramIndex = 3;

        if (collection_id) {
            queryText += ` AND file_path LIKE $${paramIndex}`;
            params.push(`%${collection_id}%`);
            paramIndex++;
        }

        queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
        params.push(resultLimit);

        const result = await query<{
            id: string; file_path: string; content: string;
            memory_type: string; scope: string; created_at: Date;
        }>(queryText, params);

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                results: result.rows.map(row => ({
                    id: row.id,
                    file_path: row.file_path,
                    content: row.content.substring(0, 500),
                    memory_type: row.memory_type,
                    scope: row.scope,
                    created_at: row.created_at,
                })),
                total: result.rows.length,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/upload_kb
router.post('/upload_kb', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { title, content, file_path, collection_id } = req.body;
        const userId = req.sandbox!.userId;

        if (!title || typeof title !== 'string') {
            throw new BadRequestError('title is required');
        }
        if (!content && !file_path) {
            throw new BadRequestError('Either content or file_path is required');
        }
        if (content && typeof content === 'string' && content.length > MAX_CONTENT_SIZE) {
            throw new BadRequestError(`Content exceeds maximum size of ${MAX_CONTENT_SIZE} bytes (1MB)`);
        }

        const collection = collection_id || 'default';
        const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const kbPath = `knowledge/${collection}/${safeTitle}.md`;

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                document_id: `kb-${Date.now()}`,
                title,
                path: kbPath,
                collection: collection,
                user_id: userId,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/assign_kb
router.post('/assign_kb', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { agent_id, document_id, collection_id, permission } = req.body;
        const userId = req.sandbox!.userId;

        if (!agent_id) {
            throw new BadRequestError('agent_id is required');
        }
        if (!document_id && !collection_id) {
            throw new BadRequestError('Either document_id or collection_id is required');
        }

        const agentIdNum = parseInt(String(agent_id), 10);
        if (isNaN(agentIdNum)) {
            throw new BadRequestError('agent_id must be a valid integer');
        }

        const agentResult = await query<{ id: number; slug: string }>(
            `SELECT id, slug FROM agent_registry WHERE id = $1 AND (user_id = $2 OR agent_type = 'system')`,
            [agentIdNum, userId],
        );
        if (agentResult.rows.length === 0) {
            throw new BadRequestError(`Agent not found: ${agent_id}`);
        }

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                assigned: true,
                agent_id: agentResult.rows[0].id,
                agent_slug: agentResult.rows[0].slug,
                document_id: document_id || null,
                collection_id: collection_id || null,
                permission: permission || 'read',
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

export { router as knowledgeBaseRoutes };
