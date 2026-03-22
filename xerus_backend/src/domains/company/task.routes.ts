// Task Routes
// REST API endpoints for the kanban task board.
// Tasks are created by agents (via metadata_sync) or humans (via POST).
// Dual-write: DB is authoritative, sandbox .beads/issues.jsonl is best-effort.
// Frontend reads these to render the CompanyBoard kanban.

import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types';
import { sendResponse } from '../../utils/response';
import { authenticateFirebaseToken } from '../../middleware/auth';
import { query } from '../../database/connection';
import { SANDBOX_CONFIG } from '../execution';
import type { SandboxService, DaytonaProvider } from '../execution';
import { shellEscape } from '../../utils/shell-safety';
import { sanitizeSlug } from '../../shared/slugify';
import { VALID_STATUSES, VALID_PRIORITIES, DB_TO_SANDBOX_STATUS } from './task.constants';

const router = Router();
const auth = authenticateFirebaseToken;

// -------------------------------------------------------------------------
// Dependency Injection (set from index.ts at startup)
// -------------------------------------------------------------------------

interface TaskRoutesDeps { sandboxService: SandboxService }
let deps: TaskRoutesDeps | null = null;
export function setTaskRoutesDeps(d: TaskRoutesDeps): void { deps = d; }

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface TaskRow {
    id: string;
    beads_id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    assigned_agents: string[];
    subtasks: Array<{ text: string; done: boolean }>;
    labels: Array<{ name: string; color: string }>;
    start_date: string | null;
    due_date: string | null;
    created_at: string;
    metadata: Record<string, unknown>;
    channel_tag: string;
}

interface AgentRow { slug: string; name: string; status: string }

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function formatTask(row: TaskRow, agentMap: Map<string, AgentRow>) {
    const subtasks = Array.isArray(row.subtasks) ? row.subtasks : [];
    const assignedAgents = (row.assigned_agents || []).map(slug => {
        const agent = agentMap.get(slug);
        return agent
            ? { id: slug, name: agent.name, slug: agent.slug, status: agent.status }
            : { id: slug, name: slug, slug, status: 'idle' };
    });

    return {
        id: row.beads_id,
        title: row.title,
        description: row.description || undefined,
        status: row.status,
        priority: row.priority,
        assignedAgents,
        channelTag: row.channel_tag || undefined,
        labels: Array.isArray(row.labels) ? row.labels : [],
        subtasks: { total: subtasks.length, completed: subtasks.filter(s => s.done).length },
        startDate: row.start_date || undefined,
        dueDate: row.due_date || undefined,
        createdAt: row.created_at,
        metadata: row.metadata || {},
    };
}

async function resolveAgentMap(userId: string, slugs: string[]): Promise<Map<string, AgentRow>> {
    const map = new Map<string, AgentRow>();
    if (slugs.length === 0) return map;
    const unique = [...new Set(slugs)];
    const result = await query<AgentRow>(
        `SELECT slug, slug AS name, 'active' AS status FROM agent_registry WHERE user_id = $1 AND slug = ANY($2)`,
        [userId, unique],
    );
    for (const row of result.rows) map.set(row.slug, row);
    return map;
}

// -------------------------------------------------------------------------
// Sandbox Dual-Write: append task to .beads/issues.jsonl
// Best-effort: failures are logged, never block the API response.
// -------------------------------------------------------------------------

function buildBeadsDir(channelTag: string): string {
    const parts = channelTag.split('/');
    if (parts.length >= 2) {
        return `${SANDBOX_CONFIG.workspacePath}/projects/${sanitizeSlug(parts[0])}/channels/${sanitizeSlug(parts[1])}/.beads`;
    }
    return `${SANDBOX_CONFIG.workspacePath}/projects/${sanitizeSlug(channelTag)}/.beads`;
}

async function syncTaskToSandbox(
    userId: string,
    channelTag: string,
    beadsEntry: Record<string, unknown>,
): Promise<void> {
    if (!deps) return;
    const { sandboxService } = deps;
    const status = await sandboxService.getSandboxStatus(userId);
    if (status.status !== 'running' || !status.sandboxId) return;

    const provider = sandboxService.getProvider() as DaytonaProvider;
    if (typeof provider.executeCommand !== 'function') return;

    const beadsDir = buildBeadsDir(channelTag);
    const issuesPath = `${beadsDir}/issues.jsonl`;

    // Atomic append via shell — avoids read-modify-write race condition.
    // Matches how the MCP handler uses fs.appendFile inside the sandbox.
    const jsonLine = JSON.stringify(beadsEntry);
    await provider.executeCommand(
        status.sandboxId,
        `mkdir -p ${shellEscape(beadsDir)} && printf '%s\\n' ${shellEscape(jsonLine)} >> ${shellEscape(issuesPath)}`,
    );
}

async function updateTaskInSandbox(
    userId: string,
    channelTag: string,
    beadsId: string,
    updates: Record<string, unknown>,
): Promise<void> {
    if (!deps) return;
    const { sandboxService } = deps;
    const status = await sandboxService.getSandboxStatus(userId);
    if (status.status !== 'running' || !status.sandboxId) return;

    const provider = sandboxService.getProvider() as DaytonaProvider;
    if (typeof provider.readFile !== 'function') return;

    const beadsDir = buildBeadsDir(channelTag);
    const issuesPath = `${beadsDir}/issues.jsonl`;

    let existing = '';
    try {
        existing = await provider.readFile(status.sandboxId, issuesPath);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('ENOENT') || msg.includes('not found') || msg.includes('No such file')) return;
        throw err;
    }

    // Parse JSONL, find and update the matching task.
    // Read-modify-write is unavoidable for updates (must find + replace a specific line).
    const lines = existing.split('\n').filter(l => l.trim());
    const updated = lines.map(line => {
        const entry = JSON.parse(line) as Record<string, unknown>;
        if (entry.id === beadsId) return JSON.stringify({ ...entry, ...updates });
        return line;
    });

    await provider.writeFile(status.sandboxId, issuesPath, updated.join('\n') + '\n');
}

// -------------------------------------------------------------------------
// GET /api/v1/tasks - All tasks for user (company board)
// -------------------------------------------------------------------------

router.get('/tasks', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
        const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

        const result = await query(
            `SELECT t.id::text, t.beads_id, t.title, t.description, t.status,
                    t.priority, t.assigned_agents, t.subtasks, t.labels,
                    t.start_date, t.due_date, t.created_at, t.metadata,
                    d.slug || '/' || c.slug AS channel_tag
             FROM tasks t
             JOIN channels c ON c.id = t.channel_id
             JOIN domains d ON d.id = c.domain_id
             WHERE t.user_id = $1
             ORDER BY t.created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset],
        );

        const rows = result.rows as unknown as TaskRow[];
        const allSlugs = rows.flatMap(r => r.assigned_agents || []);
        const agentMap = await resolveAgentMap(userId, allSlugs);

        sendResponse(res, 200, { tasks: rows.map(r => formatTask(r, agentMap)) }, startTime);
    } catch (err) {
        next(err);
    }
});

// -------------------------------------------------------------------------
// GET /api/v1/channels/:channelId/tasks - Tasks for one channel
// -------------------------------------------------------------------------

router.get('/channels/:channelId/tasks', auth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const startTime = res.locals.startTime || Date.now();
    try {
        const userId = req.user?.uid;
        if (!userId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const { channelId } = req.params;
        const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
        const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

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

        const result = await query(
            `SELECT t.id::text, t.beads_id, t.title, t.description, t.status,
                    t.priority, t.assigned_agents, t.subtasks, t.labels,
                    t.start_date, t.due_date, t.created_at, t.metadata,
                    d.slug || '/' || c.slug AS channel_tag
             FROM tasks t
             JOIN channels c ON c.id = t.channel_id
             JOIN domains d ON d.id = c.domain_id
             WHERE t.channel_id::text = $1 AND t.user_id = $2
             ORDER BY t.created_at DESC
             LIMIT $3 OFFSET $4`,
            [channelId, userId, limit, offset],
        );

        const rows = result.rows as unknown as TaskRow[];
        const allSlugs = rows.flatMap(r => r.assigned_agents || []);
        const agentMap = await resolveAgentMap(userId, allSlugs);

        sendResponse(res, 200, { tasks: rows.map(r => formatTask(r, agentMap)) }, startTime);
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
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const { channelId } = req.params;
        const { title, description, priority, assigned_agents, subtasks, labels } = req.body;

        if (!title || typeof title !== 'string') {
            res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'title is required' } });
            return;
        }

        const channelCheck = await query(
            `SELECT c.id, d.slug AS domain_slug, c.slug AS channel_slug FROM channels c
             JOIN domains d ON d.id = c.domain_id
             WHERE c.id::text = $1 AND d.user_id = $2`,
            [channelId, userId],
        );
        if (channelCheck.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Channel not found' } });
            return;
        }

        const beadsId = `task-${Date.now()}`;
        const taskPriority = VALID_PRIORITIES.has(priority) ? priority : 'medium';
        const subtaskItems = Array.isArray(subtasks) ? subtasks : [];

        const result = await query(
            `INSERT INTO tasks (beads_id, channel_id, user_id, title, description, status, priority, assigned_agents, subtasks, labels)
             VALUES ($1, $2::uuid, $3, $4, $5, 'todo', $6, $7, $8, $9)
             RETURNING id::text, beads_id, title, description, status, priority, assigned_agents,
                       subtasks, labels, start_date, due_date, created_at, metadata`,
            [
                beadsId, channelId, userId, title,
                description ?? '', taskPriority,
                assigned_agents ?? [], JSON.stringify(subtaskItems), JSON.stringify(labels ?? []),
            ],
        );

        const row = result.rows[0] as unknown as TaskRow;
        const channelRow = channelCheck.rows[0] as { domain_slug: string; channel_slug: string };
        const channelTag = `${channelRow.domain_slug}/${channelRow.channel_slug}`;
        row.channel_tag = channelTag;

        // Dual-write: sync new task to sandbox .beads/issues.jsonl (best-effort)
        const beadsEntry = {
            id: beadsId, title, description: description ?? '', priority: taskPriority,
            assigned_agents: assigned_agents ?? [],
            subtasks: subtaskItems.map((s: string | { text: string; done: boolean }) =>
                typeof s === 'string' ? { text: s, done: false } : s,
            ),
            status: 'open',
            created_at: new Date().toISOString(),
        };
        syncTaskToSandbox(userId, channelTag, beadsEntry).catch(err =>
            console.warn(`[TaskRoutes] Sandbox sync failed for create: ${err.message}`),
        );

        const agentMap = await resolveAgentMap(userId, row.assigned_agents || []);
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
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }

        const { taskId } = req.params;
        const { status } = req.body;

        if (!status || !VALID_STATUSES.has(status)) {
            res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}` },
            });
            return;
        }

        const result = await query(
            `UPDATE tasks SET status = $1, updated_at = NOW()
             WHERE (beads_id = $2 OR id::text = $2) AND user_id = $3
             RETURNING id::text, beads_id, title, description, status, priority, assigned_agents,
                       subtasks, labels, start_date, due_date, created_at, metadata`,
            [status, taskId, userId],
        );

        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
            return;
        }

        const row = result.rows[0] as unknown as TaskRow;
        const tagResult = await query(
            `SELECT d.slug || '/' || c.slug AS channel_tag
             FROM tasks t
             JOIN channels c ON c.id = t.channel_id
             JOIN domains d ON d.id = c.domain_id
             WHERE t.id::text = $1`,
            [row.id],
        );
        const channelTag = (tagResult.rows[0] as { channel_tag: string })?.channel_tag || '';
        row.channel_tag = channelTag;

        // Dual-write: update status in sandbox .beads/issues.jsonl (best-effort)
        const sandboxStatus = DB_TO_SANDBOX_STATUS[status] || status;
        updateTaskInSandbox(userId, channelTag, row.beads_id, { status: sandboxStatus }).catch(err =>
            console.warn(`[TaskRoutes] Sandbox sync failed for status update: ${err.message}`),
        );

        const agentMap = await resolveAgentMap(userId, row.assigned_agents || []);
        sendResponse(res, 200, { task: formatTask(row, agentMap) }, startTime);
    } catch (err) {
        next(err);
    }
});

export default router;
