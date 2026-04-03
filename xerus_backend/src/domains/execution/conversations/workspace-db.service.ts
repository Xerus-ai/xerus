// Workspace DB Service
// Queries workspace.db (SQLite) on sandbox via provider.executeCommand()
// Source of truth for conversations, execution_sessions, etc. per CLI-native pivot
// Reference: xerus-workspace/data/workspace-schema.sql

import type { DaytonaProvider } from '../sandbox/providers/daytona.provider';
import { SANDBOX_CONFIG } from '../sandbox/sandbox.config';

const WORKSPACE_DB_PATH = `${SANDBOX_CONFIG.workspacePath}/data/workspace.db`;

// -----------------------------------------------------------------------------
// Types (mirror workspace-schema.sql)
// -----------------------------------------------------------------------------

export interface ConversationRow {
    id: string;
    agent_slug: string;
    title: string | null;
    summary: string | null;
    message_count: number;
    status: 'active' | 'archived' | 'deleted';
    created_at: string;
    updated_at: string;
}

export interface ExecutionSessionRow {
    id: string;
    agent_slug: string;
    conversation_id: string | null;
    status: string;
    trigger_type: string | null;
    started_at: string;
    ended_at: string | null;
    tokens_input: number;
    tokens_output: number;
    cost_usd: number;
    result_summary: string | null;
}

// -----------------------------------------------------------------------------
// Query Helpers
// -----------------------------------------------------------------------------

function escapeSQL(value: string): string {
    // Escape single quotes by doubling them
    return value.replace(/'/g, "''");
}

function buildSqliteCommand(sql: string): string {
    // Use JSON mode for structured output
    // Escape double quotes in SQL (shell wraps in double quotes), NOT single quotes
    const shellSafe = sql.replace(/"/g, '\\"');
    return `sqlite3 -json '${WORKSPACE_DB_PATH}' "${shellSafe}"`;
}

function parseJsonResult<T>(output: string): T[] {
    const trimmed = output.trim();
    if (!trimmed || trimmed === '[]') return [];
    try {
        return JSON.parse(trimmed) as T[];
    } catch {
        console.error('[WorkspaceDB] Failed to parse JSON:', trimmed.slice(0, 200));
        return [];
    }
}

// -----------------------------------------------------------------------------
// Conversation Queries
// -----------------------------------------------------------------------------

export async function listConversations(
    provider: DaytonaProvider,
    sandboxId: string,
    options: { limit?: number; offset?: number } = {},
): Promise<{ conversations: ConversationRow[]; total: number }> {
    const limit = Math.min(options.limit ?? 50, 100);
    const offset = options.offset ?? 0;

    // Get conversations
    const listSql = `
        SELECT id, agent_slug, title, summary, message_count, status, created_at, updated_at
        FROM conversations
        WHERE status != 'deleted'
        ORDER BY updated_at DESC
        LIMIT ${limit} OFFSET ${offset}
    `;
    const listResult = await provider.executeCommand(sandboxId, buildSqliteCommand(listSql));
    const conversations = parseJsonResult<ConversationRow>(listResult.result);

    // Get total count
    const countSql = `SELECT COUNT(*) as count FROM conversations WHERE status != 'deleted'`;
    const countResult = await provider.executeCommand(sandboxId, buildSqliteCommand(countSql));
    const countRows = parseJsonResult<{ count: number }>(countResult.result);
    const total = countRows[0]?.count ?? 0;

    return { conversations, total };
}

export async function getConversation(
    provider: DaytonaProvider,
    sandboxId: string,
    conversationId: string,
): Promise<ConversationRow | null> {
    const sql = `
        SELECT id, agent_slug, title, summary, message_count, status, created_at, updated_at
        FROM conversations
        WHERE id = '${escapeSQL(conversationId)}' AND status != 'deleted'
    `;
    const result = await provider.executeCommand(sandboxId, buildSqliteCommand(sql));
    const rows = parseJsonResult<ConversationRow>(result.result);
    return rows[0] ?? null;
}

export async function getConversationWithMessages(
    provider: DaytonaProvider,
    sandboxId: string,
    conversationId: string,
): Promise<{ conversation: ConversationRow; messages: ExecutionSessionRow[] } | null> {
    const conv = await getConversation(provider, sandboxId, conversationId);
    if (!conv) return null;

    const messagesSql = `
        SELECT id, agent_slug, conversation_id, status, trigger_type,
               started_at, ended_at, tokens_input, tokens_output, cost_usd, result_summary
        FROM execution_sessions
        WHERE conversation_id = '${escapeSQL(conversationId)}'
        ORDER BY started_at ASC
    `;
    const messagesResult = await provider.executeCommand(sandboxId, buildSqliteCommand(messagesSql));
    const messages = parseJsonResult<ExecutionSessionRow>(messagesResult.result);

    return { conversation: conv, messages };
}

export async function createConversation(
    provider: DaytonaProvider,
    sandboxId: string,
    agentSlug: string,
    title?: string,
): Promise<ConversationRow> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const titleValue = title ? `'${escapeSQL(title)}'` : 'NULL';

    const sql = `
        INSERT INTO conversations (id, agent_slug, title, message_count, status, created_at, updated_at)
        VALUES ('${id}', '${escapeSQL(agentSlug)}', ${titleValue}, 0, 'active', '${now}', '${now}');
        SELECT id, agent_slug, title, summary, message_count, status, created_at, updated_at
        FROM conversations WHERE id = '${id}';
    `;
    const result = await provider.executeCommand(sandboxId, buildSqliteCommand(sql));
    const rows = parseJsonResult<ConversationRow>(result.result);

    if (!rows[0]) {
        throw new Error('Failed to create conversation');
    }
    return rows[0];
}

export async function updateConversation(
    provider: DaytonaProvider,
    sandboxId: string,
    conversationId: string,
    updates: { title?: string; status?: 'active' | 'archived' },
): Promise<ConversationRow | null> {
    const setClauses: string[] = [];
    if (updates.title !== undefined) {
        setClauses.push(`title = '${escapeSQL(updates.title)}'`);
    }
    if (updates.status !== undefined) {
        setClauses.push(`status = '${updates.status}'`);
    }
    if (setClauses.length === 0) {
        return getConversation(provider, sandboxId, conversationId);
    }

    const now = new Date().toISOString();
    setClauses.push(`updated_at = '${now}'`);

    const sql = `
        UPDATE conversations SET ${setClauses.join(', ')}
        WHERE id = '${escapeSQL(conversationId)}' AND status != 'deleted';
        SELECT id, agent_slug, title, summary, message_count, status, created_at, updated_at
        FROM conversations WHERE id = '${escapeSQL(conversationId)}';
    `;
    const result = await provider.executeCommand(sandboxId, buildSqliteCommand(sql));
    const rows = parseJsonResult<ConversationRow>(result.result);
    return rows[0] ?? null;
}

export async function deleteConversation(
    provider: DaytonaProvider,
    sandboxId: string,
    conversationId: string,
): Promise<boolean> {
    // Soft delete - set status to 'deleted'
    const now = new Date().toISOString();
    const sql = `
        UPDATE conversations SET status = 'deleted', updated_at = '${now}'
        WHERE id = '${escapeSQL(conversationId)}' AND status != 'deleted'
    `;
    await provider.executeCommand(sandboxId, buildSqliteCommand(sql));
    // SQLite doesn't return affected rows in JSON mode, so we check if the conversation exists after
    const check = await getConversation(provider, sandboxId, conversationId);
    return check === null; // Deleted if not found (status = 'deleted' excluded from query)
}
