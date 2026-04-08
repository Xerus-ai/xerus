// Workspace DB Service
// Queries workspace.db (SQLite) on sandbox via provider.executeCommand()
// Source of truth for conversations, execution_sessions, etc. per CLI-native pivot
// Reference: xerus-workspace/data/workspace-schema.sql

import type { DaytonaProvider } from '../sandbox-infra/sandbox/providers/daytona.provider';
import { escapeSQL, executeWorkspaceQuery, executeWorkspaceJsonQuery } from './workspace-db.helpers';

// Re-export helpers for other domain services
export { escapeSQL, executeWorkspaceQuery, executeWorkspaceJsonQuery } from './workspace-db.helpers';

// -----------------------------------------------------------------------------
// Types (mirror workspace-schema.sql)
// -----------------------------------------------------------------------------

export interface ConversationRow {
    id: string;
    agent_slug: string;
    title: string | null;
    summary: string | null;
    message_count: number;
    sdk_session_id: string | null;
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
        SELECT id, agent_slug, title, summary, message_count, sdk_session_id, status, created_at, updated_at
        FROM conversations
        WHERE status != 'deleted'
        ORDER BY updated_at DESC
        LIMIT ${limit} OFFSET ${offset}
    `;
    const conversations = await executeWorkspaceJsonQuery<ConversationRow>(provider, sandboxId, listSql);

    // Get total count
    const countSql = `SELECT COUNT(*) as count FROM conversations WHERE status != 'deleted'`;
    const countRows = await executeWorkspaceJsonQuery<{ count: number }>(provider, sandboxId, countSql);
    const total = countRows[0]?.count ?? 0;

    return { conversations, total };
}

export async function getConversation(
    provider: DaytonaProvider,
    sandboxId: string,
    conversationId: string,
): Promise<ConversationRow | null> {
    const sql = `
        SELECT id, agent_slug, title, summary, message_count, sdk_session_id, status, created_at, updated_at
        FROM conversations
        WHERE id = '${escapeSQL(conversationId)}' AND status != 'deleted'
    `;
    const rows = await executeWorkspaceJsonQuery<ConversationRow>(provider, sandboxId, sql);
    return rows[0] ?? null;
}

export interface ConversationMessageRow {
    id: number;
    conversation_id: string;
    session_id: string | null;
    role: 'user' | 'assistant';
    content: string;
    execution_id: string | null;
    created_at: string;
    input_tokens: number | null;
    output_tokens: number | null;
    credits_used: number | null;
    thinking: string | null;
    message_metadata: { parts?: unknown[]; tool_calls?: unknown[] } | null;
}

/**
 * Return type matches the frontend ConversationDetail interface:
 * a flat object with all conversation fields + messages array at root.
 */
export interface ConversationDetailResponse extends ConversationRow {
    messages: ConversationMessageRow[];
}

export async function getConversationWithMessages(
    provider: DaytonaProvider,
    sandboxId: string,
    conversationId: string,
): Promise<ConversationDetailResponse | null> {
    const conv = await getConversation(provider, sandboxId, conversationId);
    if (!conv) return null;

    // Query chat_executions (user_message + agent_response pairs) and
    // expand each row into user + assistant messages for the frontend.
    const chatSql = `
        SELECT id, conversation_id, session_id, user_message, agent_response,
               response_time_ms, tokens_used, message_metadata, created_at
        FROM chat_executions
        WHERE conversation_id = '${escapeSQL(conversationId)}'
        ORDER BY created_at ASC
    `;

    const rows = await executeWorkspaceJsonQuery<{
        id: number; conversation_id: string; session_id: string | null;
        user_message: string; agent_response: string | null;
        response_time_ms: number | null; tokens_used: number;
        message_metadata: string | null; created_at: string;
    }>(provider, sandboxId, chatSql);

    const messages: ConversationMessageRow[] = [];
    for (const row of rows) {
        // User message
        messages.push({
            id: row.id * 2,
            conversation_id: row.conversation_id,
            session_id: row.session_id,
            role: 'user',
            content: row.user_message,
            execution_id: row.session_id,
            created_at: row.created_at,
            input_tokens: null,
            output_tokens: null,
            credits_used: null,
            thinking: null,
            message_metadata: null,
        });
        // Assistant response (if present)
        if (row.agent_response) {
            // Parse message_metadata from JSON string to object for frontend consumption
            let parsedMeta: Record<string, unknown> | null = null;
            if (row.message_metadata) {
                try { parsedMeta = JSON.parse(row.message_metadata); } catch { /* corrupt JSON — skip */ }
            }
            messages.push({
                id: row.id * 2 + 1,
                conversation_id: row.conversation_id,
                session_id: row.session_id,
                role: 'assistant',
                content: row.agent_response,
                execution_id: row.session_id,
                created_at: row.created_at,
                input_tokens: null,
                output_tokens: row.tokens_used || null,
                credits_used: null,
                thinking: null,
                message_metadata: parsedMeta as ConversationMessageRow['message_metadata'],
            });
        }
    }

    // Flat structure: spread conversation fields + messages at root
    return { ...conv, messages };
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
        BEGIN;
        INSERT INTO conversations (id, agent_slug, title, message_count, status, created_at, updated_at)
        VALUES ('${id}', '${escapeSQL(agentSlug)}', ${titleValue}, 0, 'active', '${now}', '${now}');
        SELECT id, agent_slug, title, summary, message_count, sdk_session_id, status, created_at, updated_at
        FROM conversations WHERE id = '${id}';
        COMMIT;
    `;
    const rows = await executeWorkspaceJsonQuery<ConversationRow>(provider, sandboxId, sql);

    if (!rows[0]) {
        throw new Error('Failed to create conversation');
    }
    return rows[0];
}

/**
 * Find an active conversation for an agent+channel combo, or create one.
 * Channel conversations use a title prefix convention: "[channel:{slug}]"
 * This ensures each agent+channel pair reuses the same conversation thread,
 * preserving execution history and SDK session state across messages.
 */
export async function findOrCreateChannelConversation(
    provider: DaytonaProvider,
    sandboxId: string,
    agentSlug: string,
    channelSlug: string,
): Promise<ConversationRow> {
    const titlePrefix = `[channel:${escapeSQL(channelSlug)}]`;
    // Escape LIKE metacharacters (% and _) to prevent pattern matching injection
    const likePrefix = titlePrefix.replace(/%/g, '\\%').replace(/_/g, '\\_');

    // Look for an existing active conversation for this agent+channel
    const findSql = `
        SELECT id, agent_slug, title, summary, message_count, sdk_session_id, status, created_at, updated_at
        FROM conversations
        WHERE agent_slug = '${escapeSQL(agentSlug)}'
          AND title LIKE '${likePrefix}%' ESCAPE '\\'
          AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 1
    `;
    const existing = await executeWorkspaceJsonQuery<ConversationRow>(provider, sandboxId, findSql);
    if (existing[0]) {
        return existing[0];
    }

    // Create a new conversation for this agent+channel
    const title = `${titlePrefix} Channel conversation`;
    return createConversation(provider, sandboxId, agentSlug, title);
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
        BEGIN;
        UPDATE conversations SET ${setClauses.join(', ')}
        WHERE id = '${escapeSQL(conversationId)}' AND status != 'deleted';
        SELECT id, agent_slug, title, summary, message_count, sdk_session_id, status, created_at, updated_at
        FROM conversations WHERE id = '${escapeSQL(conversationId)}';
        COMMIT;
    `;
    const rows = await executeWorkspaceJsonQuery<ConversationRow>(provider, sandboxId, sql);
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
    await executeWorkspaceQuery(provider, sandboxId, sql);
    // SQLite doesn't return affected rows in JSON mode, so we check if the conversation exists after
    const check = await getConversation(provider, sandboxId, conversationId);
    return check === null; // Deleted if not found (status = 'deleted' excluded from query)
}

export async function incrementConversationMessageCount(
    provider: DaytonaProvider,
    sandboxId: string,
    conversationId: string,
): Promise<void> {
    const now = new Date().toISOString();
    const sql = `
        UPDATE conversations
        SET message_count = message_count + 1,
            updated_at = '${now}'
        WHERE id = '${escapeSQL(conversationId)}' AND status != 'deleted'
    `;
    await executeWorkspaceQuery(provider, sandboxId, sql);
}

/**
 * Persist a chat turn (user message + agent response) to workspace.db chat_executions.
 * Called at the end of each execution so conversation history survives page reloads.
 */
export async function writeChatExecution(
    provider: DaytonaProvider,
    sandboxId: string,
    conversationId: string,
    sessionId: string | null,
    userMessage: string,
    agentResponse: string | null,
    tokensUsed: number,
    responseTimeMs: number | null,
    messageMetadata: string | null,
): Promise<void> {
    // Ensure message_metadata column exists (added after initial schema)
    try {
        await executeWorkspaceQuery(provider, sandboxId,
            `ALTER TABLE chat_executions ADD COLUMN message_metadata TEXT`);
    } catch {
        // Column already exists — expected
    }

    const sessionValue = sessionId ? `'${escapeSQL(sessionId)}'` : 'NULL';
    const responseValue = agentResponse ? `'${escapeSQL(agentResponse)}'` : 'NULL';
    const timeValue = responseTimeMs !== null ? String(responseTimeMs) : 'NULL';
    const metaValue = messageMetadata ? `'${escapeSQL(messageMetadata)}'` : 'NULL';

    const sql = `
        INSERT INTO chat_executions (conversation_id, session_id, user_message, agent_response, response_time_ms, tokens_used, message_metadata)
        VALUES ('${escapeSQL(conversationId)}', ${sessionValue}, '${escapeSQL(userMessage)}', ${responseValue}, ${timeValue}, ${tokensUsed}, ${metaValue})
    `;
    await executeWorkspaceQuery(provider, sandboxId, sql);
}

export async function updateSdkSessionId(
    provider: DaytonaProvider,
    sandboxId: string,
    conversationId: string,
    sdkSessionId: string,
): Promise<void> {
    const now = new Date().toISOString();
    const sql = `
        UPDATE conversations
        SET sdk_session_id = '${escapeSQL(sdkSessionId)}',
            updated_at = '${now}'
        WHERE id = '${escapeSQL(conversationId)}' AND status != 'deleted'
    `;
    await executeWorkspaceQuery(provider, sandboxId, sql);
}
