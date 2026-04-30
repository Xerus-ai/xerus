// Internal MCP Routes
// Backend API endpoints called by mcp-server.ts from sandbox
// These routes handle the 14 backend-coupled tools that require platform state
//
// Tools:
//  1. pause_execution          - Session control (needs backend state machine)
//  2. resume_execution         - HITL approval (needs backend state)
//  3. get_session_state        - Distributed state query (needs backend DB)
//  4. complete_session         - Termination signal (needs backend cleanup)
//  5. connect_tool             - OAuth flow (needs Pipedream integration)
//  6. register_trigger         - Webhook provisioning (needs backend registration)
//  7. deregister_trigger       - Webhook cleanup (needs backend)
//  8. send_notification        - User notification (needs backend push)
//  9. search_tools             - Query connected accounts (needs Pipedream DB)
// 10. query_memory             - pgvector semantic search (needs Neon DB)
// 11. analyze_memory_patterns  - Memory analytics (needs pgvector)
// 12. list_triggers            - List registered webhooks (needs backend DB)
// 13. get_status               - Agent/sandbox status (needs backend DB)
// 14. get_billing_status       - Billing info (needs backend DB)

import { Router, Request, Response, NextFunction } from 'express';
import { authenticateInternalMcp } from './middleware';
import { sessionControlRoutes } from './session-control.routes';
import { triggerRoutes } from './trigger.routes';
import { notificationRoutes } from './notification.routes';
import { toolConnectionRoutes } from './tool-connection.routes';
import { memoryRoutes } from './memory.routes';
import { scheduleRoutes } from './schedule.routes';
import { billingRoutes } from './billing.routes';
import { McpToolResult } from './types';
import { logger } from '../../../utils/logger';

const log = logger('InternalMCP');

const router = Router();

// Apply internal auth to all routes
router.use(authenticateInternalMcp);

// Mount route modules
router.use(sessionControlRoutes);
router.use(triggerRoutes);
router.use(notificationRoutes);
router.use(toolConnectionRoutes);
router.use(memoryRoutes);
router.use(scheduleRoutes);
router.use(billingRoutes);

// Error Handler
router.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    log.error('Internal MCP request failed', error);

    const mcpResult: McpToolResult = {
        success: false,
        error: error.message,
    };

    const statusCode = (error as { statusCode?: number }).statusCode || 500;
    res.status(statusCode).json(mcpResult);
});

export { router as internalMcpRouter };

// Re-export types for consumers
export type { InternalMcpRequest, McpToolResult } from './types';
