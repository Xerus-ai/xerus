// MCP Config Service Tests
// Tests for syncPipedreamMcpConfig — static platform server enforcement
// (canonical entries, legacy-name migration) and Pipedream account sync.

import { syncPipedreamMcpConfig } from '../mcp-config.service';
import type { SandboxFileSystem } from '../workspace.manager';

const MCP_JSON_PATH = '/workspace/.mcp.json';

const CANONICAL_PLATFORM = { command: 'node', args: ['.xerus/runner/mcp-server.js'], env: {} };
const CANONICAL_IPC = { command: 'python3', args: ['.xerus/ipc/claude_ipc_server.py'], env: {} };

// In-memory filesystem for testing (no mocks - real data structure)
function createInMemoryFs(): SandboxFileSystem & { files: Map<string, string>; writeCount: number } {
    const files = new Map<string, string>();

    const fs = {
        files,
        writeCount: 0,
        async mkdir(): Promise<void> {},
        async writeFile(path: string, content: string): Promise<void> {
            fs.writeCount += 1;
            files.set(path, content);
        },
        async readFile(path: string): Promise<string> {
            const content = files.get(path);
            if (content === undefined) {
                throw new Error(`File not found: ${path}`);
            }
            return content;
        },
        async exists(path: string): Promise<boolean> {
            return files.has(path);
        },
        async rm(path: string): Promise<void> {
            files.delete(path);
        },
        async list(): Promise<string[]> {
            return [];
        },
    };
    return fs;
}

// In-memory database returning the given connected app slugs (no mocks)
function createDb(appSlugs: string[]) {
    return {
        async query<T>(): Promise<{ rows: T[] }> {
            return { rows: appSlugs.map(app_slug => ({ app_slug })) as T[] };
        },
    };
}

function readServers(fs: { files: Map<string, string> }): Record<string, { command?: string; args?: string[]; url?: string }> {
    const raw = fs.files.get(MCP_JSON_PATH);
    if (raw === undefined) throw new Error('.mcp.json was not written');
    return (JSON.parse(raw) as { mcpServers: Record<string, { command?: string; args?: string[]; url?: string }> }).mcpServers;
}

describe('syncPipedreamMcpConfig — static server enforcement', () => {
    it('renames legacy xerus-platform entry to canonical platform', async () => {
        const fs = createInMemoryFs();
        fs.files.set(MCP_JSON_PATH, JSON.stringify({
            mcpServers: {
                'xerus-platform': CANONICAL_PLATFORM,
                ipc: CANONICAL_IPC,
            },
        }));

        const result = await syncPipedreamMcpConfig(fs, MCP_JSON_PATH, 'user-1', createDb([]));

        expect(result.normalized).toContain('xerus-platform');
        expect(result.normalized).toContain('platform');
        const servers = readServers(fs);
        expect(servers['xerus-platform']).toBeUndefined();
        expect(servers['platform']).toEqual(CANONICAL_PLATFORM);
        expect(servers['ipc']).toEqual(CANONICAL_IPC);
    });

    it('adds missing static entries when .mcp.json lacks them', async () => {
        const fs = createInMemoryFs();
        fs.files.set(MCP_JSON_PATH, JSON.stringify({ mcpServers: {} }));

        const result = await syncPipedreamMcpConfig(fs, MCP_JSON_PATH, 'user-1', createDb([]));

        expect(result.normalized).toEqual(expect.arrayContaining(['platform', 'ipc']));
        const servers = readServers(fs);
        expect(servers['platform']).toEqual(CANONICAL_PLATFORM);
        expect(servers['ipc']).toEqual(CANONICAL_IPC);
    });

    it('creates .mcp.json with static entries when the file is missing', async () => {
        const fs = createInMemoryFs();

        const result = await syncPipedreamMcpConfig(fs, MCP_JSON_PATH, 'user-1', createDb([]));

        expect(result.normalized).toEqual(expect.arrayContaining(['platform', 'ipc']));
        const servers = readServers(fs);
        expect(servers['platform']).toEqual(CANONICAL_PLATFORM);
        expect(servers['ipc']).toEqual(CANONICAL_IPC);
    });

    it('repairs a platform entry whose command/args drifted', async () => {
        const fs = createInMemoryFs();
        fs.files.set(MCP_JSON_PATH, JSON.stringify({
            mcpServers: {
                platform: { command: 'node', args: ['some/other/path.js'], env: {} },
                ipc: CANONICAL_IPC,
            },
        }));

        const result = await syncPipedreamMcpConfig(fs, MCP_JSON_PATH, 'user-1', createDb([]));

        expect(result.normalized).toEqual(['platform']);
        expect(readServers(fs)['platform']).toEqual(CANONICAL_PLATFORM);
    });

    it('does not write when config is already canonical (idempotent)', async () => {
        const fs = createInMemoryFs();
        fs.files.set(MCP_JSON_PATH, JSON.stringify({
            mcpServers: { platform: CANONICAL_PLATFORM, ipc: CANONICAL_IPC },
        }));

        const result = await syncPipedreamMcpConfig(fs, MCP_JSON_PATH, 'user-1', createDb([]));

        expect(result.normalized).toEqual([]);
        expect(result.added).toEqual([]);
        expect(result.removed).toEqual([]);
        expect(fs.writeCount).toBe(0);
    });

    it('preserves user-defined non-platform entries', async () => {
        const custom = { command: 'npx', args: ['-y', 'some-custom-server'] };
        const fs = createInMemoryFs();
        fs.files.set(MCP_JSON_PATH, JSON.stringify({
            mcpServers: { 'my-custom': custom, 'xerus-platform': CANONICAL_PLATFORM },
        }));

        await syncPipedreamMcpConfig(fs, MCP_JSON_PATH, 'user-1', createDb([]));

        const servers = readServers(fs);
        expect(servers['my-custom']).toEqual(custom);
        expect(servers['platform']).toEqual(CANONICAL_PLATFORM);
    });
});

describe('syncPipedreamMcpConfig — Pipedream account sync', () => {
    // Same base URL resolution as the service (env-dependent)
    const PIPEDREAM_BASE = process.env.PIPEDREAM_MCP_URL || 'https://mcp.pipedream.com';

    it('adds entries for connected apps and removes stale Pipedream entries', async () => {
        const fs = createInMemoryFs();
        fs.files.set(MCP_JSON_PATH, JSON.stringify({
            mcpServers: {
                platform: CANONICAL_PLATFORM,
                ipc: CANONICAL_IPC,
                slack: { type: 'sse', url: `${PIPEDREAM_BASE}/user-1/slack` },
            },
        }));

        const result = await syncPipedreamMcpConfig(fs, MCP_JSON_PATH, 'user-1', createDb(['gmail']));

        expect(result.added).toEqual(['gmail']);
        expect(result.removed).toEqual(['slack']);
        const servers = readServers(fs);
        expect(servers['gmail']).toEqual({ type: 'sse', url: `${PIPEDREAM_BASE}/user-1/gmail` });
        expect(servers['slack']).toBeUndefined();
        expect(servers['platform']).toEqual(CANONICAL_PLATFORM);
        expect(servers['ipc']).toEqual(CANONICAL_IPC);
    });
});
