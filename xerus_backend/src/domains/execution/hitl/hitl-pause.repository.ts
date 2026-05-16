// HITL Pause State Repository
// Production implementation against execution_pause_states table
// Matches: migration 022_execution_domain.sql

import { query } from '../../../database/connection';
import type { HITLPauseRepository } from './hitl.handler';
import type { HITLPauseState, HITLRequestData } from './hitl.types';
import type { PauseReason, PauseResolution } from '../../../shared/types/execution-shared.types';

// Inlined from deleted history/sessions/session.types.ts
interface ExecutionPauseStateRow {
    id: string;
    execution_id: string;
    paused_at: Date;
    reason: PauseReason;
    request_data: Record<string, unknown> | null;
    resolved_at: Date | null;
    resolution: PauseResolution | null;
    resolved_by: string | null;
}

// -----------------------------------------------------------------------------
// Repository Implementation
// -----------------------------------------------------------------------------

export class HITLPauseRepositoryImpl implements HITLPauseRepository {
    async createPauseState(
        executionId: string,
        reason: string,
        requestData: HITLRequestData
    ): Promise<{ id: string; paused_at: string }> {
        const result = await query<{ id: string; paused_at: Date }>(
            `INSERT INTO execution_pause_states (execution_id, reason, request_data)
             VALUES ($1, $2, $3)
             RETURNING id, paused_at`,
            [executionId, reason, JSON.stringify(requestData)]
        );

        const row = result.rows[0];
        return {
            id: row.id,
            paused_at: row.paused_at.toISOString(),
        };
    }

    async getPendingPauseState(pauseId: string): Promise<HITLPauseState | null> {
        const result = await query<ExecutionPauseStateRow>(
            `SELECT id, execution_id, paused_at, reason, request_data,
                    resolved_at, resolution, resolved_by
             FROM execution_pause_states
             WHERE id = $1`,
            [pauseId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return mapRowToState(result.rows[0]);
    }

    async getPendingForExecution(executionId: string): Promise<HITLPauseState | null> {
        const result = await query<ExecutionPauseStateRow>(
            `SELECT id, execution_id, paused_at, reason, request_data,
                    resolved_at, resolution, resolved_by
             FROM execution_pause_states
             WHERE execution_id = $1 AND resolved_at IS NULL
             ORDER BY paused_at DESC
             LIMIT 1`,
            [executionId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return mapRowToState(result.rows[0]);
    }

    async resolvePauseState(
        pauseId: string,
        resolution: PauseResolution,
        resolvedBy: string,
        feedback?: string
    ): Promise<{ resolved_at: string }> {
        const result = await query<{ resolved_at: Date }>(
            `UPDATE execution_pause_states
             SET resolved_at = NOW(), resolution = $2, resolved_by = $3, feedback = $4
             WHERE id = $1 AND resolved_at IS NULL
             RETURNING resolved_at`,
            [pauseId, resolution, resolvedBy, feedback || null]
        );

        if (result.rows.length === 0) {
            throw new Error(`Pause state '${pauseId}' not found or already resolved`);
        }

        return {
            resolved_at: result.rows[0].resolved_at.toISOString(),
        };
    }

    async resolveExpiredPauseStates(timeoutSeconds: number): Promise<string[]> {
        const result = await query<{ id: string }>(
            `UPDATE execution_pause_states
             SET resolved_at = NOW(), resolution = 'timeout', resolved_by = 'system'
             WHERE resolved_at IS NULL
               AND paused_at < NOW() - ($1 || ' seconds')::interval
             RETURNING id`,
            [timeoutSeconds]
        );
        return result.rows.map(r => r.id);
    }
}

// -----------------------------------------------------------------------------
// Row Mapper
// -----------------------------------------------------------------------------

function parseRequestData(raw: unknown): HITLRequestData {
    if (raw === null || raw === undefined || typeof raw !== 'object') {
        throw new Error('execution_pause_states.request_data is missing or not an object');
    }
    const data = raw as Record<string, unknown>;
    if (typeof data.scenario !== 'string' || typeof data.question !== 'string'
        || typeof data.tool_name !== 'string' || typeof data.agent_slug !== 'string') {
        throw new Error('execution_pause_states.request_data missing required fields');
    }
    return {
        scenario: data.scenario as HITLRequestData['scenario'],
        question: data.question,
        tool_name: data.tool_name,
        tool_input: (data.tool_input ?? {}) as Record<string, unknown>,
        agent_slug: data.agent_slug,
        options: Array.isArray(data.options) ? data.options as string[] : undefined,
        expanded_context: typeof data.expanded_context === 'string' ? data.expanded_context : undefined,
        requires_auth: typeof data.requires_auth === 'boolean' ? data.requires_auth : undefined,
    };
}

function mapRowToState(row: ExecutionPauseStateRow): HITLPauseState {
    return {
        id: row.id,
        execution_id: row.execution_id,
        paused_at: row.paused_at.toISOString(),
        reason: row.reason as PauseReason,
        request_data: parseRequestData(row.request_data),
        resolved_at: row.resolved_at ? row.resolved_at.toISOString() : null,
        resolution: row.resolution ?? null,
        resolved_by: row.resolved_by ?? null,
    };
}
