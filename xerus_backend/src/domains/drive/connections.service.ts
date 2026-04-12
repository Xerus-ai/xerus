// Connections Service
// CRUD for file_connections table in workspace.db (SQLite on sandbox).
// Links files in drive/ to agents, channels, or other files.
// Reference: docs/planning/workspace-redesign.md Section 4

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { escapeSQL, executeWorkspaceQuery, executeWorkspaceJsonQuery } from '../conversations/workspace-db.helpers';

// Auto-create table if missing (handles unmigrated sandboxes)
const ENSURE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS file_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK(target_type IN ('agent','channel','file')),
    target_ref TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    created_by TEXT,
    UNIQUE(file_path, target_type, target_ref)
);
CREATE INDEX IF NOT EXISTS idx_fc_target ON file_connections(target_type, target_ref);
CREATE INDEX IF NOT EXISTS idx_fc_file ON file_connections(file_path);
`;

const ensured = new Set<string>();

async function ensureTable(provider: DaytonaProvider, sandboxId: string): Promise<void> {
    if (ensured.has(sandboxId)) return;
    await executeWorkspaceQuery(provider, sandboxId, ENSURE_TABLE_SQL);
    ensured.add(sandboxId);
}

// -----------------------------------------------------------------------------
// Types (mirror workspace-schema.sql file_connections table)
// -----------------------------------------------------------------------------

export interface FileConnectionRow {
    id: number;
    file_path: string;
    target_type: 'agent' | 'channel' | 'file';
    target_ref: string;
    created_at: string;
    created_by: string | null;
}

// -----------------------------------------------------------------------------
// Queries
// -----------------------------------------------------------------------------

export async function getConnectionsForFile(
    provider: DaytonaProvider,
    sandboxId: string,
    filePath: string,
): Promise<FileConnectionRow[]> {
    const sql = `
        SELECT id, file_path, target_type, target_ref, created_at, created_by
        FROM file_connections
        WHERE file_path = '${escapeSQL(filePath)}'
        ORDER BY created_at DESC
    `;
    await ensureTable(provider, sandboxId);
    return executeWorkspaceJsonQuery<FileConnectionRow>(provider, sandboxId, sql);
}

export async function getConnectionsForTarget(
    provider: DaytonaProvider,
    sandboxId: string,
    targetType: string,
    targetRef: string,
): Promise<FileConnectionRow[]> {
    const sql = `
        SELECT id, file_path, target_type, target_ref, created_at, created_by
        FROM file_connections
        WHERE target_type = '${escapeSQL(targetType)}' AND target_ref = '${escapeSQL(targetRef)}'
        ORDER BY created_at DESC
    `;
    await ensureTable(provider, sandboxId);
    return executeWorkspaceJsonQuery<FileConnectionRow>(provider, sandboxId, sql);
}

export async function createConnection(
    provider: DaytonaProvider,
    sandboxId: string,
    filePath: string,
    targetType: string,
    targetRef: string,
    createdBy: string,
): Promise<FileConnectionRow> {
    const sql = `
        INSERT OR IGNORE INTO file_connections (file_path, target_type, target_ref, created_by)
        VALUES ('${escapeSQL(filePath)}', '${escapeSQL(targetType)}', '${escapeSQL(targetRef)}', '${escapeSQL(createdBy)}');
        SELECT id, file_path, target_type, target_ref, created_at, created_by
        FROM file_connections
        WHERE file_path = '${escapeSQL(filePath)}'
          AND target_type = '${escapeSQL(targetType)}'
          AND target_ref = '${escapeSQL(targetRef)}'
    `;
    await ensureTable(provider, sandboxId);
    const rows = await executeWorkspaceJsonQuery<FileConnectionRow>(provider, sandboxId, sql);
    if (!rows[0]) {
        throw new Error(`Failed to create connection for ${filePath}`);
    }
    return rows[0];
}

export async function deleteConnection(
    provider: DaytonaProvider,
    sandboxId: string,
    id: number,
): Promise<void> {
    const sql = `DELETE FROM file_connections WHERE id = ${id}`;
    await ensureTable(provider, sandboxId);
    await executeWorkspaceQuery(provider, sandboxId, sql);
}
