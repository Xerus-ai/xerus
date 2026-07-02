// Notification Routes
// Handles send_notification MCP tool
// Writes to workspace.db (SQLite) on sandbox, NOT Postgres (inbox_items was dropped by migration 084).

import { Router, Response, NextFunction } from 'express';
import { BadRequestError } from '../../../utils/errors';
import { InternalMcpRequest, McpToolResult } from './types';
import { escapeSQL, executeWorkspaceJsonQuery } from '../../conversations/workspace-db.helpers';
import { requireRunningSandbox, getDaytonaProvider } from '../../sandbox-infra/sandbox/sandbox-route-helpers';
import type { SandboxService } from '../../sandbox-infra/sandbox/sandbox.service';

const router = Router();

const XERUS_MASTER_SLUG = 'xerus-master';

let _sandboxService: SandboxService | null = null;

export function setNotificationRoutesDeps(deps: { sandboxService: SandboxService }): void {
    _sandboxService = deps.sandboxService;
}

function getSandboxService(): SandboxService {
    if (!_sandboxService) {
        throw new Error('Notification routes dependencies not initialized');
    }
    return _sandboxService;
}

// POST /api/v1/internal/mcp/send_notification
router.post('/send_notification', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { message, priority, agent_slug } = req.body;
        const userId = req.sandbox!.userId;

        if (!message) {
            throw new BadRequestError('message is required');
        }

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const senderSlug = agent_slug || 'system';
        const prio = priority || 'medium';
        const subject = message.length > 80 ? message.slice(0, 77) + '...' : message;
        const now = new Date().toISOString();
        const metadata = JSON.stringify({ notification_type: 'agent_notification', priority: prio });

        const sql = `
            INSERT INTO inbox_items (agent_slug, sender_slug, message_type, subject, content, metadata, priority, status, received_at)
            VALUES ('${escapeSQL(XERUS_MASTER_SLUG)}', '${escapeSQL(senderSlug)}', 'notification', '${escapeSQL(subject)}', '${escapeSQL(message)}', '${escapeSQL(metadata)}', '${escapeSQL(prio)}', 'unread', '${now}');
            SELECT id FROM inbox_items WHERE id = last_insert_rowid();
        `;

        const rows = await executeWorkspaceJsonQuery<{ id: number }>(provider, sandboxId, sql);

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                notification_id: rows[0]?.id ? String(rows[0].id) : undefined,
                message,
                priority: prio,
                agent_slug: senderSlug,
                delivered_at: now,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

export { router as notificationRoutes };
