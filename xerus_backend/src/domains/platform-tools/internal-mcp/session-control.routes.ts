// Session Control Routes
// Handles pause, resume, get_state, and complete_session MCP tools

import { Router, Response, NextFunction } from 'express';
import { getSessionControlService } from '../platform/tools/session-control.tools';
import { query } from '../../../database/connection';
import { BadRequestError } from '../../../utils/errors';
import { InternalMcpRequest, McpToolResult } from './types';

const router = Router();

// POST /api/v1/internal/mcp/pause_execution
router.post('/pause_execution', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { session_id, reason, question } = req.body;
        const userId = req.sandbox!.userId;

        if (!session_id) {
            throw new BadRequestError('session_id is required');
        }

        const sessionControl = getSessionControlService();
        const result = await sessionControl.pauseExecution(userId, {
            sessionId: session_id,
            reason: reason || 'manual',
            checkpoint: question ? { question } : undefined,
        });

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                session_id: result.sessionId,
                pause_id: result.pauseId,
                paused_at: result.pausedAt,
                reason: result.reason,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /api/v1/internal/mcp/resume_execution
router.post('/resume_execution', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { session_id, approved, feedback } = req.body;
        const userId = req.sandbox!.userId;

        if (!session_id) {
            throw new BadRequestError('session_id is required');
        }
        if (typeof approved !== 'boolean') {
            throw new BadRequestError('approved must be a boolean');
        }

        const sessionControl = getSessionControlService();
        const result = await sessionControl.resumeExecution(userId, {
            sessionId: session_id,
            approved,
            feedback,
        });

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                session_id: result.sessionId,
                pause_id: result.pauseId,
                resolution: result.resolution,
                resumed_at: result.resumedAt,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /api/v1/internal/mcp/get_session_state
router.post('/get_session_state', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { session_id } = req.body;
        const userId = req.sandbox!.userId;

        if (!session_id) {
            throw new BadRequestError('session_id is required');
        }

        const sessionControl = getSessionControlService();
        const result = await sessionControl.getSessionState(userId, {
            sessionId: session_id,
            includeCheckpoint: true,
        });

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                session_id: result.sessionId,
                status: result.status,
                agent_id: result.agentId,
                trigger_type: result.triggerType,
                started_at: result.startedAt,
                completed_at: result.completedAt,
                input_tokens: result.inputTokens,
                output_tokens: result.outputTokens,
                credits_used: result.creditsUsed,
                pending_approval: result.pendingApproval,
                checkpoint: result.checkpoint,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /api/v1/internal/mcp/complete_session
router.post('/complete_session', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { summary } = req.body;
        const userId = req.sandbox!.userId;

        // session_id is optional per MCP schema - completeSession finds active session
        const sessionControl = getSessionControlService();
        const result = await sessionControl.completeSession(userId, {
            reason: summary,
            status: 'success',
            summary,
        });

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                acknowledged: result.acknowledged,
                session_id: result.session_id,
                completed_at: result.completed_at,
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /api/v1/internal/mcp/get_status
router.post('/get_status', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { include_agents, include_sandbox } = req.body;
        const userId = req.sandbox!.userId;

        const statusData: Record<string, unknown> = {
            platform: 'xerus',
            timestamp: new Date().toISOString(),
        };

        if (include_agents !== false) {
            const agentResult = await query<{ slug: string; status: string; adapter_type: string }>(
                `SELECT slug, status, adapter_type FROM agent_registry WHERE user_id = $1 ORDER BY slug`,
                [userId]
            );
            statusData.agents = agentResult.rows;
        }

        if (include_sandbox !== false) {
            const sandboxResult = await query<{ sandbox_id: string; sandbox_status: string }>(
                `SELECT sandbox_id, sandbox_status FROM workspaces WHERE user_id = $1 LIMIT 1`,
                [userId]
            );
            statusData.sandbox = sandboxResult.rows[0] || null;
        }

        const mcpResult: McpToolResult = {
            success: true,
            data: statusData,
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

export { router as sessionControlRoutes };
