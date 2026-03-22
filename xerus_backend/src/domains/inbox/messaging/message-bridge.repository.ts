// Message Bridge Repository
// Neon DB operations for channel_messages table
// Reference: Migration 033_v2_company_hierarchy.sql

import type {
    ChannelMessageRow,
    SenderType,
    MessageType,
    QueryMessagesOptions,
} from './message-bridge.types';

// -----------------------------------------------------------------------------
// Database Interface
// -----------------------------------------------------------------------------

export interface MessageBridgeQueryResult<T> {
    rows: T[];
}

export interface MessageBridgeDatabase {
    query<T = ChannelMessageRow>(text: string, values?: unknown[]): Promise<MessageBridgeQueryResult<T>>;
}

// -----------------------------------------------------------------------------
// Repository
// -----------------------------------------------------------------------------

export interface InsertMessageInput {
    channel_id: string;
    sender_type: SenderType;
    sender_slug: string;
    content: string;
    message_type: MessageType;
    metadata?: Record<string, unknown>;
}

export interface ChannelLookupRow {
    id: string;
    slug: string;
    domain_slug: string;
}

export class MessageBridgeRepository {
    private readonly db: MessageBridgeDatabase;

    constructor(db: MessageBridgeDatabase) {
        this.db = db;
    }

    async insertMessage(input: InsertMessageInput): Promise<ChannelMessageRow> {
        const result = await this.db.query<ChannelMessageRow>(
            `INSERT INTO channel_messages (channel_id, sender_type, sender_slug, content, message_type, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                input.channel_id,
                input.sender_type,
                input.sender_slug,
                input.content,
                input.message_type,
                JSON.stringify(input.metadata || {}),
            ]
        );

        return result.rows[0];
    }

    async queryMessages(options: QueryMessagesOptions): Promise<ChannelMessageRow[]> {
        const conditions: string[] = ['channel_id = $1'];
        const values: unknown[] = [options.channel_id];
        let paramIndex = 2;

        if (options.before) {
            conditions.push(`created_at < $${paramIndex}`);
            values.push(options.before);
            paramIndex++;
        }

        if (options.after) {
            conditions.push(`created_at > $${paramIndex}`);
            values.push(options.after);
            paramIndex++;
        }

        if (options.sender_type) {
            conditions.push(`sender_type = $${paramIndex}`);
            values.push(options.sender_type);
            paramIndex++;
        }

        const limit = Math.min(options.limit || 50, 200);
        const where = conditions.join(' AND ');

        const result = await this.db.query<ChannelMessageRow>(
            `SELECT * FROM channel_messages
             WHERE ${where}
             ORDER BY created_at DESC
             LIMIT $${paramIndex}`,
            [...values, limit]
        );

        return result.rows;
    }

    async findChannelByProjectAndSlug(
        userId: string,
        projectSlug: string,
        channelSlug: string
    ): Promise<ChannelLookupRow | null> {
        const result = await this.db.query<ChannelLookupRow>(
            `SELECT c.id, c.slug, d.slug AS domain_slug
             FROM channels c
             JOIN domains d ON c.domain_id = d.id
             WHERE c.user_id = $1 AND d.slug = $2 AND c.slug = $3`,
            [userId, projectSlug, channelSlug]
        );

        return result.rows[0] || null;
    }

    async findChannelById(channelId: string): Promise<ChannelLookupRow | null> {
        const result = await this.db.query<ChannelLookupRow>(
            `SELECT c.id, c.slug, d.slug AS domain_slug
             FROM channels c
             JOIN domains d ON c.domain_id = d.id
             WHERE c.id = $1`,
            [channelId]
        );

        return result.rows[0] || null;
    }

    async findChannelLead(channelId: string): Promise<string | null> {
        // Prefer the explicitly assigned lead from channel_members (role = 'lead')
        const leadResult = await this.db.query<{ slug: string }>(
            `SELECT ar.slug
             FROM channel_members cm
             JOIN agent_registry ar ON ar.id = cm.agent_id
             WHERE cm.channel_id = $1 AND cm.role = 'lead'
             LIMIT 1`,
            [channelId]
        );

        if (leadResult.rows[0]?.slug) {
            return leadResult.rows[0].slug;
        }

        // Fallback: no explicit lead assigned -- use most recent agent sender as heuristic.
        // This is a best-effort approximation until a lead is explicitly assigned via channel_members.
        const result = await this.db.query<{ sender_slug: string }>(
            `SELECT sender_slug
             FROM channel_messages
             WHERE channel_id = $1 AND sender_type = 'agent'
             ORDER BY created_at DESC
             LIMIT 1`,
            [channelId]
        );

        return result.rows[0]?.sender_slug || null;
    }
}
