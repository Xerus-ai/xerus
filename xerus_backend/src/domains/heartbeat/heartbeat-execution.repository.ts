// Heartbeat Execution Repository
// CRUD operations for heartbeat_executions table

import { query } from '../../database/connection';
import {
    HeartbeatExecution,
    HeartbeatExecutionRow,
    CreateHeartbeatExecutionDTO,
    HeartbeatExecutionListOptions,
    PaginatedHeartbeatExecutions,
    HeartbeatExecutionStatus,
    HeartbeatOutcome,
    HeartbeatTriggerType,
} from './types';

function mapRowToExecution(row: HeartbeatExecutionRow): HeartbeatExecution {
    return {
        id: row.id,
        heartbeat_config_id: row.heartbeat_config_id,
        agent_id: row.agent_id,
        trigger_type: row.trigger_type as HeartbeatTriggerType,
        trigger_id: row.trigger_id,
        event_payload: row.event_payload,
        snapshot_execution_id: row.snapshot_execution_id,
        scheduled_at: row.scheduled_at,
        started_at: row.started_at,
        completed_at: row.completed_at,
        status: row.status as HeartbeatExecutionStatus,
        outcome: row.outcome as HeartbeatOutcome | null,
        result: row.result,
        error_message: row.error_message,
        duration_ms: row.duration_ms,
        tokens_used: row.tokens_used,
        tool_calls_count: row.tool_calls_count,
        inbox_posts: row.inbox_posts,
        memory_updates: row.memory_updates,
        alerts_sent: row.alerts_sent,
        run_id: row.run_id,
        created_at: row.created_at,
    };
}

export class HeartbeatExecutionRepository {
    async create(data: CreateHeartbeatExecutionDTO): Promise<HeartbeatExecution> {
        const result = await query<HeartbeatExecutionRow>(
            `INSERT INTO heartbeat_executions (
                heartbeat_config_id,
                agent_id,
                trigger_type,
                trigger_id,
                event_payload,
                snapshot_execution_id,
                scheduled_at,
                status,
                run_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued', $8)
            RETURNING *`,
            [
                data.heartbeat_config_id ?? null,
                data.agent_id,
                data.trigger_type,
                data.trigger_id ?? null,
                data.event_payload ? JSON.stringify(data.event_payload) : null,
                data.snapshot_execution_id ?? null,
                data.scheduled_at,
                data.run_id ?? null,
            ]
        );

        return mapRowToExecution(result.rows[0]);
    }

    async getById(id: string): Promise<HeartbeatExecution | null> {
        const result = await query<HeartbeatExecutionRow>(
            'SELECT * FROM heartbeat_executions WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return mapRowToExecution(result.rows[0]);
    }

    async listByAgentId(
        agentId: number,
        options: HeartbeatExecutionListOptions = {}
    ): Promise<PaginatedHeartbeatExecutions> {
        const { limit = 20, offset = 0, status } = options;

        const whereClauses: string[] = ['agent_id = $1'];
        const values: unknown[] = [agentId];
        let paramIndex = 2;

        if (status) {
            whereClauses.push(`status = $${paramIndex}`);
            values.push(status);
            paramIndex++;
        }

        const whereClause = whereClauses.join(' AND ');

        const countResult = await query<{ count: string }>(
            `SELECT COUNT(*) as count FROM heartbeat_executions WHERE ${whereClause}`,
            values
        );
        const total = parseInt(countResult.rows[0].count, 10);

        values.push(limit, offset);

        const result = await query<HeartbeatExecutionRow>(
            `SELECT * FROM heartbeat_executions
             WHERE ${whereClause}
             ORDER BY scheduled_at DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            values
        );

        return {
            executions: result.rows.map(mapRowToExecution),
            total,
            limit,
            offset,
        };
    }

    async getLatestByConfigId(configId: number): Promise<HeartbeatExecution | null> {
        const result = await query<HeartbeatExecutionRow>(
            `SELECT * FROM heartbeat_executions
             WHERE heartbeat_config_id = $1
             ORDER BY scheduled_at DESC
             LIMIT 1`,
            [configId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return mapRowToExecution(result.rows[0]);
    }

    async getLatestByAgentId(agentId: number): Promise<HeartbeatExecution | null> {
        const result = await query<HeartbeatExecutionRow>(
            `SELECT * FROM heartbeat_executions
             WHERE agent_id = $1
             ORDER BY scheduled_at DESC
             LIMIT 1`,
            [agentId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return mapRowToExecution(result.rows[0]);
    }

    async updateStatus(
        id: string,
        status: HeartbeatExecutionStatus,
        additionalFields?: {
            started_at?: Date;
            completed_at?: Date;
            outcome?: HeartbeatOutcome;
            result?: Record<string, unknown>;
            error_message?: string;
            duration_ms?: number;
            tokens_used?: number;
            tool_calls_count?: number;
            inbox_posts?: number;
            memory_updates?: number;
            alerts_sent?: number;
        }
    ): Promise<HeartbeatExecution | null> {
        const setClauses: string[] = ['status = $1'];
        const values: unknown[] = [status];
        let paramIndex = 2;

        if (additionalFields) {
            if (additionalFields.started_at !== undefined) {
                setClauses.push(`started_at = $${paramIndex}`);
                values.push(additionalFields.started_at);
                paramIndex++;
            }
            if (additionalFields.completed_at !== undefined) {
                setClauses.push(`completed_at = $${paramIndex}`);
                values.push(additionalFields.completed_at);
                paramIndex++;
            }
            if (additionalFields.outcome !== undefined) {
                setClauses.push(`outcome = $${paramIndex}`);
                values.push(additionalFields.outcome);
                paramIndex++;
            }
            if (additionalFields.result !== undefined) {
                setClauses.push(`result = $${paramIndex}`);
                values.push(JSON.stringify(additionalFields.result));
                paramIndex++;
            }
            if (additionalFields.error_message !== undefined) {
                setClauses.push(`error_message = $${paramIndex}`);
                values.push(additionalFields.error_message);
                paramIndex++;
            }
            if (additionalFields.duration_ms !== undefined) {
                setClauses.push(`duration_ms = $${paramIndex}`);
                values.push(additionalFields.duration_ms);
                paramIndex++;
            }
            if (additionalFields.tokens_used !== undefined) {
                setClauses.push(`tokens_used = $${paramIndex}`);
                values.push(additionalFields.tokens_used);
                paramIndex++;
            }
            if (additionalFields.tool_calls_count !== undefined) {
                setClauses.push(`tool_calls_count = $${paramIndex}`);
                values.push(additionalFields.tool_calls_count);
                paramIndex++;
            }
            if (additionalFields.inbox_posts !== undefined) {
                setClauses.push(`inbox_posts = $${paramIndex}`);
                values.push(additionalFields.inbox_posts);
                paramIndex++;
            }
            if (additionalFields.memory_updates !== undefined) {
                setClauses.push(`memory_updates = $${paramIndex}`);
                values.push(additionalFields.memory_updates);
                paramIndex++;
            }
            if (additionalFields.alerts_sent !== undefined) {
                setClauses.push(`alerts_sent = $${paramIndex}`);
                values.push(additionalFields.alerts_sent);
                paramIndex++;
            }
        }

        values.push(id);

        const result = await query<HeartbeatExecutionRow>(
            `UPDATE heartbeat_executions SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return null;
        }

        return mapRowToExecution(result.rows[0]);
    }

    async countByAgentIdAndStatus(agentId: number, status: HeartbeatExecutionStatus): Promise<number> {
        const result = await query<{ count: string }>(
            'SELECT COUNT(*) as count FROM heartbeat_executions WHERE agent_id = $1 AND status = $2',
            [agentId, status]
        );
        return parseInt(result.rows[0].count, 10);
    }

    async deleteByAgentId(agentId: number): Promise<number> {
        const result = await query(
            'DELETE FROM heartbeat_executions WHERE agent_id = $1',
            [agentId]
        );
        return result.rowCount ?? 0;
    }
}

export const heartbeatExecutionRepository = new HeartbeatExecutionRepository();
