// Database-backed Usage Store
// Implements UsageStore interface for credit-tracker.service.ts
// Stores tool usage records and aggregates session usage from tool_usage table

import { query } from '../../../database/connection';
import type { UsageStore, ToolUsageRecord, SessionUsage } from './credit-tracker.service';

export class DatabaseUsageStore implements UsageStore {
    async storeToolUsage(record: ToolUsageRecord): Promise<void> {
        await query(
            `INSERT INTO tool_usage (user_id, agent_slug, session_id, tool_name, tokens_used, credits_consumed, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                record.user_id,
                record.agent_slug ?? null,
                record.session_id ?? null,
                record.tool_name,
                record.tokens_used,
                record.credits_consumed,
                record.created_at,
            ]
        );
    }

    async getSessionUsage(sessionId: string): Promise<SessionUsage> {
        const result = await query<{
            total_tokens: string;
            total_credits: string;
            tool_calls: string;
        }>(
            `SELECT
                COALESCE(SUM(tokens_used), 0) AS total_tokens,
                COALESCE(SUM(credits_consumed), 0) AS total_credits,
                COUNT(*) AS tool_calls
             FROM tool_usage
             WHERE session_id = $1`,
            [sessionId]
        );

        const row = result.rows[0];
        const totalTokens = parseInt(row.total_tokens, 10);

        // tool_usage table stores aggregate tokens_used without input/output split.
        // Assign all to total_input_tokens; total_output_tokens stays 0.
        // LLM streaming tokens (input/output) are tracked separately in execution_sessions
        // via PipelineContext.inputTokens/outputTokens, not here.
        return {
            session_id: sessionId,
            total_input_tokens: totalTokens,
            total_output_tokens: 0,
            total_credits: parseFloat(row.total_credits),
            tool_calls: parseInt(row.tool_calls, 10),
        };
    }
}
