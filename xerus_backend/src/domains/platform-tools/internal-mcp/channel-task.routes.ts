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
import { SANDBOX_CONFIG } from '../../sandbox-infra/sandbox/sandbox.config';
import { workspaceSSEBroadcaster } from '../../drive';
import { scaffoldChannel } from '../../company/workspace-scaffold.service';
import { addSystemAgentsToChannel, assignAgentToChannel } from '../../company/system-agent-assignment.service';
import { logMcpActivity } from './activity-logger';
import { logger } from '../../../utils/logger';

const log = logger('channel-task-routes');
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

interface SubtaskItem { text: string; done: boolean }
interface AttachmentItem { name: string; path: string; type: string }

function parseDependencies(raw: string | null): { subtasks: SubtaskItem[]; attachments: AttachmentItem[] } {
    if (!raw) return { subtasks: [], attachments: [] };
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const subtasks = Array.isArray(parsed.subtasks) ? parsed.subtasks as SubtaskItem[] : [];
        const attachments = Array.isArray(parsed.attachments) ? parsed.attachments as AttachmentItem[] : [];
        return { subtasks, attachments };
    } catch {
        return { subtasks: [], attachments: [] };
    }
}

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

        await logMcpActivity(provider, sandboxId, {
            channelSlug,
            action: 'channel_created',
            summary: `Channel "${name}" created in ${domainSlug}`,
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

        await logMcpActivity(provider, sandboxId, {
            channelSlug: channel_id,
            action: 'agent_added_to_channel',
            summary: `@${agentRows[0].slug} added to #${channel_id} as ${memberRole || 'member'}`,
        });

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/create_task
router.post('/create_task', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { channel_id, title, description, description_file, assigned_agent_ids, priority, subtasks } = req.body;
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

        // Resolve description_file: if the agent wrote a detailed description to a file,
        // read it and use it as the full description + store as attachment metadata
        let resolvedDescription = description || null;
        let attachmentPath: string | null = null;
        if (description_file && typeof description_file === 'string') {
            try {
                const ws = SANDBOX_CONFIG.workspacePath;
                const filePath = description_file.startsWith('/')
                    ? description_file
                    : `${ws}/${description_file}`;
                const fileContent = await provider.readFile(sandboxId, filePath);
                if (fileContent && fileContent.trim().length > 0) {
                    resolvedDescription = fileContent.trim();
                    attachmentPath = description_file;
                }
            } catch (err) {
                log.debug('description_file read failed, using inline description', {
                    file: description_file,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

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
        const existingTaskRows = await executeWorkspaceJsonQuery<TaskRow & { dependencies: string | null }>(
            provider, sandboxId,
            `SELECT id, project_slug, title, description, status, priority, assigned_agent, dependencies, created_at
             FROM tasks WHERE project_slug = '${escapeSQL(normalizedChannelId)}' AND title = '${escapeSQL(title)}' LIMIT 1`,
        );
        if (existingTaskRows.length > 0) {
            const existing = existingTaskRows[0];
            const existingDeps = parseDependencies(existing.dependencies);
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
                        subtasks: existingDeps.subtasks,
                        attachments: existingDeps.attachments,
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
        const descValue = resolvedDescription ? `'${escapeSQL(resolvedDescription)}'` : 'NULL';
        const assignedAgentSlug = Array.isArray(assigned_agent_ids) && assigned_agent_ids.length > 0
            ? String(assigned_agent_ids[0])
            : null;
        const assignedAgent = assignedAgentSlug
            ? `'${escapeSQL(assignedAgentSlug)}'`
            : 'NULL';
        // Subtasks are checklist items — store as structured JSON in dependencies column.
        // Previously these were incorrectly stored in the labels column.
        const subtaskItems = subtasks && Array.isArray(subtasks) && subtasks.length > 0
            ? subtasks.map((s: string) => ({ text: String(s), done: false }))
            : [];
        const depsPayload: Record<string, unknown> = {};
        if (subtaskItems.length > 0) depsPayload.subtasks = subtaskItems;
        if (attachmentPath) depsPayload.attachments = [{ name: attachmentPath.split('/').pop() || 'description.md', path: attachmentPath, type: 'markdown' }];
        const depsValue = Object.keys(depsPayload).length > 0
            ? `'${escapeSQL(JSON.stringify(depsPayload))}'`
            : 'NULL';

        // Ensure the assigned agent exists in the agents table before inserting the task.
        // Without this, the FK constraint (assigned_agent REFERENCES agents(slug)) rejects
        // the entire INSERT and the task silently fails to create.
        const ensureAgentSql = assignedAgentSlug
            ? `INSERT OR IGNORE INTO agents (slug, name, adapter_type, role, autonomy_level, status)
               VALUES ('${escapeSQL(assignedAgentSlug)}', '${escapeSQL(assignedAgentSlug)}', 'claudecode', 'specialist', 'supervised', 'idle');`
            : '';

        const sql = `
            BEGIN;
            ${ensureAgentSql}
            INSERT INTO tasks (id, project_slug, title, description, status, priority, assigned_agent, dependencies)
            VALUES (
                '${escapeSQL(taskId)}',
                '${escapeSQL(normalizedChannelId)}',
                '${escapeSQL(title)}',
                ${descValue},
                'open',
                '${escapeSQL(taskPriority)}',
                ${assignedAgent},
                ${depsValue}
            );
            SELECT id, project_slug, title, description, status, priority, assigned_agent, dependencies, created_at
            FROM tasks WHERE id = '${escapeSQL(taskId)}';
            COMMIT;
        `;

        const rows = await executeWorkspaceJsonQuery<TaskRow & { dependencies: string | null }>(provider, sandboxId, sql);

        const row = rows[0];
        if (!row) {
            throw new BadRequestError('Failed to create task — database insert returned no result');
        }
        const parsedDeps = parseDependencies(row.dependencies);
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
                    subtasks: parsedDeps.subtasks,
                    attachments: parsedDeps.attachments,
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

        const assignedLabel = Array.isArray(assigned_agent_ids) && assigned_agent_ids.length > 0
            ? ` and assigned to @${assigned_agent_ids[0]}`
            : '';
        await logMcpActivity(provider, sandboxId, {
            channelSlug: normalizedChannelId,
            action: 'task_created',
            summary: `Task "${title}" created${assignedLabel}`,
            taskId: taskId,
        });

        // Agent wakeup: if task is assigned, trigger execution for the assigned agent
        if (Array.isArray(assigned_agent_ids) && assigned_agent_ids.length > 0) {
            const assignedSlug = String(assigned_agent_ids[0]);
            const taskPrompt = [
                `You have been assigned a new task:`,
                ``,
                `**Title**: ${title}`,
                resolvedDescription ? `**Description**: ${resolvedDescription}` : '',
                `**Priority**: ${taskPriority}`,
                `**Task ID**: ${taskId}`,
                `**Channel**: ${channel_id}`,
                ``,
                `Work on this task now.`,
            ].filter(Boolean).join('\n');

            try {
                const { triggerChannelExecution } = await import('../../company/channel-execution.service');
                const { getExecutionService } = await import('../../execution/execution.routes');
                const execService = getExecutionService();
                triggerChannelExecution(
                    execService,
                    provider,
                    sandboxId,
                    userId,
                    assignedSlug,
                    taskPrompt,
                    normalizedChannelId,
                    'task_assigned',
                ).catch(err => {
                    log.warn('Task-assigned wakeup failed (non-blocking)', {
                        agent: assignedSlug,
                        task: taskId,
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
            } catch (err) {
                log.warn('Task-assigned wakeup skipped (service not ready)', {
                    agent: assignedSlug,
                    task: taskId,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

// POST /mcp/update_task
router.post('/update_task', async (req: InternalMcpRequest, res: Response, next: NextFunction) => {
    try {
        const { task_id, status, comment, attachments } = req.body;
        const userId = req.sandbox!.userId;

        if (!task_id || typeof task_id !== 'string') {
            throw new BadRequestError('task_id is required');
        }

        const validStatuses = ['open', 'in_progress', 'completed', 'blocked'];
        if (status && !validStatuses.includes(status)) {
            throw new BadRequestError(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
        }

        const sandboxService = getSandboxService();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        // Verify task exists
        const existingRows = await executeWorkspaceJsonQuery<TaskRow & { dependencies: string | null }>(
            provider, sandboxId,
            `SELECT id, project_slug, title, description, status, priority, assigned_agent, dependencies, created_at
             FROM tasks WHERE id = '${escapeSQL(task_id)}'`,
        );
        if (existingRows.length === 0) {
            throw new BadRequestError(`Task not found: ${task_id}`);
        }
        const existing = existingRows[0];

        // Build SET clauses
        const setClauses: string[] = [];
        if (status) {
            setClauses.push(`status = '${escapeSQL(status)}'`);
        }

        // Merge attachments into dependencies JSON
        if (Array.isArray(attachments) && attachments.length > 0) {
            const deps = parseDependencies(existing.dependencies);
            for (const att of attachments) {
                if (att && typeof att === 'object' && att.name && att.path) {
                    deps.attachments.push({
                        name: String(att.name),
                        path: String(att.path),
                        type: String(att.type || 'file'),
                    });
                }
            }
            const depsJson = JSON.stringify({ subtasks: deps.subtasks, attachments: deps.attachments });
            setClauses.push(`dependencies = '${escapeSQL(depsJson)}'`);
        }

        // Build combined multi-statement SQL to minimize sandbox round-trips
        const callingAgent = req.sandbox!.agentSlug || existing.assigned_agent || 'system';
        const statements: string[] = [];

        if (setClauses.length > 0) {
            setClauses.push(`updated_at = '${new Date().toISOString()}'`);
            statements.push(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = '${escapeSQL(task_id)}'`);
        }

        if (comment && typeof comment === 'string' && comment.trim()) {
            const commentMeta = JSON.stringify({
                event_type: 'task_comment',
                task_id: task_id,
                source: 'agent',
            });
            statements.push(`INSERT INTO channel_messages (channel_slug, agent_slug, content, message_type, metadata)
                VALUES ('${escapeSQL(existing.project_slug)}', '${escapeSQL(callingAgent)}', '${escapeSQL(comment.trim())}', 'system', '${escapeSQL(commentMeta)}')`);
        }

        // Re-fetch in the same round-trip
        statements.push(`SELECT id, project_slug, title, description, status, priority, assigned_agent, dependencies, created_at
             FROM tasks WHERE id = '${escapeSQL(task_id)}'`);

        const updatedRows = await executeWorkspaceJsonQuery<TaskRow & { dependencies: string | null }>(
            provider, sandboxId, statements.join(';\n'),
        );
        const row = updatedRows[0] || existing;
        const updatedDeps = parseDependencies(row.dependencies);

        const mcpResult: McpToolResult = {
            success: true,
            data: {
                task: {
                    id: row.id,
                    channel_id: row.project_slug,
                    title: row.title,
                    description: row.description || '',
                    assigned_agent_ids: row.assigned_agent ? [row.assigned_agent] : [],
                    priority: row.priority,
                    subtasks: updatedDeps.subtasks,
                    attachments: updatedDeps.attachments,
                    status: row.status,
                    created_at: row.created_at,
                },
            },
        };

        workspaceSSEBroadcaster.broadcastFileChanged(userId, {
            type: 'file_changed', path: `tasks/${task_id}`, action: 'modified',
            timestamp: new Date().toISOString(),
        });

        const summaryParts: string[] = [];
        if (status) summaryParts.push(`status → ${status}`);
        if (comment) summaryParts.push('added comment');
        if (Array.isArray(attachments) && attachments.length > 0) summaryParts.push(`${attachments.length} attachment(s)`);
        await logMcpActivity(provider, sandboxId, {
            channelSlug: existing.project_slug,
            action: 'task_updated',
            summary: `Task "${existing.title}" updated: ${summaryParts.join(', ')}`,
            taskId: task_id,
        });

        res.json(mcpResult);
    } catch (error) {
        next(error);
    }
});

export { router as channelTaskRoutes };
