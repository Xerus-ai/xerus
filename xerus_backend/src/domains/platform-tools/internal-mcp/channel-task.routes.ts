// Channel & Task Routes
// Handles create_channel, add_to_channel, create_task MCP tools

import { Router, Response, NextFunction } from 'express';
import { query } from '../../../database/connection';
import { BadRequestError } from '../../../utils/errors';
import { InternalMcpRequest, McpToolResult } from './types';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const router = Router();

// POST /mcp/create_channel
router.post('/create_channel', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { name, project_id, description, agent_ids } = req.body;
        const userId = req.sandbox!.userId;

        if (!name || typeof name !== 'string') {
            throw new BadRequestError('name is required');
        }

        const channelSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (!SLUG_PATTERN.test(channelSlug)) {
            throw new BadRequestError(`Invalid channel name: ${name}. Slug must match ${SLUG_PATTERN}`);
        }

        const workspaceResult = await query<{ id: string }>(
            `SELECT id FROM workspaces WHERE user_id = $1 LIMIT 1`,
            [userId],
        );
        if (workspaceResult.rows.length === 0) {
            throw new BadRequestError('Workspace not found');
        }

        const channelId = `ch-${Date.now()}`;

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                channel: {
                    id: channelId,
                    slug: channelSlug,
                    name,
                    description: description || '',
                    project_id: project_id || null,
                    workspace_id: workspaceResult.rows[0].id,
                    agent_ids: agent_ids || [],
                    created_at: new Date().toISOString(),
                },
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/add_to_channel
router.post('/add_to_channel', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { channel_id, agent_id, role } = req.body;
        const userId = req.sandbox!.userId;

        if (!channel_id || typeof channel_id !== 'string') {
            throw new BadRequestError('channel_id is required');
        }
        if (!agent_id) {
            throw new BadRequestError('agent_id is required');
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
                added: true,
                channel_id,
                agent_id: agentResult.rows[0].id,
                agent_slug: agentResult.rows[0].slug,
                role: role || 'member',
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/create_task
router.post('/create_task', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { channel_id, title, description, assigned_agent_ids, priority, subtasks } = req.body;
        const userId = req.sandbox!.userId;

        if (!channel_id || typeof channel_id !== 'string') {
            throw new BadRequestError('channel_id is required');
        }
        if (!title || typeof title !== 'string') {
            throw new BadRequestError('title is required');
        }

        const validPriorities = ['low', 'medium', 'high', 'critical'];
        if (priority && !validPriorities.includes(priority)) {
            throw new BadRequestError(`Invalid priority: ${priority}. Must be one of: ${validPriorities.join(', ')}`);
        }

        const taskId = `task-${Date.now()}`;

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                task: {
                    id: taskId,
                    channel_id,
                    title,
                    description: description || '',
                    assigned_agent_ids: assigned_agent_ids || [],
                    priority: priority || 'medium',
                    subtasks: subtasks || [],
                    status: 'open',
                    created_by: userId,
                    created_at: new Date().toISOString(),
                },
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

export { router as channelTaskRoutes };
