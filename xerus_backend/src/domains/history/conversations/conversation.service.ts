// Conversation Service
// CRUD operations for chat conversations linked to execution sessions.
// Conversations group multiple execution_sessions as user/assistant message pairs.

import { query, transaction } from '../../../database/connection';
import { NotFoundError, BadRequestError } from '../../../utils/errors';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ConversationRow {
    id: string;
    user_id: string;
    agent_slug: string | null;
    title: string;
    sdk_session_id: string | null;
    summary: string | null;
    message_count: number;
    last_message_at: Date;
    created_at: Date;
}

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
    execution_id: string;
    created_at: string;
    status?: string;
    input_tokens?: number;
    output_tokens?: number;
    credits_used?: string;
    completed_at?: string;
    thinking?: string;
    message_metadata?: Record<string, unknown>;
}

export interface ConversationDetail extends ConversationRow {
    messages: ConversationMessage[];
}

export interface ListConversationsOptions {
    limit?: number;
    offset?: number;
}

// -----------------------------------------------------------------------------
// List Conversations
// -----------------------------------------------------------------------------

export async function listConversations(
    userId: string,
    options: ListConversationsOptions = {},
): Promise<{ conversations: ConversationRow[]; total: number }> {
    const limit = Math.min(options.limit ?? 50, 100);
    const offset = options.offset ?? 0;

    const [dataResult, countResult] = await Promise.all([
        query<ConversationRow>(
            `SELECT id, user_id, agent_slug, title, sdk_session_id, summary,
                    message_count, last_message_at, created_at
             FROM conversations
             WHERE user_id = $1
             ORDER BY last_message_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset],
        ),
        query<{ count: string }>(
            `SELECT COUNT(*) as count FROM conversations WHERE user_id = $1`,
            [userId],
        ),
    ]);

    return {
        conversations: dataResult.rows,
        total: parseInt(countResult.rows[0].count, 10),
    };
}

// -----------------------------------------------------------------------------
// Get Conversation (with messages from execution_sessions)
// -----------------------------------------------------------------------------

export async function getConversation(
    userId: string,
    conversationId: string,
): Promise<ConversationDetail> {
    const convResult = await query<ConversationRow>(
        `SELECT id, user_id, agent_slug, title, sdk_session_id, summary,
                message_count, last_message_at, created_at
         FROM conversations
         WHERE id = $1 AND user_id = $2`,
        [conversationId, userId],
    );

    if (convResult.rows.length === 0) {
        throw new NotFoundError('Conversation');
    }

    const conv = convResult.rows[0];

    // Fetch messages from execution_sessions linked to this conversation
    const sessionsResult = await query<{
        id: string;
        user_prompt: string | null;
        agent_response: string | null;
        status: string;
        input_tokens: number | null;
        output_tokens: number | null;
        credits_used: string | null;
        created_at: Date;
        completed_at: Date | null;
        thinking: string | null;
        message_metadata: Record<string, unknown> | null;
    }>(
        `SELECT id, user_prompt, agent_response, status,
                input_tokens, output_tokens, credits_used,
                created_at, completed_at, thinking, message_metadata
         FROM execution_sessions
         WHERE conversation_id = $1
         ORDER BY created_at ASC`,
        [conversationId],
    );

    // Flatten into user/assistant message pairs
    const messages: ConversationMessage[] = [];
    for (const session of sessionsResult.rows) {
        if (session.user_prompt) {
            messages.push({
                role: 'user',
                content: session.user_prompt,
                execution_id: session.id,
                created_at: session.created_at.toISOString(),
            });
        }
        if (session.agent_response) {
            messages.push({
                role: 'assistant',
                content: session.agent_response,
                execution_id: session.id,
                created_at: session.completed_at?.toISOString() ?? session.created_at.toISOString(),
                status: session.status,
                input_tokens: session.input_tokens ?? undefined,
                output_tokens: session.output_tokens ?? undefined,
                credits_used: session.credits_used ?? undefined,
                completed_at: session.completed_at?.toISOString(),
                thinking: session.thinking ?? undefined,
                message_metadata: session.message_metadata ?? undefined,
            });
        }
    }

    return { ...conv, messages };
}

// -----------------------------------------------------------------------------
// Create Conversation
// -----------------------------------------------------------------------------

export async function createConversation(
    userId: string,
    agentSlug: string | null,
    title?: string,
): Promise<ConversationRow> {
    const result = await query<ConversationRow>(
        `INSERT INTO conversations (user_id, agent_slug, title)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [userId, agentSlug, title ?? 'New conversation'],
    );

    return result.rows[0];
}

// -----------------------------------------------------------------------------
// Update Conversation (title rename)
// -----------------------------------------------------------------------------

export async function updateConversation(
    userId: string,
    conversationId: string,
    updates: { title?: string },
): Promise<ConversationRow> {
    if (!updates.title) {
        throw new BadRequestError('At least one field to update is required');
    }

    const result = await query<ConversationRow>(
        `UPDATE conversations
         SET title = COALESCE($3, title)
         WHERE id = $1 AND user_id = $2
         RETURNING *`,
        [conversationId, userId, updates.title],
    );

    if (result.rows.length === 0) {
        throw new NotFoundError('Conversation');
    }

    return result.rows[0];
}

// -----------------------------------------------------------------------------
// Delete Conversation
// -----------------------------------------------------------------------------

export async function deleteConversation(
    userId: string,
    conversationId: string,
): Promise<void> {
    await transaction(async (client) => {
        // Unlink execution_sessions first (SET NULL, not cascade delete)
        await client.query(
            `UPDATE execution_sessions SET conversation_id = NULL
             WHERE conversation_id = $1`,
            [conversationId],
        );

        const result = await client.query(
            `DELETE FROM conversations WHERE id = $1 AND user_id = $2`,
            [conversationId, userId],
        );

        if (result.rowCount === 0) {
            throw new NotFoundError('Conversation');
        }
    });
}

// -----------------------------------------------------------------------------
// Increment message count (called after execution completes)
// -----------------------------------------------------------------------------

export async function incrementMessageCount(
    conversationId: string,
): Promise<void> {
    await query(
        `UPDATE conversations
         SET message_count = message_count + 1,
             last_message_at = NOW()
         WHERE id = $1`,
        [conversationId],
    );
}
