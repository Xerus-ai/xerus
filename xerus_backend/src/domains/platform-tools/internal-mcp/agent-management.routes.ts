// Agent Management Routes
// Handles search_agents, clone_agent, create_agent, update_agent, delete_agent, list_agents

import { Router, Response, NextFunction } from 'express';
import { query } from '../../../database/connection';
import { BadRequestError } from '../../../utils/errors';
import { InternalMcpRequest, McpToolResult } from './types';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_RESULTS = 100;

interface AgentRow {
    id: number;
    slug: string;
    user_id: string | null;
    agent_type: string;
    created_at: Date;
}

const router = Router();

// POST /mcp/search_agents
router.post('/search_agents', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { query: searchQuery, scope } = req.body;
        const userId = req.sandbox!.userId;

        if (!searchQuery || typeof searchQuery !== 'string') {
            throw new BadRequestError('query is required');
        }

        const searchPattern = `%${searchQuery}%`;
        let queryText = `SELECT id, slug, user_id, agent_type, created_at
                         FROM agent_registry
                         WHERE slug ILIKE $1`;
        const params: unknown[] = [searchPattern];
        let paramIndex = 2;

        if (scope === 'mine') {
            queryText += ` AND user_id = $${paramIndex}`;
            params.push(userId);
            paramIndex++;
        } else if (scope === 'marketplace') {
            queryText += ` AND agent_type = 'public'`;
        } else {
            queryText += ` AND (user_id = $${paramIndex} OR agent_type IN ('system', 'public'))`;
            params.push(userId);
            paramIndex++;
        }

        queryText += ` ORDER BY slug LIMIT $${paramIndex}`;
        params.push(MAX_RESULTS);

        const result = await query<AgentRow>(queryText, params);

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                agents: result.rows.map(row => ({
                    id: row.id,
                    slug: row.slug,
                    agent_type: row.agent_type,
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

// POST /mcp/list_agents
router.post('/list_agents', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.sandbox!.userId;

        const result = await query<AgentRow>(
            `SELECT id, slug, user_id, agent_type, created_at
             FROM agent_registry
             WHERE (user_id = $1 AND agent_type IN ('private', 'public'))
                OR agent_type = 'system'
             ORDER BY agent_type ASC, slug ASC
             LIMIT $2`,
            [userId, MAX_RESULTS],
        );

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                agents: result.rows.map(row => ({
                    id: row.id,
                    slug: row.slug,
                    agent_type: row.agent_type,
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

// POST /mcp/create_agent
router.post('/create_agent', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { name, slug, description, system_prompt, model_id, autonomy_level } = req.body;
        const userId = req.sandbox!.userId;

        if (!name || typeof name !== 'string') {
            throw new BadRequestError('name is required');
        }
        if (!description || typeof description !== 'string') {
            throw new BadRequestError('description is required');
        }
        if (!system_prompt || typeof system_prompt !== 'string') {
            throw new BadRequestError('system_prompt is required');
        }

        const agentSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (!SLUG_PATTERN.test(agentSlug)) {
            throw new BadRequestError(`Invalid slug format: ${agentSlug}. Must match ${SLUG_PATTERN}`);
        }

        const result = await query<AgentRow>(
            `INSERT INTO agent_registry (slug, user_id, agent_type)
             VALUES ($1, $2, 'private')
             ON CONFLICT (slug, user_id) DO NOTHING
             RETURNING *`,
            [agentSlug, userId],
        );

        if (result.rows.length === 0) {
            throw new BadRequestError(`Agent with slug "${agentSlug}" already exists`);
        }

        const row = result.rows[0];
        const mcpResult: McpToolResult = {
            success: true,
            data: {
                agent: {
                    id: row.id,
                    slug: row.slug,
                    name,
                    description,
                    model_id: model_id || 'claude-sonnet',
                    autonomy_level: autonomy_level || 'semi_autonomous',
                    agent_type: row.agent_type,
                    created_at: row.created_at,
                },
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/clone_agent
router.post('/clone_agent', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { source_agent_id, name } = req.body;
        const userId = req.sandbox!.userId;

        if (!source_agent_id) {
            throw new BadRequestError('source_agent_id is required');
        }
        if (!name || typeof name !== 'string') {
            throw new BadRequestError('name is required');
        }

        const sourceId = parseInt(String(source_agent_id), 10);
        if (isNaN(sourceId)) {
            throw new BadRequestError('source_agent_id must be a valid integer');
        }

        const sourceResult = await query<AgentRow>(
            `SELECT * FROM agent_registry WHERE id = $1`,
            [sourceId],
        );
        if (sourceResult.rows.length === 0) {
            throw new BadRequestError(`Source agent not found: ${source_agent_id}`);
        }

        const source = sourceResult.rows[0];
        const cloneSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (!SLUG_PATTERN.test(cloneSlug)) {
            throw new BadRequestError(`Invalid slug generated from name: ${cloneSlug}`);
        }

        const insertResult = await query<AgentRow>(
            `INSERT INTO agent_registry (slug, user_id, agent_type)
             VALUES ($1, $2, 'private')
             ON CONFLICT (slug, user_id) DO NOTHING
             RETURNING *`,
            [cloneSlug, userId],
        );

        if (insertResult.rows.length === 0) {
            throw new BadRequestError(`Agent with slug "${cloneSlug}" already exists`);
        }

        const row = insertResult.rows[0];
        const mcpResult: McpToolResult = {
            success: true,
            data: {
                agent: {
                    id: row.id,
                    slug: row.slug,
                    name,
                    agent_type: row.agent_type,
                    created_at: row.created_at,
                },
                cloned_from: source.slug,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/update_agent
router.post('/update_agent', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { agent_id } = req.body;
        const userId = req.sandbox!.userId;

        if (!agent_id) {
            throw new BadRequestError('agent_id is required');
        }

        const agentIdNum = parseInt(String(agent_id), 10);
        if (isNaN(agentIdNum)) {
            throw new BadRequestError('agent_id must be a valid integer');
        }

        const existing = await query<AgentRow>(
            `SELECT * FROM agent_registry WHERE id = $1 AND user_id = $2`,
            [agentIdNum, userId],
        );
        if (existing.rows.length === 0) {
            throw new BadRequestError(`Agent not found or access denied: ${agent_id}`);
        }

        const row = existing.rows[0];
        const mcpResult: McpToolResult = {
            success: true,
            data: {
                agent: {
                    id: row.id,
                    slug: row.slug,
                    agent_type: row.agent_type,
                    updated_at: new Date().toISOString(),
                },
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/delete_agent
router.post('/delete_agent', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { agent_id, agent_slug } = req.body;
        const userId = req.sandbox!.userId;

        if (!agent_id && !agent_slug) {
            throw new BadRequestError('agent_id or agent_slug is required');
        }

        let deleteQuery: string;
        let deleteParams: unknown[];
        let lookupQuery: string;
        let lookupParams: unknown[];

        if (agent_id) {
            const agentIdNum = parseInt(String(agent_id), 10);
            if (isNaN(agentIdNum)) {
                throw new BadRequestError('agent_id must be a valid integer');
            }
            lookupQuery = `SELECT * FROM agent_registry WHERE id = $1 AND user_id = $2`;
            lookupParams = [agentIdNum, userId];
            deleteQuery = `DELETE FROM agent_registry WHERE id = $1 AND user_id = $2 AND agent_type != 'system'`;
            deleteParams = [agentIdNum, userId];
        } else {
            lookupQuery = `SELECT * FROM agent_registry WHERE slug = $1 AND user_id = $2`;
            lookupParams = [agent_slug, userId];
            deleteQuery = `DELETE FROM agent_registry WHERE slug = $1 AND user_id = $2 AND agent_type != 'system'`;
            deleteParams = [agent_slug, userId];
        }

        const existing = await query<AgentRow>(lookupQuery, lookupParams);
        if (existing.rows.length === 0) {
            throw new BadRequestError('Agent not found or access denied');
        }

        const agent = existing.rows[0];
        if (agent.agent_type === 'system') {
            throw new BadRequestError('Cannot delete system agents');
        }

        await query(deleteQuery, deleteParams);

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                deleted: true,
                agent_slug: agent.slug,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

export { router as agentManagementRoutes };
