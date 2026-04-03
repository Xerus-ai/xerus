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
    total: number;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getPipedreamMcpBaseUrl(): string {
    return process.env.PIPEDREAM_MCP_URL || 'https://mcp.pipedream.com';
}

/**
 * Detect whether an MCP server entry was created by this service.
 * Pipedream entries have a URL starting with the configured PIPEDREAM_MCP_URL.
 * Static entries (xerus-platform, ipc) use command/args (stdio transport).
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
    const parsed = JSON.parse(raw) as Partial<McpConfigDocument>;
    return {
        mcpServers: parsed.mcpServers && typeof parsed.mcpServers === 'object'
            ? parsed.mcpServers
            : {},
    };
}

// -----------------------------------------------------------------------------
// Core Sync Logic
// -----------------------------------------------------------------------------

/**
 * Sync Pipedream MCP servers into .mcp.json.
 * - Adds entries for connected accounts not yet present.
 * - Removes entries for disconnected accounts.
 * - Preserves static (non-Pipedream) entries untouched.
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

    // 3. Add MCP servers for connected apps not yet in config
    for (const appSlug of connectedApps) {
        if (!doc.mcpServers[appSlug]) {
            doc.mcpServers[appSlug] = buildPipedreamEntry(userId, appSlug);
            added.push(appSlug);
        }
    }

    // 4. Remove stale Pipedream entries (disconnected accounts)
    for (const [key, entry] of Object.entries(doc.mcpServers)) {
        if (isPipedreamEntry(entry) && !connectedApps.has(key)) {
            delete doc.mcpServers[key];
            removed.push(key);
        }
    }

    // 5. Write back only if changed
    if (added.length > 0 || removed.length > 0) {
        await sandboxFs.writeFile(mcpJsonPath, JSON.stringify(doc, null, 2) + '\n');
    }

    const pipedreamCount = Object.values(doc.mcpServers).filter(isPipedreamEntry).length;
    return { added, removed, total: pipedreamCount };
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
