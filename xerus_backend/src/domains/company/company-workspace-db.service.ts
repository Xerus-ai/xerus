// Company Workspace DB Service
// Queries workspace.db (SQLite) on sandbox for domains, channels, and channel_messages.
// Source of truth for company/collaboration entities per workspace DB migration.
// Reference: xerus-workspace/data/workspace-schema.sql

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import { escapeSQL, executeWorkspaceJsonQuery, executeWorkspaceQuery } from '../conversations/workspace-db.helpers';
import { logger } from '../../utils/logger';

const log = logger('CompanyWorkspaceDB');

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

export interface ChannelWithCount extends ChannelRow {
    agent_count: number;
}

export interface DomainWithChannels extends DomainRow {
    channels: ChannelWithCount[];
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
        SELECT c.slug, c.name, c.domain_slug, c.lead_agent_slug, c.description, c.goals, c.config, c.created_at, c.updated_at,
               (SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_slug = c.slug) AS agent_count
        FROM channels c
        ORDER BY c.name
    `;
    const channels = await executeWorkspaceJsonQuery<ChannelWithCount>(provider, sandboxId, channelsSql);

    const channelsByDomain = new Map<string, ChannelWithCount[]>();
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
    if (!slug.includes('--')) {
        throw new Error(
            `Invalid channel slug "${slug}": must use "domain--channel" format (e.g. "${domainSlug}--${slug}"). ` +
            `Bare slugs are not allowed because normalizeChannelId() requires the "--" separator.`,
        );
    }
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
    const escaped = escapeSQL(senderSlug);
    const sql = `
        BEGIN;
        INSERT OR IGNORE INTO agents (slug, name, adapter_type, role, autonomy_level, status)
        VALUES ('${escaped}', '${escaped}', 'claudecode', 'user', 'manual', 'idle');
        INSERT INTO channel_messages (channel_slug, agent_slug, content, message_type, metadata, posted_at)
        VALUES ('${escapeSQL(channelSlug)}', '${escaped}', '${escapeSQL(content)}', '${escapeSQL(messageType)}', '${escapeSQL(metadataJson)}', '${now}');
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
        INSERT OR IGNORE INTO agents (slug, name, adapter_type, role, autonomy_level, status)
        VALUES ('system', 'System', 'claudecode', 'system', 'manual', 'idle');
        INSERT INTO channel_messages (channel_slug, agent_slug, content, message_type, metadata, posted_at)
        VALUES ('${escapeSQL(channelSlug)}', 'system', '${escapeSQL(content)}', 'system', '${escapeSQL(metadataJson)}', '${now}')
    `;
    await executeWorkspaceQuery(provider, sandboxId, sql);
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

// -----------------------------------------------------------------------------
// posts.jsonl → channel_messages sync
// Agents write to output/posts.jsonl on the filesystem. The frontend reads
// channel_messages from workspace.db. This function bridges the gap.
// -----------------------------------------------------------------------------

interface PostsJsonlEntry {
    agent_slug: string;
    content: string;
    message_type: string;
    metadata?: Record<string, unknown>;
    posted_at: string;
}

export async function syncPostsJsonlToChannelMessages(
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<{ synced: number }> {
    const wp = SANDBOX_CONFIG.workspacePath;

    const { result: findResult } = await provider.executeCommand(
        sandboxId,
        `find ${wp}/projects -path '*/output/posts.jsonl' -type f 2>/dev/null; echo ""`,
    );

    const jsonlPaths = findResult.trim().split('\n').filter(p => p.trim());
    if (jsonlPaths.length === 0) return { synced: 0 };

    let totalSynced = 0;

    for (const jsonlPath of jsonlPaths) {
        // Extract channel slug from path: projects/{domain}/channels/{channel}/output/posts.jsonl
        const pathMatch = jsonlPath.match(/projects\/([^/]+)\/channels\/([^/]+)\/output/);
        if (!pathMatch) continue;
        const channelSlug = pathMatch[2];

        const { result: raw } = await provider.executeCommand(
            sandboxId,
            `cat '${jsonlPath}' 2>/dev/null || echo ""`,
        );
        if (!raw.trim()) continue;

        const lines = raw.trim().split('\n');
        const inserts: string[] = [];

        for (const line of lines) {
            try {
                const entry = JSON.parse(line) as PostsJsonlEntry;
                if (!entry.agent_slug || !entry.content || !entry.posted_at) continue;

                const metadataJson = entry.metadata ? JSON.stringify(entry.metadata) : '{}';
                // Use SELECT WHERE NOT EXISTS to prevent duplicates (no unique constraint on table)
                inserts.push(`
                    INSERT INTO channel_messages (channel_slug, agent_slug, content, message_type, metadata, posted_at)
                    SELECT
                        '${escapeSQL(channelSlug)}',
                        '${escapeSQL(entry.agent_slug)}',
                        '${escapeSQL(entry.content)}',
                        '${escapeSQL(entry.message_type || 'post')}',
                        '${escapeSQL(metadataJson)}',
                        '${escapeSQL(entry.posted_at)}'
                    WHERE NOT EXISTS (
                        SELECT 1 FROM channel_messages
                        WHERE channel_slug = '${escapeSQL(channelSlug)}'
                          AND agent_slug = '${escapeSQL(entry.agent_slug)}'
                          AND posted_at = '${escapeSQL(entry.posted_at)}'
                          AND content = '${escapeSQL(entry.content)}'
                    )
                `);
            } catch {
                continue;
            }
        }

        if (inserts.length > 0) {
            try {
                await executeWorkspaceQuery(provider, sandboxId, `BEGIN;\n${inserts.join(';\n')};\nCOMMIT;`);
                totalSynced += inserts.length;
            } catch (err) {
                log.warn('Posts sync failed for channel', { channel: channelSlug, error: (err as Error).message });
            }
        }
    }

    return { synced: totalSynced };
}

// -----------------------------------------------------------------------------
// Deliverables sync: scan output/deliverables/ → agent_outputs table
// -----------------------------------------------------------------------------

export async function syncDeliverablesFromFilesystem(
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<{ synced: number }> {
    const wp = SANDBOX_CONFIG.workspacePath;

    const { result: findResult } = await provider.executeCommand(
        sandboxId,
        `find ${wp}/projects -path '*/output/deliverables/*' -type f 2>/dev/null; echo ""`,
    );

    const filePaths = findResult.trim().split('\n').filter(p => p.trim());
    if (filePaths.length === 0) return { synced: 0 };

    const inserts: string[] = [];

    for (const filePath of filePaths) {
        // Extract agent info from path: projects/{domain}/channels/{channel}/output/deliverables/{filename}
        const pathMatch = filePath.match(/projects\/([^/]+)\/channels\/([^/]+)\/output\/deliverables\/(.+)$/);
        if (!pathMatch) continue;
        const channelSlug = pathMatch[2];
        const filename = pathMatch[3];

        // Get file info
        const { result: stat } = await provider.executeCommand(
            sandboxId,
            `stat --format='%s %Y' '${filePath}' 2>/dev/null || echo "0 0"`,
        );
        const [sizeStr, mtimeStr] = stat.trim().split(' ');
        const size = parseInt(sizeStr, 10) || 0;
        const mtime = parseInt(mtimeStr, 10) || 0;
        const createdAt = mtime > 0 ? new Date(mtime * 1000).toISOString() : new Date().toISOString();

        // Read first 500 chars as preview
        const { result: preview } = await provider.executeCommand(
            sandboxId,
            `head -c 500 '${filePath}' 2>/dev/null || echo ""`,
        );

        // Determine output type from extension
        const ext = filename.split('.').pop()?.toLowerCase() ?? '';
        const outputType = ['ts', 'js', 'py', 'sh'].includes(ext) ? 'code'
            : ['md', 'txt'].includes(ext) ? 'report'
            : ['json', 'csv', 'jsonl'].includes(ext) ? 'data'
            : 'file';

        // Get channel lead as the likely author
        const agentSql = `
            SELECT cm.agent_slug FROM channel_members cm
            WHERE cm.channel_slug = '${escapeSQL(channelSlug)}'
            ORDER BY cm.role ASC LIMIT 1
        `;
        const agentRows = await executeWorkspaceJsonQuery<{ agent_slug: string }>(provider, sandboxId, agentSql);
        const agentSlug = agentRows[0]?.agent_slug ?? 'unknown';

        const relPath = filePath.replace(wp + '/', '');

        inserts.push(`
            INSERT INTO agent_outputs (agent_slug, output_type, title, file_path, content_preview, metadata, created_at)
            SELECT
                '${escapeSQL(agentSlug)}',
                '${escapeSQL(outputType)}',
                '${escapeSQL(filename)}',
                '${escapeSQL(relPath)}',
                '${escapeSQL(preview.trim())}',
                '${escapeSQL(JSON.stringify({ size, channel: channelSlug }))}',
                '${escapeSQL(createdAt)}'
            WHERE NOT EXISTS (SELECT 1 FROM agent_outputs WHERE file_path = '${escapeSQL(relPath)}')
        `);
    }

    if (inserts.length === 0) return { synced: 0 };

    try {
        await executeWorkspaceQuery(provider, sandboxId, `BEGIN;\n${inserts.join(';\n')};\nCOMMIT;`);
    } catch (err) {
        log.warn('Deliverables sync failed', { error: (err as Error).message });
        return { synced: 0 };
    }

    return { synced: inserts.length };
}
