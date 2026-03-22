// Heartbeat State Repository
// CRUD operations for heartbeat_state table (runtime execution state)

import { query } from '../../database/connection';
import { HeartbeatState, HeartbeatStateRow, HeartbeatOutcome } from './types';

function mapRowToState(row: HeartbeatStateRow): HeartbeatState {
    return {
        id: row.id,
        agent_id: row.agent_id,
        last_run_at: row.last_run_at,
        last_outcome: row.last_outcome as HeartbeatOutcome | null,
        last_snapshot_hash: row.last_snapshot_hash,
        consecutive_failures: row.consecutive_failures,
        tokens_spent_today: row.tokens_spent_today,
        tokens_budget_today: row.tokens_budget_today,
        last_processed_ids: row.last_processed_ids ?? {},
        current_focus: row.current_focus,
        paused_execution_id: row.paused_execution_id,
        next_scheduled_at: row.next_scheduled_at,
        suppressed_until: row.suppressed_until,
        last_error: row.last_error,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

export class HeartbeatStateRepository {
    async getByAgentId(agentId: number): Promise<HeartbeatState | null> {
        const result = await query<HeartbeatStateRow>(
            'SELECT * FROM heartbeat_state WHERE agent_id = $1',
            [agentId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return mapRowToState(result.rows[0]);
    }

    async upsert(agentId: number): Promise<HeartbeatState> {
        const result = await query<HeartbeatStateRow>(
            `INSERT INTO heartbeat_state (agent_id)
             VALUES ($1)
             ON CONFLICT (agent_id) DO NOTHING
             RETURNING *`,
            [agentId]
        );

        if (result.rows.length === 0) {
            const existing = await this.getByAgentId(agentId);
            if (!existing) {
                throw new Error(`Failed to upsert heartbeat state for agent ${agentId}`);
            }
            return existing;
        }

        return mapRowToState(result.rows[0]);
    }

    async batchUpsert(agentIds: number[]): Promise<void> {
        if (agentIds.length === 0) {
            return;
        }

        const valuePlaceholders = agentIds.map((_, i) => `($${i + 1})`).join(', ');
        await query(
            `INSERT INTO heartbeat_state (agent_id)
             VALUES ${valuePlaceholders}
             ON CONFLICT (agent_id) DO NOTHING`,
            agentIds
        );
    }

    async recordRunStart(
        agentId: number,
        outcome: HeartbeatOutcome,
        tokensUsed: number,
        error?: string
    ): Promise<HeartbeatState | null> {
        const isFailure = outcome === 'failure' || outcome === 'timeout';
        const consecutiveUpdate = isFailure
            ? 'consecutive_failures + 1'
            : '0';

        const result = await query<HeartbeatStateRow>(
            `UPDATE heartbeat_state SET
                last_run_at = NOW(),
                last_outcome = $2,
                consecutive_failures = ${consecutiveUpdate},
                tokens_spent_today = tokens_spent_today + $3,
                last_error = $4
             WHERE agent_id = $1
             RETURNING *`,
            [agentId, outcome, tokensUsed, error ?? null]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return mapRowToState(result.rows[0]);
    }

    async resetDailyTokens(agentId: number): Promise<void> {
        await query(
            'UPDATE heartbeat_state SET tokens_spent_today = 0 WHERE agent_id = $1',
            [agentId]
        );
    }

    async updateNextScheduledAt(agentId: number, nextAt: Date | null): Promise<void> {
        await query(
            'UPDATE heartbeat_state SET next_scheduled_at = $2 WHERE agent_id = $1',
            [agentId, nextAt]
        );
    }

    async tryAcquireLock(agentId: number, runId: string, timeoutMs: number = 300000): Promise<boolean> {
        const result = await query<{ agent_id: number }>(
            `UPDATE heartbeat_state SET
                current_focus = $2,
                suppressed_until = NOW() + ($3 || ' milliseconds')::interval
             WHERE agent_id = $1
               AND (current_focus IS NULL
                    OR suppressed_until IS NULL
                    OR suppressed_until < NOW())
             RETURNING agent_id`,
            [agentId, runId, timeoutMs]
        );
        return result.rows.length > 0;
    }

    async releaseLock(agentId: number): Promise<void> {
        await query(
            `UPDATE heartbeat_state SET current_focus = NULL, suppressed_until = NULL WHERE agent_id = $1`,
            [agentId]
        );
    }

    async updateSnapshotHash(agentId: number, snapshotHash: string): Promise<void> {
        await query(
            'UPDATE heartbeat_state SET last_snapshot_hash = $2 WHERE agent_id = $1',
            [agentId, snapshotHash]
        );
    }

    async updateLastProcessedIds(
        agentId: number,
        lastProcessedIds: Record<string, string>
    ): Promise<void> {
        await query(
            'UPDATE heartbeat_state SET last_processed_ids = $2 WHERE agent_id = $1',
            [agentId, JSON.stringify(lastProcessedIds)]
        );
    }

    async countActiveLocksForUser(userId: string): Promise<number> {
        const result = await query<{ count: string }>(
            `SELECT COUNT(*) as count
             FROM heartbeat_state hs
             JOIN heartbeat_configs hc ON hs.agent_id = hc.agent_id
             WHERE hc.user_id = $1
               AND hs.current_focus IS NOT NULL
               AND (hs.suppressed_until IS NULL OR hs.suppressed_until > NOW())`,
            [userId]
        );
        return parseInt(result.rows[0]?.count ?? '0', 10);
    }

    async checkPauseState(agentId: number): Promise<{
        is_paused: boolean;
        has_resolution: boolean;
        resolution: string | null;
        pause_id: string | null;
    }> {
        const result = await query<{
            id: string;
            resolved_at: Date | null;
            resolution: string | null;
        }>(
            `SELECT eps.id, eps.resolved_at, eps.resolution
             FROM execution_pause_states eps
             JOIN execution_sessions es ON es.id = eps.execution_id
             WHERE es.agent_id = $1
               AND eps.resolved_at IS NULL
             ORDER BY eps.paused_at DESC
             LIMIT 1`,
            [agentId]
        );

        if (result.rows.length === 0) {
            return { is_paused: false, has_resolution: false, resolution: null, pause_id: null };
        }

        const row = result.rows[0];
        return {
            is_paused: true,
            has_resolution: row.resolved_at !== null,
            resolution: row.resolution,
            pause_id: row.id,
        };
    }
}

export const heartbeatStateRepository = new HeartbeatStateRepository();
