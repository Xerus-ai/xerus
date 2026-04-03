// Notification Routes
// Handles send_notification MCP tool

import { Router, Response, NextFunction } from 'express';
import { query } from '../../../database/connection';
import { BadRequestError } from '../../../utils/errors';
import { InternalMcpRequest, McpToolResult } from './types';

const router = Router();

// POST /api/v1/internal/mcp/send_notification
router.post('/send_notification', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { message, priority, agent_slug } = req.body;
        const userId = req.sandbox!.userId;

        if (!message) {
            throw new BadRequestError('message is required');
        }

        // Store notification in inbox
        const notificationResult = await query<{ id: string }>(
            `INSERT INTO inbox_items (user_id, agent_slug, message, priority, notification_type, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             RETURNING id`,
            [userId, agent_slug || 'system', message, priority || 'medium', 'agent_notification']
        );

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                notification_id: notificationResult.rows[0]?.id,
                message,
                priority: priority || 'medium',
                agent_slug: agent_slug || 'system',
                delivered_at: new Date().toISOString(),
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

export { router as notificationRoutes };
