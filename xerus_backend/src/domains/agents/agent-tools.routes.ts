// Agent Tool Management Routes
// GET, POST, DELETE for agent tool assignments

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { BadRequestError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { agentToolsService } from './service';
import { AgentUnauthorizedError } from './errors';
import { resolveAgentParam } from './resolve-agent-param';

const router = Router();
const auth = authenticateFirebaseToken;

// GET /api/v1/agents/:id/tools - Get agent's tools
router.get('/:id/tools', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const tools = await agentToolsService.getTools(resolved.id, req.user.uid);

        sendResponse(res, 200, { tools }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/agents/:id/tools - Add tool to agent
router.post('/:id/tools', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const appSlug = req.body.app_slug || req.body.tool_name;
        if (!appSlug) {
            throw new BadRequestError('app_slug is required');
        }

        const tools = await agentToolsService.addTool(resolved.id, appSlug, req.user.uid);

        sendResponse(res, 201, { tools, added: appSlug }, startTime);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/v1/agents/:id/tools/:appSlug - Remove tool from agent
router.delete('/:id/tools/:appSlug', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const tools = await agentToolsService.removeTool(resolved.id, req.params.appSlug, req.user.uid);

        sendResponse(res, 200, { tools, removed: req.params.appSlug }, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
