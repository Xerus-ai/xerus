// Inbox Item Repository (Workspace DB Implementation)
// Implements InboxItemRepository interface using workspace SQLite DB.
// Each instance is bound to a specific provider+sandboxId (one per execution context).

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { escapeSQL, executeWorkspaceJsonQuery } from '../conversations/workspace-db.helpers';
import type {
    InboxItemRepository,
    InboxItem,
    InboxContentType,
    InboxStatus,
    InboxPriority,
} from './inbox.types';
import { InboxItemNotFoundError } from './inbox.errors';
import type { InboxItemRow } from './inbox-workspace-db.service';

// -----------------------------------------------------------------------------
// Workspace message_type mapping
// Neon content_type -> workspace message_type
// -----------------------------------------------------------------------------

const CONTENT_TYPE_TO_MESSAGE_TYPE: Record<string, string> = {
    deliverable: 'task',
    plan: 'task',
    report: 'notification',
    analysis: 'notification',
    output: 'task',
    guidance: 'coordination',
    proactive_finding: 'notification',
    daily_digest: 'system',
};

function mapContentTypeToMessageType(contentType: InboxContentType): string {
    return CONTENT_TYPE_TO_MESSAGE_TYPE[contentType] || 'notification';
}

// -----------------------------------------------------------------------------
// Workspace priority mapping
// Neon priority -> workspace priority (critical -> urgent)
// -----------------------------------------------------------------------------

function mapPriorityToWorkspace(priority: InboxPriority): string {
    if (priority === 'critical') return 'urgent';
    return priority;
}

// -----------------------------------------------------------------------------
// Workspace status mapping
// Neon status -> workspace status
// -----------------------------------------------------------------------------

function mapStatusToWorkspace(status: InboxStatus): string {
    switch (status) {
        case 'in_progress': return 'unread';
        case 'delivered': return 'unread';
        case 'approved': return 'actioned';
        case 'rejected': return 'actioned';
        case 'archived': return 'archived';
        default: return 'unread';
    }
}

// -----------------------------------------------------------------------------
// Map workspace row to InboxItem (for callers expecting old shape)
// -----------------------------------------------------------------------------

function mapRowToInboxItem(row: InboxItemRow): InboxItem {
    let parsedMetadata: Record<string, unknown> = {};
    if (row.metadata) {
        try {
            parsedMetadata = JSON.parse(row.metadata) as Record<string, unknown>;
        } catch {
            parsedMetadata = {};
        }
    }

    return {
        item_id: String(row.id),
        user_id: '',
        channel_id: null,
        agent_slug: row.agent_slug,
        team_id: null,
        conversation_id: null,
        schedule_id: null,
        title: row.subject || '',
        summary: null,
        content: row.content,
        content_type: 'deliverable' as InboxContentType,
        status: (row.status === 'unread' ? 'delivered' : row.status === 'actioned' ? 'approved' : row.status) as InboxStatus,
        requires_approval: false,
        is_read: row.status !== 'unread',
        is_archived: row.status === 'archived',
        priority: (row.priority === 'urgent' ? 'critical' : row.priority) as InboxPriority,
        due_date: null,
        revision_number: 0,
        metadata: parsedMetadata,
        created_at: row.received_at ? new Date(row.received_at) : new Date(),
        updated_at: row.read_at ? new Date(row.read_at) : (row.received_at ? new Date(row.received_at) : new Date()),
        delivered_at: row.received_at ? new Date(row.received_at) : null,
    };
}

// -----------------------------------------------------------------------------
// Repository
// -----------------------------------------------------------------------------

interface CreateItemInput {
    user_id: string;
    channel_id: string | null;
    agent_slug: string;
    team_id?: number | null;
    conversation_id?: string | null;
    schedule_id?: number | null;
    title: string;
    summary: string;
    content: string;
    content_type: InboxContentType;
    status: InboxStatus;
    requires_approval: boolean;
    priority: InboxPriority;
    due_date?: Date | null;
    metadata: Record<string, unknown>;
}

interface MarkDeliveredUpdate {
    content: string;
    summary?: string;
    content_type?: InboxContentType;
    requires_approval?: boolean;
    priority?: InboxPriority;
    due_date?: Date | null;
    metadata?: Record<string, unknown>;
}

export class DatabaseInboxItemRepository implements InboxItemRepository {
    constructor(
        private readonly provider: DaytonaProvider,
        private readonly sandboxId: string,
    ) {}

    async createItem(input: CreateItemInput): Promise<InboxItem> {
        const now = new Date().toISOString();
        const messageType = mapContentTypeToMessageType(input.content_type);
        const workspacePriority = mapPriorityToWorkspace(input.priority);
        const workspaceStatus = mapStatusToWorkspace(input.status);
        // agent_slug = recipient (who the item is for), sender_slug = who produced it
        const agentSlug = input.agent_slug;
        const senderSlug = input.agent_slug;
        const metadataStr = JSON.stringify(input.metadata);

        const agentEsc = escapeSQL(agentSlug);
        const sql = `
            INSERT OR IGNORE INTO agents (slug, name, adapter_type, role, autonomy_level, status)
            VALUES ('${agentEsc}', '${agentEsc}', 'claudecode', 'specialist', 'supervised', 'idle');
            INSERT INTO inbox_items (agent_slug, sender_slug, message_type, subject, content, metadata, priority, status, received_at)
            VALUES ('${agentEsc}', '${escapeSQL(senderSlug)}', '${escapeSQL(messageType)}', '${escapeSQL(input.title)}', '${escapeSQL(input.content)}', '${escapeSQL(metadataStr)}', '${escapeSQL(workspacePriority)}', '${escapeSQL(workspaceStatus)}', '${now}');
            SELECT id, agent_slug, sender_slug, message_type, subject, content,
                   metadata, priority, status, received_at, read_at, actioned_at
            FROM inbox_items WHERE id = last_insert_rowid();
        `;
        const rows = await executeWorkspaceJsonQuery<InboxItemRow>(this.provider, this.sandboxId, sql);

        if (!rows[0]) {
            throw new Error('Failed to insert inbox item into workspace DB');
        }

        return mapRowToInboxItem(rows[0]);
    }

    async markDelivered(itemId: string, update: MarkDeliveredUpdate): Promise<InboxItem> {
        const id = parseInt(itemId, 10);
        if (isNaN(id)) {
            throw new InboxItemNotFoundError(itemId);
        }

        const setClauses: string[] = [
            `content = '${escapeSQL(update.content)}'`,
        ];
        if (update.summary) {
            setClauses.push(`subject = '${escapeSQL(update.summary)}'`);
        }
        if (update.metadata) {
            setClauses.push(`metadata = '${escapeSQL(JSON.stringify(update.metadata))}'`);
        }

        const sql = `
            UPDATE inbox_items SET ${setClauses.join(', ')}
            WHERE id = ${id};
            SELECT id, agent_slug, sender_slug, message_type, subject, content,
                   metadata, priority, status, received_at, read_at, actioned_at
            FROM inbox_items WHERE id = ${id};
        `;
        const rows = await executeWorkspaceJsonQuery<InboxItemRow>(this.provider, this.sandboxId, sql);

        if (!rows[0]) {
            throw new InboxItemNotFoundError(itemId);
        }

        return mapRowToInboxItem(rows[0]);
    }

    async getItem(itemId: string): Promise<InboxItem | null> {
        const id = parseInt(itemId, 10);
        if (isNaN(id)) {
            return null;
        }

        const sql = `
            SELECT id, agent_slug, sender_slug, message_type, subject, content,
                   metadata, priority, status, received_at, read_at, actioned_at
            FROM inbox_items WHERE id = ${id}
        `;
        const rows = await executeWorkspaceJsonQuery<InboxItemRow>(this.provider, this.sandboxId, sql);
        if (!rows[0]) return null;

        return mapRowToInboxItem(rows[0]);
    }
}
