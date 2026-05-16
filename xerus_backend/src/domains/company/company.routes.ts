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
import { requireRunningSandbox, getDaytonaProvider } from '../sandbox-infra/sandbox/sandbox-route-helpers';
import type { MessageBridgeService } from '../inbox/messaging/message-bridge.service';
import { findChannelLead } from '../inbox/messaging/message-bridge.repository';
import type { ExecutionService } from '../execution/execution.service';
import { triggerChannelExecution, syncMessageToSandbox } from './channel-execution.service';
import { shellEscapePath } from '../../utils/shell-safety';
import { slugify, sanitizeSlug } from '../../shared/slugify';
import { strictRateLimit } from '../../middleware/rate-limit';
import { scaffoldProject, scaffoldChannel } from './workspace-scaffold.service';
import { executeWorkspaceJsonQuery as execWsQuery } from '../conversations/workspace-db.helpers';
import {
    listDomainsWithChannels,
    createDomain,
    createChannel,
    listChannelMessages,
    createChannelMessage,
    domainExists,
    getChannelWithDomain,
    updateChannel,
    getProjectOverview,
} from './company-workspace-db.service';
import { addSystemAgentsToChannel } from './system-agent-assignment.service';
import { logger } from '../../utils/logger';

const log = logger('CompanyRoutes');

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_MESSAGE_CONTENT_LENGTH = 50000;

const router = Router();
const auth = authenticateFirebaseToken;

// -------------------------------------------------------------------------
// Dependency Injection (set from index.ts at startup)
// -------------------------------------------------------------------------

interface CompanyRoutesDeps {
    sandboxService: SandboxService;
    messageBridge?: MessageBridgeService | null;
    executionService?: ExecutionService | null;
}
let companyDeps: CompanyRoutesDeps | null = null;
export function setCompanyRoutesDeps(d: CompanyRoutesDeps): void { companyDeps = d; }

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

        // Map workspace DB shape to frontend-compatible response.
        // Channel DB slugs are domain-scoped (e.g. "marketing--general").
        // We provide both the full DB slug (as `id` for API calls) and a
        // short URL-friendly slug (strip the domain prefix) for routing.
        const domains = domainsWithChannels.map(d => {
            const prefix = `${d.slug}--`;
            return {
                id: d.slug,
                slug: d.slug,
                name: d.name,
                description: d.description,
                channels: d.channels.map(c => ({
                    id: c.slug,
                    slug: c.slug.startsWith(prefix) ? c.slug.slice(prefix.length) : c.slug,
                    name: c.name,
                    description: c.description,
                    agent_count: 0,
                })),
            };
        });

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
        // Channel slug is domain-scoped (e.g. "marketing--general") to satisfy the
        // channels.slug PRIMARY KEY uniqueness constraint.
        const generalSlug = `${slug}--general`;
        const channel = await createChannel(provider, sandboxId, slug, generalSlug, 'General', 'Default channel');

        // Create the channel directory on sandbox filesystem
        const channelDir = `${domainDir}/channels/general`;
        await provider.executeCommand(sandboxId, `mkdir -p ${shellEscapePath(channelDir)}`);

        // Scaffold project and channel template files (CLAUDE.md, context.md, etc.)
        await scaffoldProject(provider, sandboxId, slug, {
            PROJECT_NAME: name,
            PROJECT_MISSION: description,
        }).catch(err => log.warn('Project scaffold failed (non-critical)', { error: (err as Error).message }));

        await scaffoldChannel(provider, sandboxId, slug, 'general', {
            CHANNEL_NAME: 'General',
            CHANNEL_MISSION: `Default channel for ${name}`,
        }).catch(err => log.warn('Channel scaffold failed (non-critical)', { error: (err as Error).message }));

        await addSystemAgentsToChannel(provider, sandboxId, generalSlug);

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

        const domainId = sanitizeSlug(req.params.domainId);
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

        const nameSlug = slugify(name);
        if (!nameSlug) {
            throw new BadRequestError('name must contain at least one alphanumeric character');
        }
        // Channel slug is domain-scoped to satisfy channels.slug PRIMARY KEY uniqueness
        const channelDbSlug = `${domainId}--${nameSlug}`;
        const description = (req.body.description as string || '').trim().slice(0, MAX_DESCRIPTION_LENGTH);

        let channel;
        try {
            channel = await createChannel(provider, sandboxId, domainId, channelDbSlug, name, description);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('UNIQUE constraint failed') || msg.includes('already exists')) {
                throw new ConflictError('A channel with this name already exists in this project');
            }
            throw err;
        }

        // Create the channel directory on sandbox filesystem
        const channelDir = `${SANDBOX_CONFIG.workspacePath}/projects/${sanitizeSlug(domainId)}/channels/${sanitizeSlug(nameSlug)}`;
        await provider.executeCommand(sandboxId, `mkdir -p ${shellEscapePath(channelDir)}`);

        // Scaffold channel template files (CLAUDE.md, context.md, shift.yaml, AGENTS.md)
        await scaffoldChannel(provider, sandboxId, sanitizeSlug(domainId), sanitizeSlug(nameSlug), {
            CHANNEL_NAME: name,
            CHANNEL_MISSION: description || `Channel: ${name}`,
        }).catch(err => log.warn('Channel scaffold failed (non-critical)', { error: (err as Error).message }));

        await addSystemAgentsToChannel(provider, sandboxId, channelDbSlug);

        sendResponse(res, 201, {
            channel: {
                id: channel.slug,
                slug: nameSlug,
                name: channel.name,
                description: channel.description,
            },
        }, startTime);
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------------
// PATCH /api/v1/company/channels/:channelId - Update channel name/description
// -------------------------------------------------------------------------

router.patch('/channels/:channelId', auth, strictRateLimit, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) throw new UnauthorizedError();
        if (!companyDeps) throw new Error('Company routes dependencies not initialized');
        const { sandboxService } = companyDeps;
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const channelId = sanitizeSlug(req.params.channelId);
        const { name, description } = req.body;
        const updates: { name?: string; description?: string } = {};
        if (typeof name === 'string' && name.trim()) updates.name = name.trim().slice(0, MAX_NAME_LENGTH);
        if (typeof description === 'string') updates.description = description.trim().slice(0, MAX_DESCRIPTION_LENGTH);
        if (Object.keys(updates).length === 0) throw new BadRequestError('No valid fields to update');

        const updated = await updateChannel(provider, sandboxId, channelId, updates);
        if (!updated) throw new NotFoundError('Channel');

        const prefix = `${updated.domain_slug}--`;
        sendResponse(res, 200, {
            channel: {
                id: updated.slug,
                slug: updated.slug.startsWith(prefix) ? updated.slug.slice(prefix.length) : updated.slug,
                name: updated.name,
                description: updated.description,
            },
        }, startTime);
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------------
// GET /api/v1/company/domains/:domainId/overview - Project dashboard overview
// Returns aggregated project data: mission, channels, agents, costs, sessions
// -------------------------------------------------------------------------

router.get('/domains/:domainId/overview', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) throw new UnauthorizedError();
        if (!companyDeps) throw new Error('Company routes dependencies not initialized');

        const { sandboxService } = companyDeps;
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const domainId = sanitizeSlug(req.params.domainId);
        const overview = await getProjectOverview(provider, sandboxId, domainId);
        if (!overview) throw new NotFoundError('Project');

        let readme = '';
        try {
            readme = await provider.readFile(
                sandboxId,
                `${SANDBOX_CONFIG.workspacePath}/projects/${sanitizeSlug(domainId)}/CLAUDE.md`,
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (!msg.includes('ENOENT') && !msg.includes('No such file') && !msg.includes('not found')) {
                throw err;
            }
        }

        const prefix = `${domainId}--`;
        sendResponse(res, 200, {
            domain: {
                slug: overview.domain.slug,
                name: overview.domain.name,
                description: overview.domain.description,
            },
            readme,
            channels: overview.channels.map(c => ({
                slug: c.slug.startsWith(prefix) ? c.slug.slice(prefix.length) : c.slug,
                id: c.slug,
                name: c.name,
                description: c.description,
                agent_count: c.agent_count,
                lead_name: c.lead_name,
            })),
            agents: overview.agents,
            recent_sessions: overview.recent_sessions,
            cost_summary: overview.cost_summary,
        }, startTime);
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------------
// GET /api/v1/company/channels/:channelId/agents - List agents in channel
// Queries Neon for all user agents, then checks each agent's filesystem
// config to see if it has this channel assigned. Returns matching agents
// with their Neon metadata (name, avatar, model, status).
// -------------------------------------------------------------------------

router.get('/channels/:channelId/agents', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) throw new UnauthorizedError();
        if (!companyDeps) throw new Error('Company routes dependencies not initialized');
        const { sandboxService } = companyDeps;
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const channelSlug = sanitizeSlug(req.params.channelId);

        // Get all agent slugs for this user from Neon agent_registry
        const registryResult = await query<{ id: string; slug: string }>(
            `SELECT id::text, slug FROM agent_registry
             WHERE user_id = $1 AND agent_type IN ('private', 'public')
             ORDER BY created_at DESC LIMIT 100`,
            [userId],
        );

        // Get real-time agent statuses from workspace.db (updated by runner events)
        const agentStatuses = new Map<string, string>();
        try {
            const statusRows = await execWsQuery<{ slug: string; status: string }>(
                provider, sandboxId,
                `SELECT slug, status FROM agents`,
            );
            for (const sr of statusRows) agentStatuses.set(sr.slug, sr.status);
        } catch {
            // workspace.db may not have agents table populated yet
        }

        // For each agent, read config.json from sandbox and check channel membership
        const matchingAgents: Array<Record<string, unknown>> = [];
        for (const row of registryResult.rows) {
            try {
                const configRaw = await provider.readFile(
                    sandboxId,
                    `${SANDBOX_CONFIG.workspacePath}/agents/${row.slug}/config.json`,
                );
                const config = JSON.parse(configRaw);
                const agentChannels: string[] = config.channels || [];
                if (agentChannels.includes(channelSlug)) {
                    const tools: string[] = (config.tools as string[]) || [];
                    const skills: string[] = (config.skills as string[]) || [];
                    // Use workspace.db status (real-time from runner events) over config.json
                    const liveStatus = agentStatuses.get(row.slug) || (config.status as string) || 'idle';
                    matchingAgents.push({
                        id: row.id,
                        name: config.name || row.slug,
                        slug: row.slug,
                        avatar_url: config.mascot || config.avatar_url || null,
                        ai_model: config.ai_model || config.model || null,
                        adapter_type: config.adapter_type || null,
                        status: liveStatus,
                        description: config.description || null,
                        tools,
                        skills,
                    });
                }
            } catch (err) {
                log.error('Failed to read agent config from sandbox', { error: (err as Error).message, slug: row.slug });
            }
        }

        sendResponse(res, 200, { agents: matchingAgents }, startTime);
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

        const channelId = sanitizeSlug(req.params.channelId);
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

        // Collect unique agent slugs for name resolution
        const agentSlugs = new Set<string>();
        for (const r of rows) {
            const parsed = r.metadata ? JSON.parse(r.metadata) : {};
            if (parsed.sender_type !== 'human' && r.message_type !== 'system') {
                agentSlugs.add(r.agent_slug);
            }
        }

        // Resolve agent display names from workspace agent configs
        const agentNames = new Map<string, string>();
        for (const slug of agentSlugs) {
            try {
                const configRaw = await provider.readFile(
                    sandboxId,
                    `${SANDBOX_CONFIG.workspacePath}/agents/${slug}/config.json`,
                );
                const config = JSON.parse(configRaw);
                if (config.name) agentNames.set(slug, config.name);
            } catch {
                // Agent config not found — sender_name will fall back to slug
            }
        }

        // Map workspace DB fields to frontend-compatible response shape
        const messages = rows.map(r => {
            const parsedMetadata = r.metadata ? JSON.parse(r.metadata) : {};
            const senderType = parsedMetadata.sender_type || (r.message_type === 'system' ? 'system' : 'agent');
            const { sender_type: _st, ...cleanMetadata } = parsedMetadata;

            // Resolve display name: "You" for humans, agent name for agents, slug fallback
            let senderName = r.agent_slug;
            if (senderType === 'human') {
                senderName = 'You';
            } else if (agentNames.has(r.agent_slug)) {
                senderName = agentNames.get(r.agent_slug)!;
            }

            return {
                id: String(r.id),
                channel_id: r.channel_slug,
                sender_type: senderType,
                sender_slug: r.agent_slug,
                sender_name: senderName,
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

router.post('/channels/:channelId/messages', auth, strictRateLimit, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            throw new UnauthorizedError();
        }

        const channelId = sanitizeSlug(req.params.channelId);
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
        syncMessageToSandbox(sandboxService, userId, channelTag, messageEntry).catch(err =>
            log.warn('Sandbox sync failed for message', { error: err instanceof Error ? err.message : String(err) }),
        );

        // Resolve target agent: @mention > channel lead > first channel member
        // Then forward to running session or trigger new execution.
        (async () => {
            // 1. Parse @mention from human message content (e.g. "@strategist do X")
            const mentionMatch = content.trim().match(/(?:^|[\s])@([a-zA-Z][a-zA-Z0-9_-]*)/);
            let targetAgent = mentionMatch ? mentionMatch[1] : null;

            // 2. Fall back to channel lead
            if (!targetAgent) {
                targetAgent = await findChannelLead(provider, sandboxId, channelId);
            }

            // 3. Fall back to first agent assigned to this channel via config.json
            //    (channel_members table may be empty for pre-existing assignments)
            if (!targetAgent) {
                const { escapeSQL: esc } = await import('../conversations/workspace-db.helpers');

                // First try channel_members table
                const memberRows = await execWsQuery<{ agent_slug: string }>(
                    provider, sandboxId,
                    `SELECT agent_slug FROM channel_members WHERE channel_slug = '${esc(channelId)}' LIMIT 1`,
                ).catch(() => [] as Array<{ agent_slug: string }>);

                if (memberRows.length > 0) {
                    targetAgent = memberRows[0].agent_slug;
                } else {
                    // Fallback: scan agent configs from filesystem (same source as GET /channels/:id/agents)
                    const agentRegistry = await query<{ slug: string }>(
                        `SELECT slug FROM agent_registry WHERE user_id = $1 AND agent_type IN ('private', 'public') ORDER BY created_at DESC LIMIT 50`,
                        [userId],
                    );
                    for (const row of agentRegistry.rows) {
                        try {
                            const cfgRaw = await provider.readFile(
                                sandboxId,
                                `${SANDBOX_CONFIG.workspacePath}/agents/${row.slug}/config.json`,
                            );
                            const cfg = JSON.parse(cfgRaw);
                            if (Array.isArray(cfg.channels) && cfg.channels.includes(channelId)) {
                                targetAgent = row.slug;
                                break;
                            }
                        } catch { /* skip */ }
                    }
                }

                // Backfill lead_agent_slug so future messages route directly
                if (targetAgent) {
                    log.info('Auto-setting channel lead', { channel: channelId, agent: targetAgent });
                    await execWsQuery(provider, sandboxId,
                        `UPDATE channels SET lead_agent_slug = '${esc(targetAgent)}' WHERE slug = '${esc(channelId)}' AND lead_agent_slug IS NULL`,
                    ).catch(() => {});
                }
            }

            if (!targetAgent) {
                log.debug('No agents in channel, skipping execution', { channel: channelId });
                return;
            }

            log.info('Routing channel message to agent', { channel: channelId, target: targetAgent });

            // Try forwarding to already-running agent session (dispatch-only, no DB write)
            let dispatched = false;
            if (companyDeps?.messageBridge) {
                dispatched = await companyDeps.messageBridge.trySendToAgent(
                    userId, targetAgent,
                    channelInfo.domain_slug, channelInfo.channel_slug,
                    'user', content.trim(),
                );
            }

            // If no active session, trigger execution via execution service
            if (!dispatched && companyDeps?.executionService) {
                await triggerChannelExecution(
                    companyDeps.executionService,
                    provider,
                    sandboxId,
                    userId,
                    targetAgent,
                    content.trim(),
                    channelId,
                );
            }
        })().catch(err =>
            log.warn('Channel agent dispatch failed', {
                channel: channelId,
                error: err instanceof Error ? err.message : String(err),
            }),
        );

        sendResponse(res, 201, {
            message: {
                id: String(inserted.id),
                channel_id: channelId,
                sender_type: 'human',
                sender_slug: userId,
                sender_name: 'You',
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
