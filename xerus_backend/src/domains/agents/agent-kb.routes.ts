// Agent Knowledge Base Routes
// GET, POST, DELETE for agent knowledge base assignments

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { BadRequestError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { agentKBService } from './service';
import { AgentUnauthorizedError } from './errors';
import { resolveAgentParam } from './resolve-agent-param';
import { syncModuleClaudeMdToWorkspace } from './agent-workspace-sync';
import { getSyncDeps } from './routes';

const router = Router();
const auth = authenticateFirebaseToken;

// GET /api/v1/agents/:id/knowledge-bases - Get agent's knowledge bases
router.get('/:id/knowledge-bases', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const knowledgeBases = await agentKBService.getKnowledgeBases(resolved.id, req.user.uid);

        sendResponse(res, 200, { knowledge_bases: knowledgeBases }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/agents/:id/knowledge-bases - Add knowledge base to agent
router.post('/:id/knowledge-bases', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);

        const { knowledge_base_id, kb_name, access_mode } = req.body;
        if (!knowledge_base_id) {
            throw new BadRequestError('knowledge_base_id is required');
        }

        const kb = await agentKBService.addKnowledgeBase(resolved.id, knowledge_base_id, kb_name, access_mode || 'read', req.user.uid);

        syncModuleClaudeMdToWorkspace(req.user.uid, resolved.id, getSyncDeps()).catch((error) => {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`[agents] CLAUDE.md workspace sync failed for agent ${resolved.id} (best-effort): ${message}`);
        });

        sendResponse(res, 201, { knowledge_base: kb }, startTime);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/v1/agents/:id/knowledge-bases/:kbId - Remove knowledge base from agent
router.delete('/:id/knowledge-bases/:kbId', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);

        await agentKBService.removeKnowledgeBase(resolved.id, req.params.kbId, req.user.uid);

        syncModuleClaudeMdToWorkspace(req.user.uid, resolved.id, getSyncDeps()).catch((error) => {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.warn(`[agents] CLAUDE.md workspace sync failed for agent ${resolved.id} (best-effort): ${message}`);
        });

        sendResponse(res, 200, { removed: true, knowledge_base_id: req.params.kbId }, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
