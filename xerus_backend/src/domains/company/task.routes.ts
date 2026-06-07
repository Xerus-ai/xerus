// Task Routes — REST endpoints for the kanban task board.
// Tasks live in workspace.db (SQLite). Beads JSONL kept in sync for agent access.

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { UnauthorizedError, BadRequestError, NotFoundError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';
import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { requireRunningSandbox, getDaytonaProvider } from '../sandbox-infra/sandbox/sandbox-route-helpers';
import { escapeSQL, executeWorkspaceJsonQuery } from '../conversations/workspace-db.helpers';
import { shellEscape } from '../../utils/shell-safety';
import { sanitizeSlug } from '../../shared/slugify';
import { VALID_STATUSES, VALID_PRIORITIES } from './task.constants';
import {
    listTasks, listTasksByChannel, createTask, getTask, updateTask, updateTaskStatus, resolveAgentsFromWorkspace,
    listChannelDeliverables, syncBeadsToTasks,
    type WorkspaceTaskRow, type WorkspaceAgentRow, type UpdateTaskFields,
} from './task-workspace-db.service';
import { createSystemEvent } from './company-workspace-db.service';
import { triggerChannelExecution } from './channel-execution.service';
import type { ExecutionService } from '../execution/execution.service';
import { strictRateLimit } from '../../middleware/rate-limit';
import { logger } from '../../utils/logger';

const log = logger('TaskRoutes');

const router = Router();
const auth = authenticateFirebaseToken;

// Dependency Injection (set from index.ts at startup)

interface TaskRoutesDeps { sandboxService: SandboxService; executionService?: ExecutionService }
let deps: TaskRoutesDeps | null = null;
export function setTaskRoutesDeps(d: TaskRoutesDeps): void { deps = d; }

// Helpers

function getDeps(): TaskRoutesDeps {
    if (!deps) {
        throw new Error('TaskRoutes dependencies not initialized');
    }
    return deps;
}

function parseLabels(raw: string | null): Array<{ name: string; color: string }> {
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
        throw new Error(`Expected labels to be an array, got ${typeof parsed}`);
    }
    // Tasks are persisted with labels as string[] (see task-workspace-db.service.ts
    // createTask/updateTask — labels are JSON.stringify'd string arrays). The REST
    // contract advertises Array<{name, color}>, so normalize here instead of
    // letting raw strings leak out and crash consumers on label.name.toLowerCase().
    return parsed.map((item) => {
        if (typeof item === 'string') {
            return { name: item, color: '' };
        }
        if (item && typeof item === 'object') {
            const obj = item as { name?: unknown; color?: unknown };
            if (typeof obj.name === 'string') {
                return { name: obj.name, color: typeof obj.color === 'string' ? obj.color : '' };
            }
        }
        throw new Error(`Invalid label entry: ${JSON.stringify(item)}`);
    });
}

function extractAvatarUrl(config: string | null): string | null {
    if (!config) return null;
    try {
        const parsed = JSON.parse(config) as Record<string, unknown>;
        const mascot = typeof parsed.mascot === 'string' ? parsed.mascot : null;
        const avatar = typeof parsed.avatar_url === 'string' ? parsed.avatar_url : null;
        return mascot || avatar;
    } catch {
        return null;
    }
}

function formatTask(row: WorkspaceTaskRow, agentMap: Map<string, WorkspaceAgentRow>) {
    const assignedAgents: Array<{ id: string; name: string; slug: string; status: string; avatar_url: string | null }> = [];
    if (row.assigned_agent) {
        const agent = agentMap.get(row.assigned_agent);
        assignedAgents.push(
            agent
                ? {
                    id: agent.slug,
                    name: agent.name,
                    slug: agent.slug,
                    status: agent.status,
                    avatar_url: extractAvatarUrl(agent.config),
                }
                : { id: row.assigned_agent, name: row.assigned_agent, slug: row.assigned_agent, status: 'idle', avatar_url: null },
        );
    }

    return {
        id: row.id,
        title: row.title,
        description: row.description || undefined,
        status: row.status,
        priority: row.priority,
        assignedAgents,
        channelTag: row.project_slug || undefined,
        labels: parseLabels(row.labels),
        subtasks: { total: 0, completed: 0 },
        dueDate: row.due_date || undefined,
        createdAt: row.created_at,
        metadata: {},
    };
}

// Beads JSONL Write: keep .beads/issues.jsonl in sync (best-effort)
function buildBeadsDir(channelTag: string): string {
    const parts = channelTag.split('/');
    if (parts.length >= 2) {
        return `${SANDBOX_CONFIG.workspacePath}/projects/${sanitizeSlug(parts[0])}/channels/${sanitizeSlug(parts[1])}/.beads`;
    }
    return `${SANDBOX_CONFIG.workspacePath}/projects/${sanitizeSlug(channelTag)}/.beads`;
}

async function appendBeadsEntry(
    provider: DaytonaProvider,
    sandboxId: string,
    channelTag: string,
    beadsEntry: Record<string, unknown>,
): Promise<void> {
    const beadsDir = buildBeadsDir(channelTag);
    const issuesPath = `${beadsDir}/issues.jsonl`;
    const jsonLine = JSON.stringify(beadsEntry);
    await provider.executeCommand(
        sandboxId,
        `mkdir -p ${shellEscape(beadsDir)} && printf '%s\\n' ${shellEscape(jsonLine)} >> ${shellEscape(issuesPath)}`,
    );
}

async function updateBeadsEntry(
    provider: DaytonaProvider,
    sandboxId: string,
    channelTag: string,
    beadsId: string,
    updates: Record<string, unknown>,
): Promise<void> {
    const beadsDir = buildBeadsDir(channelTag);
    const issuesPath = `${beadsDir}/issues.jsonl`;

    let existing = '';
    try {
        existing = await provider.readFile(sandboxId, issuesPath);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('ENOENT') || msg.includes('not found') || msg.includes('No such file')) return;
        throw err;
    }

    const lines = existing.split('\n').filter(l => l.trim());
    const updated = lines.map(line => {
        const entry = JSON.parse(line) as Record<string, unknown>;
        if (entry.id === beadsId) return JSON.stringify({ ...entry, ...updates });
        return line;
    });

    await provider.writeFile(sandboxId, issuesPath, updated.join('\n') + '\n');
}

// GET /api/v1/tasks - All tasks for user (company board)
router.get('/tasks', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            throw new UnauthorizedError();
        }

        const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
        const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const result = await listTasks(provider, sandboxId, { limit, offset });

        const allSlugs = result.tasks
            .map(r => r.assigned_agent)
            .filter((s): s is string => s !== null && s !== '');
        const agentMap = await resolveAgentsFromWorkspace(provider, sandboxId, allSlugs);

        sendResponse(res, 200, { tasks: result.tasks.map(r => formatTask(r, agentMap)) }, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/channels/:channelId/tasks - Tasks for one channel
router.get('/channels/:channelId/tasks', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            throw new UnauthorizedError();
        }

        const { channelId } = req.params;
        const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
        const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        // Normalize channelId: if it's a bare slug (no --), look up the full domain--channel format
        let normalizedChannelId = channelId;
        if (!channelId.includes('--')) {
            const lookupSql = `SELECT slug FROM channels WHERE slug LIKE '%--${escapeSQL(channelId)}' OR slug = '${escapeSQL(channelId)}' LIMIT 1`;
            const channelRows = await executeWorkspaceJsonQuery<{ slug: string }>(provider, sandboxId, lookupSql);
            if (channelRows.length > 0) {
                normalizedChannelId = channelRows[0].slug;
            }
        }

        const result = await listTasksByChannel(provider, sandboxId, normalizedChannelId, { limit, offset });

        const allSlugs = result.tasks
            .map(r => r.assigned_agent)
            .filter((s): s is string => s !== null && s !== '');
        const agentMap = await resolveAgentsFromWorkspace(provider, sandboxId, allSlugs);

        sendResponse(res, 200, { tasks: result.tasks.map(r => formatTask(r, agentMap)) }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/channels/:channelId/tasks - Human creates task

router.post('/channels/:channelId/tasks', auth, strictRateLimit, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            throw new UnauthorizedError();
        }

        const { channelId } = req.params;
        const { title, description, priority, assigned_agents, labels, due_date } = req.body;

        if (!title || typeof title !== 'string') {
            throw new BadRequestError('title is required');
        }

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const beadsId = `task-${Date.now()}`;
        const taskPriority = VALID_PRIORITIES.has(priority) ? priority : 'medium';
        // Workspace DB uses single assigned_agent; take first from array if provided
        const assignedAgent = Array.isArray(assigned_agents) && assigned_agents.length > 0
            ? assigned_agents[0]
            : null;
        const labelNames = Array.isArray(labels) ? labels : [];
        const dueDate = typeof due_date === 'string' && due_date.trim() ? due_date.trim() : null;

        const row = await createTask(
            provider, sandboxId, beadsId, channelId, title,
            description ?? null, taskPriority, assignedAgent, labelNames, dueDate,
        );

        // Write to .beads/issues.jsonl for agent access via `bd` tool
        const beadsEntry = {
            id: beadsId,
            title,
            description: description ?? '',
            priority: taskPriority,
            assigned_agents: assignedAgent ? [assignedAgent] : [],
            status: 'open',
            created_at: new Date().toISOString(),
        };
        appendBeadsEntry(provider, sandboxId, channelId, beadsEntry).catch(err =>
            log.warn('Beads JSONL sync failed for create', { error: err instanceof Error ? err.message : String(err) }),
        );

        // System event: task created (and optionally assigned)
        const assignedLabel = assignedAgent ? ` and assigned it to ${assignedAgent}` : '';
        createSystemEvent(
            provider, sandboxId, channelId,
            `created task "${title}"${assignedLabel}`,
            { event_type: 'task_created', task_id: beadsId },
        ).catch(err => log.warn('System event failed', { error: err instanceof Error ? err.message : String(err) }));

        // Auto-trigger agent execution when task is assigned
        if (assignedAgent && getDeps().executionService) {
            const taskPrompt = `You have a new task assigned: "${title}". ${description || ''}\nTask ID: ${beadsId}\nPlease work on this task.`;
            triggerChannelExecution(
                getDeps().executionService!, provider, sandboxId, userId, assignedAgent, taskPrompt, channelId,
            ).catch(err => log.warn('Auto-execution trigger failed', { error: err instanceof Error ? err.message : String(err) }));
        }

        const allSlugs = row.assigned_agent ? [row.assigned_agent] : [];
        const agentMap = await resolveAgentsFromWorkspace(provider, sandboxId, allSlugs);
        sendResponse(res, 201, { task: formatTask(row, agentMap) }, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/tasks/:taskId - Single task detail

router.get('/tasks/:taskId', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            throw new UnauthorizedError();
        }

        const { taskId } = req.params;

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const row = await getTask(provider, sandboxId, taskId);
        if (!row) {
            throw new NotFoundError('Task');
        }

        const allSlugs = row.assigned_agent ? [row.assigned_agent] : [];
        const agentMap = await resolveAgentsFromWorkspace(provider, sandboxId, allSlugs);
        sendResponse(res, 200, { task: formatTask(row, agentMap) }, startTime);
    } catch (err) {
        next(err);
    }
});

// PATCH /api/v1/tasks/:taskId - Update task fields

router.patch('/tasks/:taskId', auth, strictRateLimit, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            throw new UnauthorizedError();
        }

        const { taskId } = req.params;
        const { title, description, priority, assigned_agent, labels, due_date, status } = req.body;

        const fields: UpdateTaskFields = {};
        if (title !== undefined) {
            if (typeof title !== 'string' || !title.trim()) {
                throw new BadRequestError('title must be a non-empty string');
            }
            fields.title = title.trim();
        }
        if (description !== undefined) {
            fields.description = typeof description === 'string' ? description : null;
        }
        if (priority !== undefined) {
            if (!VALID_PRIORITIES.has(priority)) {
                throw new BadRequestError(`Invalid priority. Must be one of: ${[...VALID_PRIORITIES].join(', ')}`);
            }
            fields.priority = priority;
        }
        if (assigned_agent !== undefined) {
            fields.assigned_agent = typeof assigned_agent === 'string' && assigned_agent.trim()
                ? assigned_agent.trim()
                : null;
        }
        if (labels !== undefined) {
            fields.labels = Array.isArray(labels) ? labels : null;
        }
        if (due_date !== undefined) {
            fields.due_date = typeof due_date === 'string' && due_date.trim()
                ? due_date.trim()
                : null;
        }
        if (status !== undefined) {
            if (!VALID_STATUSES.has(status)) {
                throw new BadRequestError(`Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}`);
            }
            fields.status = status;
        }

        if (Object.keys(fields).length === 0) {
            throw new BadRequestError('No valid fields to update');
        }

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const row = await updateTask(provider, sandboxId, taskId, fields);
        if (!row) {
            throw new NotFoundError('Task');
        }

        // Sync status change to .beads/issues.jsonl
        if (fields.status && row.project_slug) {
            updateBeadsEntry(provider, sandboxId, row.project_slug, taskId, { status: fields.status }).catch(err =>
                log.warn('Beads JSONL sync failed for task update', { error: err instanceof Error ? err.message : String(err) }),
            );
        }

        // System events for meaningful task updates
        if (row.project_slug) {
            if (fields.assigned_agent) {
                createSystemEvent(
                    provider, sandboxId, row.project_slug,
                    `assigned task "${row.title}" to ${fields.assigned_agent}`,
                    { event_type: 'task_assigned', task_id: taskId, assigned_to: fields.assigned_agent },
                ).catch(err => log.warn('System event failed', { error: err instanceof Error ? err.message : String(err) }));

                // Auto-trigger agent execution when task is (re-)assigned
                if (getDeps().executionService) {
                    const taskPrompt = `You have a new task assigned: "${row.title}". ${row.description || ''}\nTask ID: ${taskId}\nPlease work on this task.`;
                    triggerChannelExecution(
                        getDeps().executionService!, provider, sandboxId, userId, fields.assigned_agent, taskPrompt, row.project_slug,
                    ).catch(err => log.warn('Auto-execution trigger failed', { error: err instanceof Error ? err.message : String(err) }));
                }
            }
            if (fields.status) {
                createSystemEvent(
                    provider, sandboxId, row.project_slug,
                    `moved task "${row.title}" to ${fields.status}`,
                    { event_type: 'task_status_changed', task_id: taskId, new_status: fields.status },
                ).catch(err => log.warn('System event failed', { error: err instanceof Error ? err.message : String(err) }));
            }
        }

        const allSlugs = row.assigned_agent ? [row.assigned_agent] : [];
        const agentMap = await resolveAgentsFromWorkspace(provider, sandboxId, allSlugs);
        sendResponse(res, 200, { task: formatTask(row, agentMap) }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/tasks/:taskId/status - Update task status (drag-drop)

router.post('/tasks/:taskId/status', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            throw new UnauthorizedError();
        }

        const { taskId } = req.params;
        const { status } = req.body;

        if (!status || !VALID_STATUSES.has(status)) {
            throw new BadRequestError(`Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}`);
        }

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const row = await updateTaskStatus(provider, sandboxId, taskId, status);
        if (!row) {
            throw new NotFoundError('Task');
        }

        // Update status in .beads/issues.jsonl for agent access via `bd` tool
        if (row.project_slug) {
            updateBeadsEntry(provider, sandboxId, row.project_slug, taskId, { status }).catch(err =>
                log.warn('Beads JSONL sync failed for status update', { error: err instanceof Error ? err.message : String(err) }),
            );

            // System event: task status changed
            const agentLabel = row.assigned_agent ? ` (${row.assigned_agent})` : '';
            createSystemEvent(
                provider, sandboxId, row.project_slug,
                `moved task "${row.title}" to ${status}${agentLabel}`,
                { event_type: 'task_status_changed', task_id: taskId, new_status: status },
            ).catch(err => log.warn('System event failed', { error: err instanceof Error ? err.message : String(err) }));
        }

        const allSlugs = row.assigned_agent ? [row.assigned_agent] : [];
        const agentMap = await resolveAgentsFromWorkspace(provider, sandboxId, allSlugs);
        sendResponse(res, 200, { task: formatTask(row, agentMap) }, startTime);
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/channels/:channelId/deliverables - Deliverables for a channel
router.get('/channels/:channelId/deliverables', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) throw new UnauthorizedError();

        const { channelId } = req.params;
        const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
        const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const result = await listChannelDeliverables(provider, sandboxId, channelId, limit, offset);

        // Map to frontend-compatible shape
        const deliverables = result.deliverables.map(d => {
            const meta = d.metadata ? JSON.parse(d.metadata) : {};
            return {
                id: String(d.id),
                filename: d.title,
                file_type: d.output_type === 'code' ? 'code'
                    : d.output_type === 'report' ? 'markdown'
                    : d.output_type === 'data' ? 'other'
                    : d.output_type as string,
                content: d.content_preview ?? undefined,
                author_slug: d.agent_slug,
                file_size_bytes: meta.size ?? 0,
                file_path: d.file_path ?? undefined,
                description: d.description ?? undefined,
                created_at: d.created_at,
            };
        });

        sendResponse(res, 200, { deliverables }, startTime);
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/tasks/sync - Trigger beads → workspace.db sync
router.post('/tasks/sync', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) throw new UnauthorizedError();

        const { sandboxService } = getDeps();
        const sandboxId = await requireRunningSandbox(sandboxService, userId);
        const provider = getDaytonaProvider(sandboxService);

        const result = await syncBeadsToTasks(provider, sandboxId);
        sendResponse(res, 200, result, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
