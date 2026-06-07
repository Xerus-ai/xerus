// Agent Import Route
// POST /api/v1/agents/import — import an agent from uploaded agent.md + config.json files

import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { BadRequestError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { uploadRateLimit } from '../../middleware/rate-limit';
import { validateSlug } from '../../shared/slugify';
import { parseFrontmatter } from '../../shared/parse-frontmatter';
import { agentService } from './service';
import { AgentUnauthorizedError } from './errors';
import { getAgentSandboxService } from './routes';
import { requireRunningSandbox, getDaytonaProvider } from '../sandbox-infra/sandbox/sandbox-route-helpers';

const router = Router();

// Multer config: memory storage, 1MB limit, only .md and .json files
const importUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1 * 1024 * 1024 }, // 1MB per file
    fileFilter: (_req, file, cb) => {
        const allowed = ['.md', '.json'];
        const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
        if (allowed.includes(ext)) {
            cb(null, true);
        } else {
            cb(new BadRequestError(`File type not allowed: ${file.originalname}. Only .md and .json files accepted.`) as any);
        }
    },
});

// POST /import
router.post(
    '/import',
    authenticateFirebaseToken,
    uploadRateLimit,
    importUpload.array('files', 2),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) throw new AgentUnauthorizedError();

            const files = req.files as Express.Multer.File[];
            if (!files || files.length === 0) {
                throw new BadRequestError('No files uploaded');
            }

            // Find agent.md (required)
            const agentMdFile = files.find(f => f.originalname === 'agent.md');
            if (!agentMdFile) {
                throw new BadRequestError('agent.md file is required');
            }

            // Parse agent.md frontmatter
            const agentMdContent = agentMdFile.buffer.toString('utf-8');
            const { data: frontmatter } = parseFrontmatter(agentMdContent);

            if (!frontmatter.name) {
                throw new BadRequestError('agent.md frontmatter must include a "name" field');
            }

            // Validate slug if provided in frontmatter (prevents path traversal)
            if (frontmatter.slug) {
                validateSlug(frontmatter.slug, 'agent slug');
            }

            // Parse config.json if present (optional — for additional metadata)
            const configJsonFile = files.find(f => f.originalname === 'config.json');
            let configData: Record<string, any> = {};
            if (configJsonFile) {
                try {
                    configData = JSON.parse(configJsonFile.buffer.toString('utf-8'));
                } catch {
                    throw new BadRequestError('config.json contains invalid JSON');
                }
            }

            // Build CreateAgentDTO from frontmatter + config, passing the full content as system_prompt
            const createDto = {
                name: frontmatter.name,
                description: frontmatter.description || configData.description || '',
                personality_type: frontmatter.personality_type || configData.role || null,
                ai_model: frontmatter.ai_model
                    ? frontmatter.ai_model
                    : configData.model
                        ? `anthropic/${configData.model}`
                        : undefined,
                system_prompt: agentMdContent, // Full content including frontmatter — written as agent.md
                tags: frontmatter.tags || [],
                autonomy_level: frontmatter.autonomy_level || configData.autonomy_level || undefined,
            };

            // Use the existing create pipeline (validation, slug dedup, workspace.db, scaffold, index.json)
            const sandboxService = getAgentSandboxService();
            const sbId = await requireRunningSandbox(sandboxService, req.user.uid);
            const provider = getDaytonaProvider(sandboxService);

            const agent = await agentService.create(createDto, req.user.uid, provider, sbId);

            sendResponse(res, 201, { agent }, startTime);
        } catch (err) {
            next(err);
        }
    }
);

export default router;
