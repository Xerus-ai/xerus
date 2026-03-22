// Reverse Sync: Files -> DB
// When users create/edit/delete files via the Drive, sync changes back to DB
// so other pages (/ai-agents, /inbox) reflect the change.
//
// With filesystem as source of truth, agent data no longer needs reverse-sync.
// Only agent_registry (slug/id mapping) and non-agent entities still sync.

import { query } from '../../database/connection';

const LOG_PREFIX = '[reverse-sync]';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type SyncEvent = 'create' | 'update' | 'delete';

interface PathMatcher {
    pattern: RegExp;
    handler: (
        event: SyncEvent,
        match: RegExpMatchArray,
        content: string | null,
        userId: string,
    ) => Promise<void>;
}

// -----------------------------------------------------------------------------
// Path Matchers
// -----------------------------------------------------------------------------

const matchers: PathMatcher[] = [
    {
        pattern: /^agents\/([^/]+)\/config\.json$/,
        handler: syncAgentConfig,
    },
    {
        pattern: /^agents\/([^/]+)\/SOUL\.md$/,
        handler: syncAgentSoul,
    },
    {
        pattern: /^agents\/([^/]+)\/HEARTBEAT\.md$/,
        handler: syncAgentHeartbeat,
    },
    {
        pattern: /^agents\/([^/]+)\/knowledge\/(.+)$/,
        handler: syncAgentKB,
    },
    {
        pattern: /^projects\/([^/]+)\/$/,
        handler: syncDomain,
    },
    {
        pattern: /^projects\/([^/]+)\/channels\/([^/]+)\/$/,
        handler: syncChannel,
    },
];

// -----------------------------------------------------------------------------
// Public Entry Point
// -----------------------------------------------------------------------------

export async function reverseSyncToDB(
    event: SyncEvent,
    path: string,
    content: string | null,
    userId: string,
): Promise<void> {
    const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');

    for (const matcher of matchers) {
        const match = normalized.match(matcher.pattern);
        if (match) {
            await matcher.handler(event, match, content, userId);
            return;
        }
    }

    // No matcher found - this file doesn't map to a DB entity, which is fine
}

// -----------------------------------------------------------------------------
// Handler: agents/{slug}/config.json
// Filesystem is source of truth. Only manage agent_registry on create/delete.
// -----------------------------------------------------------------------------

async function syncAgentConfig(
    event: SyncEvent,
    match: RegExpMatchArray,
    _content: string | null,
    userId: string,
): Promise<void> {
    const slug = match[1];

    if (event === 'create') {
        // Ensure agent is registered in agent_registry
        await query(
            `INSERT INTO agent_registry (slug, user_id, agent_type)
             VALUES ($1, $2, 'private')
             ON CONFLICT (slug, user_id) DO NOTHING`,
            [slug, userId],
        );
        console.log(`${LOG_PREFIX} agent config create: slug=${slug} (registered in agent_registry)`);
    } else if (event === 'update') {
        // Config.json IS the source of truth — no DB sync needed
        console.log(`${LOG_PREFIX} agent config update: slug=${slug} (filesystem is source of truth)`);
    } else if (event === 'delete') {
        await query(
            `DELETE FROM agent_registry WHERE slug = $1 AND user_id = $2`,
            [slug, userId],
        );
        console.log(`${LOG_PREFIX} agent config delete: slug=${slug}`);
    }
}

// -----------------------------------------------------------------------------
// Handler: agents/{slug}/SOUL.md
// -----------------------------------------------------------------------------

async function syncAgentSoul(
    event: SyncEvent,
    match: RegExpMatchArray,
    _content: string | null,
    _userId: string,
): Promise<void> {
    const slug = match[1];
    // SOUL.md lives in workspace files only. No DB column.
    console.log(`${LOG_PREFIX} agent soul ${event}: slug=${slug} (file-only, no DB column)`);
}

// -----------------------------------------------------------------------------
// Handler: agents/{slug}/HEARTBEAT.md
// -----------------------------------------------------------------------------

async function syncAgentHeartbeat(
    event: SyncEvent,
    match: RegExpMatchArray,
    _content: string | null,
    userId: string,
): Promise<void> {
    const slug = match[1];

    // HEARTBEAT.md is a generated display file (human-readable).
    // DB heartbeat_configs is the canonical source, set via PUT /api/v1/agents/:id/heartbeat.
    // DB → generateHeartbeatMd() → HEARTBEAT.md (one-way). No reverse parse needed.
    if (event === 'delete') {
        const agentResult = await query<{ id: number }>(
            `SELECT id FROM agent_registry WHERE slug = $1 AND user_id = $2 LIMIT 1`,
            [slug, userId],
        );
        if (agentResult.rows.length > 0) {
            await query(
                `DELETE FROM heartbeat_configs WHERE agent_id = $1`,
                [agentResult.rows[0].id],
            );
            console.log(`${LOG_PREFIX} agent heartbeat delete: slug=${slug}`);
        }
    } else {
        console.log(`${LOG_PREFIX} agent heartbeat ${event}: slug=${slug} (DB is canonical, use heartbeat API)`);
    }
}

// -----------------------------------------------------------------------------
// Handler: agents/{slug}/knowledge/{file}
// KB assignments now live in config.json. No DB sync needed.
// -----------------------------------------------------------------------------

async function syncAgentKB(
    event: SyncEvent,
    match: RegExpMatchArray,
    _content: string | null,
    _userId: string,
): Promise<void> {
    const slug = match[1];
    const fileName = match[2];
    // KB data now lives in config.json knowledge_bases array.
    // No agent_knowledge_bases table to sync to.
    console.log(`${LOG_PREFIX} agent kb ${event}: slug=${slug} file=${fileName} (filesystem is source of truth)`);
}

// -----------------------------------------------------------------------------
// Handler: projects/{domain}/ (directory create/delete)
// -----------------------------------------------------------------------------

async function syncDomain(
    event: SyncEvent,
    match: RegExpMatchArray,
    _content: string | null,
    userId: string,
): Promise<void> {
    const domainSlug = match[1];

    if (event === 'create') {
        const wsResult = await query<{ id: string }>(
            `SELECT id FROM workspaces WHERE user_id = $1 LIMIT 1`,
            [userId],
        );
        if (wsResult.rows.length === 0) {
            console.warn(`${LOG_PREFIX} domain create: no workspace found for user=${userId}`);
            return;
        }

        await query(
            `INSERT INTO domains (slug, name, user_id, workspace_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (slug, workspace_id) DO NOTHING`,
            [domainSlug, domainSlug, userId, wsResult.rows[0].id],
        );
        console.log(`${LOG_PREFIX} domain create: slug=${domainSlug}`);
    } else if (event === 'delete') {
        await query(
            `DELETE FROM domains WHERE slug = $1 AND user_id = $2`,
            [domainSlug, userId],
        );
        console.log(`${LOG_PREFIX} domain delete: slug=${domainSlug}`);
    }
}

// -----------------------------------------------------------------------------
// Handler: projects/{domain}/channels/{slug}/ (directory create/delete)
// -----------------------------------------------------------------------------

async function syncChannel(
    event: SyncEvent,
    match: RegExpMatchArray,
    _content: string | null,
    userId: string,
): Promise<void> {
    const domainSlug = match[1];
    const channelSlug = match[2];

    if (event === 'create') {
        const domainResult = await query<{ id: string }>(
            `SELECT id FROM domains WHERE slug = $1 AND user_id = $2 LIMIT 1`,
            [domainSlug, userId],
        );
        if (domainResult.rows.length === 0) {
            console.warn(`${LOG_PREFIX} channel create: domain not found slug=${domainSlug}`);
            return;
        }

        await query(
            `INSERT INTO channels (slug, name, domain_id, user_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (slug, domain_id) DO NOTHING`,
            [channelSlug, channelSlug, domainResult.rows[0].id, userId],
        );
        console.log(`${LOG_PREFIX} channel create: ${domainSlug}/${channelSlug}`);
    } else if (event === 'delete') {
        const domainResult = await query<{ id: string }>(
            `SELECT id FROM domains WHERE slug = $1 AND user_id = $2 LIMIT 1`,
            [domainSlug, userId],
        );
        if (domainResult.rows.length === 0) return;

        await query(
            `DELETE FROM channels WHERE slug = $1 AND domain_id = $2`,
            [channelSlug, domainResult.rows[0].id],
        );
        console.log(`${LOG_PREFIX} channel delete: ${domainSlug}/${channelSlug}`);
    }
}
