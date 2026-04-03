// Inbox Workspace DB Service
// Queries workspace.db (SQLite) on sandbox via provider.executeCommand()
// Source of truth for inbox_items per workspace DB migration.
// Reference: xerus-workspace/data/workspace-schema.sql (inbox_items table)

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { escapeSQL, executeWorkspaceJsonQuery } from '../conversations/workspace-db.helpers';

// -----------------------------------------------------------------------------
// Types (mirror workspace-schema.sql inbox_items)
// -----------------------------------------------------------------------------

export type WorkspaceInboxMessageType = 'coordination' | 'system' | 'task' | 'notification';
export type WorkspaceInboxPriority = 'urgent' | 'high' | 'normal' | 'low';
export type WorkspaceInboxStatus = 'unread' | 'read' | 'actioned' | 'archived';

export interface InboxItemRow {
    id: number;
    agent_slug: string;
    sender_slug: string | null;
    message_type: WorkspaceInboxMessageType;
    subject: string | null;
    content: string;
    metadata: string | null;
    priority: WorkspaceInboxPriority;
    status: WorkspaceInboxStatus;
    received_at: string | null;
    read_at: string | null;
    actioned_at: string | null;
}

// -----------------------------------------------------------------------------
// Queries
// -----------------------------------------------------------------------------

export async function listInboxItems(
    provider: DaytonaProvider,
    sandboxId: string,
    options: { agentSlug?: string; status?: WorkspaceInboxStatus; limit?: number; offset?: number } = {},
): Promise<{ items: InboxItemRow[]; total: number }> {
    const limit = Math.min(options.limit ?? 50, 100);
    const offset = options.offset ?? 0;

    const conditions: string[] = [];
    if (options.agentSlug) {
        conditions.push(`agent_slug = '${escapeSQL(options.agentSlug)}'`);
    }
    if (options.status) {
        conditions.push(`status = '${escapeSQL(options.status)}'`);
    }

    const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

    const sql = `
        SELECT id, agent_slug, sender_slug, message_type, subject, content,
               metadata, priority, status, received_at, read_at, actioned_at,
               (SELECT COUNT(*) FROM inbox_items ${whereClause}) AS _total
        FROM inbox_items
        ${whereClause}
        ORDER BY received_at DESC, id DESC
        LIMIT ${limit} OFFSET ${offset}
    `;
    const rows = await executeWorkspaceJsonQuery<InboxItemRow & { _total: number }>(provider, sandboxId, sql);
    const total = rows[0]?._total ?? 0;
    const items = rows.map(({ _total: _, ...item }) => item) as InboxItemRow[];

    return { items, total };
}

export async function getInboxItem(
    provider: DaytonaProvider,
    sandboxId: string,
    itemId: number,
): Promise<InboxItemRow | null> {
    const sql = `
        SELECT id, agent_slug, sender_slug, message_type, subject, content,
               metadata, priority, status, received_at, read_at, actioned_at
        FROM inbox_items
        WHERE id = ${itemId}
    `;
    const rows = await executeWorkspaceJsonQuery<InboxItemRow>(provider, sandboxId, sql);
    return rows[0] ?? null;
}

export async function createInboxItem(
    provider: DaytonaProvider,
    sandboxId: string,
    agentSlug: string,
    senderSlug: string | null,
    content: string,
    messageType: WorkspaceInboxMessageType,
    priority: WorkspaceInboxPriority,
    metadata: Record<string, unknown> | null,
    subject?: string,
): Promise<InboxItemRow> {
    const now = new Date().toISOString();
    const senderVal = senderSlug ? `'${escapeSQL(senderSlug)}'` : 'NULL';
    const subjectVal = subject ? `'${escapeSQL(subject)}'` : 'NULL';
    const metadataVal = metadata ? `'${escapeSQL(JSON.stringify(metadata))}'` : 'NULL';

    const sql = `
        BEGIN;
        INSERT INTO inbox_items (agent_slug, sender_slug, message_type, subject, content, metadata, priority, status, received_at)
        VALUES ('${escapeSQL(agentSlug)}', ${senderVal}, '${escapeSQL(messageType)}', ${subjectVal}, '${escapeSQL(content)}', ${metadataVal}, '${escapeSQL(priority)}', 'unread', '${now}');
        SELECT id, agent_slug, sender_slug, message_type, subject, content,
               metadata, priority, status, received_at, read_at, actioned_at
        FROM inbox_items WHERE id = last_insert_rowid();
        COMMIT;
    `;
    const rows = await executeWorkspaceJsonQuery<InboxItemRow>(provider, sandboxId, sql);

    if (!rows[0]) {
        throw new Error('Failed to create inbox item in workspace DB');
    }
    return rows[0];
}

export async function markInboxItemRead(
    provider: DaytonaProvider,
    sandboxId: string,
    itemId: number,
): Promise<InboxItemRow | null> {
    const now = new Date().toISOString();
    const sql = `
        BEGIN;
        UPDATE inbox_items SET status = 'read', read_at = '${now}'
        WHERE id = ${itemId} AND status = 'unread';
        SELECT id, agent_slug, sender_slug, message_type, subject, content,
               metadata, priority, status, received_at, read_at, actioned_at
        FROM inbox_items WHERE id = ${itemId};
        COMMIT;
    `;
    const rows = await executeWorkspaceJsonQuery<InboxItemRow>(provider, sandboxId, sql);
    return rows[0] ?? null;
}

export async function archiveInboxItem(
    provider: DaytonaProvider,
    sandboxId: string,
    itemId: number,
): Promise<InboxItemRow | null> {
    const sql = `
        BEGIN;
        UPDATE inbox_items SET status = 'archived'
        WHERE id = ${itemId} AND status != 'archived';
        SELECT id, agent_slug, sender_slug, message_type, subject, content,
               metadata, priority, status, received_at, read_at, actioned_at
        FROM inbox_items WHERE id = ${itemId};
        COMMIT;
    `;
    const rows = await executeWorkspaceJsonQuery<InboxItemRow>(provider, sandboxId, sql);
    return rows[0] ?? null;
}
