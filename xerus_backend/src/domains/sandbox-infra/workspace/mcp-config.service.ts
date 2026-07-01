// MCP Config Service
// Syncs Pipedream MCP servers into workspace .mcp.json based on user's connected accounts.
// The Claude Code CLI reads .mcp.json at startup to discover available MCP servers.
// Called at sandbox setup (create + resume) and after tool add/remove operations.

import type { SandboxFileSystem } from './workspace.manager';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface McpServerEntry {
    type?: string;
    url?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    headers?: Record<string, string>;
}

interface McpConfigDocument {
    mcpServers: Record<string, McpServerEntry>;
}

export interface McpConfigDatabase {
    query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface McpSyncResult {
    added: string[];
    removed: string[];
    normalized: string[];
    total: number;
}

// -----------------------------------------------------------------------------
// Static platform servers
// -----------------------------------------------------------------------------

// Canonical static (stdio) MCP servers owned by the platform. The template's
// .mcp.json seeds these at clone time; sync re-enforces them so sandboxes
// created from older templates converge without manual intervention.
// Tool names derive from the server key (mcp__<server>__<tool>), so a stale
// key breaks every prompt and allowlist that references mcp__platform__*.
const STATIC_MCP_SERVERS: Record<string, McpServerEntry> = {
    platform: { command: 'node', args: ['.xerus/runner/mcp-server.js'], env: {} },
    ipc: { command: 'python3', args: ['.xerus/ipc/claude_ipc_server.py'], env: {} },
};

// Server keys used for static servers in older template versions.
// Renamed entries are removed and replaced by their canonical key.
const LEGACY_STATIC_SERVER_NAMES: ReadonlyArray<string> = ['xerus-platform'];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getPipedreamMcpBaseUrl(): string {
    return process.env.PIPEDREAM_MCP_URL || 'https://mcp.pipedream.com';
}

/**
 * Detect whether an MCP server entry was created by this service.
 * Pipedream entries have a URL starting with the configured PIPEDREAM_MCP_URL.
 * Static entries (platform, ipc) use command/args (stdio transport).
 */
function isPipedreamEntry(entry: McpServerEntry): boolean {
    if (!entry.url) return false;
    return entry.url.startsWith(getPipedreamMcpBaseUrl());
}

function buildPipedreamEntry(userId: string, appSlug: string): McpServerEntry {
    const baseUrl = getPipedreamMcpBaseUrl();
    return {
        type: 'sse',
        url: `${baseUrl}/${userId}/${appSlug}`,
    };
}

function readMcpConfig(raw: string): McpConfigDocument {
    // Empty file ≡ missing file: nothing to preserve, start fresh so static
    // server enforcement can seed it. Malformed non-empty JSON still throws
    // (fail-fast — never silently discard a config we cannot parse).
    if (raw.trim() === '') {
        return { mcpServers: {} };
    }
    const parsed = JSON.parse(raw) as Partial<McpConfigDocument>;
    return {
        mcpServers: parsed.mcpServers && typeof parsed.mcpServers === 'object'
            ? parsed.mcpServers
            : {},
    };
}

/**
 * Enforce canonical static server entries in-place.
 * - Drops legacy-named entries (e.g. 'xerus-platform' from older templates).
 * - Adds missing canonical entries and repairs entries whose command/args drifted.
 * Returns the list of server keys that changed.
 */
function normalizeStaticServers(doc: McpConfigDocument): string[] {
    const changed: string[] = [];

    for (const legacyName of LEGACY_STATIC_SERVER_NAMES) {
        if (doc.mcpServers[legacyName]) {
            delete doc.mcpServers[legacyName];
            changed.push(legacyName);
        }
    }

    for (const [name, canonical] of Object.entries(STATIC_MCP_SERVERS)) {
        const existing = doc.mcpServers[name];
        const matches = existing
            && existing.command === canonical.command
            && JSON.stringify(existing.args) === JSON.stringify(canonical.args);
        if (!matches) {
            doc.mcpServers[name] = { ...canonical };
            changed.push(name);
        }
    }

    return changed;
}

// -----------------------------------------------------------------------------
// Core Sync Logic
// -----------------------------------------------------------------------------

/**
 * Sync MCP servers into .mcp.json.
 * - Enforces canonical static platform entries (platform, ipc), including
 *   renaming legacy keys from older workspace templates.
 * - Adds Pipedream entries for connected accounts not yet present.
 * - Removes Pipedream entries for disconnected accounts.
 * - Preserves other user-defined entries untouched.
 *
 * Idempotent: safe to call repeatedly. Only writes if changes detected.
 */
export async function syncPipedreamMcpConfig(
    sandboxFs: SandboxFileSystem,
    mcpJsonPath: string,
    userId: string,
    db: McpConfigDatabase,
): Promise<McpSyncResult> {
    // 1. Query user's connected Pipedream accounts
    const { rows } = await db.query<{ app_slug: string }>(
        'SELECT DISTINCT app_slug FROM connected_accounts WHERE user_id = $1',
        [userId],
    );
    const connectedApps = new Set(rows.map(r => r.app_slug));

    // 2. Read existing .mcp.json (file-not-found → start fresh, parse error → fail-fast)
    let raw: string | null = null;
    try {
        raw = await sandboxFs.readFile(mcpJsonPath);
    } catch {
        // File missing — start fresh (expected on first run before template clone)
    }
    const doc: McpConfigDocument = raw !== null ? readMcpConfig(raw) : { mcpServers: {} };

    const added: string[] = [];
    const removed: string[] = [];

    // 3. Enforce canonical static platform servers (self-heals stale/legacy entries)
    const normalized = normalizeStaticServers(doc);

    // 4. Add MCP servers for connected apps not yet in config
    for (const appSlug of connectedApps) {
        if (!doc.mcpServers[appSlug]) {
            doc.mcpServers[appSlug] = buildPipedreamEntry(userId, appSlug);
            added.push(appSlug);
        }
    }

    // 5. Remove stale Pipedream entries (disconnected accounts)
    for (const [key, entry] of Object.entries(doc.mcpServers)) {
        if (isPipedreamEntry(entry) && !connectedApps.has(key)) {
            delete doc.mcpServers[key];
            removed.push(key);
        }
    }

    // 6. Write back only if changed
    if (added.length > 0 || removed.length > 0 || normalized.length > 0) {
        await sandboxFs.writeFile(mcpJsonPath, JSON.stringify(doc, null, 2) + '\n');
    }

    const pipedreamCount = Object.values(doc.mcpServers).filter(isPipedreamEntry).length;
    return { added, removed, normalized, total: pipedreamCount };
}

// -----------------------------------------------------------------------------
// Convenience wrapper for AgentFilesystemRepository callers
// -----------------------------------------------------------------------------

/**
 * Sync Pipedream MCP config using DriveService-backed file access.
 * Used by agent-tools.service.ts after add/remove tool operations.
 *
 * ASSUMPTION: DriveService resolves relative paths from the same workspace root
 * as SANDBOX_CONFIG.workspacePath used by sandbox-setup.ts. Both callers target
 * the same physical `.mcp.json` file through different transport layers.
 */
export async function syncPipedreamMcpConfigViaRepo(
    readFile: (userId: string, path: string) => Promise<string | null>,
    writeFile: (userId: string, path: string, content: string) => Promise<void>,
    userId: string,
    db: McpConfigDatabase,
): Promise<McpSyncResult> {
    // Adapt repo interface to SandboxFileSystem-like access
    const adapter: SandboxFileSystem = {
        readFile: async (path: string) => {
            const content = await readFile(userId, path);
            if (content === null) throw new Error(`File not found: ${path}`);
            return content;
        },
        writeFile: async (path: string, content: string) => {
            await writeFile(userId, path, content);
        },
        // Unused by sync logic but required by interface
        mkdir: async () => {},
        exists: async () => false,
        rm: async () => {},
        list: async () => [],
    };

    return syncPipedreamMcpConfig(adapter, '.mcp.json', userId, db);
}
