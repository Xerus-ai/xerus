// Agent Management Routes
// Handles search_agents, clone_agent, create_agent, update_agent, delete_agent, list_agents
// Queries workspace.db (SQLite) on sandbox via executeWorkspaceJsonQuery.

import { Router, Response, NextFunction } from 'express';
import { BadRequestError } from '../../../utils/errors';
import { InternalMcpRequest, McpToolResult } from './types';
import { escapeSQL, executeWorkspaceJsonQuery, executeWorkspaceQuery } from '../../conversations/workspace-db.helpers';
import { requireRunningSandbox, getDaytonaProvider } from '../../sandbox-infra/sandbox/sandbox-route-helpers';
import type { SandboxService } from '../../sandbox-infra/sandbox/sandbox.service';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_RESULTS = 100;

// ---------------------------------------------------------------------------
// Dependencies (injected at startup)
// ---------------------------------------------------------------------------

let _sandboxService: SandboxService | null = null;

export function setAgentManagementRoutesDeps(deps: { sandboxService: SandboxService }): void {
    _sandboxService = deps.sandboxService;
}

function getSandboxService(): SandboxService {
    if (!_sandboxService) {
        throw new Error('Agent management routes dependencies not initialized');
    }
    return _sandboxService;
}

// ---------------------------------------------------------------------------
// workspace.db row types
// ---------------------------------------------------------------------------

interface WorkspaceAgentRow {
    slug: string;
    name: string;
    adapter_type: string;
    role: string | null;
    autonomy_level: string;
    status: string;
    config: string | null;
    marketplace_ref: string | null;
    installed_at: string;
    updated_at: string;
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

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const escaped = escapeSQL(searchQuery);

        let sql: string;
        if (scope === 'mine') {
            // In workspace.db all agents belong to the workspace owner
            sql = `SELECT slug, name, adapter_type, role, autonomy_level, status, installed_at
                   FROM agents
                   WHERE slug LIKE '%${escaped}%' OR name LIKE '%${escaped}%'
                   ORDER BY slug
                   LIMIT ${MAX_RESULTS}`;
        } else {
            // Same query — workspace.db is per-user, so all agents are accessible
            sql = `SELECT slug, name, adapter_type, role, autonomy_level, status, installed_at
                   FROM agents
                   WHERE slug LIKE '%${escaped}%' OR name LIKE '%${escaped}%'
                   ORDER BY slug
                   LIMIT ${MAX_RESULTS}`;
        }

        const rows = await executeWorkspaceJsonQuery<WorkspaceAgentRow>(provider, sandboxId, sql);

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                agents: rows.map(row => ({
                    slug: row.slug,
                    name: row.name,
                    adapter_type: row.adapter_type,
                    role: row.role,
                    autonomy_level: row.autonomy_level,
                    status: row.status,
                    installed_at: row.installed_at,
                })),
                total: rows.length,
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

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const sql = `SELECT slug, name, adapter_type, role, autonomy_level, status, installed_at
                     FROM agents
                     ORDER BY status ASC, slug ASC
                     LIMIT ${MAX_RESULTS}`;

        const rows = await executeWorkspaceJsonQuery<WorkspaceAgentRow>(provider, sandboxId, sql);

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                agents: rows.map(row => ({
                    slug: row.slug,
                    name: row.name,
                    adapter_type: row.adapter_type,
                    role: row.role,
                    autonomy_level: row.autonomy_level,
                    status: row.status,
                    installed_at: row.installed_at,
                })),
                total: rows.length,
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

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const autonomy = autonomy_level || 'supervised';
        const model = model_id || 'claude-sonnet';
        const configJson = escapeSQL(JSON.stringify({ model, system_prompt, description }));

        const sql = `
            INSERT INTO agents (slug, name, adapter_type, role, autonomy_level, status, config)
            VALUES ('${escapeSQL(agentSlug)}', '${escapeSQL(name)}', 'claudecode', NULL, '${escapeSQL(autonomy)}', 'idle', '${configJson}');
            SELECT slug, name, adapter_type, role, autonomy_level, status, config, installed_at, updated_at
            FROM agents WHERE slug = '${escapeSQL(agentSlug)}';
        `;

        const rows = await executeWorkspaceJsonQuery<WorkspaceAgentRow>(provider, sandboxId, sql);

        if (rows.length === 0) {
            throw new BadRequestError(`Agent with slug "${agentSlug}" already exists`);
        }

        const row = rows[0];
        const mcpResult: McpToolResult = {
            success: true,
            data: {
                agent: {
                    slug: row.slug,
                    name: row.name,
                    description,
                    model_id: model,
                    autonomy_level: row.autonomy_level,
                    status: row.status,
                    installed_at: row.installed_at,
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

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        // source_agent_id is treated as a slug in workspace.db (agents table uses slug as PK)
        const sourceSlug = escapeSQL(String(source_agent_id));
        const sourceRows = await executeWorkspaceJsonQuery<WorkspaceAgentRow>(
            provider, sandboxId,
            `SELECT slug, name, adapter_type, role, autonomy_level, config FROM agents WHERE slug = '${sourceSlug}'`,
        );

        if (sourceRows.length === 0) {
            throw new BadRequestError(`Source agent not found: ${source_agent_id}`);
        }

        const source = sourceRows[0];
        const cloneSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (!SLUG_PATTERN.test(cloneSlug)) {
            throw new BadRequestError(`Invalid slug generated from name: ${cloneSlug}`);
        }

        const configValue = source.config ? `'${escapeSQL(source.config)}'` : 'NULL';
        const roleValue = source.role ? `'${escapeSQL(source.role)}'` : 'NULL';

        const sql = `
            INSERT INTO agents (slug, name, adapter_type, role, autonomy_level, status, config, marketplace_ref)
            VALUES ('${escapeSQL(cloneSlug)}', '${escapeSQL(name)}', '${escapeSQL(source.adapter_type)}', ${roleValue}, '${escapeSQL(source.autonomy_level)}', 'idle', ${configValue}, NULL);
            SELECT slug, name, adapter_type, role, autonomy_level, status, installed_at
            FROM agents WHERE slug = '${escapeSQL(cloneSlug)}';
        `;

        const rows = await executeWorkspaceJsonQuery<WorkspaceAgentRow>(provider, sandboxId, sql);

        if (rows.length === 0) {
            throw new BadRequestError(`Agent with slug "${cloneSlug}" already exists`);
        }

        const row = rows[0];
        const mcpResult: McpToolResult = {
            success: true,
            data: {
                agent: {
                    slug: row.slug,
                    name: row.name,
                    adapter_type: row.adapter_type,
                    autonomy_level: row.autonomy_level,
                    installed_at: row.installed_at,
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

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        // agent_id is treated as slug in workspace.db
        const agentSlug = escapeSQL(String(agent_id));

        const existing = await executeWorkspaceJsonQuery<WorkspaceAgentRow>(
            provider, sandboxId,
            `SELECT slug, name, adapter_type, role, autonomy_level, status FROM agents WHERE slug = '${agentSlug}'`,
        );

        if (existing.length === 0) {
            throw new BadRequestError(`Agent not found or access denied: ${agent_id}`);
        }

        const now = new Date().toISOString();
        await executeWorkspaceQuery(
            provider, sandboxId,
            `UPDATE agents SET updated_at = '${now}' WHERE slug = '${agentSlug}'`,
        );

        const row = existing[0];
        const mcpResult: McpToolResult = {
            success: true,
            data: {
                agent: {
                    slug: row.slug,
                    name: row.name,
                    adapter_type: row.adapter_type,
                    updated_at: now,
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

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        // In workspace.db, agents are identified by slug
        const slug = agent_slug || String(agent_id);
        const escapedSlug = escapeSQL(slug);

        const existing = await executeWorkspaceJsonQuery<WorkspaceAgentRow>(
            provider, sandboxId,
            `SELECT slug, name, status FROM agents WHERE slug = '${escapedSlug}'`,
        );

        if (existing.length === 0) {
            throw new BadRequestError('Agent not found or access denied');
        }

        // workspace.db agents table has ON DELETE CASCADE for related tables
        await executeWorkspaceQuery(
            provider, sandboxId,
            `DELETE FROM agents WHERE slug = '${escapedSlug}'`,
        );

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                deleted: true,
                agent_slug: existing[0].slug,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

export { router as agentManagementRoutes };
