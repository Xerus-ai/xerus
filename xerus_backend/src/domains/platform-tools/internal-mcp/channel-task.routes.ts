// Channel & Task Routes
// Handles create_channel, add_to_channel, create_task MCP tools
// Queries workspace.db (SQLite) on sandbox via executeWorkspaceJsonQuery.

import crypto from 'crypto';
import { Router, Response, NextFunction } from 'express';
import { BadRequestError } from '../../../utils/errors';
import { InternalMcpRequest, McpToolResult } from './types';
import { escapeSQL, executeWorkspaceJsonQuery, executeWorkspaceQuery } from '../../conversations/workspace-db.helpers';
import { requireRunningSandbox, getDaytonaProvider } from '../../sandbox-infra/sandbox/sandbox-route-helpers';
import type { SandboxService } from '../../sandbox-infra/sandbox/sandbox.service';
import { workspaceSSEBroadcaster } from '../../drive';
import { scaffoldChannel } from '../../company/workspace-scaffold.service';
import { addSystemAgentsToChannel, assignAgentToChannel } from '../../company/system-agent-assignment.service';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

// ---------------------------------------------------------------------------
// Dependencies (injected at startup)
// ---------------------------------------------------------------------------

let _sandboxService: SandboxService | null = null;

export function setChannelTaskRoutesDeps(deps: { sandboxService: SandboxService }): void {
    _sandboxService = deps.sandboxService;
}

function getSandboxService(): SandboxService {
    if (!_sandboxService) {
        throw new Error('Channel task routes dependencies not initialized');
    }
    return _sandboxService;
}

// ---------------------------------------------------------------------------
// workspace.db row types
// ---------------------------------------------------------------------------

interface ChannelRow {
    slug: string;
    name: string;
    domain_slug: string;
    lead_agent_slug: string | null;
    description: string | null;
    created_at: string;
}

interface AgentRow {
    slug: string;
    name: string;
}

interface TaskRow {
    id: string;
    project_slug: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    assigned_agent: string | null;
    created_at: string;
}

const router = Router();

// POST /mcp/create_channel
router.post('/create_channel', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { name, project_id, description, agent_ids } = req.body;
        const userId = req.sandbox!.userId;

        if (!name || typeof name !== 'string') {
            throw new BadRequestError('name is required');
        }

        const bareSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (!SLUG_PATTERN.test(bareSlug)) {
            throw new BadRequestError(`Invalid channel name: ${name}. Slug must match ${SLUG_PATTERN}`);
        }

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        // Ensure the domain exists (use project_id as domain_slug, default to 'default')
        const domainSlug = project_id || 'default';
        const channelSlug = `${domainSlug}--${bareSlug}`;

        // Idempotent creation: if a channel with this slug already exists, return it
        // instead of erroring or re-scaffolding. Prevents duplicate-channel attempts
        // from the agent calling create_channel twice with the same name.
        const existingChannelRows = await executeWorkspaceJsonQuery<ChannelRow>(
            provider, sandboxId,
            `SELECT slug, name, domain_slug, lead_agent_slug, description, created_at FROM channels WHERE slug = '${escapeSQL(channelSlug)}'`,
        );
        if (existingChannelRows.length > 0) {
            const existing = existingChannelRows[0];
            const existingResult: McpToolResult = {
                success: true,
                data: {
                    channel: {
                        slug: existing.slug,
                        name: existing.name,
                        description: existing.description || '',
                        domain_slug: existing.domain_slug,
                        lead_agent_slug: existing.lead_agent_slug || null,
                        agent_ids: agent_ids || [],
                        created_at: existing.created_at,
                    },
                },
            };
            res.json(existingResult);
            return;
        }

        // Determine lead agent (first in agent_ids list, if provided)
        const leadAgent = Array.isArray(agent_ids) && agent_ids.length > 0
            ? `'${escapeSQL(String(agent_ids[0]))}'`
            : 'NULL';

        const descValue = description ? `'${escapeSQL(description)}'` : 'NULL';

        // Combine domain upsert + channel insert + select into a single round-trip
        const sql = `
            INSERT OR IGNORE INTO domains (slug, name) VALUES ('${escapeSQL(domainSlug)}', '${escapeSQL(domainSlug)}');
            INSERT INTO channels (slug, name, domain_slug, lead_agent_slug, description)
            VALUES ('${escapeSQL(channelSlug)}', '${escapeSQL(name)}', '${escapeSQL(domainSlug)}', ${leadAgent}, ${descValue});
            SELECT slug, name, domain_slug, lead_agent_slug, description, created_at
            FROM channels WHERE slug = '${escapeSQL(channelSlug)}';
        `;

        const rows = await executeWorkspaceJsonQuery<ChannelRow>(provider, sandboxId, sql);

        // Validate all agent_ids exist before creating members (prevents orphan channel with no members)
        if (Array.isArray(agent_ids) && agent_ids.length > 0) {
            const checkSql = `SELECT slug FROM agents WHERE slug IN (${agent_ids.map((id: string) => `'${escapeSQL(String(id))}'`).join(',')})`;
            const existingAgents = await executeWorkspaceJsonQuery<AgentRow>(provider, sandboxId, checkSql);
            const existingSlugs = new Set(existingAgents.map((a) => a.slug));
            const missing = agent_ids.filter((id: string) => !existingSlugs.has(id));
            if (missing.length > 0) {
                throw new BadRequestError(`Agents not found: ${missing.join(', ')}`);
            }

            const memberInserts = agent_ids.map((aid: string, idx: number) => {
                const role = idx === 0 ? 'lead' : 'member';
                return `INSERT OR IGNORE INTO channel_members (channel_slug, agent_slug, role) VALUES ('${escapeSQL(channelSlug)}', '${escapeSQL(String(aid))}', '${role}')`;
            });
            await executeWorkspaceQuery(provider, sandboxId, `BEGIN;\n${memberInserts.join(';\n')};\nCOMMIT;`);
        }

        const row = rows[0];
        if (!row) {
            throw new BadRequestError('Failed to create channel — database insert returned no result');
        }

        // Scaffold channel filesystem (CLAUDE.md, context.md, shift.yaml, AGENTS.md)
        await scaffoldChannel(provider, sandboxId, domainSlug, channelSlug, {
            CHANNEL_NAME: name,
            CHANNEL_MISSION: description || `Channel: ${name}`,
        });
        await addSystemAgentsToChannel(provider, sandboxId, channelSlug);

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                channel: {
                    slug: row.slug,
                    name: row.name,
                    description: row.description || '',
                    domain_slug: row.domain_slug,
                    lead_agent_slug: row.lead_agent_slug || null,
                    agent_ids: agent_ids || [],
                    created_at: row.created_at,
                },
            },
        };

        workspaceSSEBroadcaster.broadcastFileChanged(userId, {
            type: 'file_changed', path: `channels/${channelSlug}`, action: 'created',
            timestamp: new Date().toISOString(),
        });

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/add_to_channel
router.post('/add_to_channel', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { channel_id, agent_id, role } = req.body;
        const userId = req.sandbox!.userId;

        if (!channel_id || typeof channel_id !== 'string') {
            throw new BadRequestError('channel_id is required');
        }
        if (!agent_id) {
            throw new BadRequestError('agent_id is required');
        }

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        // agent_id is treated as slug in workspace.db
        const agentSlugRaw = String(agent_id);
        const agentRows = await executeWorkspaceJsonQuery<AgentRow>(
            provider, sandboxId,
            `SELECT slug, name FROM agents WHERE slug = '${escapeSQL(agentSlugRaw)}'`,
        );

        if (agentRows.length === 0) {
            throw new BadRequestError(`Agent not found: ${agent_id}`);
        }

        // Sync every source of truth: config.json channels[], index.json, the
        // channel_members row, and lead_agent_slug. Updating only channel_members
        // leaves the agent invisible in the channel (frontend reads config.json).
        await assignAgentToChannel(provider, sandboxId, agentSlugRaw, channel_id);

        // Honor an explicit role override (e.g. promoting to lead). The helper
        // assigns 'lead' only for the agent's primary channel, so apply the
        // caller's role here when supplied.
        const memberRole = typeof role === 'string' && role.length > 0 ? role : null;
        if (memberRole) {
            await executeWorkspaceQuery(
                provider, sandboxId,
                `UPDATE channel_members SET role = '${escapeSQL(memberRole)}' WHERE channel_slug = '${escapeSQL(channel_id)}' AND agent_slug = '${escapeSQL(agentSlugRaw)}'`,
            );
            if (memberRole === 'lead') {
                await executeWorkspaceQuery(
                    provider, sandboxId,
                    `UPDATE channels SET lead_agent_slug = '${escapeSQL(agentSlugRaw)}', updated_at = '${new Date().toISOString()}' WHERE slug = '${escapeSQL(channel_id)}'`,
                );
            }
        }

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                added: true,
                channel_id,
                agent_slug: agentRows[0].slug,
                role: memberRole || 'member',
            },
        };

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/create_task
router.post('/create_task', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { channel_id, title, description, assigned_agent_ids, priority, subtasks } = req.body;
        const userId = req.sandbox!.userId;

        if (!channel_id || typeof channel_id !== 'string') {
            throw new BadRequestError('channel_id is required');
        }
        if (!title || typeof title !== 'string') {
            throw new BadRequestError('title is required');
        }

        const validPriorities = ['low', 'medium', 'high', 'critical'];
        if (priority && !validPriorities.includes(priority)) {
            throw new BadRequestError(`Invalid priority: ${priority}. Must be one of: ${validPriorities.join(', ')}`);
        }

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        // Normalize channel_id to domain--channel format for project_slug
        let normalizedChannelId = channel_id;
        if (!channel_id.includes('--')) {
            // Bare slug — look up the channel in workspace.db to find the full domain--channel slug
            const channelLookupSql = `SELECT slug, domain_slug FROM channels WHERE slug LIKE '%--${escapeSQL(channel_id)}' OR slug = '${escapeSQL(channel_id)}' LIMIT 1`;
            const channelRows = await executeWorkspaceJsonQuery<{ slug: string; domain_slug: string }>(provider, sandboxId, channelLookupSql);
            if (channelRows.length > 0) {
                normalizedChannelId = channelRows[0].slug;
            } else {
                // Channel not found by suffix match — try looking up domain_slug for this channel
                const domainLookupSql = `SELECT domain_slug FROM channels WHERE slug = '${escapeSQL(channel_id)}' LIMIT 1`;
                const domainRows = await executeWorkspaceJsonQuery<{ domain_slug: string }>(provider, sandboxId, domainLookupSql);
                if (domainRows.length > 0) {
                    normalizedChannelId = `${domainRows[0].domain_slug}--${channel_id}`;
                }
                // If still not found, use as-is — the insert will fail with a clear error downstream
            }
        }

        // Idempotent creation: if a task with the same title already exists in this
        // channel, return it instead of inserting a duplicate. Task IDs are generated
        // per-call, so without this check repeated create_task calls always duplicate.
        const existingTaskRows = await executeWorkspaceJsonQuery<TaskRow>(
            provider, sandboxId,
            `SELECT id, project_slug, title, description, status, priority, assigned_agent, created_at
             FROM tasks WHERE project_slug = '${escapeSQL(normalizedChannelId)}' AND title = '${escapeSQL(title)}' LIMIT 1`,
        );
        if (existingTaskRows.length > 0) {
            const existing = existingTaskRows[0];
            const existingResult: McpToolResult = {
                success: true,
                data: {
                    task: {
                        id: existing.id,
                        channel_id,
                        title: existing.title,
                        description: existing.description || '',
                        assigned_agent_ids: existing.assigned_agent ? [existing.assigned_agent] : [],
                        priority: existing.priority,
                        subtasks: subtasks || [],
                        status: existing.status,
                        created_by: userId,
                        created_at: existing.created_at,
                    },
                },
            };
            res.json(existingResult);
            return;
        }

        const taskId = `task-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        const taskPriority = priority || 'medium';
        const descValue = description ? `'${escapeSQL(description)}'` : 'NULL';
        const assignedAgent = Array.isArray(assigned_agent_ids) && assigned_agent_ids.length > 0
            ? `'${escapeSQL(String(assigned_agent_ids[0]))}'`
            : 'NULL';
        const labelsValue = subtasks && Array.isArray(subtasks) && subtasks.length > 0
            ? `'${escapeSQL(JSON.stringify(subtasks))}'`
            : 'NULL';

        const sql = `
            BEGIN;
            INSERT INTO tasks (id, project_slug, title, description, status, priority, assigned_agent, labels)
            VALUES (
                '${escapeSQL(taskId)}',
                '${escapeSQL(normalizedChannelId)}',
                '${escapeSQL(title)}',
                ${descValue},
                'open',
                '${escapeSQL(taskPriority)}',
                ${assignedAgent},
                ${labelsValue}
            );
            SELECT id, project_slug, title, description, status, priority, assigned_agent, created_at
            FROM tasks WHERE id = '${escapeSQL(taskId)}';
            COMMIT;
        `;

        const rows = await executeWorkspaceJsonQuery<TaskRow>(provider, sandboxId, sql);

        const row = rows[0];
        if (!row) {
            throw new BadRequestError('Failed to create task — database insert returned no result');
        }
        const mcpResult: McpToolResult = {
            success: true,
            data: {
                task: {
                    id: row.id,
                    channel_id,
                    title: row.title,
                    description: row.description || '',
                    assigned_agent_ids: assigned_agent_ids || [],
                    priority: row.priority,
                    subtasks: subtasks || [],
                    status: row.status,
                    created_by: userId,
                    created_at: row.created_at,
                },
            },
        };

        workspaceSSEBroadcaster.broadcastFileChanged(userId, {
            type: 'file_changed', path: `tasks/${taskId}`, action: 'created',
            timestamp: new Date().toISOString(),
        });

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

export { router as channelTaskRoutes };
