// Tags Service
// CRUD for file_tags table in workspace.db (SQLite on sandbox).
// User-defined labels on files in drive/.
// Reference: docs/planning/workspace-redesign.md Section 4

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { escapeSQL, executeWorkspaceQuery, executeWorkspaceJsonQuery } from '../conversations/workspace-db.helpers';

const ENSURE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS file_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    tag TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    UNIQUE(file_path, tag)
);
CREATE INDEX IF NOT EXISTS idx_ft_tag ON file_tags(tag);
CREATE INDEX IF NOT EXISTS idx_ft_file ON file_tags(file_path);
`;

const ensured = new Set<string>();

async function ensureTable(provider: DaytonaProvider, sandboxId: string): Promise<void> {
    if (ensured.has(sandboxId)) return;
    await executeWorkspaceQuery(provider, sandboxId, ENSURE_TABLE_SQL);
    ensured.add(sandboxId);
}

// -----------------------------------------------------------------------------
// Types (mirror workspace-schema.sql file_tags table)
// -----------------------------------------------------------------------------

export interface FileTagRow {
    id: number;
    file_path: string;
    tag: string;
    created_at: string;
}

export interface TagCount {
    tag: string;
    count: number;
}

// -----------------------------------------------------------------------------
// Queries
// -----------------------------------------------------------------------------

export async function getTagsForFile(
    provider: DaytonaProvider,
    sandboxId: string,
    filePath: string,
): Promise<FileTagRow[]> {
    const sql = `
        SELECT id, file_path, tag, created_at
        FROM file_tags
        WHERE file_path = '${escapeSQL(filePath)}'
        ORDER BY tag
    `;
    await ensureTable(provider, sandboxId);
    return executeWorkspaceJsonQuery<FileTagRow>(provider, sandboxId, sql);
}

export async function getFilesByTag(
    provider: DaytonaProvider,
    sandboxId: string,
    tag: string,
): Promise<FileTagRow[]> {
    const sql = `
        SELECT id, file_path, tag, created_at
        FROM file_tags
        WHERE tag = '${escapeSQL(tag)}'
        ORDER BY file_path
    `;
    await ensureTable(provider, sandboxId);
    return executeWorkspaceJsonQuery<FileTagRow>(provider, sandboxId, sql);
}

export async function createTag(
    provider: DaytonaProvider,
    sandboxId: string,
    filePath: string,
    tag: string,
): Promise<FileTagRow> {
    const sql = `
        INSERT OR IGNORE INTO file_tags (file_path, tag)
        VALUES ('${escapeSQL(filePath)}', '${escapeSQL(tag)}');
        SELECT id, file_path, tag, created_at
        FROM file_tags
        WHERE file_path = '${escapeSQL(filePath)}' AND tag = '${escapeSQL(tag)}'
    `;
    await ensureTable(provider, sandboxId);
    const rows = await executeWorkspaceJsonQuery<FileTagRow>(provider, sandboxId, sql);
    if (!rows[0]) {
        throw new Error(`Failed to create tag for ${filePath}`);
    }
    return rows[0];
}

export async function deleteTag(
    provider: DaytonaProvider,
    sandboxId: string,
    id: number,
): Promise<void> {
    const sql = `DELETE FROM file_tags WHERE id = ${id}`;
    await ensureTable(provider, sandboxId);
    await executeWorkspaceQuery(provider, sandboxId, sql);
}

export async function listTags(
    provider: DaytonaProvider,
    sandboxId: string,
): Promise<TagCount[]> {
    const sql = `
        SELECT tag, COUNT(*) as count
        FROM file_tags
        GROUP BY tag
        ORDER BY count DESC, tag
    `;
    await ensureTable(provider, sandboxId);
    return executeWorkspaceJsonQuery<TagCount>(provider, sandboxId, sql);
}
