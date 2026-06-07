// Reverse Sync: Files -> DB
// When users create/edit/delete files via the Drive, sync changes back to DB
// so other pages (/ai-agents, /inbox) reflect the change.
//
// With workspace.db as source of truth, agent data no longer needs reverse-sync.
// Only non-agent entities still sync.

import { logger } from '../../utils/logger';

const log = logger('ReverseSync');

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
// workspace.db is source of truth. No NeonDB agent_registry writes needed.
// Agent registration/deletion in workspace.db is handled by scaffold-sync-hook.
// -----------------------------------------------------------------------------

async function syncAgentConfig(
    event: SyncEvent,
    match: RegExpMatchArray,
    _content: string | null,
    _userId: string,
): Promise<void> {
    const slug = match[1];
    // workspace.db is source of truth for agent data. No NeonDB writes needed.
    log.debug('Agent config sync', { event, slug, action: 'workspace.db is source of truth, no Neon write' });
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
    log.debug('Agent soul sync', { event, slug, action: 'file-only, no DB column' });
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
    log.debug('Domain sync', { event, slug: domainSlug, action: 'workspace DB is source of truth, no Neon write' });
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
    log.debug('Channel sync', { event, domain: domainSlug, channel: channelSlug, action: 'workspace DB is source of truth, no Neon write' });
}
