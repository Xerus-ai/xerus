// Schedule Routes (Frontend-facing)
// REST endpoints for schedule CRUD + run history (queries workspace.db on sandbox)
// Mounted under /api/v1/execute/schedules
// These are the frontend-facing counterparts to the internal MCP schedule routes.
// The internal MCP routes (/api/v1/internal/mcp/*_schedule) are for sandbox-to-backend.

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { escapeSQL, executeWorkspaceJsonQuery } from '../conversations/workspace-db.helpers';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';
import { requireRunningSandbox, getDaytonaProvider } from '../sandbox-infra/sandbox/sandbox-route-helpers';

// -----------------------------------------------------------------------------
// Types (mirror workspace-schema.sql)
// -----------------------------------------------------------------------------

interface ScheduleRow {
    id: string;
    agent_slug: string;
    name: string;
    prompt: string;
    rrule: string | null;
    adapter_type: string;
    model: string | null;
    status: string;
    max_budget_usd: number | null;
    allowed_tools: string | null;
    system_prompt: string | null;
    next_run_at: number | null;
    last_run_at: number | null;
    created_at: number;
    updated_at: number;
}

interface ScheduleRunRow {
    id: string;
    schedule_id: string;
    session_id: string | null;
    status: string;
    output: string | null;
    result: string | null;
    error: string | null;
    cost_usd: number | null;
    duration_ms: number | null;
    num_turns: number | null;
    pid: number | null;
    started_at: number | null;
    completed_at: number | null;
    created_at: number;
}

// -----------------------------------------------------------------------------
// Dependency Injection
// -----------------------------------------------------------------------------

export interface ScheduleFrontendRoutesDeps {
    sandboxService: SandboxService;
}

let deps: ScheduleFrontendRoutesDeps | null = null;

export function setScheduleFrontendRoutesDeps(d: ScheduleFrontendRoutesDeps): void {
    deps = d;
}

function getDeps(): ScheduleFrontendRoutesDeps {
    if (!deps) {
        throw new Error('ScheduleFrontendRoutes dependencies not initialized');
    }
    return deps;
}

// -----------------------------------------------------------------------------
// Router
// -----------------------------------------------------------------------------

const router = Router();
const auth = authenticateFirebaseToken;

// GET /api/v1/execute/schedules - List schedules
router.get('/', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new UnauthorizedError();

        const agentSlug = req.query.agent_slug as string | undefined;
        const status = req.query.status as string | undefined;

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
        const provider = getDaytonaProvider(sandboxService);

        const conditions: string[] = [];
        if (agentSlug) {
            conditions.push(`agent_slug = '${escapeSQL(agentSlug)}'`);
        }
        if (status) {
            conditions.push(`status = '${escapeSQL(status)}'`);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const sql = `SELECT * FROM schedules ${where} ORDER BY created_at DESC`;

        const schedules = await executeWorkspaceJsonQuery<ScheduleRow>(provider, sandboxId, sql);
        sendResponse(res, 200, { schedules, total: schedules.length }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/execute/schedules - Create a schedule
router.post('/', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new UnauthorizedError();

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

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
        const provider = getDaytonaProvider(sandboxService);

        // Use the ScheduleService via the internal MCP route's service layer
        // to benefit from rrule validation and next_run_at computation.
        // Import ScheduleService directly to avoid circular deps.
        const { ScheduleService } = await import('../platform-tools/platform/tools/schedule.tools');
        const scheduleService = new ScheduleService(provider);
        const result = await scheduleService.createSchedule(sandboxId, {
            agent_slug, name, prompt, rrule, adapter_type, model,
            max_budget_usd, allowed_tools, system_prompt,
        });

        sendResponse(res, 201, result, startTime);
    } catch (err) {
        next(err);
    }
});

// PATCH /api/v1/execute/schedules/:id - Update a schedule
router.patch('/:id', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new UnauthorizedError();

        const scheduleId = req.params.id;
        if (!scheduleId || typeof scheduleId !== 'string') {
            throw new BadRequestError('schedule_id is required');
        }

        const { name, prompt, rrule, status, model, max_budget_usd, allowed_tools, system_prompt } = req.body;

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
        const provider = getDaytonaProvider(sandboxService);

        const { ScheduleService } = await import('../platform-tools/platform/tools/schedule.tools');
        const scheduleService = new ScheduleService(provider);
        const result = await scheduleService.updateSchedule(sandboxId, {
            schedule_id: scheduleId, name, prompt, rrule, status, model,
            max_budget_usd, allowed_tools, system_prompt,
        });

        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/v1/execute/schedules/:id - Delete a schedule
router.delete('/:id', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new UnauthorizedError();

        const scheduleId = req.params.id;
        if (!scheduleId || typeof scheduleId !== 'string') {
            throw new BadRequestError('schedule_id is required');
        }

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
        const provider = getDaytonaProvider(sandboxService);

        const { ScheduleService } = await import('../platform-tools/platform/tools/schedule.tools');
        const scheduleService = new ScheduleService(provider);
        const result = await scheduleService.deleteSchedule(sandboxId, { schedule_id: scheduleId });

        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/execute/schedules/runs - List schedule runs (run history)
// Supports ?agent_slug=... to filter by agent, ?limit=... and ?offset=...
router.get('/runs', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new UnauthorizedError();

        const agentSlug = req.query.agent_slug as string | undefined;
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
        const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

        if (isNaN(limit) || limit < 1) {
            throw new BadRequestError('limit must be a positive integer');
        }
        if (isNaN(offset) || offset < 0) {
            throw new BadRequestError('offset must be a non-negative integer');
        }

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, req.user.uid);
        const provider = getDaytonaProvider(sandboxService);

        // Join schedule_runs with schedules to get agent_slug and schedule name
        const agentFilter = agentSlug
            ? `AND s.agent_slug = '${escapeSQL(agentSlug)}'`
            : '';

        const sql = `
            SELECT sr.id, sr.schedule_id, sr.session_id, sr.status, sr.output,
                   sr.result, sr.error, sr.cost_usd, sr.duration_ms, sr.num_turns,
                   sr.started_at, sr.completed_at, sr.created_at,
                   s.agent_slug, s.name as schedule_name, s.prompt as schedule_prompt
            FROM schedule_runs sr
            JOIN schedules s ON sr.schedule_id = s.id
            WHERE 1=1 ${agentFilter}
            ORDER BY sr.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const runs = await executeWorkspaceJsonQuery<ScheduleRunRow & {
            agent_slug: string;
            schedule_name: string;
            schedule_prompt: string;
        }>(provider, sandboxId, sql);

        // Get total count
        const countSql = `
            SELECT COUNT(*) as count
            FROM schedule_runs sr
            JOIN schedules s ON sr.schedule_id = s.id
            WHERE 1=1 ${agentFilter}
        `;
        const countRows = await executeWorkspaceJsonQuery<{ count: number }>(provider, sandboxId, countSql);
        const total = countRows[0]?.count ?? 0;

        sendResponse(res, 200, { runs, total }, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
