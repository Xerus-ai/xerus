// Workspace DB Helpers
// Shared utilities for querying workspace.db (SQLite) on sandbox via provider.executeCommand()
// Extracted from workspace-db.service.ts for reuse across domains.

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import { shellEscapePath } from '../../utils/shell-safety';
import { logger } from '../../utils/logger';

const log = logger('WorkspaceDB');

export const WORKSPACE_DB_PATH = `${SANDBOX_CONFIG.workspacePath}/data/workspace.db`;

// Shell-safe version of the DB path (escapes single quotes for use in shell commands)
const ESCAPED_DB_PATH = shellEscapePath(WORKSPACE_DB_PATH);

export function escapeSQL(value: string): string {
    // Reject newlines to prevent heredoc termination injection
    if (/[\n\r]/.test(value)) {
        throw new Error('SQL value must not contain newlines');
    }
    // Strip null bytes (prevents SQLite string literal termination), then escape single quotes
    return value.replace(/\0/g, '').replace(/'/g, "''");
}

export function buildSqliteCommand(sql: string): string {
    // Pipe SQL via stdin using a single-quoted heredoc to prevent shell injection.
    // <<'EOSQL' disables all shell expansion (no $(), backticks, variable interpolation).
    // ESCAPED_DB_PATH is shell-escaped to prevent injection if workspace root has single quotes.
    return `sqlite3 -json ${ESCAPED_DB_PATH} <<'EOSQL'\n${sql}\nEOSQL`;
}

export function parseJsonResult<T>(output: string): T[] | null {
    const trimmed = output.trim();
    if (!trimmed || trimmed === '[]') return [];
    try {
        return JSON.parse(trimmed) as T[];
    } catch {
        return null;
    }
}

const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function executeWorkspaceQuery(
    provider: DaytonaProvider,
    sandboxId: string,
    sql: string,
): Promise<string> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const result = await provider.executeCommand(sandboxId, buildSqliteCommand(sql));
        const output = result.result || '';
        if (output.includes('database is locked')) {
            log.warn('SQLite locked, retrying', { attempt, sandboxId });
            await sleep(100 * Math.pow(2, attempt));
            continue;
        }
        return output;
    }
    throw new Error('Workspace DB query failed after retries: database is locked');
}

export async function executeWorkspaceJsonQuery<T>(
    provider: DaytonaProvider,
    sandboxId: string,
    sql: string,
): Promise<T[]> {
    const output = await executeWorkspaceQuery(provider, sandboxId, sql);
    const parsed = parseJsonResult<T>(output);
    if (parsed !== null) {
        return parsed;
    }

    const trimmed = output.trim();
    log.error('Failed to parse JSON', { preview: trimmed.slice(0, 200) });
    throw new Error(`Workspace DB returned invalid JSON: ${trimmed.slice(0, 300)}`);
}
