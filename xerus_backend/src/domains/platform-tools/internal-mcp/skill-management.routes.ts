// Skill Management Routes
// Handles search_skills, create_skill, install_skill, uninstall_skill, cancel_execution

import { Router, Response, NextFunction } from 'express';
import { query } from '../../../database/connection';
import { BadRequestError } from '../../../utils/errors';
import { InternalMcpRequest, McpToolResult } from './types';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const router = Router();

// POST /mcp/search_skills
router.post('/search_skills', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { query: searchQuery, scope } = req.body;
        const userId = req.sandbox!.userId;

        if (!searchQuery || typeof searchQuery !== 'string') {
            throw new BadRequestError('query is required');
        }

        const workspaceResult = await query<{ id: string }>(
            `SELECT id FROM workspaces WHERE user_id = $1 LIMIT 1`,
            [userId],
        );

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                skills: [],
                total: 0,
                search_query: searchQuery,
                scope: scope || 'all',
                workspace_id: workspaceResult.rows[0]?.id || null,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/create_skill
router.post('/create_skill', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { name, description, instructions, agent_id, category } = req.body;
        const userId = req.sandbox!.userId;

        if (!name || typeof name !== 'string') {
            throw new BadRequestError('name is required');
        }
        if (!description || typeof description !== 'string') {
            throw new BadRequestError('description is required');
        }
        if (!instructions || typeof instructions !== 'string') {
            throw new BadRequestError('instructions is required');
        }

        const skillSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (!SLUG_PATTERN.test(skillSlug)) {
            throw new BadRequestError(`Invalid skill name: ${name}. Slug must match ${SLUG_PATTERN}`);
        }

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                skill: {
                    slug: skillSlug,
                    name,
                    description,
                    category: category || 'custom',
                    agent_id: agent_id || null,
                    user_id: userId,
                    path: `.claude/skills/${skillSlug}/SKILL.md`,
                    created_at: new Date().toISOString(),
                },
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/install_skill
router.post('/install_skill', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { skill_slug, agent_id } = req.body;
        const userId = req.sandbox!.userId;

        if (!skill_slug || typeof skill_slug !== 'string') {
            throw new BadRequestError('skill_slug is required');
        }
        if (!SLUG_PATTERN.test(skill_slug)) {
            throw new BadRequestError(`Invalid skill_slug format: ${skill_slug}`);
        }

        if (agent_id) {
            const agentIdNum = parseInt(String(agent_id), 10);
            if (isNaN(agentIdNum)) {
                throw new BadRequestError('agent_id must be a valid integer');
            }

            const agentResult = await query<{ id: number }>(
                `SELECT id FROM agent_registry WHERE id = $1 AND (user_id = $2 OR agent_type = 'system')`,
                [agentIdNum, userId],
            );
            if (agentResult.rows.length === 0) {
                throw new BadRequestError(`Agent not found: ${agent_id}`);
            }
        }

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                installed: true,
                skill_slug,
                agent_id: agent_id || null,
                user_id: userId,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/uninstall_skill
router.post('/uninstall_skill', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { skill_slug, agent_id } = req.body;
        const userId = req.sandbox!.userId;

        if (!skill_slug || typeof skill_slug !== 'string') {
            throw new BadRequestError('skill_slug is required');
        }
        if (!SLUG_PATTERN.test(skill_slug)) {
            throw new BadRequestError(`Invalid skill_slug format: ${skill_slug}`);
        }

        if (agent_id) {
            const agentIdNum = parseInt(String(agent_id), 10);
            if (isNaN(agentIdNum)) {
                throw new BadRequestError('agent_id must be a valid integer');
            }

            const agentResult = await query<{ id: number }>(
                `SELECT id FROM agent_registry WHERE id = $1 AND (user_id = $2 OR agent_type = 'system')`,
                [agentIdNum, userId],
            );
            if (agentResult.rows.length === 0) {
                throw new BadRequestError(`Agent not found: ${agent_id}`);
            }
        }

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                uninstalled: true,
                skill_slug,
                agent_id: agent_id || null,
                user_id: userId,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/cancel_execution
router.post('/cancel_execution', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { session_id } = req.body;
        const userId = req.sandbox!.userId;

        if (!session_id || typeof session_id !== 'string') {
            throw new BadRequestError('session_id is required');
        }

        const sessionResult = await query<{ id: string; status: string }>(
            `SELECT es.id, es.status
             FROM execution_sessions es
             JOIN user_workspaces uw ON es.workspace_id = uw.id
             WHERE es.id = $1::uuid AND uw.user_id = $2`,
            [session_id, userId],
        );
        if (sessionResult.rows.length === 0) {
            throw new BadRequestError(`Session not found: ${session_id}`);
        }

        const session = sessionResult.rows[0];
        if (session.status === 'completed' || session.status === 'cancelled' || session.status === 'failed') {
            throw new BadRequestError(`Session already in terminal state: ${session.status}`);
        }

        await query(
            `UPDATE execution_sessions SET status = 'cancelled', completed_at = NOW() WHERE id = $1::uuid`,
            [session_id],
        );

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                cancelled: true,
                session_id,
                cancelled_at: new Date().toISOString(),
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

export { router as skillManagementRoutes };
