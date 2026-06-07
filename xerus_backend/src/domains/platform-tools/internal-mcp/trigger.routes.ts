// Trigger Management Routes
// Handles register_trigger and deregister_trigger MCP tools

import { Router, Response, NextFunction } from 'express';
import { getTriggerService } from '../platform/tools/trigger.tools';
import { query } from '../../../database/connection';
import { BadRequestError } from '../../../utils/errors';
import { InternalMcpRequest, McpToolResult } from './types';

/**
 * Parse and validate integer input (fail-fast with NaN guard).
 */
function requireInt(value: string, name: string): number {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
        throw new BadRequestError(`${name} must be a valid integer`);
    }
    return parsed;
}

/**
 * Parse and validate non-empty string input.
 */
function requireString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new BadRequestError(`${name} must be a non-empty string`);
    }
    return value;
}

const router = Router();

// POST /api/v1/internal/mcp/register_trigger
router.post('/register_trigger', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { agent_slug, trigger_type, config } = req.body;
        const userId = req.sandbox!.userId;

        requireString(agent_slug, 'agent_slug');
        if (!trigger_type) {
            throw new BadRequestError('trigger_type is required');
        }

        // Parse trigger_type into app_slug and event_type
        // Expected format: "app.event" e.g., "slack.new_message"
        const [appSlug, eventType] = trigger_type.includes('.')
            ? trigger_type.split('.', 2)
            : [trigger_type, 'default'];

        const triggerService = getTriggerService();
        const result = await triggerService.registerTrigger(userId, {
            agentId: agent_slug,
            appSlug,
            eventType,
            filterConfig: config || {},
        });

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                trigger_id: result.trigger.id,
                webhook_url: result.webhookUrl,
                agent_slug,
                trigger_type,
                enabled: result.trigger.enabled,
                created_at: result.trigger.createdAt,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /api/v1/internal/mcp/deregister_trigger
router.post('/deregister_trigger', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { trigger_id } = req.body;
        const userId = req.sandbox!.userId;

        if (!trigger_id) {
            throw new BadRequestError('trigger_id is required');
        }

        const triggerService = getTriggerService();
        const result = await triggerService.deregisterTrigger(userId, {
            triggerId: requireInt(trigger_id, 'trigger_id'),
        });

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                trigger_id: result.triggerId,
                deregistered_at: result.deregisteredAt,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /api/v1/internal/mcp/list_triggers
router.post('/list_triggers', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { agent_slug } = req.body;
        const userId = req.sandbox!.userId;

        const triggerService = getTriggerService();

        if (agent_slug) {
            const listResult = await triggerService.listTriggers(userId, {
                agentId: agent_slug,
            });

            const mcpResult: McpToolResult = {
                success: true,
                data: {
                    triggers: listResult.triggers.map(t => ({
                        trigger_id: t.id,
                        agent_slug: t.agentId,
                        app_slug: t.appSlug,
                        event_type: t.eventType,
                        enabled: t.enabled,
                        webhook_url: t.webhookUrl,
                        created_at: t.createdAt,
                    })),
                    total: listResult.totalCount,
                },
            };

            res.json(mcpResult);
            return;
        }

        // No agent_slug filter: list all triggers for the user
        const result = await query<{
            id: number; agent_slug: string; app_slug: string;
            event_type: string; enabled: boolean; webhook_url: string; created_at: Date;
        }>(
            `SELECT id, agent_slug, app_slug, event_type, enabled, webhook_url, created_at
             FROM agent_triggers WHERE user_id = $1 ORDER BY created_at DESC`,
            [userId]
        );

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                triggers: result.rows.map(row => ({
                    trigger_id: row.id,
                    agent_slug: row.agent_slug,
                    app_slug: row.app_slug,
                    event_type: row.event_type,
                    enabled: row.enabled,
                    webhook_url: row.webhook_url,
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

export { router as triggerRoutes };
