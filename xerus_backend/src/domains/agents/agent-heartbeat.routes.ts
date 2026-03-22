// Agent Heartbeat Routes
// GET, PUT, POST (enable/disable), DELETE for heartbeat config, plus execution history

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { BadRequestError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { AgentUnauthorizedError } from './errors';
import { resolveAgentParam } from './resolve-agent-param';
import { heartbeatConfigService } from '../heartbeat/heartbeat-config.service';
import { HeartbeatValidationError } from '../heartbeat/errors';
import type { HeartbeatExecutionStatus } from '../heartbeat/types';
import { syncHeartbeatToWorkspace } from './agent-workspace-sync';
import { getSyncDeps } from './routes';

const router = Router();
const auth = authenticateFirebaseToken;

// -----------------------------------------------------------------------------
// Validation Helpers
// -----------------------------------------------------------------------------

function validateCronExpression(cron: string): boolean {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return false;
    return true;
}

function validateTimeFormat(time: string | undefined | null): boolean {
    if (!time) return true;
    const match = time.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/);
    return match !== null;
}

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

// GET /api/v1/agents/:id/heartbeat - Get heartbeat config
router.get('/:id/heartbeat', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const config = await heartbeatConfigService.getByAgentId(resolved.id, req.user.uid);

        sendResponse(res, 200, { heartbeat_config: config }, startTime);
    } catch (err) {
        next(err);
    }
});

// PUT /api/v1/agents/:id/heartbeat - Upsert heartbeat config
router.put('/:id/heartbeat', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);

        const { enabled, cron_expression, timezone, active_hours_start, active_hours_end,
                weekdays_only, prompt, max_duration_seconds, token_budget,
                tool_allowlist, default_channel_id } = req.body;

        if (typeof enabled !== 'boolean') {
            throw new HeartbeatValidationError('enabled is required and must be a boolean');
        }

        if (typeof cron_expression !== 'string' || !cron_expression.trim()) {
            throw new HeartbeatValidationError('cron_expression is required');
        }

        if (!validateCronExpression(cron_expression)) {
            throw new HeartbeatValidationError('cron_expression must be a valid 5-part cron expression');
        }

        if (!validateTimeFormat(active_hours_start)) {
            throw new HeartbeatValidationError('active_hours_start must be in HH:MM format');
        }

        if (!validateTimeFormat(active_hours_end)) {
            throw new HeartbeatValidationError('active_hours_end must be in HH:MM format');
        }

        if (max_duration_seconds !== undefined && (typeof max_duration_seconds !== 'number' || max_duration_seconds < 1)) {
            throw new HeartbeatValidationError('max_duration_seconds must be a positive number');
        }

        if (token_budget !== undefined && token_budget !== null && (typeof token_budget !== 'number' || token_budget < 1)) {
            throw new HeartbeatValidationError('token_budget must be a positive number');
        }

        if (tool_allowlist !== undefined && tool_allowlist !== null && !Array.isArray(tool_allowlist)) {
            throw new HeartbeatValidationError('tool_allowlist must be an array');
        }

        const input = {
            agent_id: resolved.id,
            enabled,
            cron_expression,
            timezone: timezone || 'UTC',
            active_hours_start: active_hours_start || null,
            active_hours_end: active_hours_end || null,
            weekdays_only: weekdays_only || false,
            prompt: prompt || null,
            max_duration_seconds: max_duration_seconds || 300,
            token_budget: token_budget || null,
            tool_allowlist: tool_allowlist || null,
            default_channel_id: default_channel_id || null,
        };

        const config = await heartbeatConfigService.upsert(input, req.user.uid);

        // Sync HEARTBEAT.md to sandbox (best-effort, non-blocking)
        syncHeartbeatToWorkspace(req.user.uid, resolved.id, {
            cron_expression,
            timezone: timezone || 'UTC',
            prompt: prompt || null,
            enabled,
        }, getSyncDeps()).catch((error) => {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`[agents] HEARTBEAT.md workspace sync failed for agent ${resolved.id} (best-effort): ${message}`);
        });

        sendResponse(res, 200, { heartbeat_config: config }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/agents/:id/heartbeat/enable - Enable heartbeat (preserves config)
router.post('/:id/heartbeat/enable', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const config = await heartbeatConfigService.enable(resolved.id, req.user.uid);

        sendResponse(res, 200, { heartbeat_config: config }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/agents/:id/heartbeat/disable - Disable heartbeat (preserves config)
router.post('/:id/heartbeat/disable', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const config = await heartbeatConfigService.disable(resolved.id, req.user.uid);

        sendResponse(res, 200, { heartbeat_config: config }, startTime);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/v1/agents/:id/heartbeat - Delete heartbeat config
router.delete('/:id/heartbeat', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        await heartbeatConfigService.delete(resolved.id, req.user.uid);

        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/agents/:id/heartbeat/executions - List execution history
router.get('/:id/heartbeat/executions', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);

        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
        const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
        const status = req.query.status as HeartbeatExecutionStatus | undefined;

        if (limit < 1 || limit > 100) {
            throw new BadRequestError('limit must be between 1 and 100');
        }

        if (offset < 0) {
            throw new BadRequestError('offset must be non-negative');
        }

        const result = await heartbeatConfigService.listExecutions(resolved.id, req.user.uid, { limit, offset, status });

        sendResponse(res, 200, {
            executions: result.executions,
            total: result.total,
            limit,
            offset,
        }, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
