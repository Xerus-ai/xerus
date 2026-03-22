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
import { syncModuleClaudeMdToWorkspace, type WorkspaceSyncDeps } from './agent-workspace-sync';
import type { SandboxService } from '../execution/sandbox/sandbox.service';
import { getSharedFsRepo } from './routes';
import { query } from '../../database/connection';

// -----------------------------------------------------------------------------
// Dependency Injection
// -----------------------------------------------------------------------------

export interface AgentChannelsDeps {
    sandboxService: SandboxService;
}

let channelsDeps: AgentChannelsDeps | null = null;

export function setAgentChannelsDeps(d: AgentChannelsDeps): void {
    channelsDeps = d;
    agentChannelService.setFilesystemRepo(getSharedFsRepo());
    agentChannelService.setDb({ query });
}

function getSyncDeps(): WorkspaceSyncDeps {
    if (!channelsDeps) {
        throw new Error('Agent channels deps not initialized. Call setAgentChannelsDeps() at startup.');
    }
    return { sandboxService: channelsDeps.sandboxService, db: { query } };
}

const router = Router();
const auth = authenticateFirebaseToken;

// ===== CHANNEL ASSIGNMENT =====

// GET /api/v1/agents/:id/channels - List agent's assigned channels
router.get('/:id/channels', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new AgentUnauthorizedError();

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const channels = await agentChannelService.getChannels(resolved.id, req.user.uid);

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

        const { channel_id } = req.body;
        if (!channel_id || typeof channel_id !== 'string') {
            throw new BadRequestError('channel_id is required');
        }

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const result = await agentChannelService.assignChannel(resolved.id, channel_id, req.user.uid);

        syncModuleClaudeMdToWorkspace(req.user.uid, resolved.id, getSyncDeps()).catch((error) => {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`[agents] CLAUDE.md sync failed for agent ${resolved.id} after channel assign (best-effort): ${message}`);
        });

        sendResponse(res, 201, result, startTime);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/v1/agents/:id/channels/:channelId - Remove agent from channel
router.delete('/:id/channels/:channelId', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new AgentUnauthorizedError();

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const result = await agentChannelService.removeChannel(resolved.id, req.params.channelId, req.user.uid);

        syncModuleClaudeMdToWorkspace(req.user.uid, resolved.id, getSyncDeps()).catch((error) => {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`[agents] CLAUDE.md sync failed for agent ${resolved.id} after channel remove (best-effort): ${message}`);
        });

        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/agents/:id/channels/:channelId/primary - Set as primary channel
router.post('/:id/channels/:channelId/primary', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new AgentUnauthorizedError();

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const result = await agentChannelService.setPrimaryChannel(resolved.id, req.params.channelId, req.user.uid);

        syncModuleClaudeMdToWorkspace(req.user.uid, resolved.id, getSyncDeps()).catch((error) => {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`[agents] CLAUDE.md sync failed for agent ${resolved.id} after set-primary (best-effort): ${message}`);
        });

        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

export { router as agentChannelsRouter };
