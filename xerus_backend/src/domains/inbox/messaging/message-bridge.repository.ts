// Message Bridge Repository
// Workspace-DB (SQLite) operations for channel_messages table
// Migrated from Neon to workspace-DB per migration 084.
// Uses slug-based channel identification (workspace-DB schema).
// Each function takes provider + sandboxId since the bridge is a singleton
// serving multiple users, while workspace-DB is per-sandbox.

import type { DaytonaProvider } from '../../sandbox-infra/sandbox/providers/daytona.provider';
import { escapeSQL, executeWorkspaceJsonQuery } from '../../conversations/workspace-db.helpers';

import type {
    ChannelMessageRow,
    SenderType,
    MessageType,
    QueryMessagesOptions,
} from './message-bridge.types';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface InsertMessageInput {
    channel_slug: string;
    sender_type: SenderType;
    sender_slug: string;
    content: string;
    message_type: MessageType;
    metadata?: Record<string, unknown>;
}

export interface ChannelLookupRow {
    slug: string;
    domain_slug: string;
}

// -----------------------------------------------------------------------------
// Repository Functions (stateless — provider/sandboxId per call)
// -----------------------------------------------------------------------------

export async function insertChannelMessage(
    provider: DaytonaProvider,
    sandboxId: string,
    input: InsertMessageInput,
): Promise<ChannelMessageRow> {
    const now = new Date().toISOString();
    const enrichedMetadata = { ...input.metadata, sender_type: input.sender_type };
    const metadataJson = JSON.stringify(enrichedMetadata);

    const sql = `
        BEGIN;
        INSERT INTO channel_messages (channel_slug, agent_slug, content, message_type, metadata, posted_at)
        VALUES ('${escapeSQL(input.channel_slug)}', '${escapeSQL(input.sender_slug)}', '${escapeSQL(input.content)}', '${escapeSQL(input.message_type)}', '${escapeSQL(metadataJson)}', '${now}');
        SELECT id, channel_slug, agent_slug, content, message_type, metadata, posted_at
        FROM channel_messages WHERE id = last_insert_rowid();
        COMMIT;
    `;
    const rows = await executeWorkspaceJsonQuery<{
        id: number;
        channel_slug: string;
        agent_slug: string;
        content: string;
        message_type: string;
        metadata: string | null;
        posted_at: string;
    }>(provider, sandboxId, sql);

    if (!rows[0]) {
        throw new Error(`Failed to insert channel message in channel=${input.channel_slug}`);
    }

    const row = rows[0];
    return {
        id: String(row.id),
        channel_slug: row.channel_slug,
        sender_type: input.sender_type,
        sender_slug: row.agent_slug,
        content: row.content,
        message_type: row.message_type as MessageType,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        created_at: row.posted_at,
    };
}

export async function queryChannelMessages(
    provider: DaytonaProvider,
    sandboxId: string,
    options: QueryMessagesOptions,
): Promise<ChannelMessageRow[]> {
    const conditions: string[] = [`channel_slug = '${escapeSQL(options.channel_slug)}'`];

    if (options.before) {
        conditions.push(`posted_at < '${escapeSQL(options.before)}'`);
    }

    if (options.after) {
        conditions.push(`posted_at > '${escapeSQL(options.after)}'`);
    }

    if (options.sender_type) {
        // sender_type is stored in metadata JSON as sender_type key
        conditions.push(`json_extract(metadata, '$.sender_type') = '${escapeSQL(options.sender_type)}'`);
    }

    const limit = Math.min(options.limit || 50, 200);
    const where = conditions.join(' AND ');

    const sql = `
        SELECT id, channel_slug, agent_slug, content, message_type, metadata, posted_at
        FROM channel_messages
        WHERE ${where}
        ORDER BY posted_at DESC
        LIMIT ${limit}
    `;
    const rows = await executeWorkspaceJsonQuery<{
        id: number;
        channel_slug: string;
        agent_slug: string;
        content: string;
        message_type: string;
        metadata: string | null;
        posted_at: string;
    }>(provider, sandboxId, sql);

    return rows.map(row => {
        const parsed = row.metadata ? JSON.parse(row.metadata) : {};
        const senderType = (parsed.sender_type as SenderType) || 'agent';
        return {
            id: String(row.id),
            channel_slug: row.channel_slug,
            sender_type: senderType,
            sender_slug: row.agent_slug,
            content: row.content,
            message_type: row.message_type as MessageType,
            metadata: parsed,
            created_at: row.posted_at,
        };
    });
}

export async function findChannelByProjectAndSlug(
    provider: DaytonaProvider,
    sandboxId: string,
    projectSlug: string,
    channelSlug: string,
): Promise<ChannelLookupRow | null> {
    const sql = `
        SELECT c.slug, c.domain_slug
        FROM channels c
        WHERE c.domain_slug = '${escapeSQL(projectSlug)}' AND c.slug = '${escapeSQL(channelSlug)}'
    `;
    const rows = await executeWorkspaceJsonQuery<ChannelLookupRow>(provider, sandboxId, sql);
    return rows[0] ?? null;
}

export async function findChannelBySlug(
    provider: DaytonaProvider,
    sandboxId: string,
    channelSlug: string,
): Promise<ChannelLookupRow | null> {
    const sql = `
        SELECT c.slug, c.domain_slug
        FROM channels c
        WHERE c.slug = '${escapeSQL(channelSlug)}'
    `;
    const rows = await executeWorkspaceJsonQuery<ChannelLookupRow>(provider, sandboxId, sql);
    return rows[0] ?? null;
}

export async function findChannelLead(
    provider: DaytonaProvider,
    sandboxId: string,
    channelSlug: string,
): Promise<string | null> {
    // First check lead_agent_slug on the channel itself
    const leadSql = `
        SELECT lead_agent_slug FROM channels
        WHERE slug = '${escapeSQL(channelSlug)}' AND lead_agent_slug IS NOT NULL
    `;
    const leadRows = await executeWorkspaceJsonQuery<{ lead_agent_slug: string }>(provider, sandboxId, leadSql);
    if (leadRows[0]?.lead_agent_slug) {
        return leadRows[0].lead_agent_slug;
    }

    // Fallback: most recent agent sender in channel_messages
    const sql = `
        SELECT agent_slug
        FROM channel_messages
        WHERE channel_slug = '${escapeSQL(channelSlug)}'
          AND json_extract(metadata, '$.sender_type') = 'agent'
        ORDER BY posted_at DESC
        LIMIT 1
    `;
    const rows = await executeWorkspaceJsonQuery<{ agent_slug: string }>(provider, sandboxId, sql);
    return rows[0]?.agent_slug ?? null;
}
