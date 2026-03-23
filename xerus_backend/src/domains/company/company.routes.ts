// Company Routes
// REST API endpoints for domains, channels, and messages (organization structure)
// Frontend reads these to render the inbox sidebar hierarchy.
// Dual-write: DB is authoritative, sandbox posts.jsonl is best-effort.

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { query } from '../../database/connection';
import { SANDBOX_CONFIG } from '../execution';
import type { SandboxService, DaytonaProvider } from '../execution';
import { shellEscape, shellEscapePath } from '../../utils/shell-safety';
import { slugify, sanitizeSlug } from '../../shared/slugify';
import { strictRateLimit } from '../../middleware/rate-limit';

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;

const router = Router();
const auth = authenticateFirebaseToken;

// -------------------------------------------------------------------------
// Dependency Injection (set from index.ts at startup)
// -------------------------------------------------------------------------

interface CompanyRoutesDeps { sandboxService: SandboxService }
let companyDeps: CompanyRoutesDeps | null = null;
export function setCompanyRoutesDeps(d: CompanyRoutesDeps): void { companyDeps = d; }

// -------------------------------------------------------------------------
// Sandbox Dual-Write: append message to posts.jsonl
// Best-effort: failures are logged, never block the API response.
// -------------------------------------------------------------------------

async function syncMessageToSandbox(
    userId: string,
    channelTag: string,
    messageEntry: Record<string, unknown>,
): Promise<void> {
    if (!companyDeps) return;
    const { sandboxService } = companyDeps;
    const status = await sandboxService.getSandboxStatus(userId);
    if (status.status !== 'running' || !status.sandboxId) return;

    const provider = sandboxService.getProvider() as DaytonaProvider;
    if (typeof provider.executeCommand !== 'function') return;

    const parts = channelTag.split('/');
    const domainSlug = sanitizeSlug(parts[0] || '');
    const channelSlug = sanitizeSlug(parts[1] || '');
    const postsDir = `${SANDBOX_CONFIG.workspacePath}/projects/${domainSlug}/channels/${channelSlug}`;
    const postsPath = `${postsDir}/posts.jsonl`;

    const jsonLine = JSON.stringify(messageEntry);
    await provider.executeCommand(
        status.sandboxId,
        `mkdir -p ${shellEscapePath(postsDir)} && printf '%s\\n' ${shellEscape(jsonLine)} >> ${shellEscapePath(postsPath)}`,
    );
}

// -------------------------------------------------------------------------
// GET /api/v1/company/domains - List domains with nested channels
// Query params: include=channels (default: always includes channels)
// -------------------------------------------------------------------------

router.get('/domains', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        // Fetch workspace (if exists) for context
        const wsResult = await query(
            `SELECT id::text, slug, name, description FROM workspaces WHERE user_id = $1 LIMIT 1`,
            [userId],
        );
        const workspace = wsResult.rows.length > 0 ? wsResult.rows[0] : null;

        const domainsResult = await query(
            `SELECT d.id::text, d.slug, d.name, d.description,
                    COALESCE(json_agg(
                        json_build_object(
                            'id', c.id::text,
                            'slug', c.slug,
                            'name', c.name,
                            'description', c.description,
                            'agent_count', COALESCE(c.agent_count, 0)
                        ) ORDER BY c.name
                    ) FILTER (WHERE c.id IS NOT NULL), '[]'::json) AS channels
             FROM domains d
             LEFT JOIN channels c ON c.domain_id = d.id
             WHERE d.user_id = $1
             GROUP BY d.id
             ORDER BY d.name`,
            [userId],
        );

        sendResponse(res, 200, { workspace, domains: domainsResult.rows }, startTime);
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------------
// POST /api/v1/company/domains - Create a new project (domain)
// Body: { name: string, description?: string }
// -------------------------------------------------------------------------

router.post('/domains', auth, strictRateLimit, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const name = (req.body.name as string || '').trim();
        if (!name) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name is required' } });
            return;
        }
        if (name.length > MAX_NAME_LENGTH) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `name must be ${MAX_NAME_LENGTH} characters or fewer` } });
            return;
        }

        const wsResult = await query('SELECT id::text FROM workspaces WHERE user_id = $1 LIMIT 1', [userId]);
        if (wsResult.rows.length === 0) {
            res.status(400).json({ success: false, error: { code: 'NO_WORKSPACE', message: 'Complete onboarding first' } });
            return;
        }
        const workspaceId = wsResult.rows[0].id;
        const slug = slugify(name);
        if (!slug) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name must contain at least one alphanumeric character' } });
            return;
        }
        const description = ((req.body.description as string || '').trim() || `${name} department`).slice(0, MAX_DESCRIPTION_LENGTH);

        const result = await query(
            `INSERT INTO domains (user_id, workspace_id, slug, name, description)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (workspace_id, slug) DO NOTHING
             RETURNING id::text, slug, name, description`,
            [userId, workspaceId, slug, name, description],
        );

        if (result.rows.length === 0) {
            res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'A project with this name already exists' } });
            return;
        }

        const domain = result.rows[0];

        // Auto-create #general channel in the new project
        const chResult = await query(
            `INSERT INTO channels (domain_id, user_id, slug, name, description)
             VALUES ($1, $2, 'general', 'General', 'Default channel')
             ON CONFLICT (domain_id, slug) DO NOTHING
             RETURNING id::text, slug, name`,
            [domain.id, userId],
        );

        sendResponse(res, 201, {
            domain,
            channel: chResult.rows[0] || null,
        }, startTime);
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------------
// POST /api/v1/company/domains/:domainId/channels - Create a new channel
// Body: { name: string, description?: string }
// -------------------------------------------------------------------------

router.post('/domains/:domainId/channels', auth, strictRateLimit, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const { domainId } = req.params;
        const name = (req.body.name as string || '').trim();
        if (!name) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name is required' } });
            return;
        }
        if (name.length > MAX_NAME_LENGTH) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `name must be ${MAX_NAME_LENGTH} characters or fewer` } });
            return;
        }

        // Verify domain ownership
        const domainCheck = await query(
            'SELECT id::text FROM domains WHERE id::text = $1 AND user_id = $2',
            [domainId, userId],
        );
        if (domainCheck.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
            return;
        }

        const slug = slugify(name);
        if (!slug) {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name must contain at least one alphanumeric character' } });
            return;
        }
        const description = (req.body.description as string || '').trim().slice(0, MAX_DESCRIPTION_LENGTH);

        const result = await query(
            `INSERT INTO channels (domain_id, user_id, slug, name, description)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (domain_id, slug) DO NOTHING
             RETURNING id::text, slug, name, description`,
            [domainId, userId, slug, name, description],
        );

        if (result.rows.length === 0) {
            res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'A channel with this name already exists in this project' } });
            return;
        }

        sendResponse(res, 201, { channel: result.rows[0] }, startTime);
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------------
// GET /api/v1/company/channels/:channelId/messages - List channel messages
// Query params: limit (default 50, max 100), offset (default 0)
// -------------------------------------------------------------------------

router.get('/channels/:channelId/messages', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const { channelId } = req.params;
        const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
        const offset = parseInt(req.query.offset as string, 10) || 0;

        // Verify user owns the channel (via domain ownership)
        const channelCheck = await query(
            `SELECT c.id FROM channels c
             JOIN domains d ON d.id = c.domain_id
             WHERE c.id::text = $1 AND d.user_id = $2`,
            [channelId, userId],
        );

        if (channelCheck.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Channel not found' } });
            return;
        }

        const messagesResult = await query(
            `SELECT id::text, channel_id::text, sender_type, sender_slug, content,
                    message_type, metadata, created_at
             FROM channel_messages
             WHERE channel_id::text = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [channelId, limit, offset],
        );

        sendResponse(res, 200, { messages: messagesResult.rows }, startTime);
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------------
// POST /api/v1/company/channels/:channelId/messages - Human sends message
// -------------------------------------------------------------------------

router.post('/channels/:channelId/messages', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const { channelId } = req.params;
        const { content, message_type, metadata } = req.body;

        if (!content || typeof content !== 'string' || content.trim() === '') {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'content is required' } });
            return;
        }

        const validMessageTypes = new Set(['chat', 'task_update', 'status', 'system']);
        const resolvedType = validMessageTypes.has(message_type) ? message_type : 'chat';

        const channelCheck = await query<{ id: string; domain_slug: string; channel_slug: string }>(
            `SELECT c.id::text, d.slug AS domain_slug, c.slug AS channel_slug
             FROM channels c
             JOIN domains d ON d.id = c.domain_id
             WHERE c.id::text = $1 AND d.user_id = $2`,
            [channelId, userId],
        );

        if (channelCheck.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Channel not found' } });
            return;
        }

        const channelRow = channelCheck.rows[0];

        const result = await query<{ id: string; created_at: string }>(
            `INSERT INTO channel_messages (channel_id, sender_type, sender_slug, content, message_type, metadata)
             VALUES ($1::uuid, 'human', $2, $3, $4, $5)
             RETURNING id::text, created_at`,
            [channelId, userId, content.trim(), resolvedType, JSON.stringify(metadata ?? {})],
        );

        const inserted = result.rows[0];
        const channelTag = `${channelRow.domain_slug}/${channelRow.channel_slug}`;

        const messageEntry = {
            id: inserted.id,
            sender_type: 'human',
            sender_slug: userId,
            content: content.trim(),
            message_type: resolvedType,
            metadata: metadata ?? {},
            created_at: inserted.created_at,
        };
        syncMessageToSandbox(userId, channelTag, messageEntry).catch(err =>
            console.warn(`[CompanyRoutes] Sandbox sync failed for message: ${err instanceof Error ? err.message : String(err)}`),
        );

        sendResponse(res, 201, {
            message: {
                id: inserted.id,
                channel_id: channelId,
                sender_type: 'human',
                sender_slug: userId,
                content: content.trim(),
                message_type: resolvedType,
                metadata: metadata ?? {},
                created_at: inserted.created_at,
            },
        }, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
