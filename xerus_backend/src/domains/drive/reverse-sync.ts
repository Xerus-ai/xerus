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
    _userId: string,
): Promise<void> {
    const slug = match[1];
    // Heartbeat tables deprecated in migration 081. HEARTBEAT.md is now a static template.
    console.log(`${LOG_PREFIX} agent heartbeat ${event}: slug=${slug} (heartbeat tables deprecated, no DB sync)`);
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
    _userId: string,
): Promise<void> {
    const domainSlug = match[1];
    // Domain data lives in workspace DB (source of truth). No Neon write needed.
    console.log(`${LOG_PREFIX} domain ${event}: slug=${domainSlug} (workspace DB is source of truth, no Neon write)`);
}

// -----------------------------------------------------------------------------
// Handler: projects/{domain}/channels/{slug}/ (directory create/delete)
// -----------------------------------------------------------------------------

async function syncChannel(
    event: SyncEvent,
    match: RegExpMatchArray,
    _content: string | null,
    _userId: string,
): Promise<void> {
    const domainSlug = match[1];
    const channelSlug = match[2];
    // Channel data lives in workspace DB (source of truth). No Neon write needed.
    console.log(`${LOG_PREFIX} channel ${event}: ${domainSlug}/${channelSlug} (workspace DB is source of truth, no Neon write)`);
}
