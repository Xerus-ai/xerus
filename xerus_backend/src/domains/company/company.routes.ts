// Company Routes
// REST API endpoints for domains, channels, and messages (organization structure)
// Frontend reads these to render the inbox sidebar hierarchy.
// Source of truth: workspace DB (SQLite on sandbox). No Neon sync for these entities.

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { UnauthorizedError, BadRequestError, NotFoundError, ConflictError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { query } from '../../database/connection';
import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';
import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { requireRunningSandbox, getDaytonaProvider } from '../sandbox-infra/sandbox/sandbox-route-helpers';
import type { MessageBridgeService } from '../inbox/messaging/message-bridge.service';
import { shellEscape, shellEscapePath } from '../../utils/shell-safety';
import { slugify, sanitizeSlug } from '../../shared/slugify';
import { strictRateLimit } from '../../middleware/rate-limit';
import {
    listDomainsWithChannels,
    createDomain,
    createChannel,
    listChannelMessages,
    createChannelMessage,
    domainExists,
    getChannelWithDomain,
} from './company-workspace-db.service';

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_MESSAGE_CONTENT_LENGTH = 50000;

const router = Router();
const auth = authenticateFirebaseToken;

// -------------------------------------------------------------------------
// Dependency Injection (set from index.ts at startup)
// -------------------------------------------------------------------------

interface CompanyRoutesDeps { sandboxService: SandboxService; messageBridge?: MessageBridgeService | null }
let companyDeps: CompanyRoutesDeps | null = null;
export function setCompanyRoutesDeps(d: CompanyRoutesDeps): void { companyDeps = d; }

// -------------------------------------------------------------------------
// Sandbox Dual-Write: append message to posts.jsonl
// This is agent IPC (inter-process communication), not Neon sync.
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
            throw new UnauthorizedError();
        }

        if (!companyDeps) {
            throw new Error('Company routes dependencies not initialized');
        }
        const { sandboxService } = companyDeps;

        // Fetch workspace from Neon (workspace identity stays on Neon)
        const wsResult = await query(
            `SELECT id::text, slug, name, description FROM workspaces WHERE user_id = $1 LIMIT 1`,
            [userId],
        );
        const workspace = wsResult.rows.length > 0 ? wsResult.rows[0] : null;

        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const domainsWithChannels = await listDomainsWithChannels(provider, sandboxId);

        // Map workspace DB shape to frontend-compatible response
        const domains = domainsWithChannels.map(d => ({
            id: d.slug,
            slug: d.slug,
            name: d.name,
            description: d.description,
            channels: d.channels.map(c => ({
                id: c.slug,
                slug: c.slug,
                name: c.name,
                description: c.description,
                agent_count: 0,
            })),
        }));

        sendResponse(res, 200, { workspace, domains }, startTime);
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
            throw new UnauthorizedError();
        }

        const name = (req.body.name as string || '').trim();
        if (!name) {
            throw new BadRequestError('name is required');
        }
        if (name.length > MAX_NAME_LENGTH) {
            throw new BadRequestError(`name must be ${MAX_NAME_LENGTH} characters or fewer`);
        }

        const slug = slugify(name);
        if (!slug) {
            throw new BadRequestError('name must contain at least one alphanumeric character');
        }

        if (!companyDeps) {
            throw new Error('Company routes dependencies not initialized');
        }
        const { sandboxService } = companyDeps;
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        // Check for slug conflict in workspace DB
        const exists = await domainExists(provider, sandboxId, slug);
        if (exists) {
            throw new ConflictError('A project with this name already exists');
        }

        const description = ((req.body.description as string || '').trim() || `${name} department`).slice(0, MAX_DESCRIPTION_LENGTH);

        const domain = await createDomain(provider, sandboxId, slug, name, description);

        // Create the domain directory on sandbox filesystem
        const domainDir = `${SANDBOX_CONFIG.workspacePath}/projects/${sanitizeSlug(slug)}`;
        await provider.executeCommand(sandboxId, `mkdir -p ${shellEscapePath(domainDir)}`);

        // Auto-create #general channel in the new project
        const channel = await createChannel(provider, sandboxId, slug, 'general', 'General', 'Default channel');

        // Create the channel directory on sandbox filesystem
        const channelDir = `${domainDir}/channels/general`;
        await provider.executeCommand(sandboxId, `mkdir -p ${shellEscapePath(channelDir)}`);

        sendResponse(res, 201, {
            domain: {
                id: domain.slug,
                slug: domain.slug,
                name: domain.name,
                description: domain.description,
            },
            channel: {
                id: channel.slug,
                slug: channel.slug,
                name: channel.name,
            },
        }, startTime);
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------------
// POST /api/v1/company/domains/:domainId/channels - Create a new channel
// Body: { name: string, description?: string }
// NOTE: domainId param is now a slug, not UUID.
// -------------------------------------------------------------------------

router.post('/domains/:domainId/channels', auth, strictRateLimit, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            throw new UnauthorizedError();
        }

        const { domainId } = req.params;
        const name = (req.body.name as string || '').trim();
        if (!name) {
            throw new BadRequestError('name is required');
        }
        if (name.length > MAX_NAME_LENGTH) {
            throw new BadRequestError(`name must be ${MAX_NAME_LENGTH} characters or fewer`);
        }

        if (!companyDeps) {
            throw new Error('Company routes dependencies not initialized');
        }
        const { sandboxService } = companyDeps;
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        // Verify domain exists in workspace DB (domainId is now a slug)
        const exists = await domainExists(provider, sandboxId, domainId);
        if (!exists) {
            throw new NotFoundError('Project');
        }

        const slug = slugify(name);
        if (!slug) {
            throw new BadRequestError('name must contain at least one alphanumeric character');
        }
        const description = (req.body.description as string || '').trim().slice(0, MAX_DESCRIPTION_LENGTH);

        let channel;
        try {
            channel = await createChannel(provider, sandboxId, domainId, slug, name, description);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('UNIQUE constraint failed') || msg.includes('already exists')) {
                throw new ConflictError('A channel with this name already exists in this project');
            }
            throw err;
        }

        // Create the channel directory on sandbox filesystem
        const channelDir = `${SANDBOX_CONFIG.workspacePath}/projects/${sanitizeSlug(domainId)}/channels/${sanitizeSlug(slug)}`;
        await provider.executeCommand(sandboxId, `mkdir -p ${shellEscapePath(channelDir)}`);

        sendResponse(res, 201, {
            channel: {
                id: channel.slug,
                slug: channel.slug,
                name: channel.name,
                description: channel.description,
            },
        }, startTime);
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------------
// GET /api/v1/company/channels/:channelId/messages - List channel messages
// Query params: limit (default 50, max 100), offset (default 0)
// NOTE: channelId is now a slug, not UUID.
// -------------------------------------------------------------------------

router.get('/channels/:channelId/messages', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            throw new UnauthorizedError();
        }

        const { channelId } = req.params;
        const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
        const offset = parseInt(req.query.offset as string, 10) || 0;

        if (!companyDeps) {
            throw new Error('Company routes dependencies not initialized');
        }
        const { sandboxService } = companyDeps;
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        // Verify channel exists in workspace DB
        const channelInfo = await getChannelWithDomain(provider, sandboxId, channelId);
        if (!channelInfo) {
            throw new NotFoundError('Channel');
        }

        const rows = await listChannelMessages(provider, sandboxId, channelId, limit, offset);

        // Map workspace DB fields to frontend-compatible response shape
        const messages = rows.map(r => {
            const parsedMetadata = r.metadata ? JSON.parse(r.metadata) : {};
            const senderType = parsedMetadata.sender_type || (r.message_type === 'system' ? 'system' : 'agent');
            const { sender_type: _st, ...cleanMetadata } = parsedMetadata;
            return {
                id: String(r.id),
                channel_id: r.channel_slug,
                sender_type: senderType,
                sender_slug: r.agent_slug,
                content: r.content,
                message_type: r.message_type,
                metadata: cleanMetadata,
                created_at: r.posted_at,
            };
        });

        sendResponse(res, 200, { messages }, startTime);
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------------
// POST /api/v1/company/channels/:channelId/messages - Human sends message
// NOTE: channelId is now a slug, not UUID.
// -------------------------------------------------------------------------

router.post('/channels/:channelId/messages', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            throw new UnauthorizedError();
        }

        const { channelId } = req.params;
        const { content, message_type, metadata } = req.body;

        if (!content || typeof content !== 'string' || content.trim() === '') {
            throw new BadRequestError('content is required');
        }
        if (content.length > MAX_MESSAGE_CONTENT_LENGTH) {
            throw new BadRequestError(`Message content exceeds maximum length of ${MAX_MESSAGE_CONTENT_LENGTH} characters`);
        }

        const validMessageTypes = new Set(['chat', 'task_update', 'status', 'system']);
        const resolvedType = validMessageTypes.has(message_type) ? message_type : 'chat';

        if (!companyDeps) {
            throw new Error('Company routes dependencies not initialized');
        }
        const { sandboxService } = companyDeps;
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        // Verify channel exists and get domain slug for the sandbox file path
        const channelInfo = await getChannelWithDomain(provider, sandboxId, channelId);
        if (!channelInfo) {
            throw new NotFoundError('Channel');
        }

        // Map frontend message_type to workspace DB message_type
        // Workspace DB allows: 'post', 'coordination', 'system'
        const dbMessageType = resolvedType === 'system' ? 'system' : 'post';

        const inserted = await createChannelMessage(
            provider, sandboxId,
            channelId,
            'human',
            userId,
            content.trim(),
            dbMessageType,
            metadata ?? {},
        );

        const channelTag = `${channelInfo.domain_slug}/${channelInfo.channel_slug}`;

        const messageEntry = {
            id: String(inserted.id),
            sender_type: 'human',
            sender_slug: userId,
            content: content.trim(),
            message_type: resolvedType,
            metadata: metadata ?? {},
            created_at: inserted.posted_at,
        };

        // Write to posts.jsonl for agent IPC (not Neon sync)
        syncMessageToSandbox(userId, channelTag, messageEntry).catch(err =>
            console.warn(`[CompanyRoutes] Sandbox sync failed for message: ${err instanceof Error ? err.message : String(err)}`),
        );

        // Forward message to running agent's CLI stdin (best-effort, non-blocking)
        if (companyDeps?.messageBridge) {
            companyDeps.messageBridge.dispatchInbound(provider, sandboxId, {
                user_id: userId,
                channel_slug: channelId,
                content: content.trim(),
            }).catch(err =>
                console.warn(`[CompanyRoutes] Runner dispatch failed: ${err instanceof Error ? err.message : String(err)}`),
            );
        }

        sendResponse(res, 201, {
            message: {
                id: String(inserted.id),
                channel_id: channelId,
                sender_type: 'human',
                sender_slug: userId,
                content: content.trim(),
                message_type: resolvedType,
                metadata: metadata ?? {},
                created_at: inserted.posted_at,
            },
        }, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
