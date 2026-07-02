// Internal Execution Routes
// Backend API endpoints for in-sandbox schedule daemon to fire executions.
// Auth: same internal-token middleware as platform-tools/internal-mcp.

import crypto from 'crypto';
import { Router, Response, NextFunction } from 'express';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { NullStreamingResponse } from './streaming/stream.handler';
import type { ExecutionService } from './execution.service';

const log = logger('InternalExecution');

const INTERNAL_API_TOKEN = process.env.XERUS_INTERNAL_API_TOKEN;

const router = Router();

let _executionService: ExecutionService | null = null;

const inFlightSchedules = new Map<string, string>();

export function setInternalExecutionDeps(deps: { executionService: ExecutionService }): void {
    _executionService = deps.executionService;
}

function getExecutionService(): ExecutionService {
    if (!_executionService) {
        throw new Error('Internal execution routes dependencies not initialized');
    }
    return _executionService;
}

function authenticateInternal(
    req: { headers: { authorization?: string }; body: Record<string, unknown> },
    _res: Response,
    next: NextFunction,
): void {
    try {
        if (!INTERNAL_API_TOKEN) {
            throw new UnauthorizedError('XERUS_INTERNAL_API_TOKEN not configured');
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedError('Missing internal API token');
        }

        const token = authHeader.split('Bearer ')[1];
        const tokenBuf = Buffer.from(token);
        const expectedBuf = Buffer.from(INTERNAL_API_TOKEN);
        if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
            throw new UnauthorizedError('Invalid internal API token');
        }

        next();
    } catch (error) {
        next(error);
    }
}

router.use(authenticateInternal);

// POST /internal/v1/schedules/fire
// Body: { schedule_id, agent_slug, prompt, system_prompt?, scheduled_for, user_id }
// Idempotent: duplicate (schedule_id, scheduled_for) returns existing execution id.
router.post('/schedules/fire', async (req, res: Response, next: NextFunction) => {
    try {
        const { schedule_id, agent_slug, prompt, system_prompt, scheduled_for, user_id } = req.body;

        if (!schedule_id || typeof schedule_id !== 'string') {
            throw new BadRequestError('schedule_id is required');
        }
        if (!agent_slug || typeof agent_slug !== 'string') {
            throw new BadRequestError('agent_slug is required');
        }
        if (!prompt || typeof prompt !== 'string') {
            throw new BadRequestError('prompt is required');
        }
        if (!user_id || typeof user_id !== 'string') {
            throw new BadRequestError('user_id is required');
        }
        if (!scheduled_for || typeof scheduled_for !== 'string') {
            throw new BadRequestError('scheduled_for is required');
        }

        const idempotencyKey = `${schedule_id}:${scheduled_for}`;
        const existing = inFlightSchedules.get(idempotencyKey);
        if (existing) {
            log.info('Duplicate schedule fire — returning existing execution', {
                schedule_id, scheduled_for, execution_id: existing,
            });
            res.json({ success: true, execution_id: existing, duplicate: true });
            return;
        }

        const executionService = getExecutionService();
        const executionId = crypto.randomUUID();

        inFlightSchedules.set(idempotencyKey, executionId);

        log.info('Firing scheduled execution', {
            schedule_id, agent_slug, user_id, scheduled_for, execution_id: executionId,
        });

        const task = system_prompt
            ? `${prompt}\n\n[Schedule Task Brief]\n${system_prompt}`
            : prompt;

        executionService.startExecution({
            request: {
                agentSlug: agent_slug,
                task,
                userId: user_id,
                context: {
                    trigger: 'schedule',
                    schedule_id,
                    scheduled_for,
                },
            },
            stream: new NullStreamingResponse(executionId),
            triggerType: 'schedule',
        }).catch(err => {
            log.error('Scheduled execution failed', {
                schedule_id, execution_id: executionId,
                error: err instanceof Error ? err.message : String(err),
            });
        }).finally(() => {
            setTimeout(() => inFlightSchedules.delete(idempotencyKey), 300_000);
        });

        res.json({ success: true, execution_id: executionId, duplicate: false });
    } catch (error) {
        next(error);
    }
});

router.use((error: Error, _req: unknown, res: Response, _next: NextFunction) => {
    log.error('Internal execution request failed', error);
    const statusCode = (error as { statusCode?: number }).statusCode || 500;
    res.status(statusCode).json({
        success: false,
        error: error.message,
    });
});

export { router as internalExecutionRouter };
