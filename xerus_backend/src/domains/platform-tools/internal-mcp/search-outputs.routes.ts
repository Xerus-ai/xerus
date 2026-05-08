// Search Outputs & List Domains Routes
// Handles search_outputs, list_domains MCP tools
// Queries workspace.db (SQLite) on sandbox via executeWorkspaceJsonQuery.

import { Router, Response, NextFunction } from 'express';
import { InternalMcpRequest, McpToolResult } from './types';
import { escapeSQL, executeWorkspaceJsonQuery } from '../../conversations/workspace-db.helpers';
import { requireRunningSandbox, getDaytonaProvider } from '../../sandbox-infra/sandbox/sandbox-route-helpers';
import type { SandboxService } from '../../sandbox-infra/sandbox/sandbox.service';

const MAX_RESULTS = 100;

// ---------------------------------------------------------------------------
// Dependencies (injected at startup)
// ---------------------------------------------------------------------------

let _sandboxService: SandboxService | null = null;

export function setSearchOutputsRoutesDeps(deps: { sandboxService: SandboxService }): void {
    _sandboxService = deps.sandboxService;
}

function getSandboxService(): SandboxService {
    if (!_sandboxService) {
        throw new Error('Search outputs routes dependencies not initialized');
    }
    return _sandboxService;
}

// ---------------------------------------------------------------------------
// workspace.db row types
// ---------------------------------------------------------------------------

interface AgentOutputRow {
    id: number;
    agent_slug: string;
    session_id: string | null;
    output_type: string;
    title: string;
    description: string | null;
    file_path: string | null;
    content_preview: string | null;
    created_at: string;
}

interface DomainRow {
    slug: string;
    name: string;
    description: string | null;
    created_at: string;
}

const router = Router();

// POST /mcp/search_outputs
router.post('/search_outputs', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { agent_id, output_type, date_from, date_to, limit } = req.body;
        const userId = req.sandbox!.userId;

        const resultLimit = Math.min(limit || 20, MAX_RESULTS);

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        let sql = `SELECT ao.id, ao.agent_slug, ao.session_id, ao.output_type, ao.title,
                          ao.description, ao.file_path, ao.content_preview, ao.created_at
                   FROM agent_outputs ao
                   WHERE 1=1`;

        if (agent_id) {
            sql += ` AND ao.agent_slug = '${escapeSQL(String(agent_id))}'`;
        }

        if (output_type) {
            sql += ` AND ao.output_type = '${escapeSQL(String(output_type))}'`;
        }

        if (date_from) {
            sql += ` AND ao.created_at >= '${escapeSQL(String(date_from))}'`;
        }

        if (date_to) {
            sql += ` AND ao.created_at <= '${escapeSQL(String(date_to))}'`;
        }

        sql += ` ORDER BY ao.created_at DESC LIMIT ${resultLimit}`;

        const rows = await executeWorkspaceJsonQuery<AgentOutputRow>(provider, sandboxId, sql);

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                outputs: rows.map(row => ({
                    id: row.id,
                    agent_slug: row.agent_slug,
                    session_id: row.session_id,
                    output_type: row.output_type,
                    title: row.title,
                    description: row.description,
                    file_path: row.file_path,
                    content_preview: row.content_preview,
                    created_at: row.created_at,
                })),
                total: rows.length,
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

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const sql = `SELECT slug, name, description, created_at
                     FROM domains
                     ORDER BY name ASC
                     LIMIT ${MAX_RESULTS}`;

        const rows = await executeWorkspaceJsonQuery<DomainRow>(provider, sandboxId, sql);

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                domains: rows.map(row => ({
                    slug: row.slug,
                    name: row.name,
                    description: row.description,
                    created_at: row.created_at,
                })),
                total: rows.length,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

export { router as searchOutputsRoutes };
