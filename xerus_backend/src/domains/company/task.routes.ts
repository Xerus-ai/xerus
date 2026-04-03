// Task Routes
// REST API endpoints for the kanban task board.
// Tasks live in workspace.db (SQLite on sandbox). Workspace DB is source of truth.
// .beads/issues.jsonl is kept in sync for agent access via `bd` tool.
// Frontend reads these to render the CompanyBoard kanban.

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { UnauthorizedError, BadRequestError, NotFoundError } from '../../utils/errors';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import type { SandboxService } from '../sandbox-infra/sandbox/sandbox.service';
import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { requireRunningSandbox, getDaytonaProvider } from '../sandbox-infra/sandbox/sandbox-route-helpers';
import { shellEscape } from '../../utils/shell-safety';
import { sanitizeSlug } from '../../shared/slugify';
import { VALID_STATUSES, VALID_PRIORITIES } from './task.constants';
import {
    listTasks,
    listTasksByChannel,
    createTask,
    updateTaskStatus,
    resolveAgentsFromWorkspace,
} from './task-workspace-db.service';
import type { WorkspaceTaskRow, WorkspaceAgentRow } from './task-workspace-db.service';
import { logger } from '../../utils/logger';

const log = logger('TaskRoutes');

const router = Router();
const auth = authenticateFirebaseToken;

// -------------------------------------------------------------------------
// Dependency Injection (set from index.ts at startup)
// -------------------------------------------------------------------------

interface TaskRoutesDeps { sandboxService: SandboxService }
let deps: TaskRoutesDeps | null = null;
export function setTaskRoutesDeps(d: TaskRoutesDeps): void { deps = d; }

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

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
    return parsed;
}

function formatTask(row: WorkspaceTaskRow, agentMap: Map<string, WorkspaceAgentRow>) {
    const assignedAgents: Array<{ id: string; name: string; slug: string; status: string }> = [];
    if (row.assigned_agent) {
        const agent = agentMap.get(row.assigned_agent);
        assignedAgents.push(
            agent
                ? { id: agent.slug, name: agent.name, slug: agent.slug, status: agent.status }
                : { id: row.assigned_agent, name: row.assigned_agent, slug: row.assigned_agent, status: 'idle' },
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

// -------------------------------------------------------------------------
// Beads JSONL Write: append/update task in .beads/issues.jsonl
// Agents read these via `bd` tool — keep in sync with workspace DB.
// Best-effort: failures are logged, never block the API response.
// -------------------------------------------------------------------------

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

// -------------------------------------------------------------------------
// GET /api/v1/tasks - All tasks for user (company board)
// -------------------------------------------------------------------------

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

// -------------------------------------------------------------------------
// GET /api/v1/channels/:channelId/tasks - Tasks for one channel
// channelId is now a project_slug (e.g. "domain-slug/channel-slug")
// -------------------------------------------------------------------------

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

        const result = await listTasksByChannel(provider, sandboxId, channelId, { limit, offset });

        const allSlugs = result.tasks
            .map(r => r.assigned_agent)
            .filter((s): s is string => s !== null && s !== '');
        const agentMap = await resolveAgentsFromWorkspace(provider, sandboxId, allSlugs);

        sendResponse(res, 200, { tasks: result.tasks.map(r => formatTask(r, agentMap)) }, startTime);
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------------
// POST /api/v1/channels/:channelId/tasks - Human creates task
// -------------------------------------------------------------------------

router.post('/channels/:channelId/tasks', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            throw new UnauthorizedError();
        }

        const { channelId } = req.params;
        const { title, description, priority, assigned_agents, labels } = req.body;

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

        const row = await createTask(
            provider, sandboxId, beadsId, channelId, title,
            description ?? null, taskPriority, assignedAgent, labelNames,
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

        const allSlugs = row.assigned_agent ? [row.assigned_agent] : [];
        const agentMap = await resolveAgentsFromWorkspace(provider, sandboxId, allSlugs);
        sendResponse(res, 201, { task: formatTask(row, agentMap) }, startTime);
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------------
// POST /api/v1/tasks/:taskId/status - Update task status (drag-drop)
// -------------------------------------------------------------------------

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
        }

        const allSlugs = row.assigned_agent ? [row.assigned_agent] : [];
        const agentMap = await resolveAgentsFromWorkspace(provider, sandboxId, allSlugs);
        sendResponse(res, 200, { task: formatTask(row, agentMap) }, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
