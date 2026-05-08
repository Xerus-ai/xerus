// Search Outputs & List Domains Routes
// Handles search_outputs, list_domains MCP tools

import { Router, Response, NextFunction } from 'express';
import { query } from '../../../database/connection';
import { BadRequestError } from '../../../utils/errors';
import { InternalMcpRequest, McpToolResult } from './types';

const MAX_RESULTS = 100;

const router = Router();

// POST /mcp/search_outputs
router.post('/search_outputs', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { agent_id, output_type, date_from, date_to, limit } = req.body;
        const userId = req.sandbox!.userId;

        const resultLimit = Math.min(limit || 20, MAX_RESULTS);

        const workspaceResult = await query<{ id: string }>(
            `SELECT id FROM user_workspaces WHERE user_id = $1 LIMIT 1`,
            [userId],
        );
        if (workspaceResult.rows.length === 0) {
            const mcpResult: McpToolResult = {
                success: true,
                data: { outputs: [], total: 0 },
            };
            res.json(mcpResult);
            return;
        }

        const workspaceId = workspaceResult.rows[0].id;

        let queryText = `SELECT es.id, es.agent_id, ar.slug as agent_slug,
                         es.status, es.trigger_type, es.started_at, es.completed_at, es.created_at
                         FROM execution_sessions es
                         JOIN agent_registry ar ON es.agent_id = ar.id
                         WHERE es.workspace_id = $1::uuid`;
        const params: unknown[] = [workspaceId];
        let paramIndex = 2;

        if (agent_id) {
            const agentIdNum = parseInt(String(agent_id), 10);
            if (isNaN(agentIdNum)) {
                throw new BadRequestError('agent_id must be a valid integer');
            }
            queryText += ` AND es.agent_id = $${paramIndex}`;
            params.push(agentIdNum);
            paramIndex++;
        }

        if (date_from) {
            queryText += ` AND es.created_at >= $${paramIndex}::timestamptz`;
            params.push(date_from);
            paramIndex++;
        }

        if (date_to) {
            queryText += ` AND es.created_at <= $${paramIndex}::timestamptz`;
            params.push(date_to);
            paramIndex++;
        }

        if (output_type) {
            queryText += ` AND es.trigger_type = $${paramIndex}`;
            params.push(output_type);
            paramIndex++;
        }

        queryText += ` ORDER BY es.created_at DESC LIMIT $${paramIndex}`;
        params.push(resultLimit);

        const result = await query<{
            id: string; agent_id: number; agent_slug: string;
            status: string; trigger_type: string;
            started_at: Date | null; completed_at: Date | null; created_at: Date;
        }>(queryText, params);

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                outputs: result.rows.map(row => ({
                    id: row.id,
                    agent_id: row.agent_id,
                    agent_slug: row.agent_slug,
                    status: row.status,
                    trigger_type: row.trigger_type,
                    started_at: row.started_at,
                    completed_at: row.completed_at,
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

// POST /mcp/list_domains
router.post('/list_domains', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.sandbox!.userId;

        const workspaceResult = await query<{ id: string }>(
            `SELECT id FROM workspaces WHERE user_id = $1 LIMIT 1`,
            [userId],
        );
        if (workspaceResult.rows.length === 0) {
            const mcpResult: McpToolResult = {
                success: true,
                data: { domains: [], total: 0 },
            };
            res.json(mcpResult);
            return;
        }

        const workspaceId = workspaceResult.rows[0].id;

        const result = await query<{ id: string; slug: string; name: string; created_at: Date }>(
            `SELECT id, slug, name, created_at
             FROM domains
             WHERE workspace_id = $1::uuid
             ORDER BY name ASC
             LIMIT $2`,
            [workspaceId, MAX_RESULTS],
        );

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                domains: result.rows.map(row => ({
                    id: row.id,
                    slug: row.slug,
                    name: row.name,
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

export { router as searchOutputsRoutes };
