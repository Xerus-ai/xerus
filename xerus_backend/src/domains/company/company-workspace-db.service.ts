// Company Workspace DB Service
// Queries workspace.db (SQLite) on sandbox for domains, channels, and channel_messages.
// Source of truth for company/collaboration entities per workspace DB migration.
// Reference: xerus-workspace/data/workspace-schema.sql

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { escapeSQL, executeWorkspaceJsonQuery } from '../conversations/workspace-db.helpers';

// -----------------------------------------------------------------------------
// Types (mirror workspace-schema.sql)
// -----------------------------------------------------------------------------

export interface DomainRow {
    slug: string;
    name: string;
    description: string | null;
    config: string | null;
    created_at: string;
    updated_at: string;
}

export interface ChannelRow {
    slug: string;
    name: string;
    domain_slug: string;
    lead_agent_slug: string | null;
    description: string | null;
    goals: string | null;
    config: string | null;
    created_at: string;
    updated_at: string;
}

export interface ChannelMessageRow {
    id: number;
    channel_slug: string;
    agent_slug: string;
    content: string;
    message_type: string;
    metadata: string | null;
    posted_at: string;
}

export interface DomainWithChannels extends DomainRow {
    channels: ChannelRow[];
}

// -----------------------------------------------------------------------------
// Domain Queries
// -----------------------------------------------------------------------------

export async function listDomainsWithChannels(
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<DomainWithChannels[]> {
    const domainsSql = `
        SELECT slug, name, description, config, created_at, updated_at
        FROM domains
        ORDER BY name
    `;
    const domains = await executeWorkspaceJsonQuery<DomainRow>(provider, sandboxId, domainsSql);

    const channelsSql = `
        SELECT slug, name, domain_slug, lead_agent_slug, description, goals, config, created_at, updated_at
        FROM channels
        ORDER BY name
    `;
    const channels = await executeWorkspaceJsonQuery<ChannelRow>(provider, sandboxId, channelsSql);

    const channelsByDomain = new Map<string, ChannelRow[]>();
    for (const ch of channels) {
        const list = channelsByDomain.get(ch.domain_slug) ?? [];
        list.push(ch);
        channelsByDomain.set(ch.domain_slug, list);
    }

    return domains.map(d => ({
        ...d,
        channels: channelsByDomain.get(d.slug) ?? [],
    }));
}

export async function createDomain(
    provider: DaytonaProvider,
    sandboxId: string,
    slug: string,
    name: string,
    description: string,
): Promise<DomainRow> {
    const now = new Date().toISOString();
    const sql = `
        BEGIN;
        INSERT INTO domains (slug, name, description, created_at, updated_at)
        VALUES ('${escapeSQL(slug)}', '${escapeSQL(name)}', '${escapeSQL(description)}', '${now}', '${now}');
        SELECT slug, name, description, config, created_at, updated_at
        FROM domains WHERE slug = '${escapeSQL(slug)}';
        COMMIT;
    `;
    const rows = await executeWorkspaceJsonQuery<DomainRow>(provider, sandboxId, sql);
    if (!rows[0]) {
        throw new Error(`Failed to create domain: slug=${slug}`);
    }
    return rows[0];
}

// -----------------------------------------------------------------------------
// Channel Queries
// -----------------------------------------------------------------------------

export async function createChannel(
    provider: DaytonaProvider,
    sandboxId: string,
    domainSlug: string,
    slug: string,
    name: string,
    description: string,
): Promise<ChannelRow> {
    const now = new Date().toISOString();
    const sql = `
        BEGIN;
        INSERT INTO channels (slug, name, domain_slug, description, created_at, updated_at)
        VALUES ('${escapeSQL(slug)}', '${escapeSQL(name)}', '${escapeSQL(domainSlug)}', '${escapeSQL(description)}', '${now}', '${now}');
        SELECT slug, name, domain_slug, lead_agent_slug, description, goals, config, created_at, updated_at
        FROM channels WHERE slug = '${escapeSQL(slug)}';
        COMMIT;
    `;
    const rows = await executeWorkspaceJsonQuery<ChannelRow>(provider, sandboxId, sql);
    if (!rows[0]) {
        throw new Error(`Failed to create channel: slug=${slug} in domain=${domainSlug}`);
    }
    return rows[0];
}

// -----------------------------------------------------------------------------
// Channel Message Queries
// -----------------------------------------------------------------------------

export async function listChannelMessages(
    provider: DaytonaProvider,
    sandboxId: string,
    channelSlug: string,
    limit: number,
    offset: number,
): Promise<ChannelMessageRow[]> {
    const sql = `
        SELECT id, channel_slug, agent_slug, content, message_type, metadata, posted_at
        FROM channel_messages
        WHERE channel_slug = '${escapeSQL(channelSlug)}'
        ORDER BY posted_at DESC
        LIMIT ${limit} OFFSET ${offset}
    `;
    return executeWorkspaceJsonQuery<ChannelMessageRow>(provider, sandboxId, sql);
}

export async function createChannelMessage(
    provider: DaytonaProvider,
    sandboxId: string,
    channelSlug: string,
    senderType: string,
    senderSlug: string,
    content: string,
    messageType: string,
    metadata: Record<string, unknown>,
): Promise<ChannelMessageRow> {
    const now = new Date().toISOString();
    // Workspace DB uses agent_slug for sender identity. Store sender_type in metadata
    // so the API can reconstruct the full response shape for the frontend.
    const enrichedMetadata = { ...metadata, sender_type: senderType };
    const metadataJson = JSON.stringify(enrichedMetadata);
    const sql = `
        BEGIN;
        INSERT INTO channel_messages (channel_slug, agent_slug, content, message_type, metadata, posted_at)
        VALUES ('${escapeSQL(channelSlug)}', '${escapeSQL(senderSlug)}', '${escapeSQL(content)}', '${escapeSQL(messageType)}', '${escapeSQL(metadataJson)}', '${now}');
        SELECT id, channel_slug, agent_slug, content, message_type, metadata, posted_at
        FROM channel_messages WHERE id = last_insert_rowid();
        COMMIT;
    `;
    const rows = await executeWorkspaceJsonQuery<ChannelMessageRow>(provider, sandboxId, sql);
    if (!rows[0]) {
        throw new Error(`Failed to create channel message in channel=${channelSlug}`);
    }
    return rows[0];
}

export async function domainExists(
    provider: DaytonaProvider,
    sandboxId: string,
    slug: string,
): Promise<boolean> {
    const sql = `
        SELECT slug FROM domains WHERE slug = '${escapeSQL(slug)}'
    `;
    const rows = await executeWorkspaceJsonQuery<{ slug: string }>(provider, sandboxId, sql);
    return rows.length > 0;
}

export async function channelExists(
    provider: DaytonaProvider,
    sandboxId: string,
    slug: string,
): Promise<boolean> {
    const sql = `
        SELECT slug FROM channels WHERE slug = '${escapeSQL(slug)}'
    `;
    const rows = await executeWorkspaceJsonQuery<{ slug: string }>(provider, sandboxId, sql);
    return rows.length > 0;
}

export async function getChannelWithDomain(
    provider: DaytonaProvider,
    sandboxId: string,
    channelSlug: string,
): Promise<{ channel_slug: string; domain_slug: string } | null> {
    const sql = `
        SELECT c.slug AS channel_slug, c.domain_slug
        FROM channels c
        WHERE c.slug = '${escapeSQL(channelSlug)}'
    `;
    const rows = await executeWorkspaceJsonQuery<{ channel_slug: string; domain_slug: string }>(provider, sandboxId, sql);
    return rows[0] ?? null;
}
