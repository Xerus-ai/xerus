// Schedule Routes
// User-facing REST API for scheduled agent executions
// Facade over heartbeat_configs system

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { scheduleService } from './schedule.service';

const router = Router();
const auth = authenticateFirebaseToken;

// GET /api/v1/schedules?agent_id=123&enabled=true
router.get('/', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const agentId = req.query.agent_id ? parseInt(req.query.agent_id as string, 10) : undefined;
        const enabled = req.query.enabled !== undefined ? req.query.enabled === 'true' : undefined;

        const schedules = await scheduleService.listByUser(userId, { agentId, enabled });
        sendResponse(res, 200, schedules, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/schedules/:id
router.get('/:id', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const id = parseInt(req.params.id, 10);
        const schedule = await scheduleService.getById(id, userId);
        sendResponse(res, 200, schedule, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/schedules
router.post('/', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const schedule = await scheduleService.create(req.body, userId);
        sendResponse(res, 201, schedule, startTime);
    } catch (err) {
        next(err);
    }
});

// PUT /api/v1/schedules/:id
router.put('/:id', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const id = parseInt(req.params.id, 10);
        const schedule = await scheduleService.update(id, req.body, userId);
        sendResponse(res, 200, schedule, startTime);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/v1/schedules/:id
router.delete('/:id', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const id = parseInt(req.params.id, 10);
        await scheduleService.delete(id, userId);
        sendResponse(res, 200, { deleted: true }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/schedules/:id/enable
router.post('/:id/enable', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const id = parseInt(req.params.id, 10);
        const schedule = await scheduleService.enable(id, userId);
        sendResponse(res, 200, schedule, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/schedules/:id/disable
router.post('/:id/disable', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const id = parseInt(req.params.id, 10);
        const schedule = await scheduleService.disable(id, userId);
        sendResponse(res, 200, schedule, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/schedules/:id/trigger
router.post('/:id/trigger', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const id = parseInt(req.params.id, 10);
        const result = await scheduleService.trigger(id, userId);
        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/schedules/:id/executions?limit=10
router.get('/:id/executions', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const id = parseInt(req.params.id, 10);
        const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 100);
        const executions = await scheduleService.listExecutions(id, userId, limit);
        sendResponse(res, 200, executions, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
