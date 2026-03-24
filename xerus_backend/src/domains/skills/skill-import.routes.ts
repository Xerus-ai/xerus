// Skill Import Route
// POST /api/v1/skills/import — import a skill from uploaded SKILL.md + supporting files

import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { BadRequestError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { uploadRateLimit } from '../../middleware/rate-limit';
import { validateSlug, slugify } from '../../shared/slugify';
import { parseFrontmatter } from '../../shared/parse-frontmatter';
import { skillService } from './service';
import { SkillUnauthorizedError } from './errors';

const router = Router();

// Allowlist of text-safe file extensions (writeSkillFile only supports string content)
const ALLOWED_TEXT_EXTENSIONS = new Set([
    '.md', '.json', '.txt', '.yaml', '.yml',
    '.py', '.ts', '.js', '.toml', '.cfg', '.ini', '.csv',
]);

const importUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ext || ALLOWED_TEXT_EXTENSIONS.has(ext)) {
            cb(null, true);
        } else {
            cb(new BadRequestError(`File type not allowed: ${file.originalname}. Only text files accepted (.md, .json, .txt, .py, .ts, .js, .yaml).`) as any);
        }
    },
});

// Sanitize filename: only allow safe characters, reject hidden/traversal files
function sanitizeFilename(name: string): string {
    const base = path.basename(name);
    const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!safe || safe.startsWith('.') || safe.includes('..')) {
        throw new BadRequestError(`Unsafe filename: ${name}`);
    }
    return safe;
}

// POST /import
router.post(
    '/import',
    authenticateFirebaseToken,
    uploadRateLimit,
    importUpload.array('files', 20),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startTime = res.locals.startTime || Date.now();
        try {
            if (!req.user) throw new SkillUnauthorizedError();

            const files = req.files as Express.Multer.File[];
            if (!files || files.length === 0) {
                throw new BadRequestError('No files uploaded');
            }

            // Find SKILL.md (required)
            const skillMdFile = files.find(f => f.originalname === 'SKILL.md');
            if (!skillMdFile) {
                throw new BadRequestError('SKILL.md file is required');
            }

            // Parse SKILL.md frontmatter
            const skillMdContent = skillMdFile.buffer.toString('utf-8');
            const { data: frontmatter } = parseFrontmatter(skillMdContent);

            // Parse xerushub.json if present
            const xerushubFile = files.find(f => f.originalname === 'xerushub.json');
            let xerushub: Record<string, any> = {};
            if (xerushubFile) {
                try {
                    xerushub = JSON.parse(xerushubFile.buffer.toString('utf-8'));
                } catch {
                    throw new BadRequestError('xerushub.json contains invalid JSON');
                }
            }

            // Derive name and slug
            const name = xerushub.displayName || frontmatter.name;
            if (!name) {
                throw new BadRequestError('Skill name is required (in SKILL.md frontmatter "name" or xerushub.json "displayName")');
            }

            const rawSlug = xerushub.slug || frontmatter.name;
            if (rawSlug) {
                validateSlug(slugify(rawSlug), 'skill slug');
            }

            // Build CreateSkillDTO
            const createDto = {
                name,
                description: xerushub.summary || frontmatter.description || '',
                tags: xerushub.tags || [],
                category: undefined as string | undefined,
            };

            // Step 1: Create skill metadata (writes config.json via existing pipeline)
            // Uses createForMaster pattern: create() + writeSkillFile()
            const skill = await skillService.createForMaster(req.user.uid, {
                name: createDto.name,
                description: createDto.description,
                instructions: skillMdContent,
                category: createDto.category,
            });

            // Step 2: Write any additional supporting files (references/, scripts/, etc.)
            // Check aggregate size (10MB max total)
            const totalSize = files.reduce((sum, f) => sum + f.size, 0);
            if (totalSize > 10 * 1024 * 1024) {
                throw new BadRequestError('Total upload size exceeds 10MB limit');
            }

            for (const file of files) {
                // Skip files already processed
                if (file.originalname === 'SKILL.md' || file.originalname === 'config.json' || file.originalname === 'xerushub.json') continue;

                const safeName = sanitizeFilename(file.originalname);
                await skillService.writeAdditionalFile(
                    req.user.uid,
                    skill.slug,
                    safeName,
                    file.buffer.toString('utf-8')
                );
            }

            sendResponse(res, 201, { skill }, startTime);
        } catch (err) {
            next(err);
        }
    }
);

export default router;
