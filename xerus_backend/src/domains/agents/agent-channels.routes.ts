// Agent Channel Routes
// REST API endpoints for agent-to-channel assignment.
// Pattern mirrors agent tools routes in routes.ts.

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { BadRequestError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { agentChannelService } from './agent-channel.service';
import { AgentUnauthorizedError } from './errors';
import { resolveAgentParam } from './resolve-agent-param';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';
import { getSharedFsRepo } from './routes';
import { requireRunningSandbox, getDaytonaProvider } from '../sandbox-infra/sandbox/sandbox-route-helpers';
import { createSystemEvent } from '../company/company-workspace-db.service';
import { logger } from '../../utils/logger';

const log = logger('AgentChannelsRoutes');

// -----------------------------------------------------------------------------
// Dependency Injection
// -----------------------------------------------------------------------------

let sandboxService: SandboxService | null = null;

export interface AgentChannelsDeps {
    sandboxService: SandboxService;
}

export function setAgentChannelsDeps(d: AgentChannelsDeps): void {
    sandboxService = d.sandboxService;
    agentChannelService.setFilesystemRepo(getSharedFsRepo());
}

function getSandboxService(): SandboxService {
    if (!sandboxService) {
        throw new Error('AgentChannels dependencies not initialized. Call setAgentChannelsDeps() at startup.');
    }
    return sandboxService;
}

const router = Router();
const auth = authenticateFirebaseToken;

// ===== CHANNEL ASSIGNMENT =====

// GET /api/v1/agents/:id/channels - List agent's assigned channels
router.get('/:id/channels', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new AgentUnauthorizedError();

        const svc = getSandboxService();
        const sbId = await requireRunningSandbox(svc, req.user.uid);
        const provider = getDaytonaProvider(svc);

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const channels = await agentChannelService.getChannels(provider, sbId, resolved.id, req.user.uid);

        sendResponse(res, 200, { channels }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/agents/:id/channels - Assign agent to a channel
router.post('/:id/channels', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new AgentUnauthorizedError();

        const { channel_slug } = req.body;
        if (!channel_slug || typeof channel_slug !== 'string') {
            throw new BadRequestError('channel_slug is required');
        }

        const svc = getSandboxService();
        const sbId = await requireRunningSandbox(svc, req.user.uid);
        const provider = getDaytonaProvider(svc);

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const result = await agentChannelService.assignChannel(provider, sbId, resolved.id, channel_slug, req.user.uid);

        // System event: agent joined channel
        createSystemEvent(
            provider, sbId, channel_slug,
            `${resolved.slug ?? resolved.id} joined the channel`,
            { event_type: 'agent_joined', agent_slug: resolved.slug ?? resolved.id },
        ).catch(err => log.warn('System event failed', { error: err instanceof Error ? err.message : String(err) }));

        sendResponse(res, 201, result, startTime);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/v1/agents/:id/channels/:channelSlug - Remove agent from channel
router.delete('/:id/channels/:channelSlug', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new AgentUnauthorizedError();

        const svc = getSandboxService();
        const sbId = await requireRunningSandbox(svc, req.user.uid);
        const provider = getDaytonaProvider(svc);

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const result = await agentChannelService.removeChannel(provider, sbId, resolved.id, req.params.channelSlug, req.user.uid);

        // System event: agent left channel
        createSystemEvent(
            provider, sbId, req.params.channelSlug,
            `${resolved.slug ?? resolved.id} left the channel`,
            { event_type: 'agent_left', agent_slug: resolved.slug ?? resolved.id },
        ).catch(err => log.warn('System event failed', { error: err instanceof Error ? err.message : String(err) }));

        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/agents/:id/channels/:channelSlug/primary - Set as primary channel
router.post('/:id/channels/:channelSlug/primary', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new AgentUnauthorizedError();

        const svc = getSandboxService();
        const sbId = await requireRunningSandbox(svc, req.user.uid);
        const provider = getDaytonaProvider(svc);

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const result = await agentChannelService.setPrimaryChannel(provider, sbId, resolved.id, req.params.channelSlug, req.user.uid);

        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

export { router as agentChannelsRouter };
