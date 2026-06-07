// Internal MCP Routes
// Backend API endpoints called by mcp-server.ts from sandbox
// These routes handle 38 backend-coupled tools that require platform state
//
// Existing tools (18):
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
// 11. write_memory             - Memory write with embeddings (needs Neon DB)
// 12. analyze_memory_patterns  - Memory analytics (needs pgvector)
// 13. list_triggers            - List registered webhooks (needs backend DB)
// 14. get_status               - Agent/sandbox status (needs backend DB)
// 15-18. schedule CRUD         - Workspace scheduler management
// 19. get_billing_status       - Billing info (needs backend DB)
//
// Agent management (6):
// 20. search_agents            - Query agent registry
// 21. list_agents              - List all user agents
// 22. create_agent             - Register new agent
// 23. clone_agent              - Clone existing agent
// 24. update_agent             - Update agent registry
// 25. delete_agent             - Delete agent from registry
//
// Knowledge base (3):
// 26. search_kb                - Search KB documents
// 27. upload_kb                - Upload KB document
// 28. assign_kb                - Assign KB to agent
//
// Channels & tasks (3):
// 29. create_channel           - Create inbox channel
// 30. add_to_channel           - Add agent to channel
// 31. create_task              - Create task in channel
//
// Skills & execution (5):
// 32. search_skills            - Search skills
// 33. create_skill             - Create new skill
// 34. install_skill            - Install skill on agent
// 35. uninstall_skill          - Remove skill from agent
// 36. cancel_execution         - Cancel running session
//
// Outputs & domains (2):
// 37. search_outputs           - Search execution outputs
// 38. list_domains             - List workspace domains

import { Router, Request, Response, NextFunction } from 'express';
import { authenticateInternalMcp } from './middleware';
import { sessionControlRoutes } from './session-control.routes';
import { triggerRoutes } from './trigger.routes';
import { notificationRoutes } from './notification.routes';
import { toolConnectionRoutes } from './tool-connection.routes';
import { memoryRoutes } from './memory.routes';
import { scheduleRoutes } from './schedule.routes';
import { billingRoutes } from './billing.routes';
import { agentManagementRoutes } from './agent-management.routes';
import { knowledgeBaseRoutes } from './knowledge-base.routes';
import { channelTaskRoutes } from './channel-task.routes';
import { skillManagementRoutes } from './skill-management.routes';
import { searchOutputsRoutes } from './search-outputs.routes';
import { McpToolResult } from './types';
import { logger } from '../../../utils/logger';

const log = logger('InternalMCP');

const router = Router();

// Apply internal auth to all routes
router.use(authenticateInternalMcp);

// Mount route modules — existing
router.use(sessionControlRoutes);
router.use(triggerRoutes);
router.use(notificationRoutes);
router.use(toolConnectionRoutes);
router.use(memoryRoutes);
router.use(scheduleRoutes);
router.use(billingRoutes);

// Mount route modules — ghost tools (Task 2.1)
router.use(agentManagementRoutes);
router.use(knowledgeBaseRoutes);
router.use(channelTaskRoutes);
router.use(skillManagementRoutes);
router.use(searchOutputsRoutes);

// Error Handler — returns structured errors that LLMs can interpret and act on
router.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
    log.error('Internal MCP request failed', error);

    const statusCode = (error as { statusCode?: number }).statusCode || 500;
    const toolName = req.path.replace(/^\//, '').replace(/\//g, '_') || 'unknown';

    const mcpResult: McpToolResult = {
        success: false,
        error: formatMcpError(toolName, statusCode, error),
    };

    res.status(statusCode).json(mcpResult);
});

function formatMcpError(toolName: string, statusCode: number, error: Error): string {
    const category = statusCode >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR';
    const hint = statusCode === 400
        ? 'Check the parameter values and try again with corrected input.'
        : statusCode === 404
            ? 'The requested resource does not exist. Verify the identifier.'
            : statusCode === 409
                ? 'A conflicting resource already exists. Use a different name/slug.'
                : 'An unexpected error occurred. Retry or try a different approach.';

    return `[${category}] Tool "${toolName}" failed (HTTP ${statusCode}): ${error.message}. ${hint}`;
}

export { router as internalMcpRouter };

// Re-export types for consumers
export type { InternalMcpRequest, McpToolResult } from './types';
