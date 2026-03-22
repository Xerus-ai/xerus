// Skills Domain Routes
// REST API endpoints for skills marketplace CRUD + install/uninstall
// All skill identification is by slug (no numeric IDs)

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse, extractWildcardPath } from '../../utils/response';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { skillService } from './service';
import { skillSecretsService } from './secrets.service';
import { SkillUnauthorizedError, SkillValidationError } from './errors';
import type { PaginatedSkills } from './types';
import type { SandboxService } from '../execution/sandbox/sandbox.service';
import { SkillWorkspaceService } from './workspace.service';

// Dependency injection
export interface SkillRoutesDeps {
    sandboxService: SandboxService;
}

export function setSkillRoutesDeps(d: SkillRoutesDeps): void {
    const workspaceService = new SkillWorkspaceService(d.sandboxService);
    skillService.setWorkspaceService(workspaceService);
}

const router = Router();
const auth = authenticateFirebaseToken;

function parseListQueryParams(query: Record<string, unknown>): unknown {
    const { page, limit, sort_by, sort_order, category, search, tags } = query;
    return {
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        sort_by: sort_by as string | undefined,
        sort_order: sort_order as string | undefined,
        filters: {
            category: category as string | undefined,
            search: search as string | undefined,
            tags: tags ? (Array.isArray(tags) ? (tags as string[]) : [tags as string]) : undefined,
        },
    };
}

function sendPaginatedSkills(res: Response, result: PaginatedSkills, startTime: number): void {
    sendResponse(res, 200, {
        skills: result.skills,
        pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            total_pages: result.total_pages,
        },
        categories: result.categories || [],
    }, startTime);
}

// GET /api/v1/skills - Unified: all skills with is_installed flag + categories
router.get('/', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new SkillUnauthorizedError();
        const result = await skillService.list(req.user.uid, parseListQueryParams(req.query));
        sendPaginatedSkills(res, result, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/skills/:slug - Skill detail
router.get('/:slug', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new SkillUnauthorizedError();
        const skill = await skillService.getBySlug(req.params.slug, req.user.uid);
        sendResponse(res, 200, { skill }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/skills - Create custom skill
router.post('/', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new SkillUnauthorizedError();
        const skill = await skillService.create(req.body, req.user.uid);
        sendResponse(res, 201, { skill }, startTime);
    } catch (err) {
        next(err);
    }
});

// PATCH /api/v1/skills/:slug - Update skill metadata
router.patch('/:slug', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new SkillUnauthorizedError();
        const skill = await skillService.update(req.params.slug, req.body, req.user.uid);
        sendResponse(res, 200, { skill }, startTime);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/v1/skills/:slug - Delete custom skill
router.delete('/:slug', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new SkillUnauthorizedError();
        await skillService.delete(req.params.slug, req.user.uid);
        sendResponse(res, 200, { deleted: true }, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/skills/:slug/files - List files in skill folder
router.get('/:slug/files', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new SkillUnauthorizedError();
        const files = await skillService.listFiles(req.params.slug, req.user.uid);
        sendResponse(res, 200, { files }, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/skills/:slug/files/* - Read specific file
router.get('/:slug/files/*filePath', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new SkillUnauthorizedError();
        const filePath = extractWildcardPath(req.params);
        const content = await skillService.readFile(req.params.slug, filePath, req.user.uid);
        sendResponse(res, 200, { content }, startTime);
    } catch (err) {
        next(err);
    }
});

// PUT /api/v1/skills/:slug/files/* - Write/update file
router.put('/:slug/files/*filePath', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new SkillUnauthorizedError();
        const filePath = extractWildcardPath(req.params);
        const { content } = req.body;
        await skillService.writeFile(req.params.slug, filePath, content, req.user.uid);
        sendResponse(res, 200, { written: true }, startTime);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/v1/skills/:slug/files/* - Delete file
router.delete('/:slug/files/*filePath', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new SkillUnauthorizedError();
        const filePath = extractWildcardPath(req.params);
        await skillService.deleteFile(req.params.slug, filePath, req.user.uid);
        sendResponse(res, 200, { deleted: true }, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/skills/:slug/secrets - Get secret statuses (masked)
router.get('/:slug/secrets', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new SkillUnauthorizedError();
        const secrets = await skillSecretsService.getSecretStatuses(req.params.slug, req.user.uid);
        sendResponse(res, 200, { secrets }, startTime);
    } catch (err) {
        next(err);
    }
});

// PUT /api/v1/skills/:slug/secrets/:envKey - Set a secret
router.put('/:slug/secrets/:envKey', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new SkillUnauthorizedError();
        const { slug } = req.params;
        const { envKey } = req.params;
        const { value } = req.body;
        if (typeof value !== 'string' || value.length === 0) {
            throw new SkillValidationError([{ field: 'value', message: 'value is required and must be a non-empty string' }]);
        }
        await skillSecretsService.setSecret(slug, envKey, value, req.user.uid);
        sendResponse(res, 200, { saved: true }, startTime);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/v1/skills/:slug/secrets/:envKey - Delete a secret
router.delete('/:slug/secrets/:envKey', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new SkillUnauthorizedError();
        const { slug } = req.params;
        const { envKey } = req.params;
        await skillSecretsService.deleteSecret(slug, envKey, req.user.uid);
        sendResponse(res, 200, { deleted: true }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/skills/:slug/install - Install skill to workspace
router.post('/:slug/install', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new SkillUnauthorizedError();
        await skillService.install(req.params.slug, req.body, req.user.uid);
        sendResponse(res, 200, { installed: true }, startTime);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/v1/skills/:slug/install - Uninstall skill from workspace
router.delete('/:slug/install', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new SkillUnauthorizedError();
        const scope = (req.body.scope as 'channel' | 'global') || 'global';
        const channelId = req.body.channel_id as string | undefined;
        await skillService.uninstall(req.params.slug, req.user.uid, scope, channelId);
        sendResponse(res, 200, { uninstalled: true }, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/agents/:agentSlug/skills - List installed skills for an agent
// Returns both global skills and channel-scoped skills for the agent's primary channel.
// Mounted separately at /api/v1/agents via agentSkillsRouter
export const agentSkillsRouter = Router();

agentSkillsRouter.get('/:agentSlug/skills', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        if (!req.user) throw new SkillUnauthorizedError();
        const allInstalled = await skillService.getInstalledSkills(req.user.uid);
        // batchReadInstalled now returns both global and channel-scoped skills.
        // All are relevant to the agent since the SDK discovers skills from the
        // ancestor chain. No filtering needed — return the full set.
        sendResponse(res, 200, { skills: allInstalled }, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
