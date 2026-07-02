// Tool Connection Routes
// Handles connect_tool and search_tools MCP tools

import { Router, Response, NextFunction } from 'express';
// TECH DEBT: Cross-domain import. Should use interface injection.
// See: docs/planning/execution/sqlite-neon-sync.md#cross-domain-dependencies
import { toolsService } from '../../tools/service';
import { resolvePipedreamWebhookUrl } from '../../tools/pipedream-webhook';
import { BadRequestError } from '../../../utils/errors';
import { InternalMcpRequest, McpToolResult } from './types';

const router = Router();

// POST /api/v1/internal/mcp/connect_tool
router.post('/connect_tool', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { tool_slug, agent_slug } = req.body;
        const userId = req.sandbox!.userId;

        if (!tool_slug) {
            throw new BadRequestError('tool_slug is required');
        }

        // Start OAuth connection flow via Pipedream Connect.
        // Pass the SAME webhook_url the user-initiated flow uses so agent-initiated
        // OAuth completions reach the (signature-verified) webhook and persist.
        const connectionResult = await toolsService.startConnection({
            user_id: userId,
            allowed_origins: process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) ?? [],
            webhook_url: resolvePipedreamWebhookUrl(),
        });

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                connect_url: connectionResult.connect_url,
                expires_at: connectionResult.expires_at,
                tool_slug,
                agent_slug,
                instructions: `Open this URL to connect ${tool_slug}: ${connectionResult.connect_url}`,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /api/v1/internal/mcp/search_tools
router.post('/search_tools', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { query: searchQuery, category } = req.body;
        const userId = req.sandbox?.userId || (req.body.user_id as string | undefined);

        if (!searchQuery) {
            throw new BadRequestError('query is required');
        }

        // Search available tool integrations from Pipedream DB
        const result = await toolsService.listAppsFromDB({
            search: searchQuery,
            categories: category ? [category] : undefined,
            limit: 20,
        });

        // Enrich with connection state so the agent knows which tools are usable
        const connectedSlugs = new Set<string>();
        if (userId) {
            const accounts = await toolsService.getConnectedAccounts({ user_id: userId });
            for (const acct of accounts) {
                connectedSlugs.add(acct.app_slug);
            }
        }

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                tools: result.apps.map(app => ({
                    slug: app.name_slug,
                    name: app.name,
                    description: app.description,
                    categories: app.categories,
                    logo_url: app.img_src,
                    is_connected: connectedSlugs.has(app.name_slug),
                })),
                total_count: result.pagination.total,
                connected_count: connectedSlugs.size,
                query: searchQuery,
                category,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

export { router as toolConnectionRoutes };
