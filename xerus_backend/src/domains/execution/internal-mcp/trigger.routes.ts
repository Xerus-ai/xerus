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

const router = Router();

// POST /api/v1/internal/mcp/register_trigger
router.post('/register_trigger', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { agent_slug, trigger_type, config } = req.body;
        const userId = req.sandbox!.userId;

        if (!agent_slug) {
            throw new BadRequestError('agent_slug is required');
        }
        if (!trigger_type) {
            throw new BadRequestError('trigger_type is required');
        }

        // Look up agent_id from slug
        const agentResult = await query<{ id: number }>(
            `SELECT id FROM agent_registry WHERE slug = $1 AND user_id = $2`,
            [agent_slug, userId]
        );

        if (agentResult.rows.length === 0) {
            throw new BadRequestError(`Agent not found: ${agent_slug}`);
        }

        const agentId = agentResult.rows[0].id;

        // Parse trigger_type into app_slug and event_type
        // Expected format: "app.event" e.g., "slack.new_message"
        const [appSlug, eventType] = trigger_type.includes('.')
            ? trigger_type.split('.', 2)
            : [trigger_type, 'default'];

        const triggerService = getTriggerService();
        const result = await triggerService.registerTrigger(userId, {
            agentId: String(agentId),
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

export { router as triggerRoutes };
