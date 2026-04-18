// Task Workspace DB Service
// Queries workspace.db (SQLite) on sandbox for task data.
// Source of truth for tasks per workspace-first pivot.
// Reference: xerus-workspace/data/workspace-schema.sql (tasks table)

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { escapeSQL, executeWorkspaceJsonQuery } from '../conversations/workspace-db.helpers';

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

    const sql = `
        BEGIN;
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
