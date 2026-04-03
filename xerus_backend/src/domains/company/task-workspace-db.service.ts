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
): Promise<WorkspaceTaskRow> {
    const now = new Date().toISOString();
    const descValue = description ? `'${escapeSQL(description)}'` : 'NULL';
    const agentValue = assignedAgent ? `'${escapeSQL(assignedAgent)}'` : 'NULL';
    const labelsValue = labels && labels.length > 0 ? `'${escapeSQL(JSON.stringify(labels))}'` : 'NULL';

    const sql = `
        BEGIN;
        INSERT INTO tasks (id, project_slug, title, description, status, priority, assigned_agent, labels, created_at, updated_at)
        VALUES (
            '${escapeSQL(id)}',
            '${escapeSQL(projectSlug)}',
            '${escapeSQL(title)}',
            ${descValue},
            'open',
            '${escapeSQL(priority)}',
            ${agentValue},
            ${labelsValue},
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
        SELECT slug, name, status
        FROM agents
        WHERE slug IN (${inClause})
    `;
    const rows = await executeWorkspaceJsonQuery<WorkspaceAgentRow>(provider, sandboxId, sql);
    for (const row of rows) {
        map.set(row.slug, row);
    }
    return map;
}
