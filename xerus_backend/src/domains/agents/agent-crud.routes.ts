// Agent CRUD Routes
// Create, read, update, delete, list, clone, publish, unpublish, set-default

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { BadRequestError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { agentService, agentMarketplaceService } from './service';
import { AgentUnauthorizedError, AgentNotFoundError } from './errors';
import { agentRegistryRepository } from './agent-registry.repository';
import { formatPromptWithAI } from './prompt-formatter';
import { resolveAgentParam } from './resolve-agent-param';

const router = Router();
const auth = authenticateFirebaseToken;

// POST /api/v1/agents/format-prompt - Format raw prompt using AI
router.post('/format-prompt', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const { raw_prompt } = req.body;
        if (typeof raw_prompt !== 'string') {
            throw new BadRequestError('raw_prompt is required and must be a string');
        }

        const result = await formatPromptWithAI(raw_prompt);

        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/agents - List agents with pagination and filtering
router.get('/', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const { page, limit, sort_by, sort_order, agent_type, is_verified, ai_model, search, tags } = req.query;

        const options: Record<string, unknown> = {
            page: page ? parseInt(page as string, 10) : undefined,
            limit: limit ? parseInt(limit as string, 10) : undefined,
            sort_by: sort_by as string | undefined,
            sort_order: sort_order as 'asc' | 'desc' | undefined,
            filters: {
                agent_type: agent_type as string | undefined,
                is_verified: is_verified === 'true' ? true : is_verified === 'false' ? false : undefined,
                ai_model: ai_model as string | undefined,
                search: search as string | undefined,
                tags: tags ? (Array.isArray(tags) ? (tags as string[]) : [tags as string]) : undefined,
            },
        };

        const result = await agentService.listWithEnrichedTools(req.user.uid, options);

        sendResponse(
            res,
            200,
            {
                agents: result.agents,
                pagination: {
                    page: result.page,
                    limit: result.limit,
                    total: result.total,
                    total_pages: result.total_pages,
                },
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/agents/marketplace - Browse marketplace agents
router.get('/marketplace', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const { page, limit, is_verified, search, tags } = req.query;

        const filters = {
            is_verified: is_verified === 'true' ? true : is_verified === 'false' ? false : undefined,
            search: search as string | undefined,
            tags: tags ? (Array.isArray(tags) ? (tags as string[]) : [tags as string]) : undefined,
        };

        const result = await agentMarketplaceService.searchMarketplace(
            filters,
            req.user.uid,
            page ? parseInt(page as string, 10) : 1,
            limit ? parseInt(limit as string, 10) : 20
        );

        sendResponse(
            res,
            200,
            {
                agents: result.agents,
                pagination: {
                    page: result.page,
                    limit: result.limit,
                    total: result.total,
                    total_pages: result.total_pages,
                },
            },
            startTime
        );
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/agents/mine - List user's own agents
router.get('/mine', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const agents = await agentMarketplaceService.getUserAgents(req.user.uid);

        sendResponse(res, 200, { agents }, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/agents/:id - Get agent detail with full enrichment
router.get('/:id', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }
        const userId = req.user.uid;

        const param = req.params.id;
        const numericId = parseInt(param, 10);
        const isNumericParam = !Number.isNaN(numericId) && String(numericId) === param;

        const agent = isNumericParam
            ? await agentService.getById(numericId, userId)
            : await (async () => {
                const entry = await agentRegistryRepository.findBySlug(param, userId);
                if (entry) {
                    return agentService.getById(entry.id, userId);
                }
                return agentMarketplaceService.getMarketplaceDetailBySlug(param, userId);
            })();

        sendResponse(res, 200, { agent }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/agents - Create new agent (registry + filesystem scaffold)
router.post('/', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const agent = await agentService.create(req.body, req.user.uid);

        sendResponse(res, 201, { agent }, startTime);
    } catch (err) {
        next(err);
    }
});

// PATCH /api/v1/agents/:id - Update agent
router.patch('/:id', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const agent = await agentService.update(resolved.id, req.body, req.user.uid);

        sendResponse(res, 200, { agent }, startTime);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/v1/agents/:id - Delete agent (registry + filesystem cleanup)
router.delete('/:id', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        await agentService.delete(resolved.id, req.user.uid);

        sendResponse(res, 200, { deleted: true, id: resolved.id }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/agents/:id/clone - Clone agent (registry + filesystem copy)
// Accepts both registered agent IDs/slugs and marketplace agent slugs.
// For marketplace agents (no registry entry), falls through to filesystem-based clone.
router.post('/:id/clone', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const { name } = req.body;
        const param = req.params.id;

        // Try registered agent first (private or user-published)
        try {
            const resolved = await resolveAgentParam(param, req.user.uid);
            const { cloned } = await agentMarketplaceService.clone(resolved.id, req.user.uid, { name });
            sendResponse(res, 201, { agent: cloned, source_id: resolved.id }, startTime);
            return;
        } catch (err) {
            // Only fall through for not-found errors; re-throw auth/limit errors
            if (!(err instanceof AgentNotFoundError)) throw err;
        }

        // Not in registry: try marketplace agent clone (by slug)
        const { cloned, sourceSlug } = await agentMarketplaceService.cloneMarketplaceAgent(
            param, req.user.uid, { name },
        );
        sendResponse(res, 201, { agent: cloned, source_slug: sourceSlug }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/agents/:id/publish - Publish agent to marketplace
router.post('/:id/publish', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const agent = await agentMarketplaceService.publish(resolved.id, req.user.uid);

        sendResponse(res, 200, { agent, published: true }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/agents/:id/unpublish - Remove agent from marketplace
router.post('/:id/unpublish', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const agent = await agentMarketplaceService.unpublish(resolved.id, req.user.uid);

        sendResponse(res, 200, { agent, unpublished: true }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/agents/:id/set-default - Set agent as default
router.post('/:id/set-default', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) {
            throw new AgentUnauthorizedError();
        }

        const resolved = await resolveAgentParam(req.params.id, req.user.uid);
        const agent = await agentMarketplaceService.setDefault(resolved.id, req.user.uid);

        sendResponse(res, 200, { agent, is_default: true }, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
