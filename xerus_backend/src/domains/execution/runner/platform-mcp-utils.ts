// Platform MCP Shared Utilities
// Filesystem helpers used by platform-mcp-handlers-extended and
// platform-mcp-handlers-operations

import fs from 'fs/promises';

export type MetadataSyncFn = (entity: string, action: string, data: unknown) => void;

export function getWorkspacePath(): string {
    // Read env var at call-time to support per-test overrides in platform-mcp-handlers tests
    const root = process.env.XERUS_WORKSPACE_ROOT;
    if (!root) {
        throw new Error('XERUS_WORKSPACE_ROOT environment variable is required.');
    }
    return root;
}

export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw err;
    }
}

export async function ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
}

export async function readJsonFile(filePath: string): Promise<unknown> {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n');
}
