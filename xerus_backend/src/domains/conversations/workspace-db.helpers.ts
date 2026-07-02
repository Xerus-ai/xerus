// Workspace DB Helpers
// Shared utilities for querying workspace.db (SQLite) on sandbox via provider.executeCommand()
// Extracted from workspace-db.service.ts for reuse across domains.

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { SANDBOX_CONFIG } from '../sandbox-infra/sandbox/sandbox.config';
import { shellEscapePath } from '../../utils/shell-safety';
import { logger } from '../../utils/logger';

const log = logger('WorkspaceDB');

export const WORKSPACE_DB_PATH = `${SANDBOX_CONFIG.workspacePath}/data/workspace.db`;

// Business data DB — research reports, prospects, topics, etc.
// Agents write here via sqlite3; the company domain reads it for the UI.
export const COMPANY_DB_PATH = `${SANDBOX_CONFIG.workspacePath}/data/company.db`;

const HEREDOC_DELIM = 'XERUS_SQL_EOF_7f3a';

export function escapeSQL(value: string): string {
    if (value.includes(HEREDOC_DELIM)) {
        throw new Error('SQL value contains reserved delimiter');
    }
    // Strip null bytes (prevents SQLite string literal termination), then escape single quotes.
    // Newlines are safe inside single-quoted heredoc + SQLite string literals.
    return value.replace(/\0/g, '').replace(/'/g, "''");
}

/**
 * Escape SQL LIKE pattern wildcards (% and _) in addition to standard escapeSQL.
 * Use with `ESCAPE '\\'` clause in LIKE queries to prevent user input from
 * wildcard-matching unintended rows.
 */
export function escapeLikePattern(value: string): string {
    return escapeSQL(value).replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function buildSqliteCommand(sql: string): string {
    return buildSqliteCommandForDb(WORKSPACE_DB_PATH, sql);
}

export function buildSqliteCommandForDb(dbPath: string, sql: string): string {
    // Pipe SQL via stdin using a single-quoted heredoc to prevent shell injection.
    // Single-quoted heredoc disables all shell expansion (no $(), backticks, variable interpolation).
    // Delimiter is unique enough that agent content won't contain it (escapeSQL guards this).
    // Prepend PRAGMA foreign_keys=ON so FK constraints are enforced on every connection.
    const escapedDbPath = shellEscapePath(dbPath);
    const fullSql = `PRAGMA foreign_keys=ON;\n${sql}`;
    return `sqlite3 -json ${escapedDbPath} <<'${HEREDOC_DELIM}'\n${fullSql}\n${HEREDOC_DELIM}`;
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
    return executeSandboxDbQuery(provider, sandboxId, WORKSPACE_DB_PATH, sql);
}

export async function executeSandboxDbQuery(
    provider: DaytonaProvider,
    sandboxId: string,
    dbPath: string,
    sql: string,
): Promise<string> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const result = await provider.executeCommand(sandboxId, buildSqliteCommandForDb(dbPath, sql));
        const output = result.result || '';
        if (output.includes('database is locked')) {
            log.warn('SQLite locked, retrying', { attempt, sandboxId, dbPath });
            await sleep(100 * Math.pow(2, attempt));
            continue;
        }
        return output;
    }
    throw new Error(`SQLite query failed after retries (database is locked): ${dbPath}`);
}

export async function executeWorkspaceJsonQuery<T>(
    provider: DaytonaProvider,
    sandboxId: string,
    sql: string,
): Promise<T[]> {
    return executeSandboxDbJsonQuery<T>(provider, sandboxId, WORKSPACE_DB_PATH, sql);
}

export async function executeSandboxDbJsonQuery<T>(
    provider: DaytonaProvider,
    sandboxId: string,
    dbPath: string,
    sql: string,
): Promise<T[]> {
    const output = await executeSandboxDbQuery(provider, sandboxId, dbPath, sql);
    const parsed = parseJsonResult<T>(output);
    if (parsed !== null) {
        return parsed;
    }

    const trimmed = output.trim();
    log.error('Failed to parse JSON', { preview: trimmed.slice(0, 200), dbPath });
    throw new Error(`SQLite returned invalid JSON: ${trimmed.slice(0, 300)}`);
}
