// Schedule Management Routes
// CRUD for workspace.db schedules table (sandbox-local SQLite via sqlite3 CLI)
// The 9to5 scheduler daemon polls this table every 30s.

import { Router, Response, NextFunction } from 'express';
import { query } from '../../../database/connection';
import { BadRequestError } from '../../../utils/errors';
import { InternalMcpRequest, McpToolResult } from './types';
import { ScheduleService } from '../platform/tools/schedule.tools';
import type { SandboxService } from '../sandbox/sandbox.service';

// -----------------------------------------------------------------------------
// Dependencies (injected at startup)
// -----------------------------------------------------------------------------

let scheduleService: ScheduleService | null = null;

export function setScheduleRoutesDeps(deps: { sandboxService: SandboxService }): void {
    scheduleService = new ScheduleService(deps.sandboxService.getDaytonaProvider());
}

function getScheduleService(): ScheduleService {
    if (!scheduleService) {
        throw new Error('Schedule routes dependencies not initialized');
    }
    return scheduleService;
}

async function requireSandboxId(userId: string): Promise<string> {
    const result = await query<{ sandbox_id: string; sandbox_status: string }>(
        `SELECT sandbox_id, sandbox_status FROM workspaces WHERE user_id = $1 LIMIT 1`,
        [userId],
    );
    if (result.rows.length === 0 || !result.rows[0].sandbox_id) {
        throw new BadRequestError('No sandbox found for user');
    }
    if (result.rows[0].sandbox_status !== 'running') {
        throw new BadRequestError('Sandbox not running — start a session first');
    }
    return result.rows[0].sandbox_id;
}

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

const router = Router();

// POST /api/v1/internal/mcp/create_schedule
router.post('/create_schedule', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.sandbox!.userId;
        const { agent_slug, name, prompt, rrule, adapter_type, model, max_budget_usd, allowed_tools, system_prompt } = req.body;

        if (!agent_slug || typeof agent_slug !== 'string') {
            throw new BadRequestError('agent_slug is required');
        }
        if (!name || typeof name !== 'string') {
            throw new BadRequestError('name is required');
        }
        if (!prompt || typeof prompt !== 'string') {
            throw new BadRequestError('prompt is required');
        }

        const sandboxId = await requireSandboxId(userId);
        const result = await getScheduleService().createSchedule(sandboxId, {
            agent_slug, name, prompt, rrule, adapter_type, model,
            max_budget_usd, allowed_tools, system_prompt,
        });

        const mcpResult: McpToolResult = { success: true, data: result };
        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /api/v1/internal/mcp/list_schedules
router.post('/list_schedules', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.sandbox!.userId;
        const { agent_slug, status } = req.body;

        const sandboxId = await requireSandboxId(userId);
        const result = await getScheduleService().listSchedules(sandboxId, { agent_slug, status });

        const mcpResult: McpToolResult = { success: true, data: result };
        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /api/v1/internal/mcp/update_schedule
router.post('/update_schedule', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.sandbox!.userId;
        const { schedule_id, name, prompt, rrule, status, model, max_budget_usd, allowed_tools, system_prompt } = req.body;

        if (!schedule_id || typeof schedule_id !== 'string') {
            throw new BadRequestError('schedule_id is required');
        }

        const sandboxId = await requireSandboxId(userId);
        const result = await getScheduleService().updateSchedule(sandboxId, {
            schedule_id, name, prompt, rrule, status, model,
            max_budget_usd, allowed_tools, system_prompt,
        });

        const mcpResult: McpToolResult = { success: true, data: result };
        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /api/v1/internal/mcp/delete_schedule
router.post('/delete_schedule', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.sandbox!.userId;
        const { schedule_id } = req.body;

        if (!schedule_id || typeof schedule_id !== 'string') {
            throw new BadRequestError('schedule_id is required');
        }

        const sandboxId = await requireSandboxId(userId);
        const result = await getScheduleService().deleteSchedule(sandboxId, { schedule_id });

        const mcpResult: McpToolResult = { success: true, data: result };
        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

export { router as scheduleRoutes };
