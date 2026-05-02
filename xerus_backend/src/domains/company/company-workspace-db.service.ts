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

export async function updateChannel(
    provider: DaytonaProvider,
    sandboxId: string,
    channelSlug: string,
    updates: { name?: string; description?: string },
): Promise<ChannelRow | null> {
    const setClauses: string[] = [];
    if (updates.name !== undefined) {
        setClauses.push(`name = '${escapeSQL(updates.name)}'`);
    }
    if (updates.description !== undefined) {
        setClauses.push(`description = '${escapeSQL(updates.description)}'`);
    }
    if (setClauses.length === 0) return null;

    const now = new Date().toISOString();
    setClauses.push(`updated_at = '${now}'`);
    const sql = `
        UPDATE channels SET ${setClauses.join(', ')} WHERE slug = '${escapeSQL(channelSlug)}';
        SELECT slug, name, domain_slug, lead_agent_slug, description, goals, config, created_at, updated_at
        FROM channels WHERE slug = '${escapeSQL(channelSlug)}';
    `;
    const rows = await executeWorkspaceJsonQuery<ChannelRow>(provider, sandboxId, sql);
    return rows[0] ?? null;
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
    // Sub-select with DESC to get latest N messages, then wrap in ASC for
    // chronological display (oldest first, like Slack).
    const sql = `
        SELECT * FROM (
            SELECT id, channel_slug, agent_slug, content, message_type, metadata, posted_at
            FROM channel_messages
            WHERE channel_slug = '${escapeSQL(channelSlug)}'
            ORDER BY posted_at DESC
            LIMIT ${limit} OFFSET ${offset}
        ) sub
        ORDER BY posted_at ASC
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

// -----------------------------------------------------------------------------
// System Events — insert system-type messages for channel activity feed
// -----------------------------------------------------------------------------

export async function createSystemEvent(
    provider: DaytonaProvider,
    sandboxId: string,
    channelSlug: string,
    content: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    const now = new Date().toISOString();
    const enrichedMetadata = { sender_type: 'system', ...metadata };
    const metadataJson = JSON.stringify(enrichedMetadata);
    const sql = `
        INSERT INTO channel_messages (channel_slug, agent_slug, content, message_type, metadata, posted_at)
        VALUES ('${escapeSQL(channelSlug)}', 'system', '${escapeSQL(content)}', 'system', '${escapeSQL(metadataJson)}', '${now}')
    `;
    await executeWorkspaceJsonQuery(provider, sandboxId, sql);
}

// -----------------------------------------------------------------------------
// Channel Members
// -----------------------------------------------------------------------------

export interface ChannelMemberRow {
    agent_slug: string;
    agent_name: string;
    agent_status: string;
    role: string;
}

export async function listChannelAgents(
    provider: DaytonaProvider,
    sandboxId: string,
    channelSlug: string,
): Promise<ChannelMemberRow[]> {
    const sql = `
        SELECT cm.agent_slug, COALESCE(a.name, cm.agent_slug) AS agent_name,
               COALESCE(a.status, 'idle') AS agent_status, cm.role
        FROM channel_members cm
        LEFT JOIN agents a ON a.slug = cm.agent_slug
        WHERE cm.channel_slug = '${escapeSQL(channelSlug)}'
        ORDER BY cm.role ASC, cm.joined_at ASC
    `;
    return executeWorkspaceJsonQuery<ChannelMemberRow>(provider, sandboxId, sql);
}

// -----------------------------------------------------------------------------
// Project Overview (aggregate dashboard data)
// -----------------------------------------------------------------------------

export interface ProjectOverview {
    domain: DomainRow;
    channels: Array<ChannelRow & { agent_count: number; lead_name: string | null }>;
    agents: Array<{ slug: string; name: string; status: string; role: string; channel_slug: string }>;
    recent_sessions: Array<{ agent_slug: string; status: string; started_at: string; completed_at: string | null }>;
    cost_summary: { total_cost: number; session_count: number };
}

export async function getProjectOverview(
    provider: DaytonaProvider,
    sandboxId: string,
    domainSlug: string,
): Promise<ProjectOverview | null> {
    const esc = escapeSQL(domainSlug);

    const domainSql = `SELECT slug, name, description, config, created_at, updated_at FROM domains WHERE slug = '${esc}'`;
    const domains = await executeWorkspaceJsonQuery<DomainRow>(provider, sandboxId, domainSql);
    if (domains.length === 0) return null;

    const channelsSql = `
        SELECT c.slug, c.name, c.domain_slug, c.lead_agent_slug, c.description, c.goals, c.config, c.created_at, c.updated_at,
               (SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_slug = c.slug) AS agent_count,
               a.name AS lead_name
        FROM channels c
        LEFT JOIN agents a ON a.slug = c.lead_agent_slug
        WHERE c.domain_slug = '${esc}'
        ORDER BY c.name
    `;

    const agentsSql = `
        SELECT DISTINCT a.slug, a.name, COALESCE(a.status, 'idle') AS status, COALESCE(cm.role, 'member') AS role, cm.channel_slug
        FROM channel_members cm
        JOIN agents a ON a.slug = cm.agent_slug
        JOIN channels c ON c.slug = cm.channel_slug
        WHERE c.domain_slug = '${esc}'
        ORDER BY a.name
    `;

    const sessionsSql = `
        SELECT es.agent_slug, es.status, es.started_at, es.ended_at AS completed_at
        FROM execution_sessions es
        WHERE es.agent_slug IN (SELECT DISTINCT cm.agent_slug FROM channel_members cm JOIN channels c ON c.slug = cm.channel_slug WHERE c.domain_slug = '${esc}')
        ORDER BY es.started_at DESC
        LIMIT 10
    `;

    const costSql = `SELECT COALESCE(SUM(total_cost), 0) AS total_cost, COUNT(*) AS session_count FROM v_daily_costs`;

    function catchMissingTable<T>(fallback: T) {
        return (err: unknown): T => {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('no such table') || msg.includes('no such view')) return fallback;
            throw err;
        };
    }

    const [channels, agents, recent_sessions, costRows] = await Promise.all([
        executeWorkspaceJsonQuery<ChannelRow & { agent_count: number; lead_name: string | null }>(provider, sandboxId, channelsSql),
        executeWorkspaceJsonQuery<{ slug: string; name: string; status: string; role: string; channel_slug: string }>(provider, sandboxId, agentsSql),
        executeWorkspaceJsonQuery<ProjectOverview['recent_sessions'][number]>(provider, sandboxId, sessionsSql)
            .catch(catchMissingTable<ProjectOverview['recent_sessions']>([])),
        executeWorkspaceJsonQuery<{ total_cost: number; session_count: number }>(provider, sandboxId, costSql)
            .catch(catchMissingTable<Array<{ total_cost: number; session_count: number }>>([])),
    ]);

    const cost_summary = costRows.length > 0 ? costRows[0] : { total_cost: 0, session_count: 0 };

    return { domain: domains[0], channels, agents, recent_sessions, cost_summary };
}
