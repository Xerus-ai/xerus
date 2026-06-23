// Task Workspace DB Service
// Queries workspace.db (SQLite) on sandbox for task data.
// Source of truth for tasks per workspace-first pivot.
// Reference: xerus-workspace/data/workspace-schema.sql (tasks table)

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import { escapeSQL, executeWorkspaceJsonQuery, executeWorkspaceQuery } from '../conversations/workspace-db.helpers';
import { logger } from '../../utils/logger';

const log = logger('TaskWorkspaceDB');

// -----------------------------------------------------------------------------
// Types (mirror workspace-schema.sql tasks table)
// -----------------------------------------------------------------------------

export interface WorkspaceTaskRow {
    id: string;
    project_slug: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    assigned_agent: string | null;
    dependencies: string | null;
    labels: string | null;
    due_date: string | null;
    created_at: string;
    updated_at: string | null;
    closed_at: string | null;
    close_reason: string | null;
    synced_at: string | null;
}

export interface WorkspaceAgentRow {
    slug: string;
    name: string;
    status: string;
    config: string | null;
}

// -----------------------------------------------------------------------------
// Task Queries
// -----------------------------------------------------------------------------

export async function listTasks(
    provider: DaytonaProvider,
    sandboxId: string,
    options: { limit?: number; offset?: number } = {},
): Promise<{ tasks: WorkspaceTaskRow[]; total: number }> {
    const limit = Math.min(options.limit ?? 50, 100);
    const offset = options.offset ?? 0;

    const sql = `
        SELECT id, project_slug, title, description, status, priority,
               assigned_agent, dependencies, labels, due_date,
               created_at, updated_at, closed_at, close_reason, synced_at,
               (SELECT COUNT(*) FROM tasks) AS _total
        FROM tasks
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
    `;
    const rows = await executeWorkspaceJsonQuery<WorkspaceTaskRow & { _total: number }>(provider, sandboxId, sql);
    const total = rows[0]?._total ?? 0;
    const tasks = rows.map(({ _total: _, ...task }) => task) as WorkspaceTaskRow[];

    return { tasks, total };
}

export async function listTasksByChannel(
    provider: DaytonaProvider,
    sandboxId: string,
    channelSlug: string,
    options: { limit?: number; offset?: number } = {},
): Promise<{ tasks: WorkspaceTaskRow[]; total: number }> {
    const limit = Math.min(options.limit ?? 50, 100);
    const offset = options.offset ?? 0;
    const escaped = escapeSQL(channelSlug);

    const sql = `
        SELECT id, project_slug, title, description, status, priority,
               assigned_agent, dependencies, labels, due_date,
               created_at, updated_at, closed_at, close_reason, synced_at,
               (SELECT COUNT(*) FROM tasks WHERE project_slug = '${escaped}') AS _total
        FROM tasks
        WHERE project_slug = '${escaped}'
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
    `;
    const rows = await executeWorkspaceJsonQuery<WorkspaceTaskRow & { _total: number }>(provider, sandboxId, sql);
    const total = rows[0]?._total ?? 0;
    const tasks = rows.map(({ _total: _, ...task }) => task) as WorkspaceTaskRow[];

    return { tasks, total };
}

export async function getTask(
    provider: DaytonaProvider,
    sandboxId: string,
    taskId: string,
): Promise<WorkspaceTaskRow | null> {
    const sql = `
        SELECT id, project_slug, title, description, status, priority,
               assigned_agent, dependencies, labels, due_date,
               created_at, updated_at, closed_at, close_reason, synced_at
        FROM tasks
        WHERE id = '${escapeSQL(taskId)}'
    `;
    const rows = await executeWorkspaceJsonQuery<WorkspaceTaskRow>(provider, sandboxId, sql);
    return rows[0] ?? null;
}

export async function createTask(
    provider: DaytonaProvider,
    sandboxId: string,
    id: string,
    projectSlug: string,
    title: string,
    description: string | null,
    priority: string,
    assignedAgent: string | null,
    labels: string[] | null,
    dueDate?: string | null,
): Promise<WorkspaceTaskRow> {
    const now = new Date().toISOString();
    const descValue = description ? `'${escapeSQL(description)}'` : 'NULL';
    const agentValue = assignedAgent ? `'${escapeSQL(assignedAgent)}'` : 'NULL';
    const labelsValue = labels && labels.length > 0 ? `'${escapeSQL(JSON.stringify(labels))}'` : 'NULL';
    const dueDateValue = dueDate ? `'${escapeSQL(dueDate)}'` : 'NULL';

    const ensureAgent = assignedAgent
        ? `INSERT OR IGNORE INTO agents (slug, name, adapter_type, role, autonomy_level, status)
           VALUES ('${escapeSQL(assignedAgent)}', '${escapeSQL(assignedAgent)}', 'claudecode', 'specialist', 'supervised', 'idle');`
        : '';
    const sql = `
        BEGIN;
        ${ensureAgent}
        INSERT INTO tasks (id, project_slug, title, description, status, priority, assigned_agent, labels, due_date, created_at, updated_at)
        VALUES (
            '${escapeSQL(id)}',
            '${escapeSQL(projectSlug)}',
            '${escapeSQL(title)}',
            ${descValue},
            'open',
            '${escapeSQL(priority)}',
            ${agentValue},
            ${labelsValue},
            ${dueDateValue},
            '${now}',
            '${now}'
        );
        SELECT id, project_slug, title, description, status, priority,
               assigned_agent, dependencies, labels, due_date,
               created_at, updated_at, closed_at, close_reason, synced_at
        FROM tasks WHERE id = '${escapeSQL(id)}';
        COMMIT;
    `;
    const rows = await executeWorkspaceJsonQuery<WorkspaceTaskRow>(provider, sandboxId, sql);

    if (!rows[0]) {
        throw new Error(`Failed to create task with id=${id}`);
    }
    return rows[0];
}

export async function updateTaskStatus(
    provider: DaytonaProvider,
    sandboxId: string,
    taskId: string,
    status: string,
): Promise<WorkspaceTaskRow | null> {
    const now = new Date().toISOString();
    const closedClause = (status === 'completed' || status === 'cancelled')
        ? `, closed_at = '${now}'`
        : '';

    const sql = `
        BEGIN;
        UPDATE tasks
        SET status = '${escapeSQL(status)}',
            updated_at = '${now}'${closedClause}
        WHERE id = '${escapeSQL(taskId)}';
        SELECT id, project_slug, title, description, status, priority,
               assigned_agent, dependencies, labels, due_date,
               created_at, updated_at, closed_at, close_reason, synced_at
        FROM tasks WHERE id = '${escapeSQL(taskId)}';
        COMMIT;
    `;
    const rows = await executeWorkspaceJsonQuery<WorkspaceTaskRow>(provider, sandboxId, sql);
    return rows[0] ?? null;
}

// General-purpose task update (used by PATCH /tasks/:taskId)

export interface UpdateTaskFields {
    title?: string;
    description?: string | null;
    priority?: string;
    assigned_agent?: string | null;
    labels?: string[] | null;
    due_date?: string | null;
    status?: string;
}

export async function updateTask(
    provider: DaytonaProvider,
    sandboxId: string,
    taskId: string,
    fields: UpdateTaskFields,
): Promise<WorkspaceTaskRow | null> {
    const setClauses: string[] = [];
    const now = new Date().toISOString();

    if (fields.title !== undefined) setClauses.push(`title = '${escapeSQL(fields.title)}'`);
    if (fields.description !== undefined) setClauses.push(`description = ${fields.description === null ? 'NULL' : `'${escapeSQL(fields.description)}'`}`);
    if (fields.priority !== undefined) setClauses.push(`priority = '${escapeSQL(fields.priority)}'`);
    if (fields.assigned_agent !== undefined) setClauses.push(`assigned_agent = ${fields.assigned_agent === null ? 'NULL' : `'${escapeSQL(fields.assigned_agent)}'`}`);
    if (fields.labels !== undefined) setClauses.push(`labels = ${fields.labels === null ? 'NULL' : `'${escapeSQL(JSON.stringify(fields.labels))}'`}`);
    if (fields.due_date !== undefined) setClauses.push(`due_date = ${fields.due_date === null ? 'NULL' : `'${escapeSQL(fields.due_date)}'`}`);
    if (fields.status !== undefined) {
        setClauses.push(`status = '${escapeSQL(fields.status)}'`);
        if (fields.status === 'completed' || fields.status === 'cancelled') {
            setClauses.push(`closed_at = '${now}'`);
        }
    }

    if (setClauses.length === 0) return null;
    setClauses.push(`updated_at = '${now}'`);

    const sql = `
        BEGIN;
        UPDATE tasks SET ${setClauses.join(', ')} WHERE id = '${escapeSQL(taskId)}';
        SELECT id, project_slug, title, description, status, priority,
               assigned_agent, dependencies, labels, due_date,
               created_at, updated_at, closed_at, close_reason, synced_at
        FROM tasks WHERE id = '${escapeSQL(taskId)}';
        COMMIT;
    `;
    const rows = await executeWorkspaceJsonQuery<WorkspaceTaskRow>(provider, sandboxId, sql);
    return rows[0] ?? null;
}

export async function resolveAgentsFromWorkspace(
    provider: DaytonaProvider,
    sandboxId: string,
    slugs: string[],
): Promise<Map<string, WorkspaceAgentRow>> {
    const map = new Map<string, WorkspaceAgentRow>();
    if (slugs.length === 0) return map;

    const unique = [...new Set(slugs)];
    const inClause = unique.map(s => `'${escapeSQL(s)}'`).join(', ');

    const sql = `
        SELECT slug, name, status, config
        FROM agents
        WHERE slug IN (${inClause})
    `;
    const rows = await executeWorkspaceJsonQuery<WorkspaceAgentRow>(provider, sandboxId, sql);
    for (const row of rows) {
        map.set(row.slug, row);
    }
    return map;
}

// -----------------------------------------------------------------------------
// Deliverables (agent_outputs table)
// -----------------------------------------------------------------------------

export interface WorkspaceDeliverableRow {
    id: number;
    agent_slug: string;
    session_id: string | null;
    output_type: string;
    title: string;
    description: string | null;
    file_path: string | null;
    content_preview: string | null;
    metadata: string | null;
    created_at: string;
}

export async function listChannelDeliverables(
    provider: DaytonaProvider,
    sandboxId: string,
    channelSlug: string,
    limit: number,
    offset: number,
): Promise<{ deliverables: WorkspaceDeliverableRow[] }> {
    // Get agent slugs assigned to this channel, then fetch their outputs
    const sql = `
        SELECT ao.id, ao.agent_slug, ao.session_id, ao.output_type, ao.title,
               ao.description, ao.file_path, ao.content_preview, ao.metadata, ao.created_at
        FROM agent_outputs ao
        INNER JOIN channel_members cm ON cm.agent_slug = ao.agent_slug
        WHERE cm.channel_slug = '${escapeSQL(channelSlug)}'
        ORDER BY ao.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
    `;
    const deliverables = await executeWorkspaceJsonQuery<WorkspaceDeliverableRow>(provider, sandboxId, sql);
    return { deliverables };
}

// -----------------------------------------------------------------------------
// Beads JSONL → tasks sync
// -----------------------------------------------------------------------------

// Mirrors the JSONL records written by the `bd` CLI (beads). Field names match
// the on-disk format exactly: `status` (not `state`), `issue_type`, `assignee`,
// and `description`. The CLI also emits `body` in some versions, so both are read.
interface BeadsIssue {
    id: string;
    title?: string;
    description?: string;
    body?: string;
    status?: string;
    assignee?: string;
    priority?: number;
    labels?: string[];
    project?: string;
    created_at?: string;
    updated_at?: string;
    closed_at?: string;
}

const BEADS_STATUS_MAP: Record<string, string> = {
    open: 'open',
    in_progress: 'in_progress',
    blocked: 'blocked',
    closed: 'completed',
    cancelled: 'cancelled',
};

// Beads priorities are 0-4 (0 = critical, 4 = backlog). See CLI_REFERENCE.md.
const PRIORITY_MAP: Record<number, string> = {
    0: 'critical',
    1: 'critical',
    2: 'high',
    3: 'medium',
    4: 'low',
};

export async function syncBeadsToTasks(
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<{ synced: number; skipped: number }> {
    const wp = SANDBOX_CONFIG.workspacePath;

    // Find ALL .beads/issues.jsonl files across channel directories
    const { result: findResult } = await provider.executeCommand(
        sandboxId,
        `find ${wp}/projects -path '*/.beads/issues.jsonl' -type f 2>/dev/null; echo ""`,
    );

    const jsonlPaths = findResult.trim().split('\n').filter(p => p.trim());
    if (jsonlPaths.length === 0) return { synced: 0, skipped: 0 };

    const upserts: string[] = [];
    let skipped = 0;

    for (const jsonlPath of jsonlPaths) {
        // Extract channel slug from path: projects/{domain}/channels/{channel}/.beads/issues.jsonl
        const pathMatch = jsonlPath.match(/projects\/([^/]+)\/channels\/([^/]+)\/.beads/);
        const projectSlug = pathMatch ? `${pathMatch[1]}/${pathMatch[2]}` : 'default';

        const { result: raw } = await provider.executeCommand(
            sandboxId,
            `cat '${jsonlPath}' 2>/dev/null || echo ""`,
        );
        if (!raw.trim()) continue;

        const lines = raw.trim().split('\n');
        for (const line of lines) {
            try {
                const issue = JSON.parse(line) as BeadsIssue;
                if (!issue.id || !issue.title) { skipped++; continue; }

                const status = BEADS_STATUS_MAP[issue.status ?? 'open'] ?? 'open';
                const priority = issue.priority !== undefined
                    ? (PRIORITY_MAP[issue.priority] ?? 'medium')
                    : 'medium';
                const description = issue.description ?? issue.body ?? null;
                const now = new Date().toISOString();
                const issueProject = issue.project ?? projectSlug;

                upserts.push(`
                    INSERT INTO tasks (id, project_slug, title, description, status, priority, assigned_agent, labels, created_at, updated_at, synced_at)
                    VALUES (
                        '${escapeSQL(issue.id)}',
                        '${escapeSQL(issueProject)}',
                        '${escapeSQL(issue.title)}',
                        ${description !== null ? `'${escapeSQL(description)}'` : 'NULL'},
                        '${status}',
                        '${priority}',
                        ${issue.assignee ? `'${escapeSQL(issue.assignee)}'` : 'NULL'},
                        ${issue.labels ? `'${escapeSQL(JSON.stringify(issue.labels))}'` : 'NULL'},
                        '${issue.created_at ?? now}',
                        '${issue.updated_at ?? now}',
                        '${now}'
                    )
                    ON CONFLICT(id) DO UPDATE SET
                        title = excluded.title,
                        description = excluded.description,
                        status = excluded.status,
                        priority = excluded.priority,
                        assigned_agent = excluded.assigned_agent,
                        labels = excluded.labels,
                        updated_at = excluded.updated_at,
                        synced_at = excluded.synced_at;
                `);
            } catch (err) {
                log.debug('Skipping malformed beads line', { error: (err as Error).message });
                skipped++;
            }
        }
    }

    if (upserts.length === 0) return { synced: 0, skipped };

    // Batch into chunks of 50 to avoid exceeding shell argument limits at scale
    const BATCH_SIZE = 50;
    let synced = 0;
    for (let i = 0; i < upserts.length; i += BATCH_SIZE) {
        const batch = upserts.slice(i, i + BATCH_SIZE);
        const batchSql = `BEGIN;\n${batch.join('\n')}\nCOMMIT;`;
        try {
            await executeWorkspaceQuery(provider, sandboxId, batchSql);
            synced += batch.length;
        } catch (err) {
            log.warn('Beads sync batch failed', { error: (err as Error).message, batchStart: i, batchSize: batch.length });
            skipped += batch.length;
        }
    }

    return { synced, skipped };
}
