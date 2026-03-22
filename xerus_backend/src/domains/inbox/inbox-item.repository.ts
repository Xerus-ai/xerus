// Inbox Item Repository (Database Implementation)
// Implements InboxItemRepository interface for inbox_items table

import { query } from '../../database/connection';
import type {
    InboxItemRepository,
    InboxItem,
    InboxContentType,
    InboxStatus,
    InboxPriority,
} from './inbox.types';
import { InboxItemNotFoundError } from './inbox.errors';

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
    async createItem(input: CreateItemInput): Promise<InboxItem> {
        const result = await query<InboxItem>(
            `INSERT INTO inbox_items (
                user_id, channel_id, agent_slug, team_id, conversation_id, schedule_id,
                title, summary, content, content_type, status,
                requires_approval, priority, due_date, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *`,
            [
                input.user_id,
                input.channel_id,
                input.agent_slug,
                input.team_id ?? null,
                input.conversation_id ?? null,
                input.schedule_id ?? null,
                input.title,
                input.summary,
                input.content,
                input.content_type,
                input.status,
                input.requires_approval,
                input.priority,
                input.due_date ?? null,
                JSON.stringify(input.metadata),
            ]
        );

        if (!result.rows[0]) {
            throw new Error('Failed to insert inbox item');
        }

        return result.rows[0];
    }

    async markDelivered(itemId: string, update: MarkDeliveredUpdate): Promise<InboxItem> {
        const result = await query<InboxItem>(
            `UPDATE inbox_items SET
                status = 'delivered',
                content = $2,
                summary = COALESCE($3, summary),
                content_type = COALESCE($4, content_type),
                requires_approval = COALESCE($5, requires_approval),
                delivered_at = NOW(),
                updated_at = NOW(),
                revision_number = revision_number + 1,
                metadata = metadata || COALESCE($6, '{}'::jsonb)
            WHERE item_id = $1
            RETURNING *`,
            [
                itemId,
                update.content,
                update.summary ?? null,
                update.content_type ?? null,
                update.requires_approval ?? null,
                update.metadata ? JSON.stringify(update.metadata) : null,
            ]
        );

        if (!result.rows[0]) {
            throw new InboxItemNotFoundError(itemId);
        }

        return result.rows[0];
    }

    async getItem(itemId: string): Promise<InboxItem | null> {
        const result = await query<InboxItem>(
            `SELECT * FROM inbox_items WHERE item_id = $1`,
            [itemId]
        );

        return result.rows[0] ?? null;
    }
}
